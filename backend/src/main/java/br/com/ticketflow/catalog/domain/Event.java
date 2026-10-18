package br.com.ticketflow.catalog.domain;

import br.com.ticketflow.organization.Organization;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Evento do catálogo. Os campos denormalizados (preço mínimo, esgotado, últimos ingressos) vêm dos lotes. */
@Entity
@Table(name = "events")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Event {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "category_id")
    private Category category;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "venue_id")
    private Venue venue;

    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 80)
    private String subtitle;

    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "age_rating")
    private Short ageRating;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EventStatus status = EventStatus.DRAFT;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(nullable = false)
    private boolean featured;

    @Column(name = "featured_rank")
    private Short featuredRank;

    @Column(name = "has_seat_map", nullable = false)
    private boolean hasSeatMap;

    @Column(name = "service_fee_pct", nullable = false, precision = 4, scale = 1)
    private BigDecimal serviceFeePct = new BigDecimal("10.0");

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @Column(name = "min_price_cents")
    private Long minPriceCents;

    @Column(name = "sold_out", nullable = false)
    private boolean soldOut;

    @Column(name = "last_tickets", nullable = false)
    private boolean lastTickets;

    @Column(name = "search_text", nullable = false, columnDefinition = "text")
    private String searchText = "";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<EventScheduleItem> scheduleItems = new ArrayList<>();

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<EventPolicyItem> policyItems = new ArrayList<>();

    @OneToMany(mappedBy = "event", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<TicketType> ticketTypes = new ArrayList<>();

    public static Event create(Organization org, Category category, Venue venue, String slug, String title, Instant startsAt, Instant now) {
        Event e = new Event();
        e.id = UUID.randomUUID();
        e.organization = org;
        e.category = category;
        e.venue = venue;
        e.slug = slug;
        e.title = title;
        e.startsAt = startsAt;
        e.createdAt = now;
        e.updatedAt = now;
        return e;
    }

    /** Publica o evento (visível no catálogo). */
    public void publish(Instant now) {
        this.status = EventStatus.PUBLISHED;
        this.publishedAt = now;
        this.updatedAt = now;
    }

    public void addScheduleItem(EventScheduleItem item) {
        item.setEvent(this);
        scheduleItems.add(item);
    }

    public void addPolicyItem(EventPolicyItem item) {
        item.setEvent(this);
        policyItems.add(item);
    }

    public void addTicketType(TicketType type) {
        type.setEvent(this);
        ticketTypes.add(type);
    }
}
