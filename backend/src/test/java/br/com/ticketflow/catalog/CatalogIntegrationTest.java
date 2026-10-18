package br.com.ticketflow.catalog;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import br.com.ticketflow.support.AbstractIntegrationTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Catálogo público. Conjunto de dados (todos em datas relativas a agora):
 *
 * <pre>
 *  slug          categoria   cidade   preço  quando  observação
 *  rock-alpha    musica      SP       50     +5d     destaque
 *  jazz-beta     cultura     SP       100    +10d    mapa de assentos
 *  tech-gamma    tecnologia  Rio      0      +20d    gratuito
 *  show-esgotado esportes    SP       30     +3d     esgotado
 *  rascunho      musica      SP       10     +4d     NÃO publicado
 *  passado       musica      SP       10     -10d    publicado, mas já encerrado
 * </pre>
 */
class CatalogIntegrationTest extends AbstractIntegrationTest {

    @Autowired private EventRepository events;
    @Autowired private CategoryRepository categories;
    @Autowired private VenueRepository venues;
    @Autowired private OrganizationRepository organizations;
    @Autowired private EventAvailabilityService availability;

    @BeforeEach
    void seed() {
        resetSalesData();
        Instant now = Instant.now();
        Organization org = organizations.save(Organization.create("Org " + UUID.randomUUID(), "org-" + UUID.randomUUID(), now));
        Venue sp = venue("Casa SP", "São Paulo", "SP", "-23.5600", "-46.6500", now);
        Venue rio = venue("Arena Rio", "Rio de Janeiro", "RJ", "-22.9000", "-43.1700", now);

        event(org, sp, "rock-alpha", "Rock Alpha", "musica", 5_000, 100, 5, true, true, false, now);
        event(org, sp, "jazz-beta", "Jazz Beta", "cultura", 10_000, 100, 10, true, false, true, now);
        event(org, rio, "tech-gamma", "Tech Gamma", "tecnologia", 0, 100, 20, true, false, false, now);
        event(org, sp, "show-esgotado", "Show Esgotado", "esportes", 3_000, 500, 3, true, false, false, now);
        event(org, sp, "rascunho", "Rascunho", "musica", 1_000, 100, 4, false, false, false, now);
        event(org, sp, "passado", "Passado", "musica", 1_000, 100, -10, true, false, false, now);
    }

    private Venue venue(String name, String city, String state, String lat, String lng, Instant now) {
        Venue v = Venue.create(name, city, state, now);
        v.setLatitude(new BigDecimal(lat));
        v.setLongitude(new BigDecimal(lng));
        return venues.save(v);
    }

    private Event event(Organization org, Venue venue, String slug, String title, String category, long priceCents,
                        int sold, int days, boolean published, boolean featured, boolean seatMap, Instant now) {
        Instant startsAt = now.plus(days, ChronoUnit.DAYS);
        Event e = Event.create(org, categories.findBySlug(category).orElseThrow(), venue, slug, title, startsAt, now);
        e.setEndsAt(startsAt.plus(4, ChronoUnit.HOURS));
        e.setHasSeatMap(seatMap);
        e.setDescription("Descrição de " + title);
        e.setAgeRating((short) 16);
        if (featured) {
            e.setFeatured(true);
            e.setFeaturedRank((short) 0);
        }
        int total = slug.equals("show-esgotado") ? 500 : 1000;
        TicketType type = TicketType.of("geral", "Ingresso", null, TicketKind.GENERAL, null, 0, now);
        type.addLot(TicketLot.of("Lote 1", priceCents, total, slug.equals("show-esgotado") ? total : sold, startsAt.minus(30, ChronoUnit.DAYS), startsAt, 0, now));
        e.addTicketType(type);
        availability.recalculate(e, now);
        if (published) {
            e.publish(now.minus(1, ChronoUnit.HOURS));
        }
        e.setSearchText(EventSearchTextBuilder.build(e));
        return events.save(e);
    }

    // ---- visibilidade ------------------------------------------------------------------------------------

