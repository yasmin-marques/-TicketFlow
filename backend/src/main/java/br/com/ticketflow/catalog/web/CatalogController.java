package br.com.ticketflow.catalog.web;

import br.com.ticketflow.catalog.service.CatalogService;
import br.com.ticketflow.catalog.service.EventSearchCriteria;
import br.com.ticketflow.catalog.web.dto.CategoryDto;
import br.com.ticketflow.catalog.web.dto.EventDetailDto;
import br.com.ticketflow.catalog.web.dto.EventSummaryDto;
import br.com.ticketflow.catalog.web.dto.PageDto;
import br.com.ticketflow.catalog.web.dto.SuggestionDto;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Catálogo público (sem autenticação): apenas eventos publicados e disponíveis. */
@RestController
@RequestMapping("/api")
@Tag(name = "Catálogo", description = "Eventos e categorias públicos")
public class CatalogController {

    private static final int MAX_LIST_LIMIT = 50;

    private final CatalogService catalog;
    private final AppProperties.Catalog cfg;

    public CatalogController(CatalogService catalog, AppProperties props) {
        this.catalog = catalog;
        this.cfg = props.catalog();
    }

    @Operation(summary = "Lista paginada com filtros")
    @GetMapping("/events")
    public PageDto<EventSummaryDto> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String categories,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String when,
            @RequestParam(required = false, defaultValue = "false") boolean seatMapOnly,
            @RequestParam(required = false, defaultValue = "data") String sort,
            @RequestParam(required = false, defaultValue = "1") int page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng) {

        LocalDate fromDate = date("from", from);
        LocalDate toDate = date("to", to);
        if (fromDate != null && toDate != null && toDate.isBefore(fromDate)) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'to' não pode ser anterior a 'from'.");
        }
        if (minPrice != null && maxPrice != null && maxPrice.compareTo(minPrice) < 0) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'maxPrice' não pode ser menor que 'minPrice'.");
        }
        if ((lat == null) != (lng == null)) {
            throw ApiException.badRequest("INVALID_PARAMETER", "Informe 'lat' e 'lng' juntos.");
        }
        if (lat != null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
            throw ApiException.badRequest("INVALID_PARAMETER", "Coordenadas inválidas.");
        }

        City parsedCity = City.parse(city);
        EventSearchCriteria criteria = new EventSearchCriteria(
                blankToNull(q),
                parsedCity == null ? null : parsedCity.name(),
                parsedCity == null ? null : parsedCity.state(),
                fromDate,
                toDate,
                categories == null || categories.isBlank()
                        ? List.of()
                        : Arrays.stream(categories.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList(),
                cents("minPrice", minPrice),
                cents("maxPrice", maxPrice),
                enumParam("when", when, EventSearchCriteria.WhenFilter::fromParam),
                seatMapOnly,
                enumParam("sort", sort, EventSearchCriteria.Sort::fromParam),
                Math.max(1, page),
                clamp(pageSize == null ? cfg.defaultPageSize() : pageSize, 1, cfg.maxPageSize()),
                lat,
                lng);
        return catalog.search(criteria);
    }

    @Operation(summary = "Eventos em destaque")
    @GetMapping("/events/featured")
    public List<EventSummaryDto> featured() {
        return catalog.featured();
    }

    @Operation(summary = "Próximos eventos de uma cidade")
    @GetMapping("/events/upcoming")
    public List<EventSummaryDto> upcoming(
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String category,
            @RequestParam(required = false, defaultValue = "8") int limit) {
        City parsed = City.parse(city);
        return catalog.upcoming(parsed == null ? null : parsed.name(), parsed == null ? null : parsed.state(),
                blankToNull(category), clamp(limit, 1, MAX_LIST_LIMIT));
    }

    @Operation(summary = "Sugestões para a busca global")
    @GetMapping("/events/suggest")
    public List<SuggestionDto> suggest(
            @RequestParam(required = false, defaultValue = "") String q,
            @RequestParam(required = false, defaultValue = "5") int limit) {
        return catalog.suggest(q, clamp(limit, 1, 10));
    }

    @Operation(summary = "Detalhe do evento")
    @GetMapping("/events/{slug}")
    public EventDetailDto detail(@PathVariable String slug) {
        return catalog.detail(slug);
    }

    @Operation(summary = "Eventos relacionados")
    @GetMapping("/events/{slug}/related")
    public List<EventSummaryDto> related(@PathVariable String slug, @RequestParam(required = false, defaultValue = "4") int limit) {
        return catalog.related(slug, clamp(limit, 1, MAX_LIST_LIMIT));
    }

    @Operation(summary = "Categorias com contagem de eventos")
    @GetMapping("/categories")
    public List<CategoryDto> categories() {
        return catalog.categories();
    }

    // ---- parsing -------------------------------------------------------------------------------------------

    /** Cidade no formato do frontend: "São Paulo, SP" (estado opcional). */
    private record City(String name, String state) {
        static City parse(String raw) {
            if (raw == null || raw.isBlank()) {
                return null;
            }
            int comma = raw.lastIndexOf(',');
            if (comma < 0) {
                return new City(raw.trim(), null);
            }
            String state = raw.substring(comma + 1).trim();
            return new City(raw.substring(0, comma).trim(), state.isEmpty() ? null : state);
        }
    }

    private static LocalDate date(String name, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'" + name + "' deve estar no formato YYYY-MM-DD.");
        }
    }

    private static Long cents(String name, BigDecimal reais) {
        if (reais == null) {
            return null;
        }
        if (reais.signum() < 0) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'" + name + "' não pode ser negativo.");
        }
        try {
            return Money.toCents(reais);
        } catch (ArithmeticException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "'" + name + "' fora do intervalo permitido.");
        }
    }

    private static <T> T enumParam(String name, String value, java.util.function.Function<String, T> parser) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return parser.apply(value);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("INVALID_PARAMETER", "Valor inválido para '" + name + "': " + value);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }
}
