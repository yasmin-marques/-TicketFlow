package br.com.ticketflow.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.support.OrgTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

/** Pedidos (filtros, paginação, reembolso) e números do dashboard/relatório conferidos contra o banco. */
class OrgOrdersAndReportsIntegrationTest extends OrgTestSupport {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");

    @Test
    void ordersAreFilteredPaginatedAndRefundable() throws Exception {
        Fx fx = newEvent(50);
        Buyer owner = memberOf(fx, MemberRole.OWNER);
        Buyer ana = newBuyer();
        Buyer bia = newBuyer();
        JsonNode o1 = buy(ana, fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":2}]");
        JsonNode o2 = buy(bia, fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        Resp pix = reserve(bia, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]"));
        Resp pending = order(bia, key(), orderBody(pix.body().path("id").asText(), "pix", null));
        assertThat(pending.body().path("status").asText()).isEqualTo("pending");

        JsonNode all = send(owner, get("/api/org/orders?eventId=" + fx.eventId())).body();
        assertThat(all.path("total").asInt()).isEqualTo(3);
        JsonNode first = all.path("items").get(0);
        for (String field : new String[] {"id", "code", "eventId", "eventTitle", "buyerName", "buyerEmail", "quantity", "subtotal", "fee", "total",
                "paymentMethod", "createdAt", "status", "lines"}) {
            assertThat(first.has(field)).as(field).isTrue();
        }
        assertThat(first.has("buyerCpf")).isFalse();
        assertThat(send(owner, get("/api/org/orders?eventId=" + fx.eventId() + "&status=paid")).body().path("total").asInt()).isEqualTo(2);
        assertThat(send(owner, get("/api/org/orders?eventId=" + fx.eventId() + "&method=pix")).body().path("total").asInt()).isEqualTo(1);
        assertThat(send(owner, get("/api/org/orders?q=" + o1.path("code").asText())).body().path("total").asInt()).isEqualTo(1);
        JsonNode page2 = send(owner, get("/api/org/orders?eventId=" + fx.eventId() + "&page=2&pageSize=2")).body();
        assertThat(page2.path("page").asInt()).isEqualTo(2);
        assertThat(page2.path("totalPages").asInt()).isEqualTo(2);
        assertThat(page2.path("items").size()).isEqualTo(1);
        String today = LocalDate.now(SP).toString();
        assertThat(send(owner, get("/api/org/orders?eventId=" + fx.eventId() + "&from=" + today + "&to=" + today)).body().path("total").asInt()).isEqualTo(3);
        assertThat(send(owner, get("/api/org/orders?status=nada")).status()).isEqualTo(400);

        // Reembolso: pedido pago → reembolsado, estoque devolvido; repetir ou reembolsar pendente → 409.
        Resp refunded = send(owner, post("/api/org/orders/" + o1.path("id").asText() + "/refund"));
        assertThat(refunded.status()).isEqualTo(200);
        assertThat(refunded.body().path("status").asText()).isEqualTo("refunded");
        assertThat(lotSold(fx, "geral")).isEqualTo(1);
        assertThat(send(owner, post("/api/org/orders/" + o1.path("id").asText() + "/refund")).status()).isEqualTo(409);
        assertThat(send(owner, post("/api/org/orders/" + pending.body().path("id").asText() + "/refund")).status()).isEqualTo(409);

        // Ingresso já utilizado bloqueia o reembolso.
        json(owner, post("/api/org/events/" + fx.eventId() + "/checkin"), "{\"code\":\"" + qrOf(o2, 0) + "\",\"gate\":\"A\"}");
        Resp blocked = send(owner, post("/api/org/orders/" + o2.path("id").asText() + "/refund"));
        assertThat(blocked.status()).isEqualTo(409);
        assertThat(send(bia, get("/api/orders/" + o2.path("id").asText())).body().path("status").asText()).isEqualTo("paid");
    }

    @Test
    void dashboardAndReportNumbersMatchTheDatabase() throws Exception {
        Fx fx = newEvent(100);
        Buyer owner = memberOf(fx, MemberRole.OWNER);
        buy(newBuyer(), fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":3}]");
        buy(newBuyer(), fx, "[{\"ticketTypeId\":\"premium\",\"quantity\":2,\"seatIds\":[\"A01\",\"A02\"]}]");
        JsonNode refunded = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        send(owner, post("/api/org/orders/" + refunded.path("id").asText() + "/refund"));
        // Uma reserva que expira (conta no funil e na taxa de expiração).
        Buyer late = newBuyer();
        Resp r = reserve(late, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]"));
        jdbc.update("update reservations set status = 'EXPIRED' where id = ?::uuid", r.body().path("id").asText());
        jdbc.update("update ticket_lots set quantity_held = 0 where ticket_type_id = ?", fx.general().getId());

        long revenueCents = jdbc.queryForObject("select sum(subtotal_cents) from orders where event_id = ? and status = 'PAID'", Long.class, fx.event().getId());
        int ticketsSold = jdbc.queryForObject("select count(*) from tickets where event_id = ? and status in ('VALID','USED')", Integer.class, fx.event().getId());
        assertThat(revenueCents).isEqualTo(3 * 10_000 + 2 * 12_000);
        assertThat(ticketsSold).isEqualTo(5);

        JsonNode dash = send(owner, get("/api/org/dashboard?range=7&eventId=" + fx.eventId())).body();
        assertThat(dash.path("revenue").path("value").decimalValue()).isEqualByComparingTo(BigDecimal.valueOf(revenueCents, 2));
        assertThat(dash.path("sold").path("value").asInt()).isEqualTo(5);
        assertThat(dash.path("revenue").path("delta").isNull()).isTrue(); // sem vendas no período anterior → sem variação
        assertThat(dash.path("salesByDay").size()).isEqualTo(7);
        assertThat(dash.path("salesByDay").get(6).path("tickets").asInt()).isEqualTo(5);
        assertThat(dash.path("goal").asInt()).isEqualTo(100 + 4 + 4);
        assertThat(dash.path("occupancy").path("value").asInt()).isEqualTo(Math.round(5 * 100f / 108));
        assertThat(dash.path("byType").toString()).contains("Geral").contains("Premium");
        assertThat(dash.path("revenueByEvent").get(0).path("revenue").decimalValue()).isEqualByComparingTo(BigDecimal.valueOf(revenueCents, 2));

        JsonNode report = send(owner, get("/api/org/reports?eventId=" + fx.eventId())).body();
        assertThat(report.path("revenue").decimalValue()).isEqualByComparingTo(BigDecimal.valueOf(revenueCents, 2));
        assertThat(report.path("sold").asInt()).isEqualTo(5);
        assertThat(report.path("avgTicket").decimalValue()).isEqualByComparingTo(new BigDecimal("108.00"));
        assertThat(report.path("funnel").get(0).path("value").asInt()).isEqualTo(4); // reservas criadas
        assertThat(report.path("funnel").get(2).path("value").asInt()).isEqualTo(3); // pagos (inclui o depois reembolsado)
        assertThat(report.path("expiredReservationsPct").decimalValue()).isEqualByComparingTo("25.0");
        assertThat(report.path("conversionBasis").asText()).isEqualTo("reservation-to-paid");
        JsonNode lots = report.path("byLot");
        assertThat(lots.toString()).contains("\"typeName\":\"Geral\"");
        int lotSoldTotal = 0;
        for (JsonNode l : lots) {
            lotSoldTotal += l.path("sold").asInt();
        }
        assertThat(lotSoldTotal).isEqualTo(ticketsSold);
        assertThat(report.path("bySector").toString()).contains("Premium");
        long daySum = 0;
        for (JsonNode d : report.path("dailyRevenue")) {
            daySum += d.path("revenue").decimalValue().movePointRight(2).longValue();
        }
        assertThat(daySum).isEqualTo(revenueCents);
        assertThat(send(owner, get("/api/org/reports?eventId=" + fx.eventId() + "&from=2026-13-01")).status()).isEqualTo(400);
    }

    @Test
    void lotPriceChangesOnlyAffectNewReservations() throws Exception {
        Fx fx = newEvent(20);
        Buyer owner = memberOf(fx, MemberRole.OWNER);
        Buyer early = newBuyer();
        Resp held = reserve(early, key(), reservationBody(fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]"));
        String lotId = jdbc.queryForObject("select id::text from ticket_lots where ticket_type_id = ?", String.class, fx.general().getId());

        assertThat(json(owner, patch("/api/org/lots/" + lotId), "{\"price\":150}").status()).isEqualTo(200);
        JsonNode paid = send(early, post("/api/orders").header("Idempotency-Key", key()).contentType("application/json")
                .content(orderBody(held.body().path("id").asText(), "card", "tok_4242"))).body();
        assertThat(paid.path("subtotal").decimalValue()).isEqualByComparingTo("100");
        JsonNode later = buy(newBuyer(), fx, "[{\"ticketTypeId\":\"geral\",\"quantity\":1}]");
        assertThat(later.path("subtotal").decimalValue()).isEqualByComparingTo("150");
    }
}
