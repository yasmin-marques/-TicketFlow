package br.com.ticketflow.outbox;

import br.com.ticketflow.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Publica no Kafka os eventos pendentes do outbox (entrega "pelo menos uma vez"; os consumidores são idempotentes).
 *
 * <p>Se o Kafka estiver fora do ar nada se perde: os eventos continuam no banco e são reenviados depois. Se o
 * processo cair entre o envio e a marcação como publicado, o evento é reenviado — por isso o {@code id} do evento é
 * enviado em um cabeçalho e no corpo, e quem consome deduplica.
 */
@Component
@ConditionalOnProperty(prefix = "tf.kafka", name = "enabled", havingValue = "true")
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);
    private static final int BATCH = 100;

    private final OutboxRepository repository;
    private final KafkaTemplate<String, String> kafka;
    private final TransactionTemplate tx;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final String topic;
    private final boolean scheduled;

    public OutboxRelay(OutboxRepository repository, KafkaTemplate<String, String> kafka, TransactionTemplate tx,
                       ObjectMapper mapper, Clock clock, AppProperties props) {
        this.repository = repository;
        this.kafka = kafka;
        this.tx = tx;
        this.mapper = mapper;
        this.clock = clock;
        this.topic = props.kafka().topic();
        this.scheduled = props.jobs().outboxEnabled();
    }

    @Scheduled(fixedDelayString = "${tf.outbox.poll-ms:1000}")
    public void poll() {
        if (scheduled) {
            drain();
        }
    }

    /** Publica tudo que estiver pendente; devolve quantos eventos foram enviados. */
    public int drain() {
        int total = 0;
        while (true) {
            Integer sent = tx.execute(status -> publishBatch());
            if (sent == null || sent == 0) {
                return total;
            }
            total += sent;
        }
    }

    private int publishBatch() {
        List<OutboxEvent> batch = repository.lockPending(PageRequest.of(0, BATCH));
        int sent = 0;
        for (OutboxEvent e : batch) {
            try {
                ProducerRecord<String, String> record = new ProducerRecord<>(topic, e.getAggregateId(), envelope(e));
                record.headers().add("event-id", e.getId().toString().getBytes(StandardCharsets.UTF_8));
                record.headers().add("event-type", e.getEventType().getBytes(StandardCharsets.UTF_8));
                kafka.send(record).get(10, TimeUnit.SECONDS);
                e.setPublishedAt(clock.instant());
                sent++;
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception ex) {
                e.setAttempts(e.getAttempts() + 1);
                e.setLastError(String.valueOf(ex.getMessage()).substring(0, Math.min(250, String.valueOf(ex.getMessage()).length())));
                log.warn("Falha ao publicar evento {} ({}); será reenviado: {}", e.getId(), e.getEventType(), ex.toString());
                break; // preserva a ordem: não pula para eventos posteriores
            }
        }
        return sent;
    }

    private String envelope(OutboxEvent e) throws Exception {
        ObjectNode n = mapper.createObjectNode();
        n.put("id", e.getId().toString());
        n.put("type", e.getEventType());
        n.put("aggregateType", e.getAggregateType());
        n.put("aggregateId", e.getAggregateId());
        n.put("occurredAt", e.getCreatedAt().toString());
        n.set("data", mapper.readTree(e.getPayload()));
        return mapper.writeValueAsString(n);
    }
}
