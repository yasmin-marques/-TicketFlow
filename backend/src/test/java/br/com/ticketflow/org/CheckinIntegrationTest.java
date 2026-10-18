package br.com.ticketflow.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.support.OrgTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import org.junit.jupiter.api.Test;

/** Portaria: assinatura do QR, estado do ingresso, evento certo e entrada atômica sob leituras simultâneas. */
class CheckinIntegrationTest extends OrgTestSupport {

    private Resp scan(Buyer staff, Fx fx, String code, String gate) throws Exception {
        return json(staff, post("/api/org/events/" + fx.eventId() + "/checkin"), "{\"code\":\"" + code + "\",\"gate\":\"" + gate + "\"}");
    }

    @Test
    void aValidTicketEntersOnceAndThenReportsWhenAndWhereItWasUsed() throws Exception {
        Fx fx = newEvent(10);
        Buyer staff = memberOf(fx, MemberRole.CHECKIN);
        JsonNode order = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"premium\",\"quantity\":1,\"seatIds\":[\"A02\"]}]");
        String qr = qrOf(order, 0);

        Resp first = scan(staff, fx, qr, "Portão B");
        assertThat(first.status()).isEqualTo(200);
        assertThat(first.body().path("result").asText()).isEqualTo("valid");
        assertThat(first.body().path("seat").asText()).isEqualTo("A02");
        assertThat(first.body().path("sector").asText()).isEqualTo("Premium");
        assertThat(first.body().path("holderName").asText()).isEqualTo("Maria Compradora");

        Resp again = scan(staff, fx, qr, "Portão C");
        assertThat(again.status()).isEqualTo(200);
        assertThat(again.body().path("result").asText()).isEqualTo("used");
        assertThat(again.body().path("gate").asText()).isEqualTo("Portão B");
        assertThat(again.body().path("checkedInAt").asText()).isNotBlank();

