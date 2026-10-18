package br.com.ticketflow.org.settings;

import br.com.ticketflow.common.Texts;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.web.OrgDtos.NoticeDto;
import br.com.ticketflow.org.web.OrgDtos.SearchEvent;
import br.com.ticketflow.org.web.OrgDtos.SearchOrder;
import br.com.ticketflow.org.web.OrgDtos.SearchResults;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Avisos do painel (lidos por usuário) e busca global (⌘K), sempre restritos à organização da sessão. */
@Service
public class OrgInboxService {

    private static final int NOTICE_LIMIT = 30;
    private static final int SEARCH_LIMIT = 5;

    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;
    private final ZoneId zone;

    public OrgInboxService(NamedParameterJdbcTemplate jdbc, Clock clock, AppProperties props) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    @Transactional(readOnly = true)
    public List<NoticeDto> notices(OrgContext ctx) {
        MapSqlParameterSource p = new MapSqlParameterSource("org", ctx.organizationId()).addValue("user", ctx.userId()).addValue("limit", NOTICE_LIMIT);
        return jdbc.query("""
                select n.id, n.title, n.body, n.href, n.created_at, (r.user_id is not null) as read
                from org_notifications n
                  left join org_notification_reads r on r.notification_id = n.id and r.user_id = :user
                where n.organization_id = :org
                order by n.created_at desc, n.id limit :limit
                """, p, (rs, i) -> new NoticeDto(rs.getObject("id", UUID.class).toString(), rs.getString("title"), rs.getString("body"),
                rs.getTimestamp("created_at").toInstant().atZone(zone).toOffsetDateTime(), rs.getBoolean("read"), rs.getString("href")));
    }

    @Transactional
    public void markAllRead(OrgContext ctx) {
        Instant now = clock.instant();
        jdbc.update("""
                insert into org_notification_reads (notification_id, user_id, read_at)
                select n.id, :user, :now from org_notifications n where n.organization_id = :org
                on conflict do nothing
                """, new MapSqlParameterSource("org", ctx.organizationId()).addValue("user", ctx.userId()).addValue("now", Timestamp.from(now)));
    }

    /** Eventos por título; pedidos por código, comprador ou e-mail (pedidos só para quem pode vê-los). */
    @Transactional(readOnly = true)
    public SearchResults search(OrgContext ctx, String raw) {
        String q = raw == null ? "" : raw.trim();
        if (q.length() < 2) {
            return new SearchResults(List.of(), List.of());
        }
        String like = "%" + Texts.escapeLike(q.toLowerCase(Locale.ROOT)) + "%";
        MapSqlParameterSource p = new MapSqlParameterSource("org", ctx.organizationId()).addValue("q", like).addValue("limit", SEARCH_LIMIT)
                .addValue("now", Timestamp.from(clock.instant()));
        List<SearchEvent> events = ctx.can(OrgPermission.VIEW_EVENTS) ? jdbc.query("""
                select id, title, case
                         when status = 'DRAFT' then 'draft' when status = 'CANCELLED' then 'cancelled'
                         when status = 'ENDED' or coalesce(ends_at, starts_at) < :now then 'ended' else 'published' end as st
                from events where organization_id = :org and lower(title) like :q escape '\\'
                order by starts_at desc limit :limit
                """, p, (rs, i) -> new SearchEvent(rs.getObject("id", UUID.class).toString(), rs.getString("title"), rs.getString("st")))
                : List.of();
        List<SearchOrder> orders = ctx.can(OrgPermission.VIEW_ORDERS) ? jdbc.query("""
                select o.id, o.code, o.buyer_name, e.title from orders o join events e on e.id = o.event_id
                where e.organization_id = :org and (lower(o.code) like :q escape '\\' or lower(o.buyer_name) like :q escape '\\'
                      or lower(o.buyer_email) like :q escape '\\')
                order by o.created_at desc limit :limit
                """, p, (rs, i) -> new SearchOrder(rs.getObject("id", UUID.class).toString(), rs.getString("code"), rs.getString("buyer_name"),
                rs.getString("title")))
                : List.of();
        return new SearchResults(events, orders);
    }
}
