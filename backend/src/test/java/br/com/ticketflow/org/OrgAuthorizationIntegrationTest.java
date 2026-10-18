package br.com.ticketflow.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.support.OrgTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Papel global + vínculo com a organização + papel de membro, todos verificados no servidor. Um organizador nunca vê
 * nem altera eventos, lotes, pedidos, participantes, check-ins ou números de outra organização.
 */
class OrgAuthorizationIntegrationTest extends OrgTestSupport {

    @Test
    void anonymousAndPlainUsersAreRejectedOnEveryOrganizerRoute() throws Exception {
        Buyer user = newBuyer();
        List<MockHttpServletRequestBuilder> routes = List.of(get("/api/org/dashboard"), get("/api/org/events"), post("/api/org/events"),
                get("/api/org/orders"), get("/api/org/attendees"), get("/api/org/settings"), get("/api/org/search?q=ab"),
                get("/api/org/notifications"), get("/api/org/reports"));
        for (MockHttpServletRequestBuilder r : routes) {
            assertThat(send(null, r).status()).isEqualTo(401);
        }
        for (MockHttpServletRequestBuilder r : List.of(get("/api/org/dashboard"), get("/api/org/events"), get("/api/org/orders"),
                get("/api/org/settings"))) {
            Resp res = send(user, r);
            assertThat(res.status()).isEqualTo(403);
            assertThat(res.code()).isEqualTo("FORBIDDEN");
        }
    }

