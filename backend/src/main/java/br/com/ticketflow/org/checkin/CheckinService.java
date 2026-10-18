package br.com.ticketflow.org.checkin;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.org.access.AuditService;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.events.OrgEventMapper;
import br.com.ticketflow.org.web.OrgDtos.AttendeeDto;
import br.com.ticketflow.org.web.OrgDtos.CheckinEntryDto;
import br.com.ticketflow.org.web.OrgDtos.CheckinResultDto;
import br.com.ticketflow.org.web.OrgDtos.CheckinStatsDto;
import br.com.ticketflow.tickets.TicketQrService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Portaria. O veredito é SEMPRE do servidor:
 *
 * <ol>
 *   <li>o QR ({@code TF1.<ticketId>.<versão>.<assinatura>}) tem a assinatura HMAC verificada e a versão comparada com a do
 *       banco (um QR anterior a uma transferência não vale); o código legível ({@code TF-XXXX-XXXX}) também é aceito
 *       para digitação manual;</li>
 *   <li>o ingresso precisa ser DESTE evento, e o evento precisa estar publicado e não encerrado;</li>
 *   <li>a entrada é registrada com um único {@code UPDATE … WHERE status = 'VALID'}: duas leituras simultâneas do mesmo
 *       ingresso disputam a mesma linha e só uma altera — a outra vê {@code used}.</li>
 * </ol>
 * Toda leitura (válida ou não) fica em {@code checkin_scans}; check-ins manuais e reversões também vão para a auditoria.
 */
@Service
public class CheckinService {

    private static final Pattern READABLE_CODE = Pattern.compile("^TF-[A-Z0-9]{4}-[A-Z0-9]{4}$");
    private static final List<String> DEFAULT_GATES = List.of("Portão A", "Portão B", "Portão C");
    private static final String DEFAULT_GATE = "Portão A";

    private final EventRepository events;
    private final TicketQrService qr;
    private final AttendeeQueries attendees;
    private final AuditService audit;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final ZoneId zone;

