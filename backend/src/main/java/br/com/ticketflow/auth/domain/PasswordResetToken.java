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

/** Token de redefinição de senha: aleatório, expira e é de uso único. Só o hash é persistido. */
@Entity
@Table(name = "password_reset_tokens")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PasswordResetToken {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "token_hash", nullable = false, length = 64, columnDefinition = "char(64)")
    @JdbcTypeCode(SqlTypes.CHAR)
    private String tokenHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    public static PasswordResetToken create(UUID userId, String hash, Instant now, Instant expiresAt) {
        PasswordResetToken t = new PasswordResetToken();
        t.id = UUID.randomUUID();
        t.userId = userId;
        t.tokenHash = hash;
        t.createdAt = now;
        t.expiresAt = expiresAt;
        return t;
    }

    public boolean isUsable(Instant now) {
        return usedAt == null && expiresAt.isAfter(now);
    }
}
