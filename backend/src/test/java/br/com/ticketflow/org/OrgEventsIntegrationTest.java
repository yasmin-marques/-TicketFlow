package br.com.ticketflow.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.support.OrgTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** CRUD, publicação, despublicação, cancelamento, exclusão, slugs, lotes e mapa de assentos — tudo pela API real. */
class OrgEventsIntegrationTest extends OrgTestSupport {

    private String createPublishable(Buyer org, String title) throws Exception {
        Resp created = json(org, post("/api/org/events"), publishableDraft(title));
        assertThat(created.status()).as(created.body().toString()).isEqualTo(201);
        return created.body().path("id").asText();
    }

    @Test
    void draftIsCreatedEditedAndOnlyAppearsInTheCatalogAfterPublishing() throws Exception {
        Buyer org = account(RoleName.ORGANIZER);

        Resp draft = json(org, post("/api/org/events"), "{\"title\":\"Festa de Teste\"}");
        assertThat(draft.status()).isEqualTo(201);
        JsonNode d = draft.body();
        String id = d.path("id").asText();
        String slug = d.path("slug").asText();
        assertThat(d.path("status").asText()).isEqualTo("draft");
        assertThat(slug).isEqualTo("festa-de-teste");
        assertThat(d.path("venue").path("name").asText()).isEmpty();
        assertThat(d.has("coverName")).isTrue();
        assertThat(d.path("seatMap").isNull()).isTrue();
        assertThat(send(null, get("/api/events/" + slug)).status()).isEqualTo(404);

        // Publicar sem os requisitos lista TODAS as pendências.
        Resp blocked = send(org, post("/api/org/events/" + id + "/publish"));
        assertThat(blocked.status()).isEqualTo(422);
        assertThat(blocked.code()).isEqualTo("PUBLISH_BLOCKED");
        List<String> errors = new ArrayList<>();
        blocked.body().path("errors").forEach(e -> errors.add(e.asText()));
        assertThat(errors).anyMatch(e -> e.contains("descrição")).anyMatch(e -> e.contains("local")).anyMatch(e -> e.contains("lote"));

        Resp edited = json(org, patch("/api/org/events/" + id), publishableDraft("Festa de Teste"));
        assertThat(edited.status()).as(edited.body().toString()).isEqualTo(200);
        assertThat(edited.body().path("venue").path("city").asText()).isEqualTo("São Paulo");

        Resp lot = json(org, post("/api/org/events/" + id + "/lots"), lotBody("Pista", "1º lote", 80, 100));
        assertThat(lot.status()).isEqualTo(201);
        assertThat(lot.body().path("status").asText()).isEqualTo("draft");

        Resp published = send(org, post("/api/org/events/" + id + "/publish"));
        assertThat(published.status()).as(published.body().toString()).isEqualTo(200);
        assertThat(published.body().path("status").asText()).isEqualTo("published");
        assertThat(published.body().path("capacity").asInt()).isEqualTo(100);

        // Catálogo público: detalhe, busca e venda.
        Resp detail = send(null, get("/api/events/" + slug));
        assertThat(detail.status()).isEqualTo(200);
        assertThat(detail.body().path("minPrice").decimalValue()).isEqualByComparingTo("80");
        assertThat(detail.body().path("venue").path("city").asText()).isEqualTo("São Paulo");
        assertThat(send(null, get("/api/events").param("q", "festa de teste")).body().path("items").toString()).contains(slug);
        Resp sales = send(null, get("/api/events/" + slug + "/sales"));
        assertThat(sales.body().path("ticketTypes").get(0).path("lot").path("status").asText()).isEqualTo("open");

        Resp list = send(org, get("/api/org/events"));
        assertThat(list.body().path("counts").path("published").asInt()).isEqualTo(1);
        assertThat(list.body().path("items").get(0).path("venueLabel").asText()).isEqualTo("Galpão Central · São Paulo");

        // Auditoria das ações.
        assertThat(jdbc.queryForList("select action from audit_log where entity_id = ?", String.class, id))
                .contains("event.created", "event.updated", "event.published");
    }

