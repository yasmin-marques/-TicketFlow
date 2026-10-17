package br.com.ticketflow.organization;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Vínculo de um usuário com uma organização (usado para autorização por organização nas próximas partes). */
@Entity
@Table(name = "organization_members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrganizationMember {

    public enum MemberRole {
        OWNER,
        MANAGER,
        CHECKIN
    }

    @Embeddable
    @Getter
    @NoArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        @Column(name = "organization_id")
        private UUID organizationId;

        @Column(name = "user_id")
        private UUID userId;

        public Key(UUID organizationId, UUID userId) {
            this.organizationId = organizationId;
            this.userId = userId;
        }
    }

    @EmbeddedId
    private Key id;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_role", nullable = false, length = 20)
    private MemberRole memberRole;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public static OrganizationMember of(UUID organizationId, UUID userId, MemberRole role, Instant now) {
        OrganizationMember m = new OrganizationMember();
        m.id = new Key(organizationId, userId);
        m.memberRole = role;
        m.createdAt = now;
        return m;
    }
}