    public CheckinService(EventRepository events, TicketQrService qr, AttendeeQueries attendees, AuditService audit, JdbcTemplate jdbc,
                          Clock clock, AppProperties props) {
        this.events = events;
        this.qr = qr;
        this.attendees = attendees;
        this.audit = audit;
        this.jdbc = jdbc;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    // ── Scanner ────────────────────────────────────────────────────────────────────────────────────────

    private record TicketInfo(UUID id, UUID eventId, String code, String status, int qrVersion, String holder, String typeName,
                              String sector, String seat, Instant usedAt, String gate) {}

    /** Sempre {@code 200} com {@code valid | used | invalid}; {@code 409 EVENT_NOT_ACTIVE} se o evento não aceita entradas. */
    @Transactional
    public CheckinResultDto scan(OrgContext ctx, UUID eventId, String rawCode, String rawGate) {
        ctx.require(OrgPermission.CHECKIN);
        Instant now = clock.instant();
        Event event = events.findOwned(eventId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
        assertActive(event, now);
        String gate = gate(rawGate);
        String input = rawCode.trim();

        Optional<TicketInfo> found;
        String shownCode;
        if (input.toUpperCase(Locale.ROOT).startsWith("TF1.")) {
            Optional<TicketQrService.Verified> v = qr.verify(input);
            if (v.isEmpty()) {
                return log(ctx, eventId, null, "QR inválido", gate, now,
                        invalid("QR inválido", "QR Code inválido ou adulterado"));
            }
            found = byId(v.get().ticketId());
            if (found.isPresent() && found.get().qrVersion() != v.get().version()) {
                TicketInfo t = found.get();
                return log(ctx, eventId, sameEvent(t, eventId) ? t : null, t.code(), gate, now,
                        invalid(t.code(), "QR Code substituído: o ingresso foi transferido e tem um QR novo"));
            }
            shownCode = found.map(TicketInfo::code).orElse("QR inválido");
        } else {
            String code = input.toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
            if (!READABLE_CODE.matcher(code).matches()) {
                return log(ctx, eventId, null, truncate(code), gate, now, invalid(truncate(code), "Código não reconhecido"));
            }
            found = byCode(code);
            shownCode = code;
        }

        // Ingresso de OUTRO evento: não revela nada sobre ele (pode ser de outra organização).
        if (found.isEmpty() || !sameEvent(found.get(), eventId)) {
            return log(ctx, eventId, null, shownCode, gate, now, invalid(shownCode, "Ingresso inválido para este evento"));
        }
        TicketInfo t = found.get();
        if ("CANCELLED".equals(t.status())) {
            return log(ctx, eventId, t, t.code(), gate, now,
                    new CheckinResultDto("invalid", t.code(), "Ingresso cancelado ou reembolsado", t.holder(), null, null, null, null, null));
        }

        int updated = jdbc.update("""
                update tickets set status = 'USED', used_at = ?, checked_in_gate = ?, checked_in_by = ?, version = version + 1
                where id = ? and event_id = ? and status = 'VALID' and qr_version = ?
                """, Timestamp.from(now), gate, ctx.userId(), t.id(), eventId, t.qrVersion());
        if (updated == 1) {
            return log(ctx, eventId, t, t.code(), gate, now, new CheckinResultDto("valid", t.code(), "Entrada autorizada", t.holder(),
                    t.typeName(), t.sector(), t.seat(), null, null));
        }
        // Perdeu a corrida (ou o estado mudou entre a leitura e o UPDATE): relê e responde com o estado atual.
        TicketInfo current = byId(t.id()).orElseThrow();
        if ("USED".equals(current.status())) {
            return log(ctx, eventId, current, current.code(), gate, now, new CheckinResultDto("used", current.code(), "Ingresso já utilizado",
                    current.holder(), current.typeName(), current.sector(), current.seat(), at(current.usedAt()), current.gate()));
        }
        if ("CANCELLED".equals(current.status())) {
            return log(ctx, eventId, current, current.code(), gate, now, invalid(current.code(), "Ingresso cancelado ou reembolsado"));
        }
        // Transferido no meio da leitura: o QR/código lido já foi substituído.
        return log(ctx, eventId, current, current.code(), gate, now, invalid(current.code(), "Ingresso transferido: use o QR Code atual"));
    }

    @Transactional(readOnly = true)
    public CheckinStatsDto stats(OrgContext ctx, UUID eventId) {
        ctx.require(OrgPermission.CHECKIN);
        Event event = events.findOwned(eventId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
        Instant now = clock.instant();
        Map<String, Object> counts = jdbc.queryForMap("""
                select count(*) filter (where status in ('VALID', 'USED')) as sold, count(*) filter (where status = 'USED') as checked
                from tickets where event_id = ?
                """, eventId);
        Long recentValid = jdbc.queryForObject("select count(*) from checkin_scans where event_id = ? and result = 'valid' and created_at >= ?",
                Long.class, eventId, Timestamp.from(now.minus(Duration.ofMinutes(10))));
        LinkedHashSet<String> gates = new LinkedHashSet<>(DEFAULT_GATES);
        gates.addAll(jdbc.queryForList("select distinct gate from checkin_scans where event_id = ? and gate <> 'Manual' order by gate", String.class, eventId));
        List<CheckinEntryDto> recent = jdbc.query("""
                select id, created_at, result, code, holder_name, gate from checkin_scans
                where event_id = ? and result <> 'undone' order by created_at desc, id limit 12
                """, (rs, i) -> new CheckinEntryDto(rs.getObject("id", UUID.class).toString(), at(rs.getTimestamp("created_at").toInstant()),
                rs.getString("result"), rs.getString("code"), rs.getString("holder_name"), rs.getString("gate")), eventId);
        return new CheckinStatsDto(event.getId().toString(), event.getTitle(), ((Number) counts.get("checked")).longValue(),
                ((Number) counts.get("sold")).longValue(), Math.round((recentValid == null ? 0 : recentValid) / 10.0 * 10) / 10.0,
                new ArrayList<>(gates), recent);
    }

    // ── Check-in manual (lista de participantes) ───────────────────────────────────────────────────────

    @Transactional
    public AttendeeDto manual(OrgContext ctx, UUID ticketId, String rawGate) {
        ctx.require(OrgPermission.CHECKIN);
        Instant now = clock.instant();
        TicketInfo t = ownedTicket(ctx, ticketId);
        Event event = events.findById(t.eventId()).orElseThrow();
        assertActive(event, now);
        String gate = rawGate == null || rawGate.isBlank() ? "Manual" : gate(rawGate);
        int updated = jdbc.update("""
                update tickets set status = 'USED', used_at = ?, checked_in_gate = ?, checked_in_by = ?, version = version + 1
                where id = ? and status = 'VALID'
                """, Timestamp.from(now), gate, ctx.userId(), ticketId);
        if (updated == 0) {
            TicketInfo current = byId(ticketId).orElseThrow();
            throw "USED".equals(current.status())
                    ? ApiException.conflict("ALREADY_USED", "Check-in já realizado")
                    : ApiException.conflict("INVALID_STATE", "Ingresso cancelado");
        }
        insertScan(ctx, t.eventId(), t.id(), t.code(), "valid", gate, t.holder(), now);
        audit.record(ctx, "checkin.manual", "ticket", ticketId, Map.of("eventId", t.eventId().toString(), "gate", gate));
        return attendees.one(ticketId);
    }

    /** Desfaz um check-in (correção de erro da portaria). Só gerente/proprietário, com evento ainda ativo. */
    @Transactional
    public AttendeeDto undo(OrgContext ctx, UUID ticketId) {
        ctx.require(OrgPermission.UNDO_CHECKIN);
        Instant now = clock.instant();
        TicketInfo t = ownedTicket(ctx, ticketId);
        Event event = events.findById(t.eventId()).orElseThrow();
        String st = OrgEventMapper.status(event, now);
        if ("cancelled".equals(st)) {
            throw ApiException.conflict("INVALID_STATE", "O evento foi cancelado");
        }
        int updated = jdbc.update("""
                update tickets set status = 'VALID', used_at = null, checked_in_gate = null, checked_in_by = null, version = version + 1
                where id = ? and status = 'USED'
                """, ticketId);
        if (updated == 0) {
            throw ApiException.conflict("INVALID_STATE", "Este ingresso não tem check-in para desfazer");
        }
        insertScan(ctx, t.eventId(), t.id(), t.code(), "undone", "Manual", t.holder(), now);
        audit.record(ctx, "checkin.undone", "ticket", ticketId, Map.of("eventId", t.eventId().toString(),
                "previousGate", t.gate() == null ? "" : t.gate(), "previousAt", t.usedAt() == null ? "" : t.usedAt().toString()));
        return attendees.one(ticketId);
    }

    // ── interno ────────────────────────────────────────────────────────────────────────────────────────

    private void assertActive(Event event, Instant now) {
        if (!"published".equals(OrgEventMapper.status(event, now))) {
            throw new ApiException(HttpStatus.CONFLICT, "EVENT_NOT_ACTIVE", "O check-in só está disponível para eventos publicados e em andamento");
        }
    }

    private TicketInfo ownedTicket(OrgContext ctx, UUID ticketId) {
        return query("""
                where k.id = ? and k.event_id in (select id from events where organization_id = ?)
                """, ticketId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Ingresso não encontrado"));
    }

    private Optional<TicketInfo> byId(UUID id) {
        return query("where k.id = ?", id);
    }

    private Optional<TicketInfo> byCode(String code) {
        return query("where k.code = ?", code);
    }

    private Optional<TicketInfo> query(String where, Object... args) {
        List<TicketInfo> list = jdbc.query("""
                select k.id, k.event_id, k.code, k.status, k.qr_version, k.holder_name, k.used_at, k.checked_in_gate,
                       t.name as type_name, coalesce(sec.name, t.name) as sector, s.code as seat
                from tickets k
                  join ticket_types t on t.id = k.ticket_type_id
                  left join event_seats s on s.id = k.seat_id
                  left join event_seat_sectors sec on sec.event_id = k.event_id and sec.code = t.sector_code
                """ + where, (rs, i) -> {
            Timestamp used = rs.getTimestamp("used_at");
            return new TicketInfo(rs.getObject("id", UUID.class), rs.getObject("event_id", UUID.class), rs.getString("code"),
                    rs.getString("status"), rs.getInt("qr_version"), rs.getString("holder_name"), rs.getString("type_name"),
                    rs.getString("sector"), rs.getString("seat"), used == null ? null : used.toInstant(), rs.getString("checked_in_gate"));
        }, args);
        return list.stream().findFirst();
    }

    private static boolean sameEvent(TicketInfo t, UUID eventId) {
        return t.eventId().equals(eventId);
    }

    private CheckinResultDto log(OrgContext ctx, UUID eventId, TicketInfo t, String code, String gate, Instant now, CheckinResultDto result) {
        insertScan(ctx, eventId, t == null ? null : t.id(), code, result.result(), gate, t == null ? null : t.holder(), now);
        return result;
    }

    private void insertScan(OrgContext ctx, UUID eventId, UUID ticketId, String code, String result, String gate, String holder, Instant now) {
        jdbc.update("""
                insert into checkin_scans (id, event_id, ticket_id, code, result, gate, holder_name, operator_id, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), eventId, ticketId, truncate(code), result, gate, holder, ctx.userId(), Timestamp.from(now));
    }

    private static CheckinResultDto invalid(String code, String message) {
        return new CheckinResultDto("invalid", code, message, null, null, null, null, null, null);
    }

    private static String gate(String raw) {
        String g = raw == null ? "" : raw.trim().replaceAll("[\\p{Cntrl}]", "");
        return g.isEmpty() ? DEFAULT_GATE : g.substring(0, Math.min(60, g.length()));
    }

    private static String truncate(String s) {
        return s.length() <= 40 ? s : s.substring(0, 40);
    }

    private OffsetDateTime at(Instant i) {
        return i == null ? null : i.atZone(zone).toOffsetDateTime();
    }
}
