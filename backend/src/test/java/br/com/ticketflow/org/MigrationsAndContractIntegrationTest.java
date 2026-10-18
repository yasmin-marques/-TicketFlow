package br.com.ticketflow.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.support.OrgTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * Migrações aplicadas no PostgreSQL real (e o Hibernate validou o schema ao subir o contexto) + contrato: as respostas do
 * painel têm exatamente os campos dos tipos de {@code src/types/organizer.ts} que o frontend lê.
 */
class MigrationsAndContractIntegrationTest extends OrgTestSupport {

    @Test
    void allMigrationsAreAppliedAndKeyConstraintsExist() {
        List<String> versions = jdbc.queryForList("select version from flyway_schema_history where success order by installed_rank", String.class);
        assertThat(versions).containsSubsequence("1", "2", "3", "4", "5");
        Integer failed = jdbc.queryForObject("select count(*) from flyway_schema_history where not success", Integer.class);
        assertThat(failed).isZero();
        List<String> constraints = jdbc.queryForList("select conname from pg_constraint", String.class);
        assertThat(constraints).contains("ck_seats_blocked", "ck_tickets_used", "ck_events_published_venue", "ck_webhook_https", "ck_checkin_result",
                "ck_lots_held", "ck_seats_hold");
        // Integridade de ingressos: um assento nunca tem dois ingressos ativos; emissão única por posição do pedido.
        List<String> indexes = jdbc.queryForList("select indexname from pg_indexes", String.class);
        assertThat(indexes).contains("ux_tickets_active_seat", "ix_tickets_event_status", "ix_checkin_scans_event", "ix_audit_org");
    }

    @Test
    void organizerResponsesMatchTheFrontendTypes() throws Exception {
        Fx fx = newEvent(10);
        Buyer owner = memberOf(fx, MemberRole.OWNER);
        JsonNode order = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"premium\",\"quantity\":1,\"seatIds\":[\"A03\"]}]");

        assertKeys(send(owner, get("/api/org/events/" + fx.eventId())).body(), "id", "title", "slug", "category", "ageRating", "description",
                "startsAt", "endsAt", "venue", "coverName", "hasSeatMap", "seatMap", "cancellationPolicy", "status", "createdAt", "updatedAt",
                "capacity", "sold", "revenue", "checkedIn");
        JsonNode event = send(owner, get("/api/org/events/" + fx.eventId())).body();
        assertKeys(event.path("venue"), "name", "address", "district", "city", "state", "notes");
        assertKeys(event.path("seatMap"), "sectors", "rows", "generalCapacity");
        assertKeys(event.path("seatMap").path("rows").get(0), "letter", "cells");
        assertKeys(event.path("seatMap").path("sectors").get(0), "id", "name", "price");

        JsonNode events = send(owner, get("/api/org/events")).body();
        assertKeys(events, "items", "total", "counts");
        assertKeys(events.path("counts"), "all", "draft", "published", "ended", "cancelled");
        assertKeys(events.path("items").get(0), "id", "slug", "title", "venueLabel", "startsAt", "status", "sold", "capacity", "revenue");

        assertKeys(send(owner, get("/api/org/events/" + fx.eventId() + "/lots")).body().get(0), "id", "eventId", "typeName", "name", "price",
                "quantity", "startsAt", "endsAt", "perCustomerLimit", "autoOpenNext", "sold", "status");

        JsonNode orders = send(owner, get("/api/org/orders")).body();
        assertKeys(orders, "items", "total", "page", "pageSize", "totalPages");
        assertKeys(orders.path("items").get(0).path("lines").get(0), "description", "quantity", "unitPrice");

        JsonNode attendees = send(owner, get("/api/org/attendees?eventId=" + fx.eventId())).body();
        assertKeys(attendees, "items", "total", "page", "pageSize", "totalPages", "checkedIn", "sold");
        assertKeys(attendees.path("items").get(0), "ticketId", "code", "name", "email", "eventId", "orderCode", "typeName", "sector", "seat", "status");

        JsonNode result = json(owner, post("/api/org/events/" + fx.eventId() + "/checkin"), "{\"code\":\"" + qrOf(order, 0) + "\",\"gate\":\"A\"}").body();
        assertKeys(result, "result", "code", "message", "holderName", "typeName", "sector", "seat");
        JsonNode stats = send(owner, get("/api/org/events/" + fx.eventId() + "/checkin")).body();
        assertKeys(stats, "eventId", "eventTitle", "checkedIn", "sold", "perMinute", "gates", "recent");
        assertKeys(stats.path("recent").get(0), "id", "at", "result", "code", "holderName", "gate");

        JsonNode dash = send(owner, get("/api/org/dashboard?range=30")).body();
        assertKeys(dash, "range", "eventId", "updatedAt", "revenue", "sold", "occupancy", "checkins", "salesByDay", "byType", "cumulative", "goal",
                "revenueByEvent", "activeEvents");
        assertKeys(dash.path("revenue"), "value", "delta");
        assertKeys(dash.path("checkins"), "value", "pctOfSold");

        JsonNode report = send(owner, get("/api/org/reports?eventId=" + fx.eventId())).body();
        assertKeys(report, "eventId", "from", "to", "revenue", "sold", "occupancyPct", "avgTicket", "checkins", "checkinPct", "conversionPct",
                "expiredReservationsPct", "dailyRevenue", "funnel", "byLot", "bySector");

        JsonNode settings = send(owner, get("/api/org/settings")).body();
        assertKeys(settings, "name", "document", "email", "phone", "payout", "members", "webhooks");
        assertKeys(settings.path("payout"), "bank", "agency", "account", "holder");
        assertKeys(settings.path("members").get(0), "id", "name", "email", "role");

        JsonNode search = send(owner, get("/api/org/search?q=" + order.path("code").asText())).body();
        assertKeys(search, "events", "orders");
        assertKeys(search.path("orders").get(0), "id", "code", "buyerName", "eventTitle");

        // Swagger/OpenAPI documenta as rotas do painel.
        String openapi = mvc.perform(get("/api/docs")).andReturn().getResponse().getContentAsString();
        assertThat(openapi).contains("/api/org/events/{id}/publish", "/api/org/events/{id}/checkin", "/api/org/dashboard");
    }

    private static void assertKeys(JsonNode node, String... keys) {
        Set<String> present = new HashSet<>();
        node.fieldNames().forEachRemaining(present::add);
        assertThat(present).as(node.toString()).contains(keys);
    }
}
