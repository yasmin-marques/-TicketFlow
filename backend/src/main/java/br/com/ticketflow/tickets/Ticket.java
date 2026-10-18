package br.com.ticketflow.tickets;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.orders.domain.Order;
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

@Entity
@Table(name = "tickets")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Ticket {

    public enum Status { VALID, USED, CANCELLED }

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id")
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "ticket_type_id")
    private TicketType ticketType;

    /** Posição do ingresso no pedido: o assento ("B03") ou "{tipo}#{n}". Único por pedido (emissão idempotente). */
    @Column(nullable = false, length = 60)
    private String slot;

    @Column(name = "seat_id")
    private UUID seatId;

    @Column(name = "holder_name", nullable = false, length = 120)
    private String holderName;

    /** Dono atual. Nulo enquanto a transferência aguarda o destinatário criar conta. */
    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "transfer_email", length = 254)
    private String transferEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Status status = Status.VALID;

    /** Versão do QR: incrementada a cada transferência, invalidando o QR anterior. */
    @Column(name = "qr_version", nullable = false)
    private int qrVersion = 1;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    public static Ticket issue(String code, Order order, Event event, TicketType type, String slot, UUID seatId, String holderName, UUID owner, Instant now) {
        Ticket t = new Ticket();
        t.id = UUID.randomUUID();
        t.code = code;
        t.order = order;
        t.event = event;
        t.ticketType = type;
        t.slot = slot;
        t.seatId = seatId;
        t.holderName = holderName;
        t.ownerUserId = owner;
        t.createdAt = now;
        return t;
    }
}
