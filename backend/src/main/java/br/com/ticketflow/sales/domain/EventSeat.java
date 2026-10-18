package br.com.ticketflow.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Assento de um evento. O estado vive aqui (PostgreSQL) e só muda com a linha travada
 * ({@code SELECT … FOR UPDATE}); um {@code RESERVED} com {@code heldUntil} vencido conta como livre.
 */
@Entity
@Table(name = "event_seats")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventSeat {

    @Id
    private UUID id;

    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @Column(nullable = false, length = 8)
    private String code;

    @Column(name = "sector_code", nullable = false, length = 40)
    private String sectorCode;

    @Column(name = "row_label", nullable = false, length = 2)
    private String rowLabel;

    @Column(name = "seat_number", nullable = false)
    private short seatNumber;

    @Column(nullable = false)
    private boolean accessible;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private SeatStatus status = SeatStatus.AVAILABLE;

    @Column(name = "reservation_id")
    private UUID reservationId;

    @Column(name = "held_until")
    private Instant heldUntil;

    /** Bloqueado pelo organizador: nunca é vendido nem reservado (aparece como indisponível). */
    @Column(nullable = false)
    private boolean blocked;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public static EventSeat create(UUID eventId, String sectorCode, String row, int number, boolean accessible, Instant now) {
        EventSeat s = new EventSeat();
        s.id = UUID.randomUUID();
        s.eventId = eventId;
        s.code = row + String.format("%02d", number);
        s.sectorCode = sectorCode;
        s.rowLabel = row;
        s.seatNumber = (short) number;
        s.accessible = accessible;
        s.updatedAt = now;
        return s;
    }

    /** Livre para ser reservado por {@code reservationId}: disponível, com hold vencido ou já dele. */
    public boolean isFreeFor(UUID reservationId, Instant now) {
        if (blocked) {
            return false;
        }
        return switch (status) {
            case AVAILABLE -> true;
            case SOLD -> false;
            case RESERVED -> (heldUntil != null && !heldUntil.isAfter(now))
                    || (reservationId != null && reservationId.equals(this.reservationId));
        };
    }

    /** Aparece como disponível para os demais compradores. */
    public boolean isEffectivelyAvailable(Instant now) {
        return isFreeFor(null, now);
    }

    public void hold(UUID reservationId, Instant until, Instant now) {
        this.status = SeatStatus.RESERVED;
        this.reservationId = reservationId;
        this.heldUntil = until;
        this.updatedAt = now;
    }

    public void release(Instant now) {
        this.status = SeatStatus.AVAILABLE;
        this.reservationId = null;
        this.heldUntil = null;
        this.updatedAt = now;
    }

    public void sell(Instant now) {
        this.status = SeatStatus.SOLD;
        this.heldUntil = null;
        this.updatedAt = now;
    }
}
