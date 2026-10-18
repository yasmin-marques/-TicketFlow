package br.com.ticketflow.org.reports;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.events.EventStats;
import br.com.ticketflow.org.events.EventStats.Stats;
import br.com.ticketflow.org.events.OrgEventMapper;
import br.com.ticketflow.org.web.OrgDtos.CheckinKpi;
import br.com.ticketflow.org.web.OrgDtos.DashboardDto;
import br.com.ticketflow.org.web.OrgDtos.DayRevenue;
import br.com.ticketflow.org.web.OrgDtos.DayTickets;
import br.com.ticketflow.org.web.OrgDtos.EventRevenue;
import br.com.ticketflow.org.web.OrgDtos.FunnelStep;
import br.com.ticketflow.org.web.OrgDtos.Kpi;
import br.com.ticketflow.org.web.OrgDtos.LotSales;
import br.com.ticketflow.org.web.OrgDtos.NamedTickets;
import br.com.ticketflow.org.web.OrgDtos.OrgEventSummaryDto;
import br.com.ticketflow.org.web.OrgDtos.ReportDto;
import br.com.ticketflow.org.web.OrgDtos.SectorOccupancy;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dashboard e relatórios. TODOS os números vêm do banco:
 *
 * <ul>
 *   <li>receita = soma do subtotal dos pedidos com status {@code PAID} (reembolsados saem), pela data de pagamento;</li>
 *   <li>vendidos no período = ingressos desses pedidos; vendidos no total / check-ins = ingressos emitidos;</li>
 *   <li>ocupação = vendidos ÷ soma das quantidades dos lotes;</li>
 *   <li>funil = reservas criadas → pedidos criados → pedidos pagos (o backend não rastreia visitas à página, então não há
 *       "visitas" nem conversão visita→compra; {@code conversionBasis} diz qual é a base usada).</li>
 * </ul>
 * Dias agrupados no fuso de São Paulo.
 */
@Service
public class OrgReportService {

    private static final Set<Integer> RANGES = Set.of(7, 30, 90);
    private static final int MAX_REPORT_DAYS = 400;

    private final NamedParameterJdbcTemplate jdbc;
    private final EventRepository events;
    private final EventStats stats;
    private final OrgEventMapper mapper;
    private final Clock clock;
    private final ZoneId zone;

