package br.com.ticketflow.auth.repository;

import br.com.ticketflow.auth.domain.PasswordResetToken;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PasswordResetToken t where t.tokenHash = :hash")
    Optional<PasswordResetToken> findByTokenHashForUpdate(@Param("hash") String hash);

    /** Invalida tokens anteriores ainda não usados quando um novo é emitido. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update PasswordResetToken t set t.usedAt = :now where t.userId = :user and t.usedAt is null")
    int invalidateOutstanding(@Param("user") UUID userId, @Param("now") Instant now);
}
