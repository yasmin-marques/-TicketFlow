package br.com.ticketflow.organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Produtora/organização dona de eventos. */
@Entity
@Table(name = "organizations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Organization {

    @Id
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    @Column(length = 18)
    private String document;

    @Column(length = 254)
    private String email;

    @Column(length = 20)
    private String phone;

    @Column(name = "payout_bank", length = 60)
    private String payoutBank;

    @Column(name = "payout_agency", length = 10)
    private String payoutAgency;

    @Column(name = "payout_account", length = 20)
    private String payoutAccount;

    @Column(name = "payout_holder", length = 120)
    private String payoutHolder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private Long version;

    public static Organization create(String name, String slug, Instant now) {
        Organization o = new Organization();
        o.id = UUID.randomUUID();
        o.name = name;
        o.slug = slug;
        o.createdAt = now;
        o.updatedAt = now;
        return o;
    }
}
