package br.com.ticketflow.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.RoleRepository;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.organization.OrganizationMember;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.organization.OrganizationMemberRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Helpers do painel do organizador: contas com papel/vínculo, chamadas JSON e compras reais via API. */
public abstract class OrgTestSupport extends SalesTestSupport {

    protected static final String PASSWORD = "Senha123ok";

    @Autowired protected UserRepository users;
    @Autowired protected RoleRepository roles;
    @Autowired protected OrganizationMemberRepository memberships;
    @Autowired protected PasswordEncoder encoder;
    @Autowired protected Clock clock;

    /** Conta com o papel global dado (sem vínculo com organização). */
    protected Buyer account(RoleName role) throws Exception {
        String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
        users.save(User.create("Pessoa " + role, email, encoder.encode(PASSWORD), roles.findByName(role).orElseThrow(), clock.instant()));
        return login(email);
    }

    protected Buyer login(String email) throws Exception {
        MockHttpServletResponse res = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD))).andReturn().getResponse();
        JsonNode body = json.readTree(res.getContentAsString());
        assertThat(res.getStatus()).as("login " + email).isEqualTo(200);
        return new Buyer(UUID.fromString(body.path("user").path("id").asText()), email, body.path("accessToken").asText());
    }

    /** Organizador vinculado à organização do evento de teste com o papel de membro dado. */
    protected Buyer memberOf(Fx fx, MemberRole role) throws Exception {
        return memberOf(fx.event().getOrganization().getId(), role);
    }

    protected Buyer memberOf(UUID organizationId, MemberRole role) throws Exception {
        Buyer b = account(RoleName.ORGANIZER);
        memberships.save(OrganizationMember.of(organizationId, b.id(), role, clock.instant()));
        return b;
    }

    /** Organização (auto-criada) de um organizador novo. */
    protected UUID orgOf(Buyer organizer) throws Exception {
        send(organizer, get("/api/org/settings")); // primeira chamada cria a organização
        return jdbc.queryForObject("select organization_id from organization_members where user_id = ?", UUID.class, organizer.id());
    }

    protected Resp json(Buyer b, MockHttpServletRequestBuilder request, String body) throws Exception {
        return send(b, request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** Compra paga (cartão sandbox aprovado) e devolve o pedido. */
    protected JsonNode buy(Buyer b, Fx fx, String itemsJson) throws Exception {
        Resp r = reserve(b, key(), reservationBody(fx, itemsJson));
        assertThat(r.status()).as(r.body().toString()).isEqualTo(201);
        Resp o = order(b, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242"));
        assertThat(o.status()).as(o.body().toString()).isEqualTo(201);
        assertThat(o.body().path("status").asText()).isEqualTo("paid");
        return o.body();
    }

    protected String qrOf(JsonNode order, int index) {
        return order.path("tickets").get(index).path("qrPayload").asText();
    }

    protected String ticketIdOf(JsonNode order, int index) {
        return order.path("tickets").get(index).path("id").asText();
    }

    /** Corpo mínimo de um rascunho publicável. */
    protected static String publishableDraft(String title) {
        return """
                {"title":"%s","category":"musica","ageRating":16,
                 "description":"Uma noite inteira de música ao vivo com bandas autorais, food trucks e uma estrutura completa para o público.",
                 "startsAt":"2030-05-10T20:00:00-03:00","endsAt":"2030-05-11T02:00:00-03:00",
                 "venue":{"name":"Galpão Central","address":"Rua A, 100","district":"Centro","city":"São Paulo","state":"SP","notes":""},
                 "cancellationPolicy":"full-7d"}
                """.formatted(title);
    }

    protected static String lotBody(String type, String name, int price, int quantity) {
        return """
                {"typeName":"%s","name":"%s","price":%d,"quantity":%d,"startsAt":"2020-01-01","endsAt":"2030-05-10",
                 "perCustomerLimit":6,"autoOpenNext":true}
                """.formatted(type, name, price, quantity);
    }
}
