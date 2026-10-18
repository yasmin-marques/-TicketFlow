package br.com.ticketflow.sales.domain;

import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "reservation_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReservationItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reservation_id")
    private Reservation reservation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_type_id")
    private TicketType ticketType;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "lot_id")
    private TicketLot lot;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price_cents", nullable = false)
    private long unitPriceCents;

    @Column(name = "unit_fee_cents", nullable = false)
    private long unitFeeCents;

    public static ReservationItem of(TicketType type, TicketLot lot, int quantity, long unitPriceCents, long unitFeeCents) {
        ReservationItem i = new ReservationItem();
        i.id = UUID.randomUUID();
        i.ticketType = type;
        i.lot = lot;
        i.quantity = quantity;
        i.unitPriceCents = unitPriceCents;
        i.unitFeeCents = unitFeeCents;
        return i;
    }
}
