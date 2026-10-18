package br.com.ticketflow.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "event_seat_maps")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventSeatMap {

    @Id
    @Column(name = "event_id")
    private UUID eventId;

    /** Todas as filas, em ordem ("ABCDEFGH"). */
    @Column(nullable = false, length = 40)
    private String rows;

    @Column(name = "seats_per_row", nullable = false)
    private short seatsPerRow;

    @Column(name = "aisle_after", nullable = false)
    private short aisleAfter;

    public static EventSeatMap of(UUID eventId, String rows, int seatsPerRow, int aisleAfter) {
        EventSeatMap m = new EventSeatMap();
        m.eventId = eventId;
        m.rows = rows;
        m.seatsPerRow = (short) seatsPerRow;
        m.aisleAfter = (short) aisleAfter;
        return m;
    }
}
