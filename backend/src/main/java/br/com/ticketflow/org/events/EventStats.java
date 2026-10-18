package br.com.ticketflow.org.events;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Números derivados de um evento, sempre calculados a partir do banco (nada é estimado):
 *
 * <ul>
 *   <li>{@code capacity}: soma das quantidades dos lotes;</li>
 *   <li>{@code sold}: ingressos emitidos ainda válidos ou já usados (reembolsados não contam);</li>
 *   <li>{@code revenueCents}: soma do subtotal dos pedidos pagos (sem a taxa de serviço, que não é do organizador);</li>
 *   <li>{@code checkedIn}: ingressos com check-in.</li>
 * </ul>
 */
@Component
public class EventStats {

    public record Stats(int capacity, int sold, long revenueCents, int checkedIn) {
        static final Stats EMPTY = new Stats(0, 0, 0, 0);
    }

    private final NamedParameterJdbcTemplate jdbc;

    public EventStats(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Stats of(UUID eventId) {
        return of(java.util.List.of(eventId)).getOrDefault(eventId, Stats.EMPTY);
    }

    public Map<UUID, Stats> of(Collection<UUID> eventIds) {
        Map<UUID, Stats> out = new HashMap<>();
        if (eventIds.isEmpty()) {
            return out;
        }
        jdbc.query("""
                select e.id,
                       coalesce((select sum(l.quantity_total) from ticket_lots l join ticket_types t on t.id = l.ticket_type_id
                                 where t.event_id = e.id), 0) as capacity,
                       (select count(*) from tickets k where k.event_id = e.id and k.status in ('VALID', 'USED')) as sold,
                       (select count(*) from tickets k where k.event_id = e.id and k.status = 'USED') as checked_in,
                       coalesce((select sum(o.subtotal_cents) from orders o where o.event_id = e.id and o.status = 'PAID'), 0) as revenue
                from events e where e.id in (:ids)
                """, new MapSqlParameterSource("ids", eventIds), rs -> {
            out.put(rs.getObject("id", UUID.class), new Stats(rs.getInt("capacity"), rs.getInt("sold"), rs.getLong("revenue"), rs.getInt("checked_in")));
        });
        return out;
    }

    public Stats get(Map<UUID, Stats> stats, UUID eventId) {
        return stats.getOrDefault(eventId, Stats.EMPTY);
    }
}
