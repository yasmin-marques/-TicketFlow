package br.com.ticketflow.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "venues")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Venue {

    @Id
    private UUID id;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(length = 200)
    private String address;

    @Column(length = 120)
    private String district;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(nullable = false, length = 2, columnDefinition = "char(2)")
    @JdbcTypeCode(SqlTypes.CHAR)
    private String state;

    @Column(length = 400)
    private String notes;

    @Column(precision = 9, scale = 6)
    private BigDecimal latitude;

    @Column(precision = 9, scale = 6)
    private BigDecimal longitude;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public static Venue create(String name, String city, String state, Instant now) {
        Venue v = new Venue();
        v.id = UUID.randomUUID();
        v.name = name;
        v.city = city;
        v.state = state;
        v.createdAt = now;
        return v;
    }

    public boolean hasCoordinates() {
        return latitude != null && longitude != null;
    }
}
