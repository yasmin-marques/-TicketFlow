package br.com.ticketflow.outbox;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Deduplicação de consumidores: {@code (consumer, event_id)} é chave primária, então processar o mesmo evento duas
 * vezes (reentrega do Kafka, reenvio do outbox) é detectado pelo próprio banco. Deve ser usado na MESMA transação
 * dos efeitos colaterais do consumidor.
 */
@Component
public class ProcessedEvents {

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public ProcessedEvents(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** {@code true} se é a primeira vez que este consumidor vê o evento. */
    public boolean markIfNew(String consumer, UUID eventId) {
        return jdbc.update(
                        "insert into processed_events (consumer, event_id, processed_at) values (?, ?, ?) on conflict do nothing",
                        consumer, eventId, Timestamp.from(clock.instant()))
                == 1;
    }
}
