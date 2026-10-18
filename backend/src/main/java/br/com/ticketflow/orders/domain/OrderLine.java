package br.com.ticketflow.orders.domain;

import br.com.ticketflow.catalog.domain.TicketType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "order_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderLine {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private Order order;

    @Column(nullable = false)
    private short position;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_type_id")
    private TicketType ticketType;

    @Column(nullable = false, length = 200)
    private String description;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price_cents", nullable = false)
    private long unitPriceCents;

    /** Códigos dos assentos separados por vírgula (vazio para ingressos sem assento). */
    @Column(name = "seat_codes", nullable = false, length = 400)
    private String seatCodes = "";

    public static OrderLine of(int position, TicketType type, String description, int quantity, long unitPriceCents, List<String> seats) {
        OrderLine l = new OrderLine();
        l.id = UUID.randomUUID();
        l.position = (short) position;
        l.ticketType = type;
        l.description = description;
        l.quantity = quantity;
        l.unitPriceCents = unitPriceCents;
        l.seatCodes = String.join(",", seats);
        return l;
    }

    public List<String> seats() {
        return seatCodes.isBlank() ? List.of() : List.of(seatCodes.split(","));
    }
}