    public OrgReportService(NamedParameterJdbcTemplate jdbc, EventRepository events, EventStats stats, OrgEventMapper mapper, Clock clock,
                            AppProperties props) {
        this.jdbc = jdbc;
        this.events = events;
        this.stats = stats;
        this.mapper = mapper;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    // ── GET /org/dashboard ─────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public DashboardDto dashboard(OrgContext ctx, int requestedRange, String eventIdParam) {
        ctx.require(OrgPermission.VIEW_REPORTS);
        int range = RANGES.contains(requestedRange) ? requestedRange : 30;
        Instant now = clock.instant();
        Instant from = now.minus(Duration.ofDays(range));
        Instant prevFrom = from.minus(Duration.ofDays(range));
        UUID eventId = eventIdParam == null || eventIdParam.isBlank() ? null : uuid(eventIdParam);
        if (eventId != null) {
            events.findOwned(eventId, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
        }

        List<Event> all = events.findAllOwned(ctx.organizationId()).stream().filter(e -> eventId == null || e.getId().equals(eventId)).toList();
        Map<UUID, Stats> s = stats.of(all.stream().map(Event::getId).toList());
        List<Event> live = all.stream().filter(e -> Set.of("published", "ended").contains(OrgEventMapper.status(e, now))).toList();

        MapSqlParameterSource p = scope(ctx, eventId).addValue("from", ts(from)).addValue("prevFrom", ts(prevFrom)).addValue("now", ts(now))
                .addValue("tz", zone.getId());
        Map<String, Object> w = jdbc.queryForMap("""
                select coalesce(sum(o.subtotal_cents) filter (where o.paid_at >= :from), 0) as cur_rev,
                       coalesce(sum(o.subtotal_cents) filter (where o.paid_at < :from), 0) as prev_rev,
                       coalesce(sum(q.qty) filter (where o.paid_at >= :from), 0) as cur_qty,
                       coalesce(sum(q.qty) filter (where o.paid_at < :from), 0) as prev_qty
                from orders o join events e on e.id = o.event_id
                  cross join lateral (select coalesce(sum(l.quantity), 0) as qty from order_lines l where l.order_id = o.id) q
                where e.organization_id = :org and (cast(:eventId as uuid) is null or e.id = :eventId)
                  and o.status = 'PAID' and o.paid_at >= :prevFrom and o.paid_at <= :now
                """, p);
        long curRev = num(w.get("cur_rev"));
        long prevRev = num(w.get("prev_rev"));
        long curQty = num(w.get("cur_qty"));
        long prevQty = num(w.get("prev_qty"));

        long capacity = live.stream().mapToLong(e -> stats.get(s, e.getId()).capacity()).sum();
        long soldAll = live.stream().mapToLong(e -> stats.get(s, e.getId()).sold()).sum();
        long checked = live.stream().mapToLong(e -> stats.get(s, e.getId()).checkedIn()).sum();
        double occNow = capacity == 0 ? 0 : soldAll * 100.0 / capacity;
        double occThen = capacity == 0 ? 0 : Math.max(0, soldAll - curQty) * 100.0 / capacity;

        // Vendas por dia (ingressos de pedidos pagos), janela inteira com zeros.
        Map<String, Long> perDay = new LinkedHashMap<>();
        LocalDate today = LocalDate.ofInstant(now, zone);
        for (int i = range - 1; i >= 0; i--) {
            perDay.put(today.minusDays(i).toString(), 0L);
        }
        jdbc.query("""
                select to_char(o.paid_at at time zone :tz, 'YYYY-MM-DD') as day, sum(l.quantity) as qty
                from orders o join events e on e.id = o.event_id join order_lines l on l.order_id = o.id
                where e.organization_id = :org and (cast(:eventId as uuid) is null or e.id = :eventId)
                  and o.status = 'PAID' and o.paid_at >= :from and o.paid_at <= :now
                group by 1
                """, p, rs -> {
            long qty = rs.getLong("qty");
            perDay.computeIfPresent(rs.getString("day"), (k, v) -> v + qty);
        });
        List<DayTickets> salesByDay = perDay.entrySet().stream().map(en -> new DayTickets(en.getKey(), en.getValue())).toList();

        List<NamedTickets> byTypeAll = jdbc.query("""
                select t.name, sum(l.quantity) as qty
                from orders o join events e on e.id = o.event_id join order_lines l on l.order_id = o.id
                  join ticket_types t on t.id = l.ticket_type_id
                where e.organization_id = :org and (cast(:eventId as uuid) is null or e.id = :eventId)
                  and o.status = 'PAID' and o.paid_at >= :from and o.paid_at <= :now
                group by t.name order by qty desc, t.name
                """, p, (rs, i) -> new NamedTickets(rs.getString("name"), rs.getLong("qty")));
        List<NamedTickets> byType = new ArrayList<>(byTypeAll.stream().limit(4).toList());
        long others = byTypeAll.stream().skip(4).mapToLong(NamedTickets::tickets).sum();
        if (others > 0) {
            byType.add(new NamedTickets("Outros", others));
        }

        // Acumulado (vendidos antes da janela + vendas do dia), ~12 pontos.
        List<DayTickets> cumulative = new ArrayList<>();
        long acc = Math.max(0, soldAll - curQty);
        int step = Math.max(1, range / 11);
        for (int i = 0; i < salesByDay.size(); i++) {
            acc += salesByDay.get(i).tickets();
            if (i % step == 0 || i == salesByDay.size() - 1) {
                cumulative.add(new DayTickets(salesByDay.get(i).date(), acc));
            }
        }

        List<EventRevenue> revenueByEvent = live.stream()
                .map(e -> new EventRevenue(e.getId().toString(), e.getTitle(), Money.toReais(stats.get(s, e.getId()).revenueCents())))
                .filter(r -> r.revenue().signum() > 0)
                .sorted(Comparator.comparing(EventRevenue::revenue).reversed())
                .limit(5).toList();

        Map<String, Integer> order = Map.of("published", 0, "draft", 1, "ended", 2);
        List<OrgEventSummaryDto> active = all.stream()
                .filter(e -> !"cancelled".equals(OrgEventMapper.status(e, now)))
                .sorted(Comparator.comparing((Event e) -> order.getOrDefault(OrgEventMapper.status(e, now), 3)).thenComparing(Event::getStartsAt))
                .limit(8)
                .map(e -> mapper.toSummary(e, stats.get(s, e.getId()), now))
                .toList();

        return new DashboardDto(range, eventId == null ? null : eventId.toString(), mapper.at(now),
                new Kpi(Money.toReais(curRev), pct(curRev, prevRev)),
                new Kpi(BigDecimal.valueOf(curQty), pct(curQty, prevQty)),
                new Kpi(BigDecimal.valueOf(Math.round(occNow)), BigDecimal.valueOf(occNow - occThen).setScale(1, RoundingMode.HALF_UP)),
                new CheckinKpi(checked, soldAll == 0 ? 0 : Math.round(checked * 100.0 / soldAll)),
                salesByDay, byType, cumulative, capacity, revenueByEvent, active);
    }

    // ── GET /org/reports ───────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public ReportDto report(OrgContext ctx, String eventIdParam, String fromParam, String toParam) {
        ctx.require(OrgPermission.VIEW_REPORTS);
        Instant now = clock.instant();
        Event e;
        if (eventIdParam != null && !eventIdParam.isBlank()) {
            e = events.findOwned(uuid(eventIdParam), ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
        } else {
            e = events.findAllOwned(ctx.organizationId()).stream()
                    .filter(x -> Set.of("published", "ended").contains(OrgEventMapper.status(x, now)))
                    .findFirst()
                    .orElseThrow(() -> ApiException.notFound("Nenhum evento para o relatório"));
        }
        LocalDate today = LocalDate.ofInstant(now, zone);
        LocalDate from = date("from", fromParam, today.minusDays(45));
        LocalDate to = date("to", toParam, today);
        if (to.isBefore(from)) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'to' não pode ser anterior a 'from'.");
        }
        if (ChronoUnit.DAYS.between(from, to) > MAX_REPORT_DAYS) {
            throw ApiException.badRequest("INVALID_PARAMETER", "O período pode ter no máximo " + MAX_REPORT_DAYS + " dias.");
        }
        MapSqlParameterSource p = new MapSqlParameterSource("event", e.getId())
                .addValue("from", ts(from.atStartOfDay(zone).toInstant()))
                .addValue("to", ts(to.plusDays(1).atStartOfDay(zone).toInstant()))
                .addValue("tz", zone.getId());

        Map<String, Long> daily = new LinkedHashMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            daily.put(d.toString(), 0L);
        }
        long[] totals = new long[2];
        jdbc.query("""
                select to_char(o.paid_at at time zone :tz, 'YYYY-MM-DD') as day, sum(o.subtotal_cents) as rev,
                       sum((select coalesce(sum(l.quantity), 0) from order_lines l where l.order_id = o.id)) as qty
                from orders o
                where o.event_id = :event and o.status = 'PAID' and o.paid_at >= :from and o.paid_at < :to
                group by 1
                """, p, rs -> {
            long rev = rs.getLong("rev");
            daily.computeIfPresent(rs.getString("day"), (k, v) -> v + rev);
            totals[0] += rev;
            totals[1] += rs.getLong("qty");
        });
        long revenue = totals[0];
        long sold = totals[1];
        Stats st = stats.of(e.getId());

