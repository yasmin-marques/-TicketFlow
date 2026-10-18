package br.com.ticketflow.sales.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.TicketTypeRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.realtime.SeatUpdateBus;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationItem;
import br.com.ticketflow.sales.domain.ReservationStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.ReservationRepository;
import br.com.ticketflow.sales.web.dto.SalesDtos.CreateReservationRequest;
import br.com.ticketflow.sales.web.dto.SalesDtos.ReservationDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.ReservationItemRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reservas temporárias. Garantias de consistência (todas no PostgreSQL):
 *
 * <ul>
 *   <li><b>Assentos:</b> {@code SELECT … FOR UPDATE} em ordem de id; quem chega depois espera o commit do primeiro,
 *       enxerga o assento ocupado e recebe {@code 409 SEAT_UNAVAILABLE}.</li>
 *   <li><b>Ingressos sem assento:</b> {@code UPDATE … WHERE vendidos + segurados + q <= total} atômico.</li>
 *   <li><b>Uma reserva ativa por usuário:</b> índice único parcial.</li>
 *   <li><b>Prazo:</b> {@code expires_at} é definido na criação e NUNCA renovado.</li>
 * </ul>
 */
@Service
public class ReservationService {

    private final ReservationRepository reservations;
    private final EventRepository events;
    private final TicketTypeRepository ticketTypes;
    private final EventSeatRepository seats;
    private final LotStock stock;
    private final HoldService holds;
    private final ReservationExpiryService expiry;
    private final SalesService sales;
    private final ReservationMapper mapper;
    private final SeatUpdateBus bus;
    private final ReservationGuard guard;
    private final Clock clock;
    private final AppProperties props;

    public ReservationService(ReservationRepository reservations, EventRepository events, TicketTypeRepository ticketTypes,
                              EventSeatRepository seats, LotStock stock, HoldService holds, ReservationExpiryService expiry,
                              SalesService sales, ReservationMapper mapper, SeatUpdateBus bus, ReservationGuard guard, Clock clock,
                              AppProperties props) {
        this.reservations = reservations;
        this.events = events;
        this.ticketTypes = ticketTypes;
        this.seats = seats;
        this.stock = stock;
        this.holds = holds;
        this.expiry = expiry;
        this.sales = sales;
        this.mapper = mapper;
        this.bus = bus;
        this.guard = guard;
        this.clock = clock;
        this.props = props;
    }

    // ── POST /reservations ─────────────────────────────────────────────────────────────────────────────

