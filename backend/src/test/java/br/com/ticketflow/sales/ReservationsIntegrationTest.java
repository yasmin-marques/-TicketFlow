package br.com.ticketflow.sales;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.sales.service.ReservationExpiryService;
import br.com.ticketflow.support.SalesTestSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class ReservationsIntegrationTest extends SalesTestSupport {

    @Autowired private ReservationExpiryService expiry;

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

    // ── 1. disputa pelo mesmo assento ──────────────────────────────────────────────────────────────────

    @Test
    void ofManyBuyersRacingForTheSameSeatExactlyOneWins() throws Exception {
        int contenders = 8;
        List<Buyer> buyers = new ArrayList<>();
        for (int i = 0; i < contenders; i++) {
            buyers.add(newBuyer());
        }
        String body = reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "]");

        List<Callable<Resp>> tasks = buyers.stream().map(b -> (Callable<Resp>) () -> reserve(b, key(), body)).toList();
        List<Resp> results = concurrently(tasks);

        assertThat(results.stream().filter(r -> r.status() == 201)).hasSize(1);
        List<Resp> losers = results.stream().filter(r -> r.status() != 201).toList();
        assertThat(losers).hasSize(contenders - 1);
        assertThat(losers).allSatisfy(r -> {
            assertThat(r.status()).isEqualTo(409);
            assertThat(r.code()).isEqualTo("SEAT_UNAVAILABLE");
            assertThat(r.body().path("seatIds").get(0).asText()).isEqualTo("A01");
        });

        // O banco concorda: um único dono, um único estoque segurado, e as reservas perdedoras nem existem.
        assertThat(seatStatus(fx, "A01")).isEqualTo("RESERVED");
        assertThat(jdbc.queryForObject("select count(*) from event_seats where reservation_id is not null and event_id = ?", Integer.class, fx.event().getId())).isEqualTo(1);
        assertThat(lotHeld(fx, "premium")).isEqualTo(1);
        assertThat(count("reservations", fx)).isEqualTo(1);
    }

    @Test
    void losingARaceSuggestsFreeNeighboursAndLeavesNothingHeld() throws Exception {
        Buyer first = newBuyer();
        Buyer second = newBuyer();
        assertThat(reserve(first, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A02") + "]")).status()).isEqualTo(201);

        Resp lost = reserve(second, key(), reservationBody(fx, "[" + seatItem("premium", 2, "A02", "A03") + "]"));

        assertThat(lost.status()).isEqualTo(409);
        assertThat(lost.code()).isEqualTo("SEAT_UNAVAILABLE");
        assertThat(lost.body().path("seatIds")).extracting(n -> n.asText()).containsExactly("A02");
        assertThat(lost.body().path("suggestions")).extracting(n -> n.asText()).contains("A01");
        // A03 (que estava livre) não ficou presa pela tentativa fracassada.
        assertThat(seatStatus(fx, "A03")).isEqualTo("AVAILABLE");
        assertThat(lotHeld(fx, "premium")).isEqualTo(1);
    }

    // ── 2. idempotência ────────────────────────────────────────────────────────────────────────────────

    @Test
    void repeatingTheSameIdempotentRequestHasNoDuplicateEffects() throws Exception {
        Buyer b = newBuyer();
        String key = key();
        String body = reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "," + seatItem("geral", 2) + "]");

        Resp first = reserve(b, key, body);
        Resp second = reserve(b, key, body);
        Resp third = reserve(b, key, body);

        assertThat(first.status()).isEqualTo(201);
        assertThat(second.status()).isEqualTo(201);
        assertThat(third.status()).isEqualTo(201);
        assertThat(second.body().path("id").asText()).isEqualTo(first.body().path("id").asText());
        assertThat(second.body().path("expiresAt").asText()).isEqualTo(first.body().path("expiresAt").asText());
        assertThat(second.raw().getHeader("Idempotent-Replayed")).isEqualTo("true");

        assertThat(count("reservations", fx)).isEqualTo(1);
        assertThat(lotHeld(fx, "geral")).isEqualTo(2);
        assertThat(lotHeld(fx, "premium")).isEqualTo(1);
    }

    @Test
    void sameKeyWithDifferentPayloadOrMissingKeyIsRejected() throws Exception {
        Buyer b = newBuyer();
        String key = key();
        assertThat(reserve(b, key, reservationBody(fx, "[" + seatItem("geral", 1) + "]")).status()).isEqualTo(201);

        Resp reused = reserve(b, key, reservationBody(fx, "[" + seatItem("geral", 3) + "]"));
        assertThat(reused.status()).isEqualTo(422);
        assertThat(reused.code()).isEqualTo("IDEMPOTENCY_KEY_REUSED");

        Resp missing = send(b, post("/api/reservations").contentType("application/json").content(reservationBody(fx, "[" + seatItem("geral", 1) + "]")));
        assertThat(missing.status()).isEqualTo(422);
        assertThat(missing.code()).isEqualTo("IDEMPOTENCY_KEY_REQUIRED");
        assertThat(lotHeld(fx, "geral")).isEqualTo(1);
    }

    @Test
    void concurrentDuplicatesOfTheSameKeyProduceASingleReservation() throws Exception {
        Buyer b = newBuyer();
        String key = key();
        String body = reservationBody(fx, "[" + seatItem("geral", 1) + "]");

        List<Resp> results = concurrently(List.of(() -> reserve(b, key, body), () -> reserve(b, key, body), () -> reserve(b, key, body)));

        assertThat(results).allSatisfy(r -> assertThat(r.status()).isIn(201, 409));
        assertThat(results.stream().filter(r -> r.status() == 409)).allSatisfy(r -> assertThat(r.code()).isEqualTo("REQUEST_IN_PROGRESS"));
        assertThat(results.stream().filter(r -> r.status() == 201).count()).isGreaterThanOrEqualTo(1);
        assertThat(count("reservations", fx)).isEqualTo(1);
        assertThat(lotHeld(fx, "geral")).isEqualTo(1);
    }

    // ── 3. expiração ───────────────────────────────────────────────────────────────────────────────────

    private void makeExpired(String reservationId) {
        Instant past = Instant.now().minus(1, ChronoUnit.MINUTES);
        jdbc.update("update reservations set created_at = ?, expires_at = ? where id = ?::uuid",
                Timestamp.from(past.minus(10, ChronoUnit.MINUTES)), Timestamp.from(past), reservationId);
        jdbc.update("update event_seats set held_until = ? where reservation_id = ?::uuid", Timestamp.from(past), reservationId);
    }

    @Test
    void reservationsExpireAfterTenMinutesAndReleaseStock() throws Exception {
        Buyer b = newBuyer();
        Resp created = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 2, "A01") + "," + seatItem("geral", 3) + "]"));
        assertThat(created.status()).isEqualTo(201);
        String id = created.body().path("id").asText();

        // O prazo é de dez minutos e vem do servidor.
        Instant createdAt = java.time.OffsetDateTime.parse(created.body().path("createdAt").asText()).toInstant();
        Instant expiresAt = java.time.OffsetDateTime.parse(created.body().path("expiresAt").asText()).toInstant();
        assertThat(java.time.Duration.between(createdAt, expiresAt)).isEqualTo(java.time.Duration.ofMinutes(10));
        assertThat(lotHeld(fx, "geral")).isEqualTo(3);
        assertThat(seatStatus(fx, "A01")).isEqualTo("RESERVED");

        makeExpired(id);
        assertThat(expiry.expireDue()).isEqualTo(1);

        assertThat(jdbc.queryForObject("select status from reservations where id = ?::uuid", String.class, id)).isEqualTo("EXPIRED");
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(lotHeld(fx, "geral")).isZero();
        assertThat(lotHeld(fx, "premium")).isZero();
        assertThat(getReservation(b, id).body().path("status").asText()).isEqualTo("expired");

        Resp late = setSeats(b, id, "premium", "[\"A02\"]");
        assertThat(late.status()).isEqualTo(410);
        assertThat(late.code()).isEqualTo("RESERVATION_EXPIRED");
        assertThat(expiry.expireDue()).isZero(); // idempotente: nada a fazer na segunda vez
    }

    @Test
    void anExpiredHoldIsImmediatelyAvailableToOthersEvenBeforeTheCleanupJobRuns() throws Exception {
        Buyer slow = newBuyer();
        Buyer quick = newBuyer();
        Resp r1 = reserve(slow, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A03") + "]"));
        makeExpired(r1.body().path("id").asText());

        Resp r2 = reserve(quick, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A03") + "]"));

        assertThat(r2.status()).isEqualTo(201);
        assertThat(r2.body().path("items").get(0).path("seatIds").get(0).asText()).isEqualTo("A03");
        // A criação limpou a reserva vencida do evento e o estoque ficou correto: só a nova segura 1 unidade.
        assertThat(lotHeld(fx, "premium")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from reservations where id = ?::uuid", String.class, r1.body().path("id").asText())).isEqualTo("EXPIRED");
    }

    @Test
    void usingAnExpiredReservationFreesItAndAnswersGone() throws Exception {
        Buyer b = newBuyer();
        String id = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "]")).body().path("id").asText();
        makeExpired(id);

        Resp checkout = order(b, key(), orderBody(id, "pix", null));

        assertThat(checkout.status()).isEqualTo(410);
        assertThat(checkout.code()).isEqualTo("RESERVATION_EXPIRED");
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(lotHeld(fx, "premium")).isZero();
    }

    // ── regras de reserva ──────────────────────────────────────────────────────────────────────────────

    @Test
    void creatingAReservationReleasesThePreviousActiveOne() throws Exception {
        Buyer b = newBuyer();
        Resp first = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "]"));
        Resp second = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A02") + "]"));

        assertThat(second.status()).isEqualTo(201);
        assertThat(getReservation(b, first.body().path("id").asText()).body().path("status").asText()).isEqualTo("released");
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(seatStatus(fx, "A02")).isEqualTo("RESERVED");
        assertThat(lotHeld(fx, "premium")).isEqualTo(1);
    }

    @Test
    void putSeatsReplacesTheSelectionAndIsIdempotentAndDoesNotRenewTheDeadline() throws Exception {
        Buyer b = newBuyer();
        Resp created = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 2) + "]"));
        String id = created.body().path("id").asText();
        String expiresAt = created.body().path("expiresAt").asText();

        Resp first = setSeats(b, id, "premium", "[\"A01\",\"A02\"]");
        Resp again = setSeats(b, id, "premium", "[\"A01\",\"A02\"]");
        Resp swapped = setSeats(b, id, "premium", "[\"A02\",\"A03\"]");

        assertThat(first.status()).isEqualTo(200);
        assertThat(again.body().path("items").get(0).path("seatIds")).hasSize(2);
        assertThat(swapped.body().path("items").get(0).path("seatIds")).extracting(n -> n.asText()).containsExactly("A02", "A03");
        assertThat(swapped.body().path("expiresAt").asText()).isEqualTo(expiresAt);
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(seatStatus(fx, "A03")).isEqualTo("RESERVED");
        assertThat(setSeats(b, id, "premium", "[]").body().path("items").get(0).path("seatIds")).isEmpty();
        assertThat(seatStatus(fx, "A02")).isEqualTo("AVAILABLE");
    }

    @Test
    void putSeatsRejectsConflictsOutsideTheSectorAndTooManySeats() throws Exception {
        Buyer a = newBuyer();
        Buyer b = newBuyer();
        reserve(a, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "]"));
        String id = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 2) + "]")).body().path("id").asText();

        Resp conflict = setSeats(b, id, "premium", "[\"A01\",\"A02\"]");
        assertThat(conflict.status()).isEqualTo(409);
        assertThat(conflict.code()).isEqualTo("SEAT_UNAVAILABLE");
        assertThat(seatStatus(fx, "A02")).isEqualTo("AVAILABLE"); // nada ficou pela metade

        assertThat(setSeats(b, id, "premium", "[\"B01\"]").status()).isEqualTo(422);          // outro setor
        assertThat(setSeats(b, id, "premium", "[\"Z99\"]").status()).isEqualTo(422);          // não existe
        assertThat(setSeats(b, id, "premium", "[\"A02\",\"A03\",\"A04\"]").status()).isEqualTo(422); // mais que a quantidade
        assertThat(setSeats(b, id, "premium", "[\"A02\",\"A02\"]").status()).isEqualTo(422);   // repetido
        assertThat(setSeats(b, id, "geral", "[\"A02\"]").status()).isEqualTo(404);             // tipo sem assento
    }

    @Test
    void enforcesOrderLimitStockAndLotRules() throws Exception {
        Buyer b = newBuyer();

        Resp tooMany = reserve(b, key(), reservationBody(fx, "[" + seatItem("geral", 7) + "]"));
        assertThat(tooMany.status()).isEqualTo(422);
        assertThat(tooMany.code()).isEqualTo("LIMIT_EXCEEDED");

        Resp unknownType = reserve(b, key(), reservationBody(fx, "[" + seatItem("vip", 1) + "]"));
        assertThat(unknownType.status()).isEqualTo(422);

        // Estoque: 10 ingressos; duas pessoas pedindo 6 → a segunda não cabe.
        Buyer c = newBuyer();
        assertThat(reserve(b, key(), reservationBody(fx, "[" + seatItem("geral", 6) + "]")).status()).isEqualTo(201);
        Resp insufficient = reserve(c, key(), reservationBody(fx, "[" + seatItem("geral", 6) + "]"));
        assertThat(insufficient.status()).isEqualTo(409);
        assertThat(insufficient.code()).isEqualTo("INSUFFICIENT_STOCK");
        assertThat(lotHeld(fx, "geral")).isEqualTo(6);

        // Lote fechado (janela de venda encerrada).
        jdbc.update("update ticket_lots set sales_end = now() - interval '1 minute', sales_start = now() - interval '1 day' where ticket_type_id = ?", fx.general().getId());
        Resp closed = reserve(c, key(), reservationBody(fx, "[" + seatItem("geral", 1) + "]"));
        assertThat(closed.status()).isEqualTo(409);
        assertThat(closed.code()).isEqualTo("LOT_CLOSED");
    }

    @Test
    void releaseFreesEverythingAndIsRepeatable() throws Exception {
        Buyer b = newBuyer();
        String id = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "," + seatItem("geral", 2) + "]")).body().path("id").asText();

        assertThat(release(b, id).status()).isEqualTo(200);
        assertThat(release(b, id).status()).isEqualTo(200);

        assertThat(getReservation(b, id).body().path("status").asText()).isEqualTo("released");
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(lotHeld(fx, "geral")).isZero();
        assertThat(lotHeld(fx, "premium")).isZero();
    }

    // ── disponibilidade e vitrine ──────────────────────────────────────────────────────────────────────

    @Test
    void seatAvailabilityHidesTheCallersOwnSeatsAndShowsOthers() throws Exception {
        Buyer a = newBuyer();
        Buyer b = newBuyer();
        reserve(a, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A01") + "]"));
        reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 1, "A02") + "]"));

        Resp forA = send(a, get("/api/events/" + fx.eventId() + "/seats"));
        Resp anonymous = send(null, get("/api/events/" + fx.eventId() + "/seats"));

        assertThat(forA.status()).isEqualTo(200);
        assertThat(forA.body().path("seats").has("A01")).isFalse();
        assertThat(forA.body().path("seats").path("A02").asText()).isEqualTo("reserved");
        assertThat(anonymous.body().path("seats").path("A01").asText()).isEqualTo("reserved");
        assertThat(anonymous.body().path("eventId").asText()).isEqualTo(fx.eventId());
        // Nada que identifique outros compradores.
        assertThat(anonymous.raw().getContentAsString()).doesNotContain(a.email()).doesNotContain(a.id().toString());
    }

    @Test
    void salesEndpointDescribesLotsPricesAndSeatMap() throws Exception {
        Resp sales = send(null, get("/api/events/" + fx.event().getSlug() + "/sales"));

        assertThat(sales.status()).isEqualTo(200);
        assertThat(sales.body().path("maxPerOrder").asInt()).isEqualTo(6);
        assertThat(sales.body().path("serviceFeePct").asDouble()).isEqualTo(10.0);
        var types = sales.body().path("ticketTypes");
        assertThat(types).hasSize(3);
        assertThat(types.get(0).path("id").asText()).isEqualTo("geral");
        assertThat(types.get(0).path("kind").asText()).isEqualTo("general");
        assertThat(types.get(0).path("price").asDouble()).isEqualTo(100.0);
        assertThat(types.get(0).path("lot").path("status").asText()).isEqualTo("open");
        assertThat(types.get(0).path("lot").path("remaining").asInt()).isEqualTo(10);
        assertThat(types.get(1).path("sectorId").asText()).isEqualTo("premium");
        var map = sales.body().path("seatMap");
        assertThat(map.path("rows")).extracting(n -> n.asText()).containsExactly("A", "B");
        assertThat(map.path("seatsPerRow").asInt()).isEqualTo(4);
        assertThat(map.path("sectors").get(0).path("ticketTypeId").asText()).isEqualTo("premium");
        assertThat(map.path("accessibleSeatIds").get(0).asText()).isEqualTo("B04");

        // Reservas seguram estoque: a vitrine reflete o que ainda dá para comprar.
        reserve(newBuyer(), key(), reservationBody(fx, "[" + seatItem("geral", 4) + "]"));
        Resp after = send(null, get("/api/events/" + fx.event().getSlug() + "/sales"));
        assertThat(after.body().path("ticketTypes").get(0).path("lot").path("remaining").asInt()).isEqualTo(6);
    }

    @Test
    void reservationDtoMatchesTheFrontendContract() throws Exception {
        Buyer b = newBuyer();
        Resp r = reserve(b, key(), reservationBody(fx, "[" + seatItem("premium", 2, "A01") + "," + seatItem("geral", 1) + "]"));

        assertThat(r.body().path("status").asText()).isEqualTo("active");
        assertThat(r.body().path("eventId").asText()).isEqualTo(fx.eventId());
        assertThat(r.body().path("eventTitle").asText()).isEqualTo("Evento Teste");
        assertThat(r.body().path("venueName").asText()).isEqualTo("Casa Teste");
        assertThat(r.body().path("expiresAt").asText()).endsWith("-03:00");
        var premium = r.body().path("items").get(1);
        assertThat(premium.path("ticketTypeId").asText()).isEqualTo("premium");
        assertThat(premium.path("kind").asText()).isEqualTo("seated");
        assertThat(premium.path("sectorName").asText()).isEqualTo("Premium");
        assertThat(premium.path("unitPrice").asDouble()).isEqualTo(120.0);
        assertThat(premium.path("unitFee").asDouble()).isEqualTo(12.0);
        // subtotal = 2×120 + 1×100; taxa 10%
        assertThat(r.body().path("subtotal").asDouble()).isEqualTo(340.0);
        assertThat(r.body().path("fee").asDouble()).isEqualTo(34.0);
        assertThat(r.body().path("total").asDouble()).isEqualTo(374.0);
    }
}