    @Test
    void slugsAreGloballyUniqueAndValidated() throws Exception {
        Buyer a = account(RoleName.ORGANIZER);
        Buyer b = account(RoleName.ORGANIZER);
        String idA = createPublishable(a, "Show Único");
        Resp second = json(b, post("/api/org/events"), "{\"title\":\"Show Único\"}");
        assertThat(second.body().path("slug").asText()).isEqualTo("show-unico-2");

        Resp check = send(b, get("/api/org/events/slug-available?slug=Show Único"));
        assertThat(check.body().path("slug").asText()).isEqualTo("show-unico");
        assertThat(check.body().path("available").asBoolean()).isFalse();
        // exceptId de OUTRA organização não libera o slug.
        assertThat(send(b, get("/api/org/events/slug-available?slug=show-unico&exceptId=" + idA)).body().path("available").asBoolean()).isFalse();
        assertThat(send(a, get("/api/org/events/slug-available?slug=show-unico&exceptId=" + idA)).body().path("available").asBoolean()).isTrue();
        assertThat(send(a, get("/api/org/events/slug-available?slug=featured")).body().path("available").asBoolean()).isFalse();

        Resp taken = json(b, patch("/api/org/events/" + second.body().path("id").asText()), "{\"slug\":\"show-unico\"}");
        assertThat(taken.status()).isEqualTo(409);
        assertThat(taken.code()).isEqualTo("SLUG_TAKEN");
        assertThat(json(a, patch("/api/org/events/" + idA), "{\"slug\":\"suggest\"}").status()).isEqualTo(422);
    }