        Map<String, Object> f = jdbc.queryForMap("""
                select (select count(*) from reservations r where r.event_id = :event and r.created_at >= :from and r.created_at < :to) as reservations,
                       (select count(*) from reservations r where r.event_id = :event and r.created_at >= :from and r.created_at < :to
                          and r.status = 'EXPIRED') as expired,
                       (select count(*) from orders o where o.event_id = :event and o.created_at >= :from and o.created_at < :to) as orders,
                       (select count(*) from orders o where o.event_id = :event and o.created_at >= :from and o.created_at < :to
                          and o.paid_at is not null) as paid
                """, p);
        long reservations = num(f.get("reservations"));
        long paid = num(f.get("paid"));

        List<LotSales> byLot = jdbc.query("""
                select t.name as type_name, l.name as lot_name, l.quantity_sold, l.quantity_total
                from ticket_lots l join ticket_types t on t.id = l.ticket_type_id
                where t.event_id = :event order by t.position, l.position
                """, p, (rs, i) -> new LotSales(rs.getString("type_name"), rs.getString("lot_name"), rs.getLong("quantity_sold"), rs.getLong("quantity_total")));

        List<SectorOccupancy> bySector = e.isHasSeatMap()
                ? jdbc.query("""
                        select coalesce(sec.name, s.sector_code) as name,
                               count(*) filter (where s.status = 'SOLD') as sold, count(*) as total
                        from event_seats s left join event_seat_sectors sec on sec.event_id = s.event_id and sec.code = s.sector_code
                        where s.event_id = :event and not s.blocked
                        group by 1 order by 1
                        """, p, (rs, i) -> new SectorOccupancy(rs.getString("name"), pctOf(rs.getLong("sold"), rs.getLong("total"))))
                : jdbc.query("""
                        select t.name, sum(l.quantity_sold) as sold, sum(l.quantity_total) as total
                        from ticket_lots l join ticket_types t on t.id = l.ticket_type_id
                        where t.event_id = :event group by t.name, t.position order by t.position
                        """, p, (rs, i) -> new SectorOccupancy(rs.getString("name"), pctOf(rs.getLong("sold"), rs.getLong("total"))));

