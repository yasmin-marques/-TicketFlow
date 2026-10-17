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

/** Item da política de cancelamento (título + texto). */
@Entity
@Table(name = "event_policy_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class EventPolicyItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @Column(nullable = false)
    private short position;

    @Column(nullable = false, length = 160)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    public static EventPolicyItem of(int position, String title, String body) {
        EventPolicyItem i = new EventPolicyItem();
        i.id = UUID.randomUUID();
        i.position = (short) position;
        i.title = title;
        i.body = body;
        return i;
    }
}
