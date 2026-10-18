package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Category;
import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.EventPolicyItem;
import br.com.ticketflow.catalog.domain.EventStatus;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.domain.Venue;
import br.com.ticketflow.catalog.repository.CategoryRepository;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.VenueRepository;
import br.com.ticketflow.catalog.service.EventAvailabilityService;
import br.com.ticketflow.catalog.service.EventSearchTextBuilder;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.org.access.AuditService;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgNotifications;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.events.EventStats.Stats;
import br.com.ticketflow.org.web.OrgDtos.EventInput;
import br.com.ticketflow.org.web.OrgDtos.OrgEventDto;
import br.com.ticketflow.org.web.OrgDtos.OrgEventSummaryDto;
import br.com.ticketflow.org.web.OrgDtos.OrgEventsResponse;
import br.com.ticketflow.org.web.OrgDtos.SlugAvailability;
import br.com.ticketflow.org.web.OrgDtos.VenueInput;
import br.com.ticketflow.organization.OrganizationRepository;
import br.com.ticketflow.sales.service.ReservationExpiryService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Eventos da organização: rascunho, edição, publicação, despublicação, cancelamento e exclusão.
 *
 * <p>Todas as operações carregam o evento por {@code (id, organization_id da sessão)}: o evento de outra organização
 * responde {@code 404} (não revela que existe). As mudanças de estado travam a linha do evento.
 */
@Service
public class OrgEventService {

    static final int MIN_DESCRIPTION = 80;
    /** Rotas literais do catálogo que um slug não pode ocupar ({@code /api/events/{slug}}). */
    private static final Set<String> RESERVED_SLUGS = Set.of("featured", "upcoming", "suggest", "novo", "new", "admin", "org");
    private static final Duration DEFAULT_DURATION = Duration.ofHours(4);

