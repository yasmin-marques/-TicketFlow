package br.com.ticketflow.tickets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.support.SalesTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class TicketsIntegrationTest extends SalesTestSupport {

    @Autowired private TicketQrService qr;

    private Fx fx;

    @BeforeEach
    void setUp() {
        resetSalesData();
        fx = newEvent(10);
    }

    private JsonNode buyTicket(Buyer b, String seat) throws Exception {
        Resp r = reserve(b, key(), reservationBody(fx, "[{\"ticketTypeId\":\"premium\",\"quantity\":1,\"seatIds\":[\"" + seat + "\"]}]"));
        Resp paid = order(b, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242"));
        assertThat(paid.status()).isEqualTo(201);
        return paid.body().path("tickets").get(0);
    }

    private Resp transfer(Buyer b, String ticketId, String email) throws Exception {
        return send(b, post("/api/tickets/" + ticketId + "/transfer").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}"));
    }

    @Test
    void ticketsAreListedWithTheContractShapeAndASignedQrCode() throws Exception {
        Buyer b = newBuyer();
        JsonNode issued = buyTicket(b, "A01");

        Resp list = send(b, get("/api/tickets"));
        Resp one = send(b, get("/api/tickets/" + issued.path("id").asText()));

        assertThat(list.body()).hasSize(1);
        JsonNode t = one.body();
        assertThat(t.path("status").asText()).isEqualTo("valid");
        assertThat(t.path("eventTitle").asText()).isEqualTo("Evento Teste");
        assertThat(t.path("typeName").asText()).isEqualTo("Premium");
        assertThat(t.path("seatId").asText()).isEqualTo("A01");
        assertThat(t.path("orderCode").asText()).startsWith("TF-");
        assertThat(t.path("eventStartsAt").asText()).endsWith("-03:00");
        assertThat(t.path("venueName").asText()).isEqualTo("Casa Teste");

        // QR assinado: verificável pelo backend, e adulterações não passam.
        String payload = t.path("qrPayload").asText();
        assertThat(qr.verify(payload)).isPresent();
        assertThat(qr.verify(payload.substring(0, payload.length() - 2) + "xx")).isEmpty();
        assertThat(qr.verify(payload.replace(t.path("id").asText(), UUID.randomUUID().toString()))).isEmpty();
        assertThat(qr.verify("TF1." + t.path("id").asText() + ".1.assinatura-falsa")).isEmpty();
        assertThat(qr.verify("lixo")).isEmpty();
        assertThat(qr.verify(null)).isEmpty();
    }

    @Test
    void transferMovesOwnershipAndInvalidatesThePreviousQr() throws Exception {
        Buyer from = newBuyer();
        Buyer to = newBuyer();
        JsonNode issued = buyTicket(from, "A01");
        String ticketId = issued.path("id").asText();
        String oldQr = issued.path("qrPayload").asText();

        Resp done = transfer(from, ticketId, to.email().toUpperCase());

        assertThat(done.status()).isEqualTo(200);
        assertThat(done.body().path("ok").asBoolean()).isTrue();
        // O remetente perde o ingresso (inclusive o acesso direto); o destinatário o recebe com QR novo.
        assertThat(send(from, get("/api/tickets")).body()).isEmpty();
        assertThat(send(from, get("/api/tickets/" + ticketId)).status()).isEqualTo(404);
        assertThat(send(from, get("/api/orders")).body().get(0).path("tickets")).isEmpty();
        Resp received = send(to, get("/api/tickets/" + ticketId));
        assertThat(received.status()).isEqualTo(200);
        String newQr = received.body().path("qrPayload").asText();
        assertThat(newQr).isNotEqualTo(oldQr);
        assertThat(qr.verify(newQr).orElseThrow().version()).isEqualTo(2);
        assertThat(qr.verify(oldQr).orElseThrow().version()).isEqualTo(1); // assinatura válida, mas a versão já não confere com o banco
        assertThat(jdbc.queryForObject("select qr_version from tickets where id = ?::uuid", Integer.class, ticketId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from ticket_transfers where ticket_id = ?::uuid", Integer.class, ticketId)).isEqualTo(1);

        // O antigo dono não consegue mais transferir nem repassar.
        assertThat(transfer(from, ticketId, newBuyer().email()).status()).isEqualTo(404);
        // Pedido com ingresso transferido não é mais reembolsável.
        String orderId = send(from, get("/api/orders")).body().get(0).path("id").asText();
        assertThat(send(from, get("/api/orders/" + orderId)).body().path("refundable").asBoolean()).isFalse();
        assertThat(send(from, post("/api/orders/" + orderId + "/cancel")).status()).isEqualTo(422);
    }

    @Test
    void transferToSomeoneWithoutAnAccountIsDeliveredWhenTheyRegister() throws Exception {
        Buyer from = newBuyer();
        String ticketId = buyTicket(from, "A01").path("id").asText();
        String futureEmail = "novo-" + UUID.randomUUID() + "@example.com";

        assertThat(transfer(from, ticketId, futureEmail).status()).isEqualTo(200);
        assertThat(send(from, get("/api/tickets")).body()).isEmpty();

        var res = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Novo Usuario\",\"email\":\"" + futureEmail + "\",\"password\":\"Senha123ok\"}")).andReturn().getResponse();
        JsonNode session = json.readTree(res.getContentAsString());
        Buyer newcomer = new Buyer(UUID.fromString(session.path("user").path("id").asText()), futureEmail, session.path("accessToken").asText());

        Resp mine = send(newcomer, get("/api/tickets"));
        assertThat(mine.body()).hasSize(1);
        assertThat(mine.body().get(0).path("id").asText()).isEqualTo(ticketId);
        assertThat(mine.body().get(0).path("holderName").asText()).isEqualTo("Novo Usuario");
        assertThat(jdbc.queryForObject("select transfer_email from tickets where id = ?::uuid", String.class, ticketId)).isNull();
    }

    @Test
    void transferRulesAreEnforced() throws Exception {
        Buyer from = newBuyer();
        Buyer stranger = newBuyer();
        String ticketId = buyTicket(from, "A01").path("id").asText();

        assertThat(transfer(from, ticketId, from.email()).status()).isEqualTo(422);          // para si mesmo
        assertThat(transfer(from, ticketId, "nao-e-email").status()).isEqualTo(422);          // e-mail inválido
        assertThat(transfer(stranger, ticketId, newBuyer().email()).status()).isEqualTo(404); // não é o dono
        assertThat(send(from, get("/api/tickets/" + ticketId)).status()).isEqualTo(200);      // continua do dono

        jdbc.update("update tickets set status = 'USED', used_at = now() where id = ?::uuid", ticketId); // USED sempre tem horário (ck_tickets_used)
        Resp used = transfer(from, ticketId, stranger.email());
        assertThat(used.status()).isEqualTo(409);                                             // só ingressos válidos
        jdbc.update("update tickets set status = 'VALID', used_at = null where id = ?::uuid", ticketId);
        jdbc.update("update events set starts_at = now() - interval '1 hour', ends_at = now() + interval '3 hours' where id = ?", fx.event().getId());
        assertThat(transfer(from, ticketId, stranger.email()).status()).isEqualTo(409);       // evento já começou
    }

    @Test
    void concurrentTransfersOfTheSameTicketHaveASingleWinner() throws Exception {
        Buyer from = newBuyer();
        Buyer x = newBuyer();
        Buyer y = newBuyer();
        String ticketId = buyTicket(from, "A01").path("id").asText();

        java.util.List<java.util.concurrent.Callable<Resp>> tasks = java.util.List.of(() -> transfer(from, ticketId, x.email()), () -> transfer(from, ticketId, y.email()));
        java.util.List<Resp> results = concurrently(tasks);

        assertThat(results.stream().filter(r -> r.status() == 200)).hasSize(1);
        assertThat(results.stream().filter(r -> r.status() != 200)).allSatisfy(r -> assertThat(r.status()).isEqualTo(404));
        assertThat(jdbc.queryForObject("select qr_version from tickets where id = ?::uuid", Integer.class, ticketId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from ticket_transfers where ticket_id = ?::uuid", Integer.class, ticketId)).isEqualTo(1);
    }
}
