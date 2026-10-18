package br.com.ticketflow.orders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.orders.service.PendingOrderExpiryService;
import br.com.ticketflow.payment.WebhookSignature;
import br.com.ticketflow.sales.service.ReservationExpiryService;
import br.com.ticketflow.support.SalesTestSupport;
import br.com.ticketflow.tickets.TicketQrService;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class OrdersIntegrationTest extends SalesTestSupport {

    private static final String WEBHOOK_SECRET = "whsec_test_secret_for_hmac_signatures_123456";

    @Autowired private PendingOrderExpiryService pendingExpiry;
    @Autowired private ReservationExpiryService reservationExpiry;
    @Autowired private TicketQrService qr;

    private Fx fx;

    @BeforeEach
    void setUp() {
        resetSalesData();
        fx = newEvent(10);
    }

    private String seatItem(String type, int qty, String... seats) {
        String ids = seats.length == 0 ? "" : ",\"seatIds\":[" + String.join(",", java.util.Arrays.stream(seats).map(s -> "\"" + s + "\"").toList()) + "]";
        return "{\"ticketTypeId\":\"" + type + "\",\"quantity\":" + qty + ids + "}";
    }

    private String reserveSeats(Buyer b, String... seats) throws Exception {
        Resp r = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", seats.length, seats) + "]"));
        assertThat(r.status()).as("reserva").isEqualTo(201);
        return r.body().path("id").asText();
    }

    private int ticketCount(String orderId) {
        return jdbc.queryForObject("select count(*) from tickets where order_id = ?::uuid", Integer.class, orderId);
    }

    private Resp webhook(String eventId, String type, String providerRef, long timestamp, String secret) throws Exception {
        String body = "{\"id\":\"" + eventId + "\",\"type\":\"" + type + "\",\"providerRef\":\"" + providerRef + "\"}";
        return send(null, post("/api/webhooks/payments/sandbox").contentType(MediaType.APPLICATION_JSON).content(body)
                .header("X-TF-Signature", WebhookSignature.sign(secret, timestamp, body)));
    }

    private Resp webhook(String eventId, String type, String providerRef) throws Exception {
        return webhook(eventId, type, providerRef, Instant.now().getEpochSecond(), WEBHOOK_SECRET);
    }

    private String providerRef(String orderId) {
        return jdbc.queryForObject("select provider_ref from orders where id = ?::uuid", String.class, orderId);
    }

    // ── 4. falha de pagamento ──────────────────────────────────────────────────────────────────────────

    @Test
    void aDeclinedPaymentChargesNothingAndKeepsTheReservationActive() throws Exception {
        Buyer b = newBuyer();
        String reservationId = reserveSeats(b, "A01", "A02");
        String declineKey = key();

        Resp declined = order(b, declineKey, orderBody(reservationId, "card", "tok_0002"));

        assertThat(declined.status()).isEqualTo(402);
        assertThat(declined.code()).isEqualTo("PAYMENT_DECLINED");
        assertThat(getReservation(b, reservationId).body().path("status").asText()).isEqualTo("active");
        assertThat(count("orders", fx)).isZero();
        assertThat(count("tickets", fx)).isZero();
        assertThat(seatStatus(fx, "A01")).isEqualTo("RESERVED");
        assertThat(lotHeld(fx, "premium")).isEqualTo(2);
        assertThat(lotSold(fx, "premium")).isZero();

        // Repetir a mesma chave devolve o mesmo 402 (sem nova tentativa de cobrança)...
        Resp replay = order(b, declineKey, orderBody(reservationId, "card", "tok_0002"));
        assertThat(replay.status()).isEqualTo(402);
        assertThat(replay.raw().getHeader("Idempotent-Replayed")).isEqualTo("true");

        // ...e o usuário pode tentar de novo com outro cartão na MESMA reserva.
        Resp ok = order(b, key(), orderBody(reservationId, "card", "tok_4242"));
        assertThat(ok.status()).isEqualTo(201);
        assertThat(ok.body().path("status").asText()).isEqualTo("paid");
    }

    // ── 5. pagamento confirmado ────────────────────────────────────────────────────────────────────────

    @Test
    void anApprovedCardPaymentIssuesTicketsExactlyOnce() throws Exception {
        Buyer b = newBuyer();
        Resp created = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 2, "A01", "A02") + "," + seatItem("geral", 2) + "]"));
        String reservationId = created.body().path("id").asText();
        String key = key();
        String body = orderBody(reservationId, "card", "tok_4242").replace("\"holders\":[]", "\"holders\":[{\"slot\":\"A01\",\"name\":\"Camila Duarte\"}]");

        Resp paid = order(b, key, body);
        Resp replay = order(b, key, body);

        assertThat(paid.status()).isEqualTo(201);
        assertThat(paid.body().path("status").asText()).isEqualTo("paid");
        assertThat(paid.body().path("code").asText()).startsWith("TF-");
        assertThat(paid.body().path("paymentMethod").asText()).isEqualTo("card");
        assertThat(paid.body().path("cardLast4").asText()).isEqualTo("4242");
        assertThat(paid.body().path("ticketCount").asInt()).isEqualTo(4);
        assertThat(paid.body().path("tickets")).hasSize(4);
        assertThat(paid.body().path("refundable").asBoolean()).isTrue();
        assertThat(paid.body().path("total").asDouble()).isEqualTo(484.0); // (2×120 + 2×100) + 10% de taxa
        // Repetição idempotente: mesmo pedido, nenhum ingresso a mais.
        assertThat(replay.status()).isEqualTo(201);
        assertThat(replay.body().path("id").asText()).isEqualTo(paid.body().path("id").asText());
        assertThat(ticketCount(paid.body().path("id").asText())).isEqualTo(4);
        assertThat(count("orders", fx)).isEqualTo(1);

        // Estoque e assentos viram "vendido"; nada continua preso.
        assertThat(seatStatus(fx, "A01")).isEqualTo("SOLD");
        assertThat(lotSold(fx, "premium")).isEqualTo(2);
        assertThat(lotSold(fx, "geral")).isEqualTo(2);
        assertThat(lotHeld(fx, "premium")).isZero();
        assertThat(lotHeld(fx, "geral")).isZero();

        // Ingressos: códigos únicos, titular informado, QR assinado.
        var tickets = paid.body().path("tickets");
        List<String> codes = new ArrayList<>();
        tickets.forEach(t -> codes.add(t.path("code").asText()));
        assertThat(codes).doesNotHaveDuplicates().allMatch(c -> c.matches("TF-[A-Z0-9]{4}-[A-Z0-9]{4}"));
        var seated = new ArrayList<com.fasterxml.jackson.databind.JsonNode>();
        tickets.forEach(t -> {
            if (t.has("seatId")) {
                seated.add(t);
            }
            assertThat(qr.verify(t.path("qrPayload").asText())).isPresent();
            assertThat(qr.verify(t.path("qrPayload").asText()).get().ticketId().toString()).isEqualTo(t.path("id").asText());
        });
        assertThat(seated).extracting(t -> t.path("seatId").asText()).containsExactlyInAnyOrder("A01", "A02");
        assertThat(seated.stream().filter(t -> t.path("seatId").asText().equals("A01")).findFirst().orElseThrow().path("holderName").asText())
                .isEqualTo("Camila Duarte");
        assertThat(seated.get(0).path("row").asText()).isEqualTo("A");
        assertThat(seated.get(0).path("sectorName").asText()).isEqualTo("Premium");
    }

    @Test
    void checkoutValidatesBuyerSeatsAndMethodAndNeverAcceptsRawCardData() throws Exception {
        Buyer b = newBuyer();
        String incomplete = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 2, "A01") + "]")).body().path("id").asText();

        Resp seats = order(b, key(), orderBody(incomplete, "pix", null));
        assertThat(seats.status()).isEqualTo(422);
        assertThat(seats.code()).isEqualTo("SEATS_INCOMPLETE");

        setSeats(b, incomplete, "premium", "[\"A01\",\"A02\"]");
        Resp badCpf = order(b, key(), orderBody(incomplete, "pix", null).replace("529.982.247-25", "111.111.111-11"));
        assertThat(badCpf.status()).isEqualTo(422);
        assertThat(badCpf.body().path("errors").has("cpf")).isTrue();

        Resp badMethod = order(b, key(), orderBody(incomplete, "bitcoin", null));
        assertThat(badMethod.status()).isEqualTo(422);

        Resp noToken = order(b, key(), orderBody(incomplete, "card", "").replace("\"token\":\"\"", "\"token\":\"\""));
        assertThat(noToken.status()).isEqualTo(422);

        // Número e CVV crus são recusados ANTES de qualquer registro e nunca voltam na resposta.
        String raw = "{\"reservationId\":\"" + incomplete + "\",\"buyer\":{\"name\":\"Maria Compradora\",\"email\":\"m@example.com\","
                + "\"phone\":\"(11) 98877-6655\",\"cpf\":\"529.982.247-25\",\"birthDate\":\"14/03/1994\"},\"holders\":[],"
                + "\"payment\":{\"method\":\"card\",\"card\":{\"number\":\"4242424242424242\",\"cvv\":\"123\",\"expiry\":\"12/30\",\"holderName\":\"MARIA\",\"installments\":1}}}";
        String rawKey = key();
        Resp rejected = order(b, rawKey, raw);
        assertThat(rejected.status()).isEqualTo(422);
        assertThat(rejected.code()).isEqualTo("CARD_DATA_NOT_ALLOWED");
        assertThat(rejected.raw().getContentAsString()).doesNotContain("4242424242424242").doesNotContain("123");
        assertThat(jdbc.queryForObject("select count(*) from idempotency_keys where idem_key = ?", Integer.class, rawKey)).isZero();
        assertThat(count("orders", fx)).isZero();
        assertThat(getReservation(b, incomplete).body().path("status").asText()).isEqualTo("active");
    }

    // ── Pix / boleto / webhook ─────────────────────────────────────────────────────────────────────────

    @Test
    void pixOrdersStayPendingHoldingStockUntilTheWebhookConfirms() throws Exception {
        Buyer b = newBuyer();
        String reservationId = reserveSeats(b, "A01");

        Resp pending = order(b, key(), orderBody(reservationId, "pix", null));

        assertThat(pending.status()).isEqualTo(201);
        assertThat(pending.body().path("status").asText()).isEqualTo("pending");
        assertThat(pending.body().path("pix").path("code").asText()).isNotBlank();
        assertThat(pending.body().path("pix").path("expiresAt").asText()).endsWith("-03:00");
        assertThat(pending.body().path("tickets")).isEmpty();
        String orderId = pending.body().path("id").asText();
        assertThat(ticketCount(orderId)).isZero(); // ingressos só depois da confirmação
        assertThat(seatStatus(fx, "A01")).isEqualTo("RESERVED");
        assertThat(lotHeld(fx, "premium")).isEqualTo(1);
        assertThat(getReservation(b, reservationId).body().path("status").asText()).isEqualTo("completed");

        Resp confirmed = webhook("evt_" + UUID.randomUUID(), "payment.confirmed", providerRef(orderId));

        assertThat(confirmed.status()).isEqualTo(200);
        assertThat(send(b, get("/api/orders/" + orderId)).body().path("status").asText()).isEqualTo("paid");
        assertThat(ticketCount(orderId)).isEqualTo(1);
        assertThat(seatStatus(fx, "A01")).isEqualTo("SOLD");
        assertThat(lotSold(fx, "premium")).isEqualTo(1);
        assertThat(lotHeld(fx, "premium")).isZero();
    }

    @Test
    void aRepeatedWebhookHasNoDuplicateEffects() throws Exception {
        Buyer b = newBuyer();
        String orderId = order(b, key(), orderBody(reserveSeats(b, "A01", "A02"), "boleto", null)).body().path("id").asText();
        String ref = providerRef(orderId);
        String eventId = "evt_" + UUID.randomUUID();

        Resp first = webhook(eventId, "payment.confirmed", ref);
        Resp sameEvent = webhook(eventId, "payment.confirmed", ref);
        Resp newEventSameOrder = webhook("evt_" + UUID.randomUUID(), "payment.confirmed", ref);

        assertThat(first.body().path("duplicate").asBoolean()).isFalse();
        assertThat(sameEvent.status()).isEqualTo(200);
        assertThat(sameEvent.body().path("duplicate").asBoolean()).isTrue();
        assertThat(newEventSameOrder.status()).isEqualTo(200);
        assertThat(ticketCount(orderId)).isEqualTo(2);
        assertThat(lotSold(fx, "premium")).isEqualTo(2);
        assertThat(count("orders", fx)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from outbox_events where event_type = 'order.paid' and aggregate_id = ?", Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void webhooksWithBadOrStaleSignaturesAreRejected() throws Exception {
        Buyer b = newBuyer();
        String orderId = order(b, key(), orderBody(reserveSeats(b, "A01"), "pix", null)).body().path("id").asText();
        String ref = providerRef(orderId);

        Resp forged = webhook("evt_" + UUID.randomUUID(), "payment.confirmed", ref, Instant.now().getEpochSecond(), "outro-segredo-qualquer-0123456789");
        Resp stale = webhook("evt_" + UUID.randomUUID(), "payment.confirmed", ref, Instant.now().minus(1, ChronoUnit.HOURS).getEpochSecond(), WEBHOOK_SECRET);
        Resp unsigned = send(null, post("/api/webhooks/payments/sandbox").contentType(MediaType.APPLICATION_JSON)
                .content("{\"id\":\"x\",\"type\":\"payment.confirmed\",\"providerRef\":\"" + ref + "\"}"));
        Resp wrongProvider = send(null, post("/api/webhooks/payments/outro").contentType(MediaType.APPLICATION_JSON).content("{}"));

        assertThat(forged.status()).isEqualTo(401);
        assertThat(forged.code()).isEqualTo("INVALID_SIGNATURE");
        assertThat(stale.status()).isEqualTo(401);
        assertThat(unsigned.status()).isEqualTo(401);
        assertThat(wrongProvider.status()).isEqualTo(404);
        assertThat(ticketCount(orderId)).isZero();
        assertThat(send(b, get("/api/orders/" + orderId)).body().path("status").asText()).isEqualTo("pending");
    }

    @Test
    void unpaidPendingOrdersExpireAndReleaseStockAndALatePaymentIsRefunded() throws Exception {
        Buyer b = newBuyer();
        String orderId = order(b, key(), orderBody(reserveSeats(b, "A01"), "pix", null)).body().path("id").asText();
        String ref = providerRef(orderId);
        jdbc.update("update orders set expires_at = ?, pix_expires_at = ? where id = ?::uuid",
                Timestamp.from(Instant.now().minusSeconds(60)), Timestamp.from(Instant.now().minusSeconds(60)), orderId);

        assertThat(pendingExpiry.expireDue()).isEqualTo(1);

        assertThat(send(b, get("/api/orders/" + orderId)).body().path("status").asText()).isEqualTo("expired");
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(lotHeld(fx, "premium")).isZero();

        // Pagamento que chega depois do prazo: não emite ingresso e dispara estorno.
        assertThat(webhook("evt_" + UUID.randomUUID(), "payment.confirmed", ref).status()).isEqualTo(200);
        assertThat(ticketCount(orderId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from outbox_events where event_type = 'payment.late-refunded' and aggregate_id = ?", Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void devSimulatePaymentConfirmsOnlyTheOwnersPendingOrder() throws Exception {
        Buyer owner = newBuyer();
        Buyer stranger = newBuyer();
        String orderId = order(owner, key(), orderBody(reserveSeats(owner, "A01"), "pix", null)).body().path("id").asText();

        assertThat(send(stranger, post("/api/dev/orders/" + orderId + "/simulate-payment")).status()).isEqualTo(404);
        Resp ok = send(owner, post("/api/dev/orders/" + orderId + "/simulate-payment"));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body().path("status").asText()).isEqualTo("paid");
        assertThat(send(owner, post("/api/dev/orders/" + orderId + "/simulate-payment")).status()).isEqualTo(409);
        assertThat(ticketCount(orderId)).isEqualTo(1);
    }

    // ── 7. checkouts concorrentes ──────────────────────────────────────────────────────────────────────

    @Test
    void concurrentCheckoutsOfTheSameReservationCreateOneOrder() throws Exception {
        Buyer b = newBuyer();
        String reservationId = reserveSeats(b, "A01", "A02");

        List<Callable<Resp>> tasks = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            tasks.add(() -> order(b, key(), orderBody(reservationId, "card", "tok_4242")));
        }
        List<Resp> results = concurrently(tasks);

        assertThat(results.stream().filter(r -> r.status() == 201)).hasSize(1);
        assertThat(results.stream().filter(r -> r.status() != 201)).allSatisfy(r -> {
            assertThat(r.status()).isEqualTo(409);
            assertThat(r.code()).isEqualTo("ALREADY_COMPLETED");
        });
        assertThat(count("orders", fx)).isEqualTo(1);
        assertThat(count("tickets", fx)).isEqualTo(2);
        assertThat(lotSold(fx, "premium")).isEqualTo(2);
        assertThat(seatStatus(fx, "A01")).isEqualTo("SOLD");
    }

    @Test
    void concurrentBuyersNeverSellMoreThanTheStock() throws Exception {
        resetSalesData();
        fx = newEvent(3); // só 3 ingressos gerais
        List<Buyer> buyers = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            buyers.add(newBuyer());
        }
        List<Callable<String>> tasks = buyers.stream().map(b -> (Callable<String>) () -> {
            Resp r = reserve(b, key(), reservationBody(fx, "[" + seatItem("geral", 1) + "]"));
            if (r.status() != 201) {
                return r.code();
            }
            Resp o = order(b, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242"));
            return o.status() == 201 ? "PAID" : o.code();
        }).toList();

        List<String> outcomes = concurrently(tasks);

        assertThat(outcomes.stream().filter("PAID"::equals)).hasSize(3);
        assertThat(outcomes.stream().filter(o -> !o.equals("PAID"))).allMatch("INSUFFICIENT_STOCK"::equals);
        assertThat(lotSold(fx, "geral")).isEqualTo(3);
        assertThat(lotHeld(fx, "geral")).isZero();
        assertThat(count("tickets", fx)).isEqualTo(3);
        assertThat(count("orders", fx)).isEqualTo(3);
    }

    @Test
    void buyersRacingForTheLastSeatsOfDifferentSectorsAllSucceedWithoutOverlap() throws Exception {
        List<Buyer> buyers = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            buyers.add(newBuyer());
        }
        String[] seats = {"A01", "A02", "A03", "A04"};
        List<Callable<Resp>> tasks = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            Buyer b = buyers.get(i);
            String seat = seats[i];
            tasks.add(() -> {
                Resp r = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 1, seat) + "]"));
                return order(b, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242"));
            });
        }
        List<Resp> results = concurrently(tasks);

        assertThat(results).allSatisfy(r -> assertThat(r.status()).isEqualTo(201));
        assertThat(lotSold(fx, "premium")).isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(distinct seat_id) from tickets where event_id = ?", Integer.class, fx.event().getId())).isEqualTo(4);
    }

    // ── reembolso ──────────────────────────────────────────────────────────────────────────────────────

    @Test
    void cancellingAPaidOrderRefundsReleasesSeatsAndCancelsTickets() throws Exception {
        Buyer b = newBuyer();
        Buyer other = newBuyer();
        String orderId = order(b, key(), orderBody(reserveSeats(b, "A01", "A02"), "card", "tok_4242")).body().path("id").asText();

        Resp refunded = send(b, post("/api/orders/" + orderId + "/cancel"));

        assertThat(refunded.status()).isEqualTo(200);
        assertThat(refunded.body().path("status").asText()).isEqualTo("refunded");
        assertThat(refunded.body().path("refundedAt").asText()).isNotBlank();
        assertThat(refunded.body().path("refundable").asBoolean()).isFalse();
        assertThat(jdbc.queryForObject("select count(*) from tickets where order_id = ?::uuid and status = 'CANCELLED'", Integer.class, orderId)).isEqualTo(2);
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(lotSold(fx, "premium")).isZero();
        assertThat(send(b, post("/api/orders/" + orderId + "/cancel")).status()).isEqualTo(409);
        // O assento volta a poder ser comprado por outra pessoa.
        assertThat(reserve(other, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "]")).status()).isEqualTo(201);
    }

    @Test
    void refundIsDeniedWhenTheEventIsLessThan48HoursAway() throws Exception {
        Buyer b = newBuyer();
        String orderId = order(b, key(), orderBody(reserveSeats(b, "A01"), "card", "tok_4242")).body().path("id").asText();
        jdbc.update("update events set starts_at = now() + interval '1 day', ends_at = now() + interval '1 day 4 hours' where id = ?", fx.event().getId());

        assertThat(send(b, get("/api/orders/" + orderId)).body().path("refundable").asBoolean()).isFalse();
        Resp denied = send(b, post("/api/orders/" + orderId + "/cancel"));

        assertThat(denied.status()).isEqualTo(422);
        assertThat(denied.code()).isEqualTo("REFUND_NOT_ALLOWED");
        assertThat(send(b, get("/api/orders/" + orderId)).body().path("status").asText()).isEqualTo("paid");
        assertThat(seatStatus(fx, "A01")).isEqualTo("SOLD");
    }

    @Test
    void cancellingAPendingOrderExpiresItAndReleasesTheHold() throws Exception {
        Buyer b = newBuyer();
        String orderId = order(b, key(), orderBody(reserveSeats(b, "A01"), "boleto", null)).body().path("id").asText();

        Resp cancelled = send(b, post("/api/orders/" + orderId + "/cancel"));

        assertThat(cancelled.status()).isEqualTo(200);
        assertThat(cancelled.body().path("status").asText()).isEqualTo("expired");
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(lotHeld(fx, "premium")).isZero();
    }

    // ── 8. acesso de outro usuário ─────────────────────────────────────────────────────────────────────

    @Test
    void usersCannotSeeOrChangeEachOthersReservationsOrdersAndTickets() throws Exception {
        Buyer owner = newBuyer();
        Buyer intruder = newBuyer();
        String reservationId = reserveSeats(owner, "A01");

        // reserva
        assertThat(getReservation(intruder, reservationId).status()).isEqualTo(404);
        assertThat(setSeats(intruder, reservationId, "premium", "[\"A02\"]").status()).isEqualTo(404);
        assertThat(release(intruder, reservationId).status()).isEqualTo(404);
        Resp steal = order(intruder, key(), orderBody(reservationId, "card", "tok_4242"));
        assertThat(steal.status()).isEqualTo(404);
        assertThat(getReservation(owner, reservationId).body().path("status").asText()).isEqualTo("active");
        assertThat(seatStatus(fx, "A01")).isEqualTo("RESERVED");

        // pedido e ingresso
        Resp paid = order(owner, key(), orderBody(reservationId, "card", "tok_4242"));
        String orderId = paid.body().path("id").asText();
        String ticketId = paid.body().path("tickets").get(0).path("id").asText();
        assertThat(send(intruder, get("/api/orders/" + orderId)).status()).isEqualTo(404);
        assertThat(send(intruder, post("/api/orders/" + orderId + "/cancel")).status()).isEqualTo(404);
        assertThat(send(intruder, get("/api/tickets/" + ticketId)).status()).isEqualTo(404);
        assertThat(send(intruder, post("/api/tickets/" + ticketId + "/transfer").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + intruder.email() + "x\"}")).status()).isEqualTo(404);
        assertThat(send(intruder, get("/api/orders")).body()).isEmpty();
        assertThat(send(intruder, get("/api/tickets")).body()).isEmpty();
        assertThat(send(owner, get("/api/orders")).body()).hasSize(1);

        // sem login
        assertThat(send(null, get("/api/orders")).status()).isEqualTo(401);
        assertThat(send(null, get("/api/tickets")).status()).isEqualTo(401);
        assertThat(send(null, get("/api/reservations/" + reservationId)).status()).isEqualTo(401);
        assertThat(send(null, post("/api/orders").contentType(MediaType.APPLICATION_JSON).content("{}")).status()).isEqualTo(401);
        assertThat(count("tickets", fx)).isEqualTo(1);
    }

    @Test
    void expiredReservationsAreAlsoSweptByTheJobWithoutTouchingPaidOnes() throws Exception {
        Buyer b = newBuyer();
        String paidOrder = order(b, key(), orderBody(reserveSeats(b, "A01"), "card", "tok_4242")).body().path("id").asText();
        Buyer c = newBuyer();
        String pendingReservation = reserveSeats(c, "A02");
        jdbc.update("update reservations set created_at = now() - interval '20 minutes', expires_at = now() - interval '10 minutes' where id = ?::uuid", pendingReservation);

        assertThat(reservationExpiry.expireDue()).isEqualTo(1);

        assertThat(seatStatus(fx, "A01")).isEqualTo("SOLD");
        assertThat(seatStatus(fx, "A02")).isEqualTo("AVAILABLE");
        assertThat(send(b, get("/api/orders/" + paidOrder)).body().path("status").asText()).isEqualTo("paid");
    }
}