    private final EventRepository events;
    private final CategoryRepository categories;
    private final VenueRepository venues;
    private final OrganizationRepository organizations;
    private final EventAvailabilityService availability;
    private final EventStats stats;
    private final OrgEventMapper mapper;
    private final OrgSeatMapService seatMaps;
    private final EventCancellation cancellation;
    private final ReservationExpiryService expiry;
    private final AuditService audit;
    private final OrgNotifications notifications;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public OrgEventService(EventRepository events, CategoryRepository categories, VenueRepository venues, OrganizationRepository organizations,
                           EventAvailabilityService availability, EventStats stats, OrgEventMapper mapper, OrgSeatMapService seatMaps,
                           EventCancellation cancellation, ReservationExpiryService expiry, AuditService audit, OrgNotifications notifications,
                           JdbcTemplate jdbc, Clock clock) {
        this.events = events;
        this.categories = categories;
        this.venues = venues;
        this.organizations = organizations;
        this.availability = availability;
        this.stats = stats;
        this.mapper = mapper;
        this.seatMaps = seatMaps;
        this.cancellation = cancellation;
        this.expiry = expiry;
        this.audit = audit;
        this.notifications = notifications;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // ── Consultas ──────────────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public OrgEventsResponse list(OrgContext ctx, String status, String q) {
        ctx.require(OrgPermission.VIEW_EVENTS);
        Instant now = clock.instant();
        List<Event> all = events.findAllOwned(ctx.organizationId());
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String s : List.of("all", "draft", "published", "ended", "cancelled")) {
            counts.put(s, 0L);
        }
        String term = q == null ? "" : Texts.normalize(q);
        List<Event> filtered = new ArrayList<>();
        for (Event e : all) {
            String st = OrgEventMapper.status(e, now);
            counts.merge("all", 1L, Long::sum);
            counts.merge(st, 1L, Long::sum);
            if ((status == null || status.isBlank() || status.equals(st)) && (term.isEmpty() || Texts.normalize(e.getTitle()).contains(term))) {
                filtered.add(e);
            }
        }
        Map<UUID, Stats> s = stats.of(filtered.stream().map(Event::getId).toList());
        List<OrgEventSummaryDto> items = filtered.stream().map(e -> mapper.toSummary(e, stats.get(s, e.getId()), now)).toList();
        return new OrgEventsResponse(items, items.size(), counts);
    }

    @Transactional(readOnly = true)
    public OrgEventDto get(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.VIEW_EVENTS);
        Event e = owned(ctx, id);
        return mapper.toDto(e, stats.of(e.getId()), clock.instant());
    }

    /** O slug é global (o catálogo é público): checa todas as organizações. {@code exceptId} só vale se for da sessão. */
    @Transactional(readOnly = true)
    public SlugAvailability slugAvailable(OrgContext ctx, String raw, UUID exceptId) {
        ctx.require(OrgPermission.VIEW_EVENTS);
        String slug = clampSlug(Texts.slugify(raw == null ? "" : raw));
        UUID except = exceptId != null && events.findOwned(exceptId, ctx.organizationId()).isPresent() ? exceptId : null;
        boolean available = !slug.isEmpty() && !RESERVED_SLUGS.contains(slug) && !taken(slug, except);
        return new SlugAvailability(slug, available);
    }

    // ── Criação e edição ───────────────────────────────────────────────────────────────────────────────

    @Transactional
    public OrgEventDto create(OrgContext ctx, EventInput in) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        String title = in.title() == null ? "" : in.title().trim();
        if (in.title() != null && title.length() < 3) {
            throw validation("O nome precisa ter ao menos 3 caracteres");
        }
        Instant startsAt = in.startsAt() != null ? in.startsAt().toInstant() : now.plus(Duration.ofDays(30));
        Instant endsAt = in.endsAt() != null ? in.endsAt().toInstant() : startsAt.plus(DEFAULT_DURATION);
        checkPeriod(startsAt, endsAt);

        String base = clampSlug(Texts.slugify(in.slug() != null && !in.slug().isBlank() ? in.slug() : title));
        String slug = uniqueSlug(base.isEmpty() || RESERVED_SLUGS.contains(base) ? "evento-" + UUID.randomUUID().toString().substring(0, 6) : base);

        Event e = Event.create(organizations.getReferenceById(ctx.organizationId()), category(in.category()), null, slug, title, startsAt, now);
        e.setEndsAt(endsAt);
        e.setDescription(in.description() == null ? "" : in.description().trim());
        e.setAgeRating(in.ageRating() == null ? (short) 0 : in.ageRating().shortValue());
        e.setCoverName(blankToNull(in.coverName()));
        e.setServiceFeePct(new BigDecimal("10.0"));
        applyPolicy(e, in.cancellationPolicy() == null ? "full-7d" : in.cancellationPolicy());
        if (in.venue() != null) {
            applyVenue(e, in.venue(), now);
        }
        e.setSearchText(EventSearchTextBuilder.build(e));
        events.saveAndFlush(e);
        if (in.seatMap() != null) {
            seatMaps.apply(e, in.seatMap(), now);
        }
        audit.record(ctx, "event.created", "event", e.getId(), Map.of("title", title, "slug", slug));
        return mapper.toDto(e, stats.of(e.getId()), now);
    }

    @Transactional
    public OrgEventDto update(OrgContext ctx, UUID id, EventInput in) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        Event e = locked(ctx, id);
        assertEditable(e, now);
        List<String> changed = new ArrayList<>();

        if (in.title() != null) {
            String title = in.title().trim();
            if (title.length() < 3) {
                throw validation("O nome precisa ter ao menos 3 caracteres");
            }
            e.setTitle(title);
            changed.add("title");
        }
        if (in.slug() != null) {
            String slug = clampSlug(Texts.slugify(in.slug()));
            if (slug.isEmpty() || RESERVED_SLUGS.contains(slug)) {
                throw validation("Link inválido");
            }
            if (!slug.equals(e.getSlug())) {
                if (taken(slug, e.getId())) {
                    throw ApiException.conflict("SLUG_TAKEN", "Este link já está em uso");
                }
                if (hasOrders(e.getId())) {
                    throw ApiException.conflict("INVALID_STATE", "O link de um evento com vendas não pode mudar");
                }
                e.setSlug(slug);
                changed.add("slug");
            }
        }
        if (in.category() != null) {
            e.setCategory(category(in.category()));
            changed.add("category");
        }
        if (in.ageRating() != null) {
            e.setAgeRating(in.ageRating().shortValue());
            changed.add("ageRating");
        }
        if (in.description() != null) {
            e.setDescription(in.description().trim());
            changed.add("description");
        }
        if (in.startsAt() != null || in.endsAt() != null) {
            Instant startsAt = in.startsAt() != null ? in.startsAt().toInstant() : e.getStartsAt();
            Instant endsAt = in.endsAt() != null ? in.endsAt().toInstant()
                    : (e.getEndsAt() != null && e.getEndsAt().isAfter(startsAt) ? e.getEndsAt() : startsAt.plus(DEFAULT_DURATION));
            checkPeriod(startsAt, endsAt);
            e.setStartsAt(startsAt);
            e.setEndsAt(endsAt);
            changed.add("dates");
        }
        if (in.venue() != null) {
            applyVenue(e, in.venue(), now);
            changed.add("venue");
        }
        if (in.coverName() != null) {
            e.setCoverName(blankToNull(in.coverName()));
            changed.add("coverName");
        }
        if (in.cancellationPolicy() != null) {
            applyPolicy(e, in.cancellationPolicy());
            changed.add("cancellationPolicy");
        }
        if (e.getStatus() == EventStatus.PUBLISHED) {
            // Um evento publicado precisa continuar publicável (o catálogo exibe estes campos).
            List<String> errors = fieldErrors(e, now, false);
            if (!errors.isEmpty()) {
                throw validation(String.join(". ", errors)).with("errors", errors);
            }
        }
        e.setSearchText(EventSearchTextBuilder.build(e));
        e.setUpdatedAt(now);
        events.saveAndFlush(e);
        if (in.seatMap() != null) {
            seatMaps.apply(e, in.seatMap(), now);
            changed.add("seatMap");
        }
        audit.record(ctx, "event.updated", "event", e.getId(), Map.of("fields", changed));
        return mapper.toDto(e, stats.of(e.getId()), now);
    }

    @Transactional
    public OrgEventDto saveSeatMap(OrgContext ctx, UUID id, br.com.ticketflow.org.web.OrgDtos.SeatMapDto map) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        Event e = locked(ctx, id);
        assertEditable(e, now);
        seatMaps.apply(e, map, now);
        e.setUpdatedAt(now);
        events.saveAndFlush(e);
        audit.record(ctx, "event.seat-map.saved", "event", e.getId(), Map.of("hasSeatMap", map != null));
        return mapper.toDto(e, stats.of(e.getId()), now);
    }

    // ── Ciclo de vida ──────────────────────────────────────────────────────────────────────────────────

    @Transactional
    public OrgEventDto publish(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        Event e = locked(ctx, id);
        if (e.getStatus() != EventStatus.DRAFT) {
            throw ApiException.conflict("INVALID_STATE", "Só rascunhos podem ser publicados");
        }
        List<String> errors = publishErrors(e, now);
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "PUBLISH_BLOCKED", "O evento ainda não pode ser publicado")
                    .with("errors", errors);
        }
        e.getTicketTypes().forEach(t -> t.getLots().forEach(l -> {
            l.setStatus(TicketLot.Status.PUBLISHED);
            l.setUpdatedAt(now);
        }));
        availability.recalculate(e, now);
        e.setSearchText(EventSearchTextBuilder.build(e));
        e.publish(now); // visível no catálogo público a partir deste commit
        events.saveAndFlush(e);
        notifications.add(ctx.organizationId(), "Evento publicado", "“" + e.getTitle() + "” já aparece no catálogo.", "/org/eventos/" + e.getId());
        audit.record(ctx, "event.published", "event", e.getId(), Map.of("slug", e.getSlug()));
        return mapper.toDto(e, stats.of(e.getId()), now);
    }

    /**
     * Volta a rascunho (sai do catálogo) — só sem vendas. Os lotes saem de venda ANTES da checagem: o UPDATE dos lotes
     * espera reservas em andamento confirmarem, e nenhuma nova consegue segurar estoque depois dele.
     */
    @Transactional
    public OrgEventDto unpublish(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        Event e = locked(ctx, id);
        if (!"published".equals(OrgEventMapper.status(e, now))) {
            throw ApiException.conflict("INVALID_STATE", "O evento não está publicado");
        }
        stopSales(e.getId());
        expiry.expireDueForEvent(e.getId());
        if (hasOrders(e.getId()) || hasActiveReservations(e.getId(), now)) {
            throw ApiException.conflict("INVALID_STATE", "Eventos com vendas não podem voltar para rascunho — cancele o evento");
        }
        e.setStatus(EventStatus.DRAFT);
        e.setUpdatedAt(now);
        events.saveAndFlush(e);
        audit.record(ctx, "event.unpublished", "event", e.getId(), Map.of());
        return mapper.toDto(e, stats.of(e.getId()), now);
    }

    /** Cancela o evento: sai do catálogo, libera reservas, expira pendentes e reembolsa todos os pedidos pagos. */
    @Transactional
    public OrgEventDto cancel(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Instant now = clock.instant();
        Event e = locked(ctx, id);
        String st = OrgEventMapper.status(e, now);
        if ("cancelled".equals(st) || "ended".equals(st)) {
            throw ApiException.conflict("INVALID_STATE", "O evento já foi encerrado");
        }
        stopSales(e.getId());
        EventCancellation.Result r = cancellation.cancelSales(e);
        e.setStatus(EventStatus.CANCELLED);
        e.setCancelledAt(now);
        e.setUpdatedAt(now);
        events.saveAndFlush(e);
        notifications.add(ctx.organizationId(), "Evento cancelado",
                "“" + e.getTitle() + "” foi cancelado: " + r.refunded() + " pedido(s) reembolsado(s).", "/org/eventos/" + e.getId());
        audit.record(ctx, "event.cancelled", "event", e.getId(),
                Map.of("refundedOrders", r.refunded(), "expiredOrders", r.expired(), "releasedReservations", r.released()));
        return mapper.toDto(e, stats.of(e.getId()), now);
    }

    /** Exclui um rascunho que nunca teve reserva nem pedido. */
    @Transactional
    public void delete(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.MANAGE_EVENTS);
        Event e = locked(ctx, id);
        if (e.getStatus() != EventStatus.DRAFT || hasOrders(e.getId()) || hasAnyReservation(e.getId())) {
            throw ApiException.conflict("INVALID_STATE", "Só rascunhos sem vendas podem ser excluídos");
        }
        Venue venue = e.getVenue();
        String title = e.getTitle();
        events.delete(e);
        events.flush();
        if (venue != null && events.countByVenue(venue.getId()) == 0) {
            venues.delete(venue);
        }
        audit.record(ctx, "event.deleted", "event", id, Map.of("title", title));
    }

    // ── Regras ─────────────────────────────────────────────────────────────────────────────────────────

    /** Todos os motivos que impedem a publicação (o frontend mostra a lista). */
    List<String> publishErrors(Event e, Instant now) {
        List<String> errors = fieldErrors(e, now, true);
        List<TicketLot> lots = e.getTicketTypes().stream().flatMap(t -> t.getLots().stream()).toList();
        if (lots.isEmpty()) {
            errors.add("Crie ao menos um lote de ingressos");
        } else if (lots.stream().noneMatch(l -> l.getSalesEnd().isAfter(now))) {
            errors.add("Todos os lotes já encerraram as vendas");
        }
        if (e.isHasSeatMap()) {
            Map<String, Integer> seatsBySector = seatMaps.sellableSeatsBySector(e.getId());
            int total = seatsBySector.values().stream().mapToInt(Integer::intValue).sum();
            if (total == 0) {
                errors.add("O mapa de assentos está vazio");
            }
            for (TicketType t : e.getTicketTypes()) {
                if (t.getKind() != TicketKind.SEATED) {
                    continue;
                }
                int seats = seatsBySector.getOrDefault(t.getSectorCode(), 0);
                int lotTotal = OrgTicketTypes.seatedLotTotal(t);
                if (seats > 0 && t.getLots().isEmpty()) {
                    errors.add("Crie um lote para o setor " + t.getName());
                } else if (lotTotal > seats) {
                    errors.add("Os lotes de " + t.getName() + " somam " + lotTotal + " ingressos, mas o setor tem " + seats + " assento(s) à venda");
                }
            }
        }
        return errors;
    }

    private List<String> fieldErrors(Event e, Instant now, boolean publishing) {
        List<String> errors = new ArrayList<>();
        if (e.getTitle() == null || e.getTitle().trim().length() < 3) {
            errors.add("Informe o nome do evento");
        }
        if (e.getDescription() == null || e.getDescription().trim().length() < MIN_DESCRIPTION) {
            errors.add("A descrição precisa ter ao menos " + MIN_DESCRIPTION + " caracteres");
        }
        Venue v = e.getVenue();
        if (v == null || v.getName() == null || v.getName().isBlank()) {
            errors.add("Informe o local do evento");
        } else if (v.getCity() == null || v.getCity().isBlank() || v.getState() == null || v.getState().trim().length() != 2) {
            errors.add("Informe a cidade e a UF do local");
        }
        if (e.getEndsAt() != null && !e.getEndsAt().isAfter(e.getStartsAt())) {
            errors.add("O término precisa ser depois do início");
        }
        if (publishing && !e.getStartsAt().isAfter(now)) {
            errors.add("A data de início já passou");
        }
        return errors;
    }

    private void assertEditable(Event e, Instant now) {
        String st = OrgEventMapper.status(e, now);
        if ("cancelled".equals(st) || "ended".equals(st)) {
            throw ApiException.conflict("INVALID_STATE", "Eventos encerrados ou cancelados não podem ser editados");
        }
    }

    private void applyVenue(Event e, VenueInput in, Instant now) {
        Venue current = e.getVenue();
        String name = pick(in.name(), current == null ? null : current.getName());
        String city = pick(in.city(), current == null ? null : current.getCity());
        String state = pick(in.state(), current == null ? null : current.getState());
        if (state != null) {
            state = state.trim().toUpperCase();
            if (!state.isEmpty() && !state.matches("[A-Z]{2}")) {
                throw validation("Use a sigla da UF (ex.: SP)");
            }
        }
        Venue v = current;
        // Locais compartilhados entre eventos (ex.: dados de demonstração) não são editados no lugar: cópia própria.
        if (v == null || events.countByVenue(v.getId()) > 1) {
            boolean sameAsShared = v != null && same(v.getName(), name) && same(v.getCity(), city);
            Venue copy = Venue.create(name == null ? "" : name.trim(), blankToNull(city), blankToNull(state), now);
            if (sameAsShared) {
                copy.setLatitude(v.getLatitude());
                copy.setLongitude(v.getLongitude());
            }
            copy.setAddress(v == null ? null : v.getAddress());
            copy.setDistrict(v == null ? null : v.getDistrict());
            copy.setNotes(v == null ? null : v.getNotes());
            v = venues.save(copy);
            e.setVenue(v);
        } else if (!same(v.getName(), name) || !same(v.getCity(), city)) {
            // Outro lugar: as coordenadas antigas não valem mais (distância passa a ser "sem coordenadas").
            v.setLatitude(null);
            v.setLongitude(null);
        }
        v.setName(name == null ? "" : name.trim());
        v.setCity(blankToNull(city));
        v.setState(blankToNull(state));
        if (in.address() != null) {
            v.setAddress(blankToNull(in.address()));
        }
        if (in.district() != null) {
            v.setDistrict(blankToNull(in.district()));
        }
        if (in.notes() != null) {
            v.setNotes(blankToNull(in.notes()));
        }
    }

    private void applyPolicy(Event e, String policy) {
        if (!"full-7d".equals(policy) && !"none".equals(policy)) {
            throw validation("Política de cancelamento inválida");
        }
        if (policy.equals(e.getCancellationPolicy()) && !e.getPolicyItems().isEmpty()) {
            return;
        }
        e.setCancellationPolicy(policy);
        if (!e.getPolicyItems().isEmpty()) {
            e.getPolicyItems().clear();
            events.flush(); // apaga os itens antigos antes de inserir os novos (UNIQUE(event_id, position))
        }
        if ("full-7d".equals(policy)) {
            e.addPolicyItem(EventPolicyItem.of(0, "Reembolso integral até 7 dias após a compra",
                    "Você pode cancelar a compra em até 7 dias e receber o valor integral, desde que faltem mais de 48 horas para o evento."));
        } else {
            e.addPolicyItem(EventPolicyItem.of(0, "Sem reembolso por desistência",
                    "Compras para este evento não podem ser canceladas pelo comprador."));
        }
        e.addPolicyItem(EventPolicyItem.of(1, "Cancelamento do evento pelo organizador",
                "Se o evento for cancelado, o valor dos ingressos e a taxa de serviço são devolvidos integralmente, pelo mesmo meio de pagamento."));
    }

    private Category category(String slug) {
        String s = slug == null || slug.isBlank() ? "musica" : slug.trim();
        return categories.findBySlug(s).orElseThrow(() -> validation("Categoria inválida"));
    }

    private static void checkPeriod(Instant startsAt, Instant endsAt) {
        if (!endsAt.isAfter(startsAt)) {
            throw validation("O término precisa ser depois do início");
        }
    }

    /** Tira os lotes de venda (UPDATE atômico: espera reservas em andamento e impede novas). */
    private void stopSales(UUID eventId) {
        jdbc.update("""
                update ticket_lots set status = 'DRAFT', version = version + 1, updated_at = now()
                where ticket_type_id in (select id from ticket_types where event_id = ?) and status = 'PUBLISHED'
                """, eventId);
    }

    private boolean hasOrders(UUID eventId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from orders where event_id = ?)", Boolean.class, eventId));
    }

    private boolean hasAnyReservation(UUID eventId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from reservations where event_id = ?)", Boolean.class, eventId));
    }

    private boolean hasActiveReservations(UUID eventId, Instant now) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from reservations where event_id = ? and status = 'ACTIVE' and expires_at > ?)",
                Boolean.class, eventId, java.sql.Timestamp.from(now)));
    }

    private boolean taken(String slug, UUID exceptId) {
        return exceptId == null ? events.existsBySlug(slug) : events.existsBySlugAndIdNot(slug, exceptId);
    }

    private String uniqueSlug(String base) {
        String slug = base;
        for (int i = 2; taken(slug, null); i++) {
            String suffix = "-" + i;
            slug = base.substring(0, Math.min(base.length(), 120 - suffix.length())) + suffix;
        }
        return slug;
    }

    private Event owned(OrgContext ctx, UUID id) {
        return events.findOwned(id, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
    }

    /** Trava a linha do evento (somente da organização da sessão) e devolve a entidade gerenciada. */
    Event locked(OrgContext ctx, UUID id) {
        return events.lockOwned(id, ctx.organizationId()).orElseThrow(() -> ApiException.notFound("Evento não encontrado"));
    }

    private static String clampSlug(String slug) {
        return slug.length() <= 120 ? slug : slug.substring(0, 120).replaceAll("-+$", "");
    }

    private static String pick(String incoming, String current) {
        return incoming != null ? incoming : current;
    }

    private static boolean same(String a, String b) {
        return Texts.normalize(a).equals(Texts.normalize(b));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    static ApiException validation(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", message);
    }
}