    @Transactional
    public ReservationDto create(UUID userId, CreateReservationRequest req) {
        Instant now = clock.instant();
        UUID eventId = parseUuid(req.eventId());
        validateItems(req.items());

        Event event = events.findVisibleById(eventId, now).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));
        expiry.expireDueForEvent(eventId); // devolve o estoque de reservas vencidas deste evento

        List<SeatUpdate> updates = new ArrayList<>();
        // Criar uma reserva libera a anterior do mesmo usuário (de qualquer evento).
        reservations.lockActiveByUser(userId).ifPresent(old -> holds.release(old, ReservationStatus.RELEASED, updates));
        reservations.flush(); // o UPDATE da antiga precisa preceder o INSERT da nova (índice único parcial)

        Map<String, TicketType> typesByCode = ticketTypes.findByEventIdOrderByPositionAsc(eventId).stream()
                .collect(Collectors.toMap(TicketType::getCode, t -> t));

        Instant expiresAt = now.plus(props.sales().reservationTtl());
        Reservation reservation = Reservation.create(userId, event, event.getServiceFeePct(), now, expiresAt);

        // 1) Valida tipos e lotes (tudo ou nada: qualquer exceção desfaz a transação inteira).
        record Line(ReservationItemRequest in, TicketType type, TicketLot lot) {}
        List<Line> lines = new ArrayList<>();
        for (ReservationItemRequest in : req.items()) {
            TicketType type = typesByCode.get(in.ticketTypeId());
            if (type == null) {
                throw validation("Ingresso inválido.");
            }
            TicketLot lot = LotSelector.open(type, now).orElseThrow(() -> noOpenLot(type, now));
            List<String> seatIds = in.seatIds() == null ? List.of() : in.seatIds();
            if (type.getKind() == TicketKind.GENERAL && !seatIds.isEmpty()) {
                throw validation("Este tipo de ingresso não tem assento marcado.");
            }
            if (seatIds.size() > in.quantity()) {
                throw validation("Mais assentos do que ingressos.");
            }
            lines.add(new Line(in, type, lot));
        }

        // 2) Segura o estoque dos lotes, em ordem estável de lote (evita deadlock entre compradores).
        for (Line l : lines.stream().sorted(Comparator.comparing(x -> x.lot().getId())).toList()) {
            if (!stock.hold(l.lot().getId(), l.in().quantity())) {
                throw new ApiException(HttpStatus.CONFLICT, "INSUFFICIENT_STOCK",
                        "Restam poucos ingressos de " + l.type().getName() + ". Reduza a quantidade.");
            }
        }
        for (Line l : lines) {
            long unit = l.lot().getPriceCents();
            reservation.addItem(ReservationItem.of(l.type(), l.lot(), l.in().quantity(), unit, feeCents(unit, event.getServiceFeePct())));
        }
        reservations.saveAndFlush(reservation);

        // 3) Assentos escolhidos já na criação.
        Map<String, List<String>> wanted = new LinkedHashMap<>();
        for (Line l : lines) {
            if (l.in().seatIds() != null && !l.in().seatIds().isEmpty()) {
                wanted.put(l.type().getCode(), l.in().seatIds());
            }
        }
        if (!wanted.isEmpty()) {
            Map<String, TicketType> seated = wanted.keySet().stream().collect(Collectors.toMap(c -> c, typesByCode::get));
            claimSeats(userId, reservation, seated, wanted, Set.of(), now, updates);
        }

        bus.publishAfterCommit(updates);
        return mapper.toDto(reservation);
    }

    // ── GET /reservations/{id} ─────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public ReservationDto get(UUID userId, UUID id) {
        Reservation r = reservations.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Reserva não encontrada"));
        return mapper.toDto(r);
    }

    // ── PUT /reservations/{id}/items/{ticketTypeId}/seats ──────────────────────────────────────────────

    /** Substitui os assentos de um item. Reenviar o mesmo conjunto não muda nada (idempotente). */
    @Transactional
    public ReservationDto setSeats(UUID userId, UUID id, String typeCode, List<String> requested) {
        failIfExpired(id, userId);
        Instant now = clock.instant();
        Reservation r = reservations.lockByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Reserva não encontrada"));
        assertUsable(r, now);

        ReservationItem item = r.getItems().stream().filter(i -> i.getTicketType().getCode().equals(typeCode)).findFirst()
                .filter(i -> i.getTicketType().getKind() == TicketKind.SEATED)
                .orElseThrow(() -> ApiException.notFound("Item da reserva não encontrado"));

        List<String> wanted = requested == null ? List.of() : requested;
        if (new HashSet<>(wanted).size() != wanted.size()) {
            throw validation("Assentos repetidos.");
        }
        if (wanted.size() > item.getQuantity()) {
            throw validation("Você escolheu ingressos para " + item.getQuantity() + " assento(s).");
        }

        List<SeatUpdate> updates = new ArrayList<>();
        String sector = item.getTicketType().getSectorCode();
        Set<String> current = seats.findByReservationId(r.getId()).stream()
                .filter(s -> s.getSectorCode().equals(sector)).map(EventSeat::getCode).collect(Collectors.toSet());
        claimSeats(userId, r, Map.of(typeCode, item.getTicketType()), Map.of(typeCode, wanted), current, now, updates);

        bus.publishAfterCommit(updates);
        return mapper.toDto(r);
    }

    // ── DELETE /reservations/{id} ──────────────────────────────────────────────────────────────────────

    @Transactional
    public void release(UUID userId, UUID id) {
        Reservation r = reservations.lockByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Reserva não encontrada"));
        if (r.isActive()) {
            List<SeatUpdate> updates = new ArrayList<>();
            holds.release(r, ReservationStatus.RELEASED, updates);
            updates.replaceAll(u -> new SeatUpdate(u.eventId(), u.seatId(), u.status(), userId));
            bus.publishAfterCommit(updates);
        }
    }

    // ── internos ───────────────────────────────────────────────────────────────────────────────────────

    /**
     * Trava (em UM comando, ordenado) os assentos desejados e os já mantidos, valida e aplica a diferença.
     * Lança {@code 409 SEAT_UNAVAILABLE} (com vizinhos sugeridos) se algum já não está livre — a transação toda
     * é desfeita, então nada fica pela metade.
     */
    private void claimSeats(UUID userId, Reservation r, Map<String, TicketType> types, Map<String, List<String>> wanted,
                            Set<String> currentlyHeld, Instant now, List<SeatUpdate> updates) {
        UUID eventId = r.getEvent().getId();
        Set<String> toLock = new LinkedHashSet<>(currentlyHeld);
        wanted.values().forEach(toLock::addAll);
        if (toLock.isEmpty()) {
            return;
        }
        Map<String, EventSeat> locked = seats.lockByCodes(eventId, toLock).stream().collect(Collectors.toMap(EventSeat::getCode, s -> s));

        // Existência e setor corretos.
        for (var entry : wanted.entrySet()) {
            TicketType type = types.get(entry.getKey());
            for (String code : entry.getValue()) {
                EventSeat s = locked.get(code);
                if (s == null || !s.getSectorCode().equals(type.getSectorCode())) {
                    throw validation("O assento " + code + " não pertence ao setor " + (type.getSectorCode() == null ? "" : type.getSectorCode()) + ".");
                }
            }
        }

        // Disputa: o que mais alguém levou.
        Set<String> allWanted = wanted.values().stream().flatMap(List::stream).collect(Collectors.toCollection(LinkedHashSet::new));
        List<EventSeat> lost = allWanted.stream().map(locked::get).filter(s -> !s.isFreeFor(r.getId(), now)).toList();
        if (!lost.isEmpty()) {
            List<String> suggestions = sales.neighbors(eventId, lost.get(0), allWanted, r.getId(), now);
            throw new ApiException(HttpStatus.CONFLICT, "SEAT_UNAVAILABLE",
                    "Esse assento (" + lost.stream().map(EventSeat::getCode).collect(Collectors.joining(", ")) + ") acabou de ser reservado por outra pessoa.")
                    .with("seatIds", lost.stream().map(EventSeat::getCode).toList())
                    .with("suggestions", suggestions);
        }

        // Aplica a diferença: solta o que saiu, segura o que entrou.
        for (String code : currentlyHeld) {
            if (!allWanted.contains(code)) {
                EventSeat s = locked.get(code);
                if (s != null && r.getId().equals(s.getReservationId())) {
                    s.release(now);
                    updates.add(new SeatUpdate(eventId, code, "available", userId));
                }
            }
        }
        for (String code : allWanted) {
            EventSeat s = locked.get(code);
            if (!(s.getStatus() == br.com.ticketflow.sales.domain.SeatStatus.RESERVED && r.getId().equals(s.getReservationId()))) {
                s.hold(r.getId(), r.getExpiresAt(), now);
                updates.add(new SeatUpdate(eventId, code, "reserved", userId));
            }
        }
    }

    private void failIfExpired(UUID id, UUID userId) {
        guard.failIfExpired(id, userId);
    }

    /**
     * Sem lote aberto: se há lote na janela de venda cujo estoque está apenas SEGURADO por outras reservas, o ingresso
     * pode voltar (INSUFFICIENT_STOCK, vale tentar de novo); caso contrário o lote está esgotado/fechado (LOT_CLOSED).
     */
    private static ApiException noOpenLot(TicketType type, Instant now) {
        boolean temporarilyHeld = type.getLots().stream().anyMatch(l -> l.getStatus() == TicketLot.Status.PUBLISHED
                && !l.getSalesStart().isAfter(now) && l.getSalesEnd().isAfter(now)
                && l.getQuantitySold() < l.getQuantityTotal() && l.available() <= 0);
        return temporarilyHeld
                ? new ApiException(HttpStatus.CONFLICT, "INSUFFICIENT_STOCK", "Restam poucos ingressos de " + type.getName() + ". Reduza a quantidade.")
                : new ApiException(HttpStatus.CONFLICT, "LOT_CLOSED", "O lote de " + type.getName() + " não está disponível.");
    }

    private void assertUsable(Reservation r, Instant now) {
        if (!r.isActive() || r.isExpiredAt(now)) {
            throw expired();
        }
    }

    static ApiException expired() {
        return ReservationGuard.expired();
    }

    private void validateItems(List<ReservationItemRequest> items) {
        if (items == null || items.isEmpty()) {
            throw validation("Escolha ao menos um ingresso");
        }
        long total = 0;
        Set<String> seen = new HashSet<>();
        for (ReservationItemRequest i : items) {
            if (i.quantity() < 1) {
                throw validation("Quantidade inválida.");
            }
            if (!seen.add(i.ticketTypeId())) {
                throw validation("Tipo de ingresso repetido.");
            }
            total += i.quantity();
        }
        if (total > props.sales().maxPerOrder()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "LIMIT_EXCEEDED",
                    "Limite de " + props.sales().maxPerOrder() + " ingressos por pedido");
        }
    }

    static long feeCents(long unitPriceCents, BigDecimal pct) {
        return BigDecimal.valueOf(unitPriceCents).multiply(pct).divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP).longValueExact();
    }

    static ApiException validation(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", message);
    }

    static UUID parseUuid(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.notFound("Evento não encontrado.");
        }
    }
}
