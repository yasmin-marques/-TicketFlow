package br.com.ticketflow.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Lote de ingressos: preço (em centavos), quantidade, janela de venda e vendidos. */
@Entity
@Table(name = "ticket_lots")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TicketLot {

    public enum Status {
        DRAFT,
        PUBLISHED
    }

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_type_id")
    private TicketType ticketType;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "price_cents", nullable = false)
    private long priceCents;

    @Column(name = "quantity_total", nullable = false)
    private int quantityTotal;

    @Column(name = "quantity_sold", nullable = false)
    private int quantitySold;

    /** Unidades seguradas por reservas ativas ou pedidos pendentes (ainda não vendidas). */
    @Column(name = "quantity_held", nullable = false)
    private int quantityHeld;

    @Column(name = "sales_start", nullable = false)
    private Instant salesStart;

    @Column(name = "sales_end", nullable = false)
    private Instant salesEnd;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Status status = Status.DRAFT;

    @Column(name = "per_customer_limit", nullable = false)
    private short perCustomerLimit = 6;

    @Column(name = "auto_open_next", nullable = false)
    private boolean autoOpenNext = true;

    @Column(nullable = false)
    private short position;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    public static TicketLot of(String name, long priceCents, int total, int sold, Instant start, Instant end, int position, Instant now) {
        TicketLot l = new TicketLot();
        l.id = UUID.randomUUID();
        l.name = name;
        l.priceCents = priceCents;
        l.quantityTotal = total;
        l.quantitySold = sold;
        l.salesStart = start;
        l.salesEnd = end;
        l.status = Status.PUBLISHED;
        l.position = (short) position;
        l.createdAt = now;
        l.updatedAt = now;
        return l;
    }

    public int remaining() {
        return quantityTotal - quantitySold;
    }

    /** Disponível para novas reservas: nem vendido nem segurado. */
    public int available() {
        return quantityTotal - quantitySold - quantityHeld;
    }

    public boolean isSoldOut() {
        return quantitySold >= quantityTotal;
    }

    /** À venda agora: publicado, dentro da janela e com estoque. */
    public boolean isOnSale(Instant now) {
        return status == Status.PUBLISHED && !isSoldOut() && !salesStart.isAfter(now) && salesEnd.isAfter(now);
    }
}