        return new ReportDto(e.getId().toString(), from.toString(), to.toString(), Money.toReais(revenue), sold,
                pctOf(st.sold(), st.capacity()),
                sold == 0 ? BigDecimal.ZERO : Money.toReais(revenue).divide(BigDecimal.valueOf(sold), 2, RoundingMode.HALF_UP),
                st.checkedIn(), pctOf(st.checkedIn(), st.sold()),
                ratio(paid, reservations), ratio(num(f.get("expired")), reservations),
                daily.entrySet().stream().map(en -> new DayRevenue(en.getKey(), Money.toReais(en.getValue()))).toList(),
                List.of(new FunnelStep("Reservas criadas", reservations), new FunnelStep("Pedidos criados", num(f.get("orders"))),
                        new FunnelStep("Pagos", paid)),
                byLot, bySector, "reservation-to-paid");
    }

    // ── interno ────────────────────────────────────────────────────────────────────────────────────────

    private static MapSqlParameterSource scope(OrgContext ctx, UUID eventId) {
        return new MapSqlParameterSource("org", ctx.organizationId()).addValue("eventId", eventId, java.sql.Types.OTHER);
    }

    /** Variação percentual com 1 casa; {@code null} sem base de comparação. */
    private static BigDecimal pct(long cur, long prev) {
        if (prev <= 0) {
            return null;
        }
        return BigDecimal.valueOf((cur - prev) * 100.0 / prev).setScale(1, RoundingMode.HALF_UP);
    }

    private static BigDecimal ratio(long part, long whole) {
        return whole == 0 ? BigDecimal.ZERO : BigDecimal.valueOf(part * 100.0 / whole).setScale(1, RoundingMode.HALF_UP);
    }

    private static long pctOf(long part, long whole) {
        return whole == 0 ? 0 : Math.round(part * 100.0 / whole);
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.from(i);
    }

    private static UUID uuid(String raw) {
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "Parâmetro inválido: eventId");
        }
    }

    private static LocalDate date(String name, String raw, LocalDate fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'" + name + "' deve estar no formato YYYY-MM-DD.");
        }
    }
}
