package br.com.ticketflow.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "event_seat_sectors")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventSeatSector {

    @Embeddable
    @Getter
    @NoArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        @Column(name = "event_id")
        private UUID eventId;

        @Column(name = "code", length = 40)
        private String code;

        public Key(UUID eventId, String code) {
            this.eventId = eventId;
            this.code = code;
        }
    }

    @EmbeddedId
    private Key id;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "ticket_type_id", nullable = false)
    private UUID ticketTypeId;

    /** Letras das filas do setor, em ordem ("ABCD"). */
    @Column(nullable = false, length = 40)
    private String rows;

    public static EventSeatSector of(UUID eventId, String code, String name, UUID ticketTypeId, String rows) {
        EventSeatSector s = new EventSeatSector();
        s.id = new Key(eventId, code);
        s.name = name;
        s.ticketTypeId = ticketTypeId;
        s.rows = rows;
        return s;
    }

    public String getCode() {
        return id.getCode();
    }

    public UUID getEventId() {
        return id.getEventId();
    }
}
