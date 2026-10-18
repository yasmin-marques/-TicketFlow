package br.com.ticketflow.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "waitlist_entries")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WaitlistEntry {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "ticket_type_id", nullable = false)
    private UUID ticketTypeId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "notified_at")
    private Instant notifiedAt;

    public static WaitlistEntry of(UUID userId, UUID ticketTypeId, Instant now) {
        WaitlistEntry w = new WaitlistEntry();
        w.id = UUID.randomUUID();
        w.userId = userId;
        w.ticketTypeId = ticketTypeId;
        w.createdAt = now;
        return w;
    }
}
