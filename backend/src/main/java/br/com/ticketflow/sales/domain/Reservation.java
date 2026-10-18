package br.com.ticketflow.sales.domain;

import br.com.ticketflow.catalog.domain.Event;
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

@Entity
@Table(name = "reservations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Reservation {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private ReservationStatus status = ReservationStatus.ACTIVE;

    @Column(name = "service_fee_pct", nullable = false, precision = 4, scale = 1)
    private BigDecimal serviceFeePct;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Version
    private Long version;

    @OneToMany(mappedBy = "reservation", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<ReservationItem> items = new ArrayList<>();

    public static Reservation create(UUID userId, Event event, BigDecimal feePct, Instant now, Instant expiresAt) {
        Reservation r = new Reservation();
        r.id = UUID.randomUUID();
        r.userId = userId;
        r.event = event;
        r.serviceFeePct = feePct;
        // Milissegundos: o PostgreSQL guarda microssegundos; truncar na origem mantém o valor idêntico em toda leitura.
        r.createdAt = now.truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        r.expiresAt = expiresAt.truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        return r;
    }

    public void addItem(ReservationItem item) {
        item.setReservation(this);
        items.add(item);
    }

    public boolean isActive() {
        return status == ReservationStatus.ACTIVE;
    }

    public boolean isExpiredAt(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public void close(ReservationStatus newStatus, Instant now) {
        this.status = newStatus;
        this.closedAt = now;
    }

    public long subtotalCents() {
        return items.stream().mapToLong(i -> i.getQuantity() * i.getUnitPriceCents()).sum();
    }

    public long feeCents() {
        return items.stream().mapToLong(i -> i.getQuantity() * i.getUnitFeeCents()).sum();
    }

    public long totalCents() {
        return subtotalCents() + feeCents();
    }
}
