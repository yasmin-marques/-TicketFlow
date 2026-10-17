package br.com.ticketflow.catalog.domain;

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
@Table(name = "event_schedule_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventScheduleItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @Column(nullable = false)
    private short position;

    @Column(name = "time_label", nullable = false, length = 5)
    private String timeLabel;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(length = 120)
    private String location;

    public static EventScheduleItem of(int position, String timeLabel, String title, String location) {
        EventScheduleItem i = new EventScheduleItem();
        i.id = UUID.randomUUID();
        i.position = (short) position;
        i.timeLabel = timeLabel;
        i.title = title;
        i.location = location;
        return i;
    }
}
