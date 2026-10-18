package br.com.ticketflow.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.domain.Venue;
import br.com.ticketflow.catalog.repository.CategoryRepository;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.VenueRepository;
import br.com.ticketflow.catalog.service.EventAvailabilityService;
import br.com.ticketflow.catalog.service.EventSearchTextBuilder;
import br.com.ticketflow.organization.Organization;
import br.com.ticketflow.organization.OrganizationRepository;
import br.com.ticketflow.sales.service.SeatMapService;
import br.com.ticketflow.sales.service.SeatMapService.SectorSpec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Fixtures e helpers HTTP para os testes do núcleo transacional (reservas, pedidos, ingressos). */
public abstract class SalesTestSupport extends AbstractIntegrationTest {

    @Autowired protected ObjectMapper json;
    @Autowired protected EventRepository events;
    @Autowired protected CategoryRepository categories;
    @Autowired protected VenueRepository venues;
    @Autowired protected OrganizationRepository organizations;
    @Autowired protected EventAvailabilityService availability;
    @Autowired protected SeatMapService seatMaps;

    // ── usuários ───────────────────────────────────────────────────────────────────────────────────────

    public record Buyer(UUID id, String email, String token) {}

    public record Resp(int status, JsonNode body, MockHttpServletResponse raw) {
        public String code() {
            return body.path("code").asText();
        }
    }

