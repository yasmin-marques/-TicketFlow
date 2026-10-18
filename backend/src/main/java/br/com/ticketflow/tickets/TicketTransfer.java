package br.com.ticketflow.tickets;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Trilha de auditoria das transferências. */
@Entity
@Table(name = "ticket_transfers")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TicketTransfer {

    @Id
    private UUID id;

    @Column(name = "ticket_id", nullable = false)
    private UUID ticketId;

    @Column(name = "from_user_id", nullable = false)
    private UUID fromUserId;

    @Column(name = "to_user_id")
    private UUID toUserId;

    @Column(name = "to_email", nullable = false, length = 254)
    private String toEmail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public static TicketTransfer of(UUID ticketId, UUID from, UUID to, String toEmail, Instant now) {
        TicketTransfer t = new TicketTransfer();
        t.id = UUID.randomUUID();
        t.ticketId = ticketId;
        t.fromUserId = from;
        t.toUserId = to;
        t.toEmail = toEmail;
        t.createdAt = now;
        return t;
    }
}
