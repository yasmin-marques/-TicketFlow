package br.com.ticketflow.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Refresh token revogável. Só o hash SHA-256 do valor é persistido. */
@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RefreshToken {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "family_id", nullable = false)
    private UUID familyId;

    @Column(name = "token_hash", nullable = false, length = 64, columnDefinition = "char(64)")
    @JdbcTypeCode(SqlTypes.CHAR)
    private String tokenHash;

    @Column(name = "issued_at", nullable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "replaced_by")
    private UUID replacedBy;

    @Column(name = "user_agent", length = 200)
    private String userAgent;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    public static RefreshToken issue(
            UUID userId, UUID familyId, String hash, Instant now, Instant expiresAt, String userAgent, String ip) {
        RefreshToken t = new RefreshToken();
        t.id = UUID.randomUUID();
        t.userId = userId;
        t.familyId = familyId;
        t.tokenHash = hash;
        t.issuedAt = now;
        t.expiresAt = expiresAt;
        t.userAgent = userAgent == null ? null : userAgent.substring(0, Math.min(200, userAgent.length()));
        t.ipAddress = ip;
        return t;
    }

    public boolean isRevoked() {
        return revokedAt != null;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }
}
