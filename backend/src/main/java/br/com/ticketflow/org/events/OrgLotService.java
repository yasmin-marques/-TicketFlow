package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.EventStatus;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.TicketLotRepository;
import br.com.ticketflow.catalog.service.EventAvailabilityService;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.org.access.AuditService;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.web.OrgDtos.LotInput;
import br.com.ticketflow.org.web.OrgDtos.OrgLotDto;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lotes de ingressos do painel. Regras: quantidade nunca abaixo do que já foi vendido ou está segurado; lote com
 * vendas/reservas não pode ser removido nem mudar de tipo; mudar o preço só vale para novas reservas (as existentes
 * guardam o preço unitário). A linha do lote é travada para que a checagem e a escrita não corram contra compradores.
 */
@Service
public class OrgLotService {

    private final EventRepository events;
    private final TicketLotRepository lots;
    private final OrgTicketTypes ticketTypes;
    private final EventAvailabilityService availability;
    private final AuditService audit;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final ZoneId zone;

    public OrgLotService(EventRepository events, TicketLotRepository lots, OrgTicketTypes ticketTypes, EventAvailabilityService availability,
                         AuditService audit, JdbcTemplate jdbc, Clock clock, AppProperties props) {
        this.events = events;
        this.lots = lots;
        this.ticketTypes = ticketTypes;
        this.availability = availability;
        this.audit = audit;
        this.jdbc = jdbc;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    @Transactional(readOnly = true)
    public List<OrgLotDto> list(OrgContext ctx, UUID eventId) {
        ctx.require(OrgPermission.VIEW_EVENTS);
        Event e = events.findOwned(eventId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
        Instant now = clock.instant();
        return lots.findByEvent(e.getId()).stream().map(l -> toDto(e, l, now)).toList();
    }

    @Transactional
    public OrgLotDto create(OrgContext ctx, UUID eventId, LotInput in) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        Event e = lockEvent(ctx, eventId);
        assertOpen(e, now);
        if (blank(in.typeName()) || blank(in.name())) {
            throw OrgEventService.validation("Informe o tipo e o nome do lote");
        }
        if (in.price() == null || in.quantity() == null) {
            throw OrgEventService.validation("Informe o preço e a quantidade");
        }
        Window w = window(in.startsAt(), in.endsAt());
        TicketType type = ticketTypes.forLot(e, in.typeName(), now);
        int position = type.getLots().stream().mapToInt(TicketLot::getPosition).max().orElse(-1) + 1;
        TicketLot lot = TicketLot.of(in.name().trim(), cents(in.price()), in.quantity(), 0, w.start(), w.end(), position, now);
        lot.setStatus(e.getStatus() == EventStatus.PUBLISHED ? TicketLot.Status.PUBLISHED : TicketLot.Status.DRAFT);
        lot.setPerCustomerLimit((short) (in.perCustomerLimit() == null ? 6 : in.perCustomerLimit()));
        lot.setAutoOpenNext(in.autoOpenNext() == null || in.autoOpenNext());
        type.addLot(lot);
        refreshEvent(e, now);
        events.saveAndFlush(e);
        audit.record(ctx, "lot.created", "lot", lot.getId(), Map.of("eventId", e.getId().toString(), "type", type.getName(),
                "name", lot.getName(), "priceCents", lot.getPriceCents(), "quantity", lot.getQuantityTotal()));
        return toDto(e, lot, now);
    }

    @Transactional
    public OrgLotDto update(OrgContext ctx, UUID lotId, LotInput in) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        UUID eventId = lots.findEventIdIfOwned(lotId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Lote não encontrado"));
        Event e = lockEvent(ctx, eventId);
        assertOpen(e, now);
        TicketLot lot = lots.lockById(lotId).orElseThrow(() -> ApiException.notFound("Lote não encontrado"));
        int inUse = lot.getQuantitySold() + lot.getQuantityHeld();

        if (in.typeName() != null && !in.typeName().isBlank()
                && !br.com.ticketflow.common.Texts.normalize(in.typeName()).equals(br.com.ticketflow.common.Texts.normalize(lot.getTicketType().getName()))) {
            if (inUse > 0) {
                throw ApiException.conflict("INVALID_STATE", "Lotes com vendas ou reservas não podem mudar de tipo");
            }
            TicketType target = ticketTypes.forLot(e, in.typeName(), now);
            // Só o lado dono (lot.ticketType): tirar o lote da coleção antiga acionaria o orphanRemoval e o apagaria.
            lot.setTicketType(target);
            target.getLots().add(lot);
        }
        if (in.name() != null) {
            if (in.name().isBlank()) {
                throw OrgEventService.validation("Informe o nome do lote");
            }
            lot.setName(in.name().trim());
        }
        if (in.price() != null) {
            lot.setPriceCents(cents(in.price())); // vale para novas reservas; as existentes guardam o preço unitário
        }
        if (in.quantity() != null) {
            if (in.quantity() < inUse) {
                throw OrgEventService.validation("A quantidade não pode ser menor que os " + inUse + " ingressos já vendidos ou reservados");
            }
            lot.setQuantityTotal(in.quantity());
        }
        if (in.startsAt() != null || in.endsAt() != null) {
            Window w = window(in.startsAt() != null ? in.startsAt() : day(lot.getSalesStart()),
                    in.endsAt() != null ? in.endsAt() : day(lot.getSalesEnd().minusMillis(1)));
            lot.setSalesStart(w.start());
            lot.setSalesEnd(w.end());
        }
        if (in.perCustomerLimit() != null) {
            lot.setPerCustomerLimit(in.perCustomerLimit().shortValue());
        }
        if (in.autoOpenNext() != null) {
            lot.setAutoOpenNext(in.autoOpenNext());
        }
        lot.setUpdatedAt(now);
        refreshEvent(e, now);
        events.saveAndFlush(e);
        audit.record(ctx, "lot.updated", "lot", lot.getId(), Map.of("eventId", e.getId().toString(),
                "priceCents", lot.getPriceCents(), "quantity", lot.getQuantityTotal()));
        return toDto(e, lot, now);
    }

    @Transactional
    public void delete(OrgContext ctx, UUID lotId) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        UUID eventId = lots.findEventIdIfOwned(lotId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Lote não encontrado"));
        Event e = lockEvent(ctx, eventId);
        TicketLot lot = lots.lockById(lotId).orElseThrow(() -> ApiException.notFound("Lote não encontrado"));
        boolean referenced = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from reservation_items where lot_id = ?)", Boolean.class, lotId));
        if (lot.getQuantitySold() + lot.getQuantityHeld() > 0 || referenced) {
            throw ApiException.conflict("INVALID_STATE", "Lotes com vendas não podem ser removidos");
        }
        TicketType type = lot.getTicketType();
        type.getLots().remove(lot); // orphanRemoval apaga o lote
        if (type.getLots().isEmpty() && type.getKind() == TicketKind.GENERAL && !typeReferenced(type.getId())) {
            e.getTicketTypes().remove(type);
        }
        refreshEvent(e, now);
        events.saveAndFlush(e);
        audit.record(ctx, "lot.deleted", "lot", lotId, Map.of("eventId", e.getId().toString(), "name", lot.getName()));
    }

