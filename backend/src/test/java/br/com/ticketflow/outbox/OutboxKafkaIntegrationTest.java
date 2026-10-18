package br.com.ticketflow.outbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.support.SalesTestSupport;
import br.com.ticketflow.support.TestBeans.CapturingSender;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.http.MediaType;

/** Outbox transacional → Kafka → consumidores idempotentes, com infraestrutura real. */
class OutboxKafkaIntegrationTest extends SalesTestSupport {

    @Autowired private OutboxRelay relay;
    @Autowired private KafkaTemplate<String, String> kafka;
    @Autowired private CapturingSender sender;
    @Value("${tf.kafka.topic}") private String topic;

    private Fx fx;

    @BeforeEach
    void setUp() {
        resetSalesData();
        fx = newEvent(5);
    }

    private String payOrder(Buyer b) throws Exception {
        Resp r = reserve(b, key(), reservationBody(fx, "[{\"ticketTypeId\":\"premium\",\"quantity\":1,\"seatIds\":[\"A01\"]}]"));
        Resp paid = order(b, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242"));
        assertThat(paid.status()).isEqualTo(201);
        return paid.body().path("id").asText();
    }

    private String outboxId(String type, String aggregateId) {
        return jdbc.queryForObject("select id::text from outbox_events where event_type = ? and aggregate_id = ?", String.class, type, aggregateId);
    }

    private int processed(String consumer, String eventId) {
        return jdbc.queryForObject("select count(*) from processed_events where consumer = ? and event_id = ?::uuid", Integer.class, consumer, eventId);
    }

    @Test
    void businessEventsAreWrittenAtomicallyAndDeliveredToKafkaConsumersExactlyOnce() throws Exception {
        Buyer b = newBuyer();
        String orderId = payOrder(b);

        // Gravado na mesma transação do pedido, antes de qualquer publicação.
        String eventId = outboxId("order.paid", orderId);
        assertThat(outboxId("ticket.issued", orderId)).isNotBlank();

        // O relay publica no Kafka; o consumidor processa e notifica o comprador uma única vez.
        relay.drain();
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            assertThat(jdbc.queryForObject("select published_at is not null from outbox_events where id = ?::uuid", Boolean.class, eventId)).isTrue();
            assertThat(processed("notifications", eventId)).isEqualTo(1);
        });
        assertThat(sender.count(b.email(), "order.paid")).isEqualTo(1);

        // Reentrega do MESMO evento (at-least-once): o consumidor reconhece e não repete o efeito.
        String redelivered = "{\"id\":\"" + eventId + "\",\"type\":\"order.paid\",\"aggregateType\":\"order\",\"aggregateId\":\"" + orderId
                + "\",\"occurredAt\":\"2030-01-01T00:00:00Z\",\"data\":{\"userId\":\"" + b.id() + "\"}}";
        kafka.send(topic, orderId, redelivered).get();
        kafka.send(topic, orderId, redelivered).get();
        // Marcador posterior na mesma chave (mesma partição): quando ele é processado, as duplicatas já foram vistas.
        String markerId = UUID.randomUUID().toString();
        kafka.send(topic, orderId, "{\"id\":\"" + markerId + "\",\"type\":\"noop\",\"aggregateType\":\"order\",\"aggregateId\":\"" + orderId
                + "\",\"occurredAt\":\"2030-01-01T00:00:00Z\",\"data\":{}}").get();
        await().atMost(Duration.ofSeconds(20)).until(() -> processed("notifications", markerId) == 1);

        assertThat(processed("notifications", eventId)).isEqualTo(1);
        assertThat(sender.count(b.email(), "order.paid")).isEqualTo(1);
    }

    @Test
    void relayRepublishingAnEventDoesNotDuplicateSideEffects() throws Exception {
        Buyer b = newBuyer();
        String orderId = payOrder(b);
        String eventId = outboxId("order.paid", orderId);
        relay.drain();
        await().atMost(Duration.ofSeconds(20)).until(() -> processed("notifications", eventId) == 1);

        // Simula "caiu depois de enviar e antes de marcar como publicado": o evento volta a ficar pendente.
        jdbc.update("update outbox_events set published_at = null where id = ?::uuid", eventId);
        relay.drain();
        String markerId = UUID.randomUUID().toString();
        kafka.send(topic, orderId, "{\"id\":\"" + markerId + "\",\"type\":\"noop\",\"aggregateType\":\"order\",\"aggregateId\":\"" + orderId
                + "\",\"occurredAt\":\"2030-01-01T00:00:00Z\",\"data\":{}}").get();
        await().atMost(Duration.ofSeconds(20)).until(() -> processed("notifications", markerId) == 1);

        assertThat(processed("notifications", eventId)).isEqualTo(1);
        assertThat(sender.count(b.email(), "order.paid")).isEqualTo(1);
    }

    @Test
    void aFailedBusinessTransactionLeavesNoEventBehind() throws Exception {
        Buyer b = newBuyer();
        Resp r = reserve(b, key(), reservationBody(fx, "[{\"ticketTypeId\":\"premium\",\"quantity\":1,\"seatIds\":[\"A01\"]}]"));
        long before = jdbc.queryForObject("select count(*) from outbox_events where event_type in ('order.paid','ticket.issued')", Long.class);

        Resp declined = order(b, key(), orderBody(r.body().path("id").asText(), "card", "tok_0002"));

        assertThat(declined.status()).isEqualTo(402);
        assertThat(jdbc.queryForObject("select count(*) from outbox_events where event_type in ('order.paid','ticket.issued')", Long.class)).isEqualTo(before);
    }

    @Test
    void waitlistedBuyersAreNotifiedOnceWhenStockReturns() throws Exception {
        resetSalesData();
        fx = newEvent(1); // um único ingresso geral
        Buyer holder = newBuyer();
        Buyer waiting = newBuyer();
        Resp r = reserve(holder, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]"));
        assertThat(r.status()).isEqualTo(201);
        assertThat(reserve(waiting, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]")).code()).isEqualTo("INSUFFICIENT_STOCK");

        String url = "/api/events/" + fx.eventId() + "/ticket-types/geral/waitlist";
        assertThat(send(waiting, post(url)).status()).isEqualTo(200);
        assertThat(send(waiting, post(url)).status()).isEqualTo(200); // idempotente
        assertThat(jdbc.queryForObject("select count(*) from waitlist_entries", Integer.class)).isEqualTo(1);
        assertThat(send(null, post(url).contentType(MediaType.APPLICATION_JSON)).status()).isEqualTo(401);

        // O comprador desiste: o estoque volta e quem estava na lista é avisado.
        assertThat(release(holder, r.body().path("id").asText()).status()).isEqualTo(200);
        relay.drain();
        await().atMost(Duration.ofSeconds(20)).until(() -> sender.count(waiting.email(), "waitlist.available") >= 1);

        // Outro evento de estoque não reenvia o aviso (notified_at já preenchido).
        Resp again = reserve(holder, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]"));
        release(holder, again.body().path("id").asText());
        relay.drain();
        String marker = UUID.randomUUID().toString();
        kafka.send(topic, fx.eventId(), "{\"id\":\"" + marker + "\",\"type\":\"noop\",\"data\":{}}").get();
        await().atMost(Duration.ofSeconds(20)).until(() -> processed("waitlist", marker) == 1);
        assertThat(sender.count(waiting.email(), "waitlist.available")).isEqualTo(1);
    }
}
