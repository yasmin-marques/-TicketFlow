package br.com.ticketflow.catalog.domain;

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
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Tipo de ingresso do evento (Pista, VIP, Meia-entrada…); cada tipo tem um ou mais lotes. */
@Entity
@Table(name = "ticket_types")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TicketType {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @Column(nullable = false, length = 40)
    private String code;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(length = 200)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private TicketKind kind;

    @Column(name = "sector_code", length = 40)
    private String sectorCode;

    @Column(nullable = false)
    private short position;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "ticketType", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<TicketLot> lots = new ArrayList<>();

    public static TicketType of(String code, String name, String description, TicketKind kind, String sectorCode, int position, Instant now) {
        TicketType t = new TicketType();
        t.id = UUID.randomUUID();
        t.code = code;
        t.name = name;
        t.description = description;
        t.kind = kind;
        t.sectorCode = sectorCode;
        t.position = (short) position;
        t.createdAt = now;
        return t;
    }

    public void addLot(TicketLot lot) {
        lot.setTicketType(this);
        lots.add(lot);
    }
}
