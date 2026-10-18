package br.com.ticketflow.org.orders;

import br.com.ticketflow.catalog.web.dto.PageDto;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.repository.OrderRepository;
import br.com.ticketflow.orders.service.FulfillmentService.RefundPolicy;
import br.com.ticketflow.org.access.AuditService;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgNotifications;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.web.OrgDtos.OrgOrderDto;
import br.com.ticketflow.org.web.OrgDtos.OrgOrderLineDto;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pedidos dos eventos da organização. Filtros, paginação e contagem rodam no PostgreSQL e TODA consulta inclui
 * {@code events.organization_id = :org} — um {@code eventId} de outra organização simplesmente não retorna nada.
 * Os dados expostos são os necessários à operação (sem CPF, telefone ou dados de pagamento além do final do cartão).
 *
 * <p>Status no painel: {@code paid}, {@code pending}, {@code refunded} e {@code declined} (pagamento não concluído:
 * Pix/boleto vencido ou recusado depois — recusas de cartão no checkout não chegam a criar pedido).
 */
@Service
public class OrgOrderService {

    public static final int MAX_PAGE_SIZE = 500;

    public record Query(String q, String eventId, String method, String status, String from, String to, int page, int pageSize) {}

    private static final String SELECT = """
            select o.id, o.code, o.event_id, e.title as event_title, o.buyer_name, o.buyer_email, o.subtotal_cents, o.fee_cents,
                   o.total_cents, o.payment_method, o.card_last4, o.created_at, o.status, o.expires_at,
                   (select coalesce(sum(l.quantity), 0) from order_lines l where l.order_id = o.id) as quantity
            from orders o join events e on e.id = o.event_id
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final OrderRepository orders;
    private final OrgRefunds refunds;
    private final AuditService audit;
    private final OrgNotifications notifications;
    private final Clock clock;
    private final ZoneId zone;

    public OrgOrderService(NamedParameterJdbcTemplate jdbc, OrderRepository orders, OrgRefunds refunds, AuditService audit,
                           OrgNotifications notifications, Clock clock, AppProperties props) {
        this.jdbc = jdbc;
        this.orders = orders;
        this.refunds = refunds;
        this.audit = audit;
        this.notifications = notifications;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    @Transactional(readOnly = true)
    public PageDto<OrgOrderDto> list(OrgContext ctx, Query query) {
        ctx.require(OrgPermission.VIEW_ORDERS);
        Instant now = clock.instant();
        MapSqlParameterSource p = new MapSqlParameterSource("org", ctx.organizationId()).addValue("now", Timestamp.from(now));
        StringBuilder where = new StringBuilder(" where e.organization_id = :org");

        if (notBlank(query.eventId())) {
            where.append(" and o.event_id = :eventId");
            p.addValue("eventId", uuid("eventId", query.eventId()));
        }
        if (notBlank(query.method())) {
            String m = query.method().trim().toUpperCase(Locale.ROOT);
            if (!List.of("CARD", "PIX", "BOLETO").contains(m)) {
                throw ApiException.badRequest("INVALID_PARAMETER", "Forma de pagamento inválida: " + query.method());
            }
            where.append(" and o.payment_method = :method");
            p.addValue("method", m);
        }
        if (notBlank(query.status())) {
            where.append(switch (query.status().trim()) {
                case "paid" -> " and o.status = 'PAID'";
                case "refunded" -> " and o.status = 'REFUNDED'";
                case "pending" -> " and o.status = 'PENDING' and (o.expires_at is null or o.expires_at > :now)";
                case "declined" -> " and (o.status = 'EXPIRED' or (o.status = 'PENDING' and o.expires_at <= :now))";
                default -> throw ApiException.badRequest("INVALID_PARAMETER", "Status inválido: " + query.status());
            });
        }
        LocalDate from = date("from", query.from());
        LocalDate to = date("to", query.to());
        if (from != null && to != null && to.isBefore(from)) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'to' não pode ser anterior a 'from'.");
        }
        if (from != null) {
            where.append(" and o.created_at >= :from");
            p.addValue("from", Timestamp.from(from.atStartOfDay(zone).toInstant()));
        }
        if (to != null) {
            where.append(" and o.created_at < :to");
            p.addValue("to", Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant()));
        }
        if (notBlank(query.q())) {
            where.append(" and (lower(o.code) like :q escape '\\' or lower(o.buyer_name) like :q escape '\\'"
                    + " or lower(o.buyer_email) like :q escape '\\' or lower(e.title) like :q escape '\\')");
            p.addValue("q", "%" + Texts.escapeLike(query.q().trim().toLowerCase(Locale.ROOT)) + "%");
        }

        long total = jdbc.queryForObject("select count(*) from orders o join events e on e.id = o.event_id" + where, p, Long.class);
        int pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, query.pageSize()));
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) pageSize));
        int page = Math.max(1, Math.min(query.page(), totalPages));
        p.addValue("limit", pageSize).addValue("offset", (page - 1) * pageSize);
        List<Row> rows = jdbc.query(SELECT + where + " order by o.created_at desc, o.id limit :limit offset :offset", p, this::row);
        return new PageDto<>(withLines(rows, now), total, page, pageSize, totalPages);
    }

    @Transactional(readOnly = true)
    public OrgOrderDto get(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.VIEW_ORDERS);
        return load(ctx, id);
    }

    /** Reembolso pelo organizador: {@code 409} se o pedido não está pago ou tem ingresso já utilizado. */
    @Transactional
    public OrgOrderDto refund(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.REFUND_ORDERS);
        orders.findIdIfOwned(id, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        Order order = orders.lockById(id).orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        refunds.refund(order, RefundPolicy.ORGANIZER);
        orders.flush();
        notifications.add(ctx.organizationId(), "Pedido reembolsado", "O pedido " + order.getCode() + " foi reembolsado pelo painel.", null);
        audit.record(ctx, "order.refunded", "order", order.getId(), Map.of("code", order.getCode(), "totalCents", order.getTotalCents()));
        return load(ctx, id);
    }

    // ── interno ────────────────────────────────────────────────────────────────────────────────────────

    private record Row(UUID id, String code, UUID eventId, String eventTitle, String buyerName, String buyerEmail, long subtotal, long fee,
                       long total, String method, String last4, Instant createdAt, String status, Instant expiresAt, int quantity) {}

    private OrgOrderDto load(OrgContext ctx, UUID id) {
        MapSqlParameterSource p = new MapSqlParameterSource("org", ctx.organizationId()).addValue("id", id);
        List<Row> rows = jdbc.query(SELECT + " where e.organization_id = :org and o.id = :id", p, this::row);
        if (rows.isEmpty()) {
            throw ApiException.notFound("Pedido não encontrado");
        }
        return withLines(rows, clock.instant()).get(0);
    }

    private Row row(ResultSet rs, int i) throws SQLException {
        Timestamp exp = rs.getTimestamp("expires_at");
        return new Row(rs.getObject("id", UUID.class), rs.getString("code"), rs.getObject("event_id", UUID.class), rs.getString("event_title"),
                rs.getString("buyer_name"), rs.getString("buyer_email"), rs.getLong("subtotal_cents"), rs.getLong("fee_cents"),
                rs.getLong("total_cents"), rs.getString("payment_method"), rs.getString("card_last4"), rs.getTimestamp("created_at").toInstant(),
                rs.getString("status"), exp == null ? null : exp.toInstant(), rs.getInt("quantity"));
    }

    private List<OrgOrderDto> withLines(List<Row> rows, Instant now) {
        Map<UUID, List<OrgOrderLineDto>> lines = new HashMap<>();
        if (!rows.isEmpty()) {
            jdbc.query("select order_id, description, quantity, unit_price_cents from order_lines where order_id in (:ids) order by order_id, position",
                    new MapSqlParameterSource("ids", rows.stream().map(Row::id).toList()), rs -> {
                        lines.computeIfAbsent(rs.getObject("order_id", UUID.class), k -> new ArrayList<>())
                                .add(new OrgOrderLineDto(rs.getString("description"), rs.getInt("quantity"), Money.toReais(rs.getLong("unit_price_cents"))));
                    });
        }
        return rows.stream().map(r -> new OrgOrderDto(r.id().toString(), r.code(), r.eventId().toString(), r.eventTitle(), r.buyerName(),
                r.buyerEmail(), r.quantity(), Money.toReais(r.subtotal()), Money.toReais(r.fee()), Money.toReais(r.total()),
                r.method().toLowerCase(Locale.ROOT), r.last4(), r.createdAt().atZone(zone).toOffsetDateTime(), status(r, now),
                lines.getOrDefault(r.id(), List.of()))).toList();
    }

    private static String status(Row r, Instant now) {
        return switch (r.status()) {
            case "PAID" -> "paid";
            case "REFUNDED" -> "refunded";
            case "EXPIRED" -> "declined";
            default -> r.expiresAt() != null && !r.expiresAt().isAfter(now) ? "declined" : "pending";
        };
    }

    private static LocalDate date(String name, String raw) {
        if (!notBlank(raw)) {
            return null;
        }
        try {
            return LocalDate.parse(raw.trim());
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'" + name + "' deve estar no formato YYYY-MM-DD.");
        }
    }

    static UUID uuid(String name, String raw) {
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "Parâmetro inválido: " + name);
        }
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