    @Test
    void listsOnlyPublishedAndNotFinishedEvents() throws Exception {
        mvc.perform(get("/api/events?pageSize=50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(4))
                .andExpect(jsonPath("$.items[*].slug", containsInAnyOrder("rock-alpha", "jazz-beta", "tech-gamma", "show-esgotado")))
                .andExpect(jsonPath("$.items[*].slug", not(hasItem("rascunho"))))
                .andExpect(jsonPath("$.items[*].slug", not(hasItem("passado"))));
    }

    @Test
    void draftAndFinishedEventsHaveNoDetailPage() throws Exception {
        for (String slug : new String[] {"rascunho", "passado", "nao-existe"}) {
            mvc.perform(get("/api/events/" + slug))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.status").value(404))
                    .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                    .andExpect(jsonPath("$.message").isNotEmpty());
        }
        mvc.perform(get("/api/events/rascunho/related")).andExpect(status().isNotFound());
    }

    // ---- filtros -----------------------------------------------------------------------------------------

    @Test
    void searchIsCaseAndAccentInsensitiveAndMatchesCategoryAndVenue() throws Exception {
        mvc.perform(get("/api/events?q=JAZZ")).andExpect(jsonPath("$.items[*].slug", contains("jazz-beta")));
        mvc.perform(get("/api/events?q=música")).andExpect(jsonPath("$.items[*].slug", contains("rock-alpha")));
        mvc.perform(get("/api/events?q=arena rio")).andExpect(jsonPath("$.items[*].slug", contains("tech-gamma")));
        mvc.perform(get("/api/events?q=100%25")).andExpect(jsonPath("$.total").value(0)); // '%' não é curinga
        mvc.perform(get("/api/events?q=zzzz")).andExpect(jsonPath("$.items", hasSize(0))).andExpect(jsonPath("$.totalPages").value(1));
    }

    @Test
    void filtersByCity() throws Exception {
        mvc.perform(get("/api/events?city=São Paulo, SP"))
                .andExpect(jsonPath("$.items[*].slug", containsInAnyOrder("rock-alpha", "jazz-beta", "show-esgotado")));
        mvc.perform(get("/api/events?city=Rio de Janeiro, RJ"))
                .andExpect(jsonPath("$.items[*].slug", contains("tech-gamma")));
    }

    @Test
    void filtersByCategories() throws Exception {
        mvc.perform(get("/api/events?categories=musica,cultura"))
                .andExpect(jsonPath("$.items[*].slug", containsInAnyOrder("rock-alpha", "jazz-beta")));
    }

    @Test
    void filtersByPriceInReais() throws Exception {
        mvc.perform(get("/api/events?minPrice=60")).andExpect(jsonPath("$.items[*].slug", contains("jazz-beta")));
        mvc.perform(get("/api/events?maxPrice=50"))
                .andExpect(jsonPath("$.items[*].slug", containsInAnyOrder("rock-alpha", "tech-gamma", "show-esgotado")));
        mvc.perform(get("/api/events?minPrice=0&maxPrice=0")).andExpect(jsonPath("$.items[*].slug", contains("tech-gamma")));
    }

    @Test
    void filtersByDateRangeAndSeatMap() throws Exception {
        String from = java.time.LocalDate.now().plusDays(9).toString();
        String to = java.time.LocalDate.now().plusDays(11).toString();
        mvc.perform(get("/api/events?from=" + from + "&to=" + to)).andExpect(jsonPath("$.items[*].slug", contains("jazz-beta")));
        mvc.perform(get("/api/events?seatMapOnly=true")).andExpect(jsonPath("$.items[*].slug", contains("jazz-beta")));
    }

    @Test
    void sortsByDatePriceAndDistance() throws Exception {
        mvc.perform(get("/api/events?sort=data"))
                .andExpect(jsonPath("$.items[*].slug", contains("show-esgotado", "rock-alpha", "jazz-beta", "tech-gamma")));
        mvc.perform(get("/api/events?sort=preco"))
                .andExpect(jsonPath("$.items[*].slug", contains("tech-gamma", "show-esgotado", "rock-alpha", "jazz-beta")));
        // Origem padrão = centro de São Paulo: locais de SP vêm antes do Rio.
        mvc.perform(get("/api/events?sort=distancia"))
                .andExpect(jsonPath("$.items[3].slug").value("tech-gamma"));
        mvc.perform(get("/api/events?sort=recentes")).andExpect(status().isOk());
    }

    @Test
    void periodShortcutsAreAccepted() throws Exception {
        for (String when : new String[] {"hoje", "fim-de-semana", "mes"}) {
            mvc.perform(get("/api/events?when=" + when)).andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray());
        }
    }

    // ---- paginação e validação ---------------------------------------------------------------------------

    @Test
    void paginates() throws Exception {
        mvc.perform(get("/api/events?pageSize=3&page=1&sort=data"))
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.total").value(4))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.pageSize").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/events?pageSize=3&page=2&sort=data"))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].slug").value("tech-gamma"));
        mvc.perform(get("/api/events?pageSize=3&page=9")).andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void clampsPageSizeAndRejectsInvalidParameters() throws Exception {
        mvc.perform(get("/api/events?pageSize=100000")).andExpect(jsonPath("$.pageSize").value(100));
        mvc.perform(get("/api/events?pageSize=0")).andExpect(jsonPath("$.pageSize").value(1));
        for (String bad : new String[] {"sort=aleatorio", "when=ontem", "from=ontem", "page=abc", "minPrice=abc",
                "from=2030-02-01&to=2030-01-01", "minPrice=10&maxPrice=5", "minPrice=-1", "lat=10"}) {
            mvc.perform(get("/api/events?" + bad))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.code").value("INVALID_PARAMETER"));
        }
    }

    // ---- contrato com o frontend -------------------------------------------------------------------------

    @Test
    void summaryMatchesTheFrontendContract() throws Exception {
        mvc.perform(get("/api/events?q=rock"))
                .andExpect(jsonPath("$.items[0].id").isString())
                .andExpect(jsonPath("$.items[0].slug").value("rock-alpha"))
                .andExpect(jsonPath("$.items[0].title").value("Rock Alpha"))
                .andExpect(jsonPath("$.items[0].category.slug").value("musica"))
                .andExpect(jsonPath("$.items[0].category.name").value("Música"))
                .andExpect(jsonPath("$.items[0].startsAt", endsWith("-03:00")))
                .andExpect(jsonPath("$.items[0].venue.name").value("Casa SP"))
                .andExpect(jsonPath("$.items[0].venue.city").value("São Paulo"))
                .andExpect(jsonPath("$.items[0].venue.state").value("SP"))
                .andExpect(jsonPath("$.items[0].venue.distanceKm").isNumber())
                .andExpect(jsonPath("$.items[0].minPrice").value(50.0))
                .andExpect(jsonPath("$.items[0].coverUrl").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.items[0].badges").isArray())
                .andExpect(jsonPath("$.items[0].hasSeatMap").value(false))
                .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$.items[0].organization").doesNotExist());
    }

    @Test
    void soldOutEventsCarryTheBadge() throws Exception {
        mvc.perform(get("/api/events?q=esgotado")).andExpect(jsonPath("$.items[0].badges", contains("soldOut")));
    }

    @Test
    void freeEventHasZeroPrice() throws Exception {
        mvc.perform(get("/api/events?q=tech")).andExpect(jsonPath("$.items[0].minPrice").value(0.0));
    }

    @Test
    void detailMatchesTheFrontendContract() throws Exception {
        mvc.perform(get("/api/events/jazz-beta"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("jazz-beta"))
                .andExpect(jsonPath("$.description").value("Descrição de Jazz Beta"))
                .andExpect(jsonPath("$.organizer").isString())
                .andExpect(jsonPath("$.ageRating").value(16))
                .andExpect(jsonPath("$.endsAt", endsWith("-03:00")))
                .andExpect(jsonPath("$.serviceFeePct").value(10.0))
                .andExpect(jsonPath("$.hasSeatMap").value(true))
                .andExpect(jsonPath("$.lot.name").value("Lote 1"))
                .andExpect(jsonPath("$.lot.remaining").value(900))
                .andExpect(jsonPath("$.schedule").isArray())
                .andExpect(jsonPath("$.cancellationPolicy").isArray())
                .andExpect(jsonPath("$.venue.name").value("Casa SP"));
    }

    // ---- endpoints auxiliares ----------------------------------------------------------------------------

    @Test
    void featuredReturnsOnlyFeaturedVisibleEvents() throws Exception {
        mvc.perform(get("/api/events/featured"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].slug", contains("rock-alpha")));
    }

    @Test
    void upcomingListsEventsOfTheCityByDate() throws Exception {
        mvc.perform(get("/api/events/upcoming?city=São Paulo, SP&limit=2"))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[*].slug", contains("show-esgotado", "rock-alpha")));
        mvc.perform(get("/api/events/upcoming?city=São Paulo, SP&category=cultura"))
                .andExpect(jsonPath("$[*].slug", contains("jazz-beta")));
    }

    @Test
    void suggestMatchesTitlesAndExposesTheFrontendShape() throws Exception {
        mvc.perform(get("/api/events/suggest?q=jazz&limit=5"))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].slug").value("jazz-beta"))
                .andExpect(jsonPath("$[0].title").value("Jazz Beta"))
                .andExpect(jsonPath("$[0].category").value("Cultura"))
                .andExpect(jsonPath("$[0].venue").value("Casa SP"));
        mvc.perform(get("/api/events/suggest?q=")).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/events/suggest")).andExpect(status().isOk());
    }

    @Test
    void relatedExcludesTheEventItselfAndHiddenOnes() throws Exception {
        mvc.perform(get("/api/events/rock-alpha/related?limit=10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].slug", not(hasItem("rock-alpha"))))
                .andExpect(jsonPath("$[*].slug", not(hasItem("rascunho"))))
                .andExpect(jsonPath("$[*].slug", not(hasItem("passado"))))
                .andExpect(jsonPath("$", hasSize(3)));
        mvc.perform(get("/api/events/rock-alpha/related?limit=1")).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void categoriesListsAllWithVisibleEventCounts() throws Exception {
        mvc.perform(get("/api/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(6)))
                .andExpect(jsonPath("$[0].slug").value("musica"))
                .andExpect(jsonPath("$[0].name").value("Música"))
                // rascunho e passado (também música) não contam
                .andExpect(jsonPath("$[0].eventCount").value(1))
                .andExpect(jsonPath("$[?(@.slug=='negocios')].eventCount").value(0));
    }

    @Test
    void catalogIsPublicAndNeverLeaksTheStackOnErrors() throws Exception {
        mvc.perform(get("/api/events")).andExpect(status().isOk());
        mvc.perform(get("/api/events/nao-existe"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.exception").doesNotExist());
    }
}