    protected Buyer newBuyer() throws Exception {
        String email = "buyer-" + UUID.randomUUID() + "@example.com";
        MockHttpServletResponse res = mvc.perform(post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Maria Compradora\",\"email\":\"" + email + "\",\"password\":\"Senha123ok\"}"))
                .andReturn().getResponse();
        JsonNode body = json.readTree(res.getContentAsString());
        return new Buyer(UUID.fromString(body.path("user").path("id").asText()), email, body.path("accessToken").asText());
    }

    // ── HTTP ───────────────────────────────────────────────────────────────────────────────────────────

    protected Resp send(Buyer b, MockHttpServletRequestBuilder request) throws Exception {
        if (b != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + b.token());
        }
        MockHttpServletResponse res = mvc.perform(request).andReturn().getResponse();
        String text = res.getContentAsString();
        return new Resp(res.getStatus(), text.isBlank() ? json.createObjectNode() : json.readTree(text), res);
    }

    protected Resp reserve(Buyer b, String key, String body) throws Exception {
        return send(b, post("/api/reservations").header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    protected Resp getReservation(Buyer b, String id) throws Exception {
        return send(b, get("/api/reservations/" + id));
    }

    protected Resp setSeats(Buyer b, String reservationId, String typeCode, String seatIdsJson) throws Exception {
        return send(b, put("/api/reservations/" + reservationId + "/items/" + typeCode + "/seats")
                .contentType(MediaType.APPLICATION_JSON).content("{\"seatIds\":" + seatIdsJson + "}"));
    }

    protected Resp release(Buyer b, String reservationId) throws Exception {
        return send(b, delete("/api/reservations/" + reservationId));
    }

    protected Resp order(Buyer b, String key, String body) throws Exception {
        return send(b, post("/api/orders").header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    protected static String key() {
        return "key-" + UUID.randomUUID();
    }

    protected static String reservationBody(Fx fx, String itemsJson) {
        return "{\"eventId\":\"" + fx.eventId() + "\",\"items\":" + itemsJson + "}";
    }

    protected static String orderBody(String reservationId, String method, String cardToken) {
        String card = "card".equals(method) ? ",\"card\":{\"token\":\"" + cardToken + "\",\"installments\":1}" : "";
        return "{\"reservationId\":\"" + reservationId + "\","
                + "\"buyer\":{\"name\":\"Maria Compradora\",\"email\":\"maria@example.com\",\"phone\":\"(11) 98877-6655\","
                + "\"cpf\":\"529.982.247-25\",\"birthDate\":\"14/03/1994\"},"
                + "\"holders\":[],\"payment\":{\"method\":\"" + method + "\"" + card + "}}";
    }

    // ── concorrência ───────────────────────────────────────────────────────────────────────────────────

    /** Executa as tarefas ao mesmo tempo (largada sincronizada) e devolve os resultados na ordem. */
    protected <T> List<T> concurrently(List<Callable<T>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        try {
            CountDownLatch ready = new CountDownLatch(tasks.size());
            CountDownLatch go = new CountDownLatch(1);
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            ready.await();
            go.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> f : futures) {
                results.add(f.get());
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    // ── fixture de evento ──────────────────────────────────────────────────────────────────────────────

    /**
     * Evento publicado daqui a 30 dias com: tipo geral {@code geral} (estoque configurável, R$ 100), setor
     * {@code premium} (fila A, 4 assentos, R$ 120) e {@code standard} (fila B, 4 assentos, R$ 50).
     */
    public record Fx(Event event, TicketType general, TicketType premium, TicketType standard) {
        public String eventId() {
            return event.getId().toString();
        }
    }

    protected Fx newEvent(int generalStock) {
        Instant now = Instant.now();
        Organization org = organizations.save(Organization.create("Org " + UUID.randomUUID(), "org-" + UUID.randomUUID(), now));
        Venue venue = Venue.create("Casa Teste", "São Paulo", "SP", now);
        venue.setLatitude(new BigDecimal("-23.56"));
        venue.setLongitude(new BigDecimal("-46.65"));
        venue = venues.save(venue);

        Instant startsAt = now.plus(30, ChronoUnit.DAYS);
        Event e = Event.create(org, categories.findBySlug("musica").orElseThrow(), venue, "evt-" + UUID.randomUUID(), "Evento Teste", startsAt, now);
        e.setEndsAt(startsAt.plus(4, ChronoUnit.HOURS));
        e.setHasSeatMap(true);
        e.setDescription("Descrição");

        TicketType general = TicketType.of("geral", "Geral", "Acesso geral", TicketKind.GENERAL, null, 0, now);
        general.addLot(TicketLot.of("1º lote", 10_000, generalStock, 0, now.minus(1, ChronoUnit.DAYS), startsAt, 0, now));
        TicketType premium = TicketType.of("premium", "Premium", "Fila A", TicketKind.SEATED, "premium", 1, now);
        premium.addLot(TicketLot.of("1º lote", 12_000, 4, 0, now.minus(1, ChronoUnit.DAYS), startsAt, 0, now));
        TicketType standard = TicketType.of("standard", "Standard", "Fila B", TicketKind.SEATED, "standard", 2, now);
        standard.addLot(TicketLot.of("1º lote", 5_000, 4, 0, now.minus(1, ChronoUnit.DAYS), startsAt, 0, now));
        e.addTicketType(general);
        e.addTicketType(premium);
        e.addTicketType(standard);
        availability.recalculate(e, now);
        e.publish(now.minus(1, ChronoUnit.HOURS));
        e.setSearchText(EventSearchTextBuilder.build(e));
        events.save(e);

        seatMaps.create(e.getId(), "AB", 4, 2,
                List.of(new SectorSpec("premium", "Premium", premium, "A"), new SectorSpec("standard", "Standard", standard, "B")),
                Set.of("B04"), now, Set.of());
        return new Fx(e, general, premium, standard);
    }

    // ── consultas de verificação ───────────────────────────────────────────────────────────────────────

    protected String seatStatus(Fx fx, String code) {
        return jdbc.queryForObject("select status from event_seats where event_id = ? and code = ?", String.class, fx.event().getId(), code);
    }

    protected int lotHeld(Fx fx, String typeCode) {
        return jdbc.queryForObject("select l.quantity_held from ticket_lots l join ticket_types t on t.id = l.ticket_type_id where t.event_id = ? and t.code = ?",
                Integer.class, fx.event().getId(), typeCode);
    }

    protected int lotSold(Fx fx, String typeCode) {
        return jdbc.queryForObject("select l.quantity_sold from ticket_lots l join ticket_types t on t.id = l.ticket_type_id where t.event_id = ? and t.code = ?",
                Integer.class, fx.event().getId(), typeCode);
    }

    protected int count(String table, Fx fx) {
        return jdbc.queryForObject("select count(*) from " + table + " where event_id = ?", Integer.class, fx.event().getId());
    }
}
