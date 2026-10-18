package br.com.ticketflow.org.checkin;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.web.OrgDtos.AttendeeDto;
import br.com.ticketflow.org.web.OrgDtos.AttendeesResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Participantes (um por ingresso emitido) dos eventos da organização. O e-mail exibido é o do dono atual do ingresso
 * (ou o e-mail para o qual foi transferido); sem CPF nem telefone.
 */
@Component
public class AttendeeQueries {

    public static final int MAX_PAGE_SIZE = 500;

    private static final String FROM = """
            from tickets k
              join events e on e.id = k.event_id
              join orders o on o.id = k.order_id
              join ticket_types t on t.id = k.ticket_type_id
              left join users u on u.id = k.owner_user_id
              left join event_seats s on s.id = k.seat_id
              left join event_seat_sectors sec on sec.event_id = k.event_id and sec.code = t.sector_code
            """;

    private static final String COLUMNS = """
            select k.id, k.code, k.holder_name, coalesce(u.email, k.transfer_email, o.buyer_email) as email, k.event_id, o.code as order_code,
                   t.name as type_name, coalesce(sec.name, t.name) as sector, s.code as seat, k.status, k.used_at, k.checked_in_gate
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final ZoneId zone;

    public AttendeeQueries(NamedParameterJdbcTemplate jdbc, AppProperties props) {
        this.jdbc = jdbc;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    @Transactional(readOnly = true)
    public AttendeesResponse list(OrgContext ctx, String eventId, String q, String status, int page, int pageSize) {
        ctx.require(OrgPermission.CHECKIN);
        MapSqlParameterSource p = new MapSqlParameterSource("org", ctx.organizationId());
        StringBuilder scope = new StringBuilder(" where e.organization_id = :org");
        if (eventId != null && !eventId.isBlank()) {
            scope.append(" and k.event_id = :eventId");
            p.addValue("eventId", parse(eventId));
        }
        StringBuilder where = new StringBuilder(scope);
        if (status != null && !status.isBlank()) {
            where.append(switch (status.trim()) {
                case "checked-in" -> " and k.status = 'USED'";
                case "waiting" -> " and k.status = 'VALID'";
                case "cancelled" -> " and k.status = 'CANCELLED'";
                default -> throw ApiException.badRequest("INVALID_PARAMETER", "Status inválido: " + status);
            });
        }
        if (q != null && !q.isBlank()) {
            where.append(" and (lower(k.holder_name) like :q escape '\\' or lower(k.code) like :q escape '\\'"
                    + " or lower(coalesce(u.email, k.transfer_email, o.buyer_email)) like :q escape '\\')");
            p.addValue("q", "%" + Texts.escapeLike(q.trim().toLowerCase(Locale.ROOT)) + "%");
        }

        Map<String, Object> totals = jdbc.queryForMap("select count(*) filter (where k.status = 'USED') as checked,"
                + " count(*) filter (where k.status in ('VALID', 'USED')) as sold " + FROM + scope, p);
        long total = jdbc.queryForObject("select count(*) " + FROM + where, p, Long.class);
        int size = Math.max(1, Math.min(MAX_PAGE_SIZE, pageSize));
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) size));
        int current = Math.max(1, Math.min(page, totalPages));
        p.addValue("limit", size).addValue("offset", (current - 1) * size);
        List<AttendeeDto> items = jdbc.query(COLUMNS + FROM + where + " order by lower(k.holder_name), k.code limit :limit offset :offset", p, this::row);
        return new AttendeesResponse(items, total, current, size, totalPages, ((Number) totals.get("checked")).longValue(),
                ((Number) totals.get("sold")).longValue());
    }

    /** Um participante (já validada a organização pelo chamador). */
    public AttendeeDto one(UUID ticketId) {
        return jdbc.query(COLUMNS + FROM + " where k.id = :id", new MapSqlParameterSource("id", ticketId), this::row).get(0);
    }

    private AttendeeDto row(ResultSet rs, int i) throws SQLException {
        Timestamp used = rs.getTimestamp("used_at");
        String status = switch (rs.getString("status")) {
            case "USED" -> "checked-in";
            case "CANCELLED" -> "cancelled";
            default -> "waiting";
        };
        return new AttendeeDto(rs.getObject("id", UUID.class).toString(), rs.getString("code"), rs.getString("holder_name"), rs.getString("email"),
                rs.getObject("event_id", UUID.class).toString(), rs.getString("order_code"), rs.getString("type_name"), rs.getString("sector"),
                rs.getString("seat"), status, used == null ? null : used.toInstant().atZone(zone).toOffsetDateTime(), rs.getString("checked_in_gate"));
    }

    private static UUID parse(String raw) {
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "Parâmetro inválido: eventId");
        }
    }
}
