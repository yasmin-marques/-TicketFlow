package br.com.ticketflow.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import br.com.ticketflow.auth.domain.RefreshToken;
import br.com.ticketflow.auth.repository.RefreshTokenRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    private static final Instant T0 = Instant.parse("2030-01-01T12:00:00Z");
    private static final ClientInfo CLIENT = new ClientInfo("junit", "127.0.0.1");

    @Mock private RefreshTokenRepository repository;

    private RefreshTokenService service;
    private final UUID userId = UUID.randomUUID();
    private final UUID family = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        var refresh = new AppProperties.Refresh(Duration.ofDays(7), false, new AppProperties.Cookie("tf_refresh", "/api/auth", false, "Lax"));
        var security = new AppProperties.Security(4, null, refresh, null, null);
        service = new RefreshTokenService(repository, new AppProperties(security, null, null, null, null, null, null, null, null, null, null), Clock.fixed(T0, ZoneOffset.UTC));
    }

    private RefreshToken stored(String raw, Instant issuedAt) {
        return RefreshToken.issue(userId, family, Tokens.sha256(raw), issuedAt, issuedAt.plus(Duration.ofDays(7)), "junit", "127.0.0.1");
    }

    @Test
    void issuesAnOpaqueTokenAndStoresOnlyItsHash() {
        RefreshTokenService.Issued issued = service.issueNewFamily(userId, CLIENT);

        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).save(saved.capture());
        assertThat(issued.rawToken()).hasSizeGreaterThanOrEqualTo(40);
        assertThat(saved.getValue().getTokenHash()).isEqualTo(Tokens.sha256(issued.rawToken())).isNotEqualTo(issued.rawToken());
        assertThat(issued.expiresAt()).isEqualTo(T0.plus(Duration.ofDays(7)));
    }

    @Test
    void rotationRevokesTheOldTokenAndKeepsTheFamily() {
        RefreshToken current = stored("antigo", T0.minusSeconds(60));
        when(repository.findByTokenHashForUpdate(Tokens.sha256("antigo"))).thenReturn(Optional.of(current));

        RefreshTokenService.Issued next = service.rotate("antigo", CLIENT);

        assertThat(current.isRevoked()).isTrue();
        assertThat(current.getReplacedBy()).isNotNull();
        assertThat(next.rawToken()).isNotEqualTo("antigo");
        ArgumentCaptor<RefreshToken> saved = ArgumentCaptor.forClass(RefreshToken.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getFamilyId()).isEqualTo(family);
    }

    @Test
    void reusingAnOldTokenOutsideTheGraceWindowRevokesTheWholeFamily() {
        RefreshToken replaced = stored("roubado", T0.minusSeconds(3600));
        replaced.setRevokedAt(T0.minusSeconds(120));
        replaced.setReplacedBy(UUID.randomUUID());
        when(repository.findByTokenHashForUpdate(Tokens.sha256("roubado"))).thenReturn(Optional.of(replaced));

        assertThatThrownBy(() -> service.rotate("roubado", CLIENT))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo("INVALID_REFRESH_TOKEN"));

        verify(repository).revokeFamily(eq(family), any(Instant.class));
        verify(repository, never()).save(any());
    }

    @Test
    void aSecondTabRefreshingRightAfterRotationDoesNotKillTheSession() {
        RefreshToken replaced = stored("aba2", T0.minusSeconds(3600));
        replaced.setRevokedAt(T0.minusSeconds(3));
        replaced.setReplacedBy(UUID.randomUUID());
        when(repository.findByTokenHashForUpdate(Tokens.sha256("aba2"))).thenReturn(Optional.of(replaced));

        assertThatThrownBy(() -> service.rotate("aba2", CLIENT)).isInstanceOf(ApiException.class);

        verify(repository, never()).revokeFamily(any(), any());
    }

    @Test
    void expiredAndUnknownTokensAreRejected() {
        RefreshToken expired = RefreshToken.issue(userId, family, Tokens.sha256("velho"), T0.minus(Duration.ofDays(10)),
                T0.minus(Duration.ofDays(3)), "junit", "127.0.0.1");
        when(repository.findByTokenHashForUpdate(Tokens.sha256("velho"))).thenReturn(Optional.of(expired));
        when(repository.findByTokenHashForUpdate(Tokens.sha256("nunca"))).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.rotate("velho", CLIENT)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.rotate("nunca", CLIENT)).isInstanceOf(ApiException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void logoutRevokesTheWholeFamilyAndIgnoresUnknownTokens() {
        RefreshToken current = stored("atual", T0.minusSeconds(60));
        when(repository.findByTokenHashForUpdate(Tokens.sha256("atual"))).thenReturn(Optional.of(current));
        when(repository.findByTokenHashForUpdate(Tokens.sha256("x"))).thenReturn(Optional.empty());

        service.revoke("atual");
        service.revoke("x");

        verify(repository).revokeFamily(eq(family), any(Instant.class));
    }
}