    // ── interno ────────────────────────────────────────────────────────────────────────────────────────

    private record Window(Instant start, Instant end) {}

    /** {@code YYYY-MM-DD} → início do dia de abertura até o fim do dia de encerramento (fuso de São Paulo). */
    private Window window(String startsAt, String endsAt) {
        if (blank(startsAt) || blank(endsAt)) {
            throw OrgEventService.validation("Informe o início e o encerramento das vendas");
        }
        LocalDate from = date(startsAt);
        LocalDate to = date(endsAt);
        if (to.isBefore(from)) {
            throw OrgEventService.validation("O encerramento precisa ser depois do início");
        }
        return new Window(from.atStartOfDay(zone).toInstant(), to.plusDays(1).atStartOfDay(zone).toInstant());
    }

    private static LocalDate date(String raw) {
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException ex) {
            throw OrgEventService.validation("Data inválida: use AAAA-MM-DD");
        }
    }

    private String day(Instant i) {
        return i.atZone(zone).toLocalDate().toString();
    }

    private static long cents(BigDecimal reais) {
        try {
            return Money.toCents(reais);
        } catch (ArithmeticException ex) {
            throw OrgEventService.validation("Preço inválido");
        }
    }

    private void refreshEvent(Event e, Instant now) {
        if (e.getStatus() == EventStatus.PUBLISHED) {
            availability.recalculate(e, now);
        }
        e.setUpdatedAt(now);
    }

    private boolean typeReferenced(UUID typeId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists(select 1 from reservation_items where ticket_type_id = ?)
                    or exists(select 1 from order_lines where ticket_type_id = ?)
                    or exists(select 1 from tickets where ticket_type_id = ?)
                    or exists(select 1 from event_seat_sectors where ticket_type_id = ?)
                """, Boolean.class, typeId, typeId, typeId, typeId));
    }

    private Event lockEvent(OrgContext ctx, UUID eventId) {
        return events.lockOwned(eventId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
    }

    private static void assertOpen(Event e, Instant now) {
        String st = OrgEventMapper.status(e, now);
        if ("cancelled".equals(st) || "ended".equals(st)) {
            throw ApiException.conflict("INVALID_STATE", "Evento encerrado");
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    /** {@code draft} (evento em rascunho) · {@code sold-out} · {@code ended} (fora da janela ou evento encerrado) · {@code published}. */
    OrgLotDto toDto(Event e, TicketLot l, Instant now) {
        String eventStatus = OrgEventMapper.status(e, now);
        String status;
        if ("draft".equals(eventStatus)) {
            status = "draft";
        } else if (l.getQuantitySold() >= l.getQuantityTotal()) {
            status = "sold-out";
        } else if (!l.getSalesEnd().isAfter(now) || "ended".equals(eventStatus) || "cancelled".equals(eventStatus)) {
            status = "ended";
        } else {
            status = l.getStatus() == TicketLot.Status.PUBLISHED ? "published" : "draft";
        }
        return new OrgLotDto(l.getId().toString(), e.getId().toString(), l.getTicketType().getName(), l.getName(),
                Money.toReais(l.getPriceCents()), l.getQuantityTotal(), day(l.getSalesStart()), day(l.getSalesEnd().minusMillis(1)),
                l.getPerCustomerLimit(), l.isAutoOpenNext(), l.getQuantitySold(), status);
    }
}