    @Test
    void unpublishDeleteAndEditingRulesRespectSales() throws Exception {
        Buyer org = account(RoleName.ORGANIZER);
        String id = createPublishable(org, "Evento Regras " + System.nanoTime());
        json(org, post("/api/org/events/" + id + "/lots"), lotBody("Pista", "Lote único", 50, 10));
        assertThat(send(org, post("/api/org/events/" + id + "/publish")).status()).isEqualTo(200);
        assertThat(send(org, delete("/api/org/events/" + id)).status()).isEqualTo(409); // publicado não se exclui

        // Sem vendas: volta para rascunho e sai do catálogo.
        String slug = send(org, get("/api/org/events/" + id)).body().path("slug").asText();
        Resp unpublished = send(org, post("/api/org/events/" + id + "/unpublish"));
        assertThat(unpublished.status()).isEqualTo(200);
        assertThat(unpublished.body().path("status").asText()).isEqualTo("draft");
        assertThat(send(null, get("/api/events/" + slug)).status()).isEqualTo(404);

        // Republica, vende e tenta despublicar.
        assertThat(send(org, post("/api/org/events/" + id + "/publish")).status()).isEqualTo(200);
        Buyer buyer = newBuyer();
        Resp r = reserve(buyer, key(), "{\"eventId\":\"" + id + "\",\"items\":[{\"ticketTypeId\":\"pista\",\"quantity\":2}]}");
        assertThat(r.status()).as(r.body().toString()).isEqualTo(201);
        assertThat(order(buyer, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242")).status()).isEqualTo(201);

        Resp refused = send(org, post("/api/org/events/" + id + "/unpublish"));
        assertThat(refused.status()).isEqualTo(409);
        assertThat(json(org, patch("/api/org/events/" + id), "{\"slug\":\"novo-link-" + System.nanoTime() + "\"}").status()).isEqualTo(409);
        // Lote: quantidade abaixo do vendido → 422; lote com vendas não é removido → 409.
        String lotId = send(org, get("/api/org/events/" + id + "/lots")).body().get(0).path("id").asText();
        assertThat(send(org, get("/api/org/events/" + id + "/lots")).body().get(0).path("sold").asInt()).isEqualTo(2);
        Resp tooFew = json(org, patch("/api/org/lots/" + lotId), "{\"quantity\":1}");
        assertThat(tooFew.status()).isEqualTo(422);
        assertThat(send(org, delete("/api/org/lots/" + lotId)).status()).isEqualTo(409);
        Resp more = json(org, patch("/api/org/lots/" + lotId), "{\"quantity\":12,\"price\":70}");
        assertThat(more.status()).isEqualTo(200);
        assertThat(more.body().path("quantity").asInt()).isEqualTo(12);

        // Rascunho sem local pode ser cancelado (sai da lista de rascunhos sem quebrar a restrição de local).
        String bare = json(org, post("/api/org/events"), "{\"title\":\"Rascunho Sem Local\"}").body().path("id").asText();
        assertThat(send(org, post("/api/org/events/" + bare + "/cancel")).body().path("status").asText()).isEqualTo("cancelled");

        // Rascunho sem vendas pode ser excluído.
        String draftId = json(org, post("/api/org/events"), "{\"title\":\"Rascunho Descartável\"}").body().path("id").asText();
        assertThat(send(org, delete("/api/org/events/" + draftId)).status()).isEqualTo(204);
        assertThat(send(org, get("/api/org/events/" + draftId)).status()).isEqualTo(404);
    }

    @Test
    void cancellingAnEventRefundsPaidOrdersAndRemovesItFromTheCatalog() throws Exception {
        Fx fx = newEvent(10);
        Buyer org = memberOf(fx, br.com.ticketflow.organization.OrganizationMember.MemberRole.OWNER);
        Buyer buyer = newBuyer();
        JsonNode paid = buy(buyer, fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":2},{\"ticketTypeId\":\"premium\",\"quantity\":1,\"seatIds\":[\"A01\"]}]");
        // Um segundo comprador fica com a reserva ativa (sem pagar).
        Buyer holder = newBuyer();
        assertThat(reserve(holder, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]")).status()).isEqualTo(201);

        Resp cancelled = send(org, post("/api/org/events/" + fx.eventId() + "/cancel"));
        assertThat(cancelled.status()).as(cancelled.body().toString()).isEqualTo(200);
        assertThat(cancelled.body().path("status").asText()).isEqualTo("cancelled");
        assertThat(cancelled.body().path("sold").asInt()).isZero();

        assertThat(send(buyer, get("/api/orders/" + paid.path("id").asText())).body().path("status").asText()).isEqualTo("refunded");
        assertThat(jdbc.queryForObject("select count(*) from tickets where event_id = ? and status <> 'CANCELLED'", Integer.class, fx.event().getId())).isZero();
        assertThat(lotSold(fx, "geral")).isZero();
        assertThat(lotHeld(fx, "geral")).isZero();
        assertThat(seatStatus(fx, "A01")).isEqualTo("AVAILABLE");
        assertThat(send(null, get("/api/events/" + fx.event().getSlug())).status()).isEqualTo(404);
        assertThat(send(org, post("/api/org/events/" + fx.eventId() + "/cancel")).status()).isEqualTo(409);
        assertThat(json(org, patch("/api/org/events/" + fx.eventId()), "{\"title\":\"Outro nome\"}").status()).isEqualTo(409);
        assertThat(send(org, get("/api/org/notifications")).body().toString()).contains("Evento cancelado");
    }

    @Test
    void seatMapIsSavedLinkedToLotsAndProtectsSoldSeats() throws Exception {
        Buyer org = account(RoleName.ORGANIZER);
        String id = createPublishable(org, "Teatro Mapa " + System.nanoTime());
        json(org, post("/api/org/events/" + id + "/lots"), lotBody("Plateia", "1º lote", 100, 4));
        String map = """
                {"seatMap":{"sectors":[{"id":"plateia","name":"Plateia","price":100}],
                  "rows":[{"letter":"A","cells":[{"label":"A01","sectorId":"plateia","blocked":false},null,
                                                {"label":"A03","sectorId":"plateia","blocked":false},{"label":"A04","sectorId":"plateia","blocked":false},
                                                {"label":"A05","sectorId":"plateia","blocked":true}]}],
                  "generalCapacity":0}}
                """;
        Resp saved = json(org, put("/api/org/events/" + id + "/seat-map"), map);
        assertThat(saved.status()).as(saved.body().toString()).isEqualTo(200);
        assertThat(saved.body().path("hasSeatMap").asBoolean()).isTrue();
        assertThat(saved.body().path("seatMap").path("rows").get(0).path("cells").get(1).isNull()).isTrue();

        // 4 ingressos no lote, mas só 3 assentos vendáveis (A05 bloqueado) → publicação bloqueada com o motivo.
        Resp blocked = send(org, post("/api/org/events/" + id + "/publish"));
        assertThat(blocked.code()).isEqualTo("PUBLISH_BLOCKED");
        assertThat(blocked.body().path("errors").toString()).contains("3 assento");
        String lotId = send(org, get("/api/org/events/" + id + "/lots")).body().get(0).path("id").asText();
        json(org, patch("/api/org/lots/" + lotId), "{\"quantity\":3}");
        assertThat(send(org, post("/api/org/events/" + id + "/publish")).status()).isEqualTo(200);

        // Comprador: o vão (A02) e o bloqueado (A05) aparecem indisponíveis; não dá para reservar o bloqueado.
        JsonNode seats = send(null, get("/api/events/" + id + "/seats")).body().path("seats");
        assertThat(seats.path("A02").asText()).isEqualTo("sold");
        assertThat(seats.path("A05").asText()).isEqualTo("sold");
        Buyer buyer = newBuyer();
        Resp bad = reserve(buyer, key(), "{\"eventId\":\"" + id + "\",\"items\":[{\"ticketTypeId\":\"plateia\",\"quantity\":1,\"seatIds\":[\"A05\"]}]}");
        assertThat(bad.status()).isEqualTo(409);

        Resp r = reserve(buyer, key(), "{\"eventId\":\"" + id + "\",\"items\":[{\"ticketTypeId\":\"plateia\",\"quantity\":1,\"seatIds\":[\"A01\"]}]}");
        assertThat(r.status()).as(r.body().toString()).isEqualTo(201);
        assertThat(order(buyer, key(), orderBody(r.body().path("id").asText(), "card", "tok_4242")).status()).isEqualTo(201);

        // Bloquear ou remover um assento vendido → 409 SEAT_SOLD; o mapa não muda.
        Resp blockSold = json(org, put("/api/org/events/" + id + "/seat-map"), map.replace(
                "{\"label\":\"A01\",\"sectorId\":\"plateia\",\"blocked\":false}", "{\"label\":\"A01\",\"sectorId\":\"plateia\",\"blocked\":true}"));
        assertThat(blockSold.status()).isEqualTo(409);
        assertThat(blockSold.code()).isEqualTo("SEAT_SOLD");
        Resp removeSold = json(org, put("/api/org/events/" + id + "/seat-map"), map.replace("{\"label\":\"A01\",\"sectorId\":\"plateia\",\"blocked\":false},", ""));
        assertThat(removeSold.code()).isEqualTo("SEAT_SOLD");
        assertThat(jdbc.queryForObject("select status from event_seats where event_id = ?::uuid and code = 'A01'", String.class, id)).isEqualTo("SOLD");

        // Desbloquear um assento livre funciona e libera a venda.
        Resp unblock = json(org, put("/api/org/events/" + id + "/seat-map"), map.replace("\"A05\",\"sectorId\":\"plateia\",\"blocked\":true", "\"A05\",\"sectorId\":\"plateia\",\"blocked\":false"));
        assertThat(unblock.status()).isEqualTo(200);
        assertThat(send(null, get("/api/events/" + id + "/seats")).body().path("seats").has("A05")).isFalse();
    }

    @Test
    void invalidInputIsRejectedWithValidationErrors() throws Exception {
        Buyer org = account(RoleName.ORGANIZER);
        assertThat(json(org, post("/api/org/events"), "{\"title\":\"ab\"}").status()).isEqualTo(422);
        assertThat(json(org, post("/api/org/events"), "{\"title\":\"Datas\",\"startsAt\":\"2030-01-02T10:00:00-03:00\",\"endsAt\":\"2030-01-01T10:00:00-03:00\"}").status())
                .isEqualTo(422);
        assertThat(json(org, post("/api/org/events"), "{\"title\":\"Categoria\",\"category\":\"inexistente\"}").status()).isEqualTo(422);
        String id = json(org, post("/api/org/events"), "{\"title\":\"Lotes inválidos\"}").body().path("id").asText();
        assertThat(json(org, post("/api/org/events/" + id + "/lots"), lotBody("Pista", "X", -1, 10)).status()).isEqualTo(422);
        assertThat(json(org, post("/api/org/events/" + id + "/lots"),
                "{\"typeName\":\"Pista\",\"name\":\"X\",\"price\":10,\"quantity\":5,\"startsAt\":\"2030-02-01\",\"endsAt\":\"2030-01-01\"}").status())
                .isEqualTo(422);
        Resp badMap = json(org, put("/api/org/events/" + id + "/seat-map"),
                "{\"seatMap\":{\"sectors\":[{\"id\":\"s\",\"name\":\"S\",\"price\":1}],\"rows\":[{\"letter\":\"A\",\"cells\":[{\"label\":\"B01\",\"sectorId\":\"s\",\"blocked\":false}]}],\"generalCapacity\":0}}");
        assertThat(badMap.status()).isEqualTo(422);
    }
}
