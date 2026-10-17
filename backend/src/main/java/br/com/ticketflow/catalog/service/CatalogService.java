package br.com.ticketflow.catalog.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.repository.CategoryRepository;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.EventSearchDao;
import br.com.ticketflow.catalog.web.dto.CategoryDto;
import br.com.ticketflow.catalog.web.dto.EventDetailDto;
import br.com.ticketflow.catalog.web.dto.EventSummaryDto;
import br.com.ticketflow.catalog.web.dto.PageDto;
import br.com.ticketflow.catalog.web.dto.SuggestionDto;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.config.AppProperties;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Casos de uso do catálogo público. Só enxerga eventos publicados e ainda não encerrados. */
@Service
@Transactional(readOnly = true)
public class CatalogService {

    private static final int FEATURED_LIMIT = 6;

    private final EventRepository events;
    private final CategoryRepository categories;
    private final EventSearchDao searchDao;
    private final EventMapper mapper;
    private final Clock clock;
    private final AppProperties.Catalog cfg;
    private final ZoneId zone;

    public CatalogService(EventRepository events, CategoryRepository categories, EventSearchDao searchDao,
                          EventMapper mapper, Clock clock, AppProperties props) {
        this.events = events;
        this.categories = categories;
        this.searchDao = searchDao;
        this.mapper = mapper;
        this.clock = clock;
        this.cfg = props.catalog();
        this.zone = ZoneId.of(cfg.timezone());
    }

    public PageDto<EventSummaryDto> search(EventSearchCriteria c) {
        Instant now = clock.instant();
        double lat = c.originLat() != null ? c.originLat() : cfg.originLat();
        double lng = c.originLng() != null ? c.originLng() : cfg.originLng();
        EventSearchDao.Result r = searchDao.search(c, now, zone, cfg.originLat(), cfg.originLng());
        return PageDto.of(summaries(r.items(), lat, lng), r.total(), c.page(), c.pageSize());
    }

    public List<EventSummaryDto> featured() {
        Instant now = clock.instant();
        return summaries(events.findFeatured(now, PageRequest.of(0, FEATURED_LIMIT)), cfg.originLat(), cfg.originLng());
    }

    /** Próximos eventos de uma cidade (e opcionalmente de uma categoria), por data. */
    public List<EventSummaryDto> upcoming(String city, String state, String category, int limit) {
        EventSearchCriteria c = new EventSearchCriteria(null, city, state, null, null,
                category == null ? List.of() : List.of(category), null, null, null, false,
                EventSearchCriteria.Sort.DATA, 1, limit, null, null);
        return search(c).items();
    }

    public EventDetailDto detail(String slug) {
        Instant now = clock.instant();
        Event e = events.findVisibleBySlug(slug, now).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));
        return mapper.toDetail(e, now, zone, cfg.originLat(), cfg.originLng());
    }

    public List<EventSummaryDto> related(String slug, int limit) {
        Instant now = clock.instant();
        Event e = events.findVisibleBySlug(slug, now).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));
        return summaries(events.findRelated(e.getId(), e.getCategory().getId(), now, PageRequest.of(0, limit)),
                cfg.originLat(), cfg.originLng());
    }

    public List<SuggestionDto> suggest(String q, int limit) {
        if (q == null || q.isBlank()) {
            return List.of();
        }
        EventSearchCriteria c = new EventSearchCriteria(q, null, null, null, null, List.of(), null, null, null, false,
                EventSearchCriteria.Sort.DATA, 1, limit, null, null);
        return searchDao.search(c, clock.instant(), zone, cfg.originLat(), cfg.originLng()).items().stream()
                .map(e -> new SuggestionDto(e.getSlug(), e.getTitle(), e.getCategory().getName(), e.getVenue().getName()))
                .toList();
    }

    public List<CategoryDto> categories() {
        return categories.findAllWithVisibleCount(clock.instant());
    }

    private List<EventSummaryDto> summaries(List<Event> items, double lat, double lng) {
        return items.stream().map(e -> mapper.toSummary(e, zone, lat, lng)).toList();
    }
}