        // O comprador vê o ingresso como utilizado.
        JsonNode stats = send(staff, get("/api/org/events/" + fx.eventId() + "/checkin")).body();
        assertThat(stats.path("checkedIn").asInt()).isEqualTo(1);
        assertThat(stats.path("sold").asInt()).isEqualTo(1);
        assertThat(stats.path("recent").size()).isEqualTo(2);
        assertThat(stats.path("gates").toString()).contains("Portão B");
    }

    @Test
    void concurrentScansOfTheSameTicketProduceExactlyOneValidEntry() throws Exception {
        Fx fx = newEvent(10);
        Buyer staff = memberOf(fx, MemberRole.CHECKIN);
        JsonNode order = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        String qr = qrOf(order, 0);
        String code = order.path("tickets").get(0).path("code").asText();

        List<Callable<String>> tasks = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            String input = i % 3 == 0 ? code : qr; // QR e código digitado disputando ao mesmo tempo
            String gate = "Portão " + (char) ('A' + i % 3);
            tasks.add(() -> scan(staff, fx, input, gate).body().path("result").asText());
        }
        List<String> results = concurrently(tasks);

        assertThat(results).filteredOn("valid"::equals).hasSize(1);
        assertThat(results).filteredOn("used"::equals).hasSize(11);
        assertThat(jdbc.queryForObject("select status from tickets where code = ?", String.class, code)).isEqualTo("USED");
        assertThat(jdbc.queryForObject("select count(*) from checkin_scans where event_id = ? and result = 'valid'", Integer.class, fx.event().getId()))
                .isEqualTo(1);
    }

    @Test
    void manualCheckinAndScannerRacingStillAdmitOnlyOnce() throws Exception {
        Fx fx = newEvent(10);
        Buyer staff = memberOf(fx, MemberRole.MANAGER);
        JsonNode order = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        String ticketId = ticketIdOf(order, 0);
        String qr = qrOf(order, 0);

        List<Callable<Integer>> tasks = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            tasks.add(i % 2 == 0
                    ? () -> json(staff, post("/api/org/attendees/" + ticketId + "/checkin"), "{\"gate\":\"Manual\"}").status()
                    : () -> "valid".equals(scan(staff, fx, qr, "Portão A").body().path("result").asText()) ? 200 : 409);
        }
        List<Integer> statuses = concurrently(tasks);
        assertThat(statuses).filteredOn(s -> s == 200).hasSize(1);
        assertThat(jdbc.queryForObject("select count(*) from checkin_scans where ticket_id = ?::uuid and result = 'valid'", Integer.class, ticketId))
                .isEqualTo(1);
    }

    @Test
    void forgedReplacedForeignAndCancelledTicketsAreInvalid() throws Exception {
        Fx fx = newEvent(10);
        Fx other = newEvent(10);
        Buyer staff = memberOf(fx, MemberRole.OWNER);
        Buyer buyer = newBuyer();
        JsonNode order = buy(buyer, fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":3}]");
        JsonNode foreign = buy(newBuyer(), other, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");

        // Assinatura adulterada / formato do mock / lixo.
        String qr = qrOf(order, 0);
        String forged = qr.substring(0, qr.lastIndexOf('.') + 1) + "AAAA" + qr.substring(qr.lastIndexOf('.') + 5);
        assertThat(scan(staff, fx, forged, "A").body().path("result").asText()).isEqualTo("invalid");
        assertThat(scan(staff, fx, "TF1." + ticketIdOf(order, 0) + ".ABC123", "A").body().path("result").asText()).isEqualTo("invalid");
        assertThat(scan(staff, fx, "qualquer coisa", "A").body().path("result").asText()).isEqualTo("invalid");

        // Ingresso de outro evento (outra organização): inválido e sem revelar dados.
        Resp foreignScan = scan(staff, fx, qrOf(foreign, 0), "A");
        assertThat(foreignScan.body().path("result").asText()).isEqualTo("invalid");
        assertThat(foreignScan.body().has("holderName")).isFalse();
        assertThat(jdbc.queryForObject("select status from tickets where id = ?::uuid", String.class, ticketIdOf(foreign, 0))).isEqualTo("VALID");

        // Transferido: o QR antigo e o código digitável antigo deixam de valer; o novo entra.
        String oldQr = qrOf(order, 1);
        String oldCode = order.path("tickets").get(1).path("code").asText();
        Buyer friend = newBuyer();
        Resp transfer = json(buyer, post("/api/tickets/" + ticketIdOf(order, 1) + "/transfer"), "{\"email\":\"" + friend.email() + "\"}");
        assertThat(transfer.status()).as(transfer.body().toString()).isEqualTo(200);
        assertThat(scan(staff, fx, oldQr, "A").body().path("result").asText()).isEqualTo("invalid");
        assertThat(scan(staff, fx, oldCode, "A").body().path("result").asText()).isEqualTo("invalid");
        String newQr = send(friend, get("/api/tickets/" + ticketIdOf(order, 1))).body().path("qrPayload").asText();
        assertThat(scan(staff, fx, newQr, "A").body().path("result").asText()).isEqualTo("valid");

        // Reembolsado: inválido.
        Buyer owner = staff;
        jdbc.update("update tickets set owner_user_id = ? where id = ?::uuid", buyer.id(), ticketIdOf(order, 1)); // devolve ao comprador p/ reembolso
        jdbc.update("update tickets set status = 'VALID', used_at = null where id = ?::uuid", ticketIdOf(order, 1));
        assertThat(send(owner, post("/api/org/orders/" + order.path("id").asText() + "/refund")).status()).isEqualTo(200);
        Resp cancelled = scan(staff, fx, qr, "A");
        assertThat(cancelled.body().path("result").asText()).isEqualTo("invalid");
        assertThat(cancelled.body().path("message").asText()).contains("cancelado");
    }

    @Test
    void checkinRequiresAnActiveEventAndCanBeUndoneByAManager() throws Exception {
        Fx fx = newEvent(10);
        Buyer manager = memberOf(fx, MemberRole.MANAGER);
        JsonNode order = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        String ticketId = ticketIdOf(order, 0);

        Resp manual = json(manager, post("/api/org/attendees/" + ticketId + "/checkin"), "{\"gate\":\"Manual\"}");
        assertThat(manual.status()).isEqualTo(200);
        assertThat(manual.body().path("status").asText()).isEqualTo("checked-in");
        Resp twice = json(manager, post("/api/org/attendees/" + ticketId + "/checkin"), "{}");
        assertThat(twice.status()).isEqualTo(409);
        assertThat(twice.code()).isEqualTo("ALREADY_USED");

        Resp undone = send(manager, delete("/api/org/attendees/" + ticketId + "/checkin"));
        assertThat(undone.status()).isEqualTo(200);
        assertThat(undone.body().path("status").asText()).isEqualTo("waiting");
        assertThat(send(manager, delete("/api/org/attendees/" + ticketId + "/checkin")).status()).isEqualTo(409);
        assertThat(jdbc.queryForList("select action from audit_log where entity_id = ?", String.class, ticketId))
                .contains("checkin.manual", "checkin.undone");
        assertThat(scan(manager, fx, qrOf(order, 0), "A").body().path("result").asText()).isEqualTo("valid");

        // Lista de participantes reflete o estado.
        JsonNode list = send(manager, get("/api/org/attendees?eventId=" + fx.eventId() + "&status=checked-in")).body();
        assertThat(list.path("total").asInt()).isEqualTo(1);
        assertThat(list.path("checkedIn").asInt()).isEqualTo(1);
        assertThat(list.path("items").get(0).path("gate").asText()).isEqualTo("A");

        // Evento cancelado: a portaria responde 409 EVENT_NOT_ACTIVE.
        assertThat(send(manager, post("/api/org/events/" + fx.eventId() + "/cancel")).status()).isEqualTo(200);
        Resp closed = scan(manager, fx, qrOf(order, 0), "A");
        assertThat(closed.status()).isEqualTo(409);
        assertThat(closed.code()).isEqualTo("EVENT_NOT_ACTIVE");
    }
}
