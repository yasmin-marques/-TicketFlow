package br.com.ticketflow.org.access;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Avisos do painel ("sino"), gravados na mesma transação do fato que os gerou. */
@Service
public class OrgNotifications {

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public OrgNotifications(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void add(UUID organizationId, String title, String body, String href) {
        jdbc.update("insert into org_notifications (id, organization_id, title, body, href, created_at) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), organizationId, truncate(title, 160), truncate(body, 500), href, Timestamp.from(clock.instant()));
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