    @Test
    void organizersCannotReachAnotherOrganizationsData() throws Exception {
        Fx fx = newEvent(10);
        Buyer owner = memberOf(fx, MemberRole.OWNER);
        Buyer intruder = account(RoleName.ORGANIZER);
        Buyer buyer = newBuyer();
        JsonNode order = buy(buyer, fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        String eventId = fx.eventId();
        String orderId = order.path("id").asText();
        String ticketId = ticketIdOf(order, 0);
        String lotId = jdbc.queryForObject("select l.id::text from ticket_lots l join ticket_types t on t.id = l.ticket_type_id where t.event_id = ? and t.code = 'geral'",
                String.class, fx.event().getId());

        // Recursos de outra organização: 404 (não revela existência) — leitura e escrita.
        for (MockHttpServletRequestBuilder r : List.of(
                get("/api/org/events/" + eventId), get("/api/org/events/" + eventId + "/lots"), get("/api/org/events/" + eventId + "/checkin"),
                post("/api/org/events/" + eventId + "/publish"), post("/api/org/events/" + eventId + "/unpublish"),
                post("/api/org/events/" + eventId + "/cancel"), delete("/api/org/events/" + eventId),
                get("/api/org/orders/" + orderId), post("/api/org/orders/" + orderId + "/refund"),
                post("/api/org/attendees/" + ticketId + "/checkin"), delete("/api/org/attendees/" + ticketId + "/checkin"),
                delete("/api/org/lots/" + lotId), get("/api/org/dashboard?eventId=" + eventId), get("/api/org/reports?eventId=" + eventId))) {
            Resp res = send(intruder, r);
            assertThat(res.status()).as(r.toString()).isEqualTo(404);
        }
        assertThat(json(intruder, patch("/api/org/events/" + eventId), "{\"title\":\"Hackeado\"}").status()).isEqualTo(404);
        assertThat(json(intruder, patch("/api/org/lots/" + lotId), "{\"price\":1}").status()).isEqualTo(404);
        assertThat(json(intruder, put("/api/org/events/" + eventId + "/seat-map"), "{\"seatMap\":null}").status()).isEqualTo(404);
        assertThat(json(intruder, post("/api/org/events/" + eventId + "/checkin"), "{\"code\":\"" + qrOf(order, 0) + "\",\"gate\":\"A\"}").status())
                .isEqualTo(404);

        // Filtros com o id de outra organização não vazam nada.
        assertThat(send(intruder, get("/api/org/orders?eventId=" + eventId)).body().path("total").asInt()).isZero();
        assertThat(send(intruder, get("/api/org/attendees?eventId=" + eventId)).body().path("total").asInt()).isZero();
        assertThat(send(intruder, get("/api/org/events")).body().path("items").toString()).doesNotContain(eventId);
        assertThat(send(intruder, get("/api/org/search?q=" + order.path("code").asText())).body().path("orders").size()).isZero();
        assertThat(send(intruder, get("/api/org/dashboard")).body().path("revenue").path("value").decimalValue()).isEqualByComparingTo("0");

        // Escolher a organização pelo cabeçalho só vale com vínculo.
        Resp spoofed = send(intruder, get("/api/org/events").header("X-Organization-Id", fx.event().getOrganization().getId().toString()));
        assertThat(spoofed.status()).isEqualTo(403);

        // Nada mudou; o dono vê tudo.
        assertThat(send(owner, get("/api/org/events/" + eventId)).body().path("title").asText()).isEqualTo("Evento Teste");
        assertThat(send(owner, get("/api/org/orders/" + orderId)).body().path("status").asText()).isEqualTo("paid");
        assertThat(send(owner, get("/api/org/orders?eventId=" + eventId)).body().path("total").asInt()).isEqualTo(1);
    }

    @Test
    void memberRolesLimitWhatEachPersonCanDo() throws Exception {
        Fx fx = newEvent(10);
        Buyer checkin = memberOf(fx, MemberRole.CHECKIN);
        Buyer manager = memberOf(fx, MemberRole.MANAGER);
        Buyer buyer = newBuyer();
        JsonNode order = buy(buyer, fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":2}]");

        // Portaria: lê eventos/participantes e faz check-in; não vê pedidos, relatórios nem configurações; não edita.
        assertThat(send(checkin, get("/api/org/events")).status()).isEqualTo(200);
        assertThat(send(checkin, get("/api/org/attendees?eventId=" + fx.eventId())).status()).isEqualTo(200);
        assertThat(json(checkin, post("/api/org/events/" + fx.eventId() + "/checkin"), "{\"code\":\"" + qrOf(order, 0) + "\",\"gate\":\"A\"}")
                .body().path("result").asText()).isEqualTo("valid");
        for (MockHttpServletRequestBuilder r : List.of(get("/api/org/orders"), get("/api/org/dashboard"), get("/api/org/reports"),
                get("/api/org/settings"), post("/api/org/orders/" + order.path("id").asText() + "/refund"),
                delete("/api/org/attendees/" + ticketIdOf(order, 0) + "/checkin"))) {
            assertThat(send(checkin, r).status()).as(r.toString()).isEqualTo(403);
        }
        assertThat(json(checkin, post("/api/org/events"), "{\"title\":\"Não pode\"}").status()).isEqualTo(403);
        assertThat(send(checkin, get("/api/org/search?q=" + order.path("code").asText())).body().path("orders").size()).isZero();

        // Gerente: opera eventos e pedidos, mas não mexe em equipe/configurações.
        assertThat(send(manager, get("/api/org/orders")).status()).isEqualTo(200);
        assertThat(send(manager, delete("/api/org/attendees/" + ticketIdOf(order, 0) + "/checkin")).status()).isEqualTo(200);
        assertThat(json(manager, patch("/api/org/settings"), "{\"name\":\"Novo nome\"}").status()).isEqualTo(403);
        assertThat(json(manager, post("/api/org/members"), "{\"email\":\"x@example.com\",\"role\":\"CHECKIN\"}").status()).isEqualTo(403);
    }

    @Test
    void accessIsCheckedAgainstTheDatabaseOnEveryRequest() throws Exception {
        Fx fx = newEvent(5);
        Buyer member = memberOf(fx, MemberRole.MANAGER);
        assertThat(send(member, get("/api/org/events/" + fx.eventId())).status()).isEqualTo(200);

        // Papel revogado no banco: o access token (ainda válido) deixa de servir na hora.
        jdbc.update("delete from user_roles where user_id = ? and role_id = 2", member.id());
        assertThat(send(member, get("/api/org/events/" + fx.eventId())).status()).isEqualTo(403);
    }

    @Test
    void aNewOrganizerGetsTheirOwnOrganizationAndCanManageTheTeam() throws Exception {
        Buyer org = account(RoleName.ORGANIZER);
        Resp settings = send(org, get("/api/org/settings"));
        assertThat(settings.status()).isEqualTo(200);
        assertThat(settings.body().path("name").asText()).startsWith("Organização de");
        assertThat(settings.body().path("members").get(0).path("role").asText()).isEqualTo("OWNER");

        Buyer colleague = newBuyer();
        Resp added = json(org, post("/api/org/members"), "{\"name\":\"Colega\",\"email\":\"" + colleague.email() + "\",\"role\":\"CHECKIN\"}");
        assertThat(added.status()).isEqualTo(201);
        assertThat(added.body().path("members").size()).isEqualTo(2);
        assertThat(json(org, post("/api/org/members"), "{\"email\":\"" + colleague.email() + "\",\"role\":\"CHECKIN\"}").code()).isEqualTo("EMAIL_TAKEN");
        assertThat(json(org, post("/api/org/members"), "{\"email\":\"ninguem-" + System.nanoTime() + "@example.com\",\"role\":\"CHECKIN\"}").code())
                .isEqualTo("USER_NOT_FOUND");

        // O colega ganhou o papel ORGANIZER (vale no próximo login) e entra na MESMA organização, como portaria.
        Buyer relogged = login(colleague.email());
        Resp colleagueView = send(relogged, get("/api/org/events"));
        assertThat(colleagueView.status()).isEqualTo(200);
        assertThat(send(relogged, get("/api/org/settings")).status()).isEqualTo(403);

        // Removido: perde o vínculo e o papel.
        Resp removed = send(org, delete("/api/org/members/" + colleague.id()));
        assertThat(removed.body().path("members").size()).isEqualTo(1);
        assertThat(send(relogged, get("/api/org/events")).status()).isEqualTo(403);
        assertThat(send(org, delete("/api/org/members/" + org.id())).status()).isEqualTo(409);

        // Webhooks: só HTTPS público; segredo nunca exposto.
        assertThat(json(org, post("/api/org/webhooks"), "{\"url\":\"http://example.com/hook\",\"events\":[\"order.paid\"]}").status()).isEqualTo(422);
        assertThat(json(org, post("/api/org/webhooks"), "{\"url\":\"https://127.0.0.1/hook\",\"events\":[\"order.paid\"]}").status()).isEqualTo(422);
        assertThat(json(org, post("/api/org/webhooks"), "{\"url\":\"https://localhost/hook\",\"events\":[\"order.paid\"]}").status()).isEqualTo(422);
        assertThat(json(org, post("/api/org/webhooks"), "{\"url\":\"https://hooks.example.com/tf\",\"events\":[\"nada\"]}").status()).isEqualTo(422);
        Resp hook = json(org, post("/api/org/webhooks"), "{\"url\":\"https://hooks.example.com/tf\",\"events\":[\"order.paid\",\"ticket.checked_in\"]}");
        assertThat(hook.status()).isEqualTo(201);
        assertThat(hook.body().toString()).doesNotContain("whsec_");
        String hookId = hook.body().path("webhooks").get(0).path("id").asText();
        assertThat(json(org, patch("/api/org/webhooks/" + hookId), "{\"active\":false}").body().path("webhooks").get(0).path("active").asBoolean()).isFalse();
        assertThat(send(org, delete("/api/org/webhooks/" + hookId)).body().path("webhooks").size()).isZero();

        // Configurações e conta de repasse.
        Resp upd = json(org, patch("/api/org/settings"), "{\"document\":\"12.345.678/0001-90\",\"payout\":{\"bank\":\"341\",\"agency\":\"0001\",\"account\":\"12345-6\",\"holder\":\"Org\"}}");
        assertThat(upd.status()).isEqualTo(200);
        assertThat(upd.body().path("payout").path("account").asText()).isEqualTo("12345-6");
        assertThat(json(org, patch("/api/org/settings"), "{\"document\":\"123\"}").status()).isEqualTo(422);
    }
}
