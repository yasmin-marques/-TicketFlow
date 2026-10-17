package br.com.ticketflow.auth.service;

import br.com.ticketflow.auth.domain.RefreshToken;
import br.com.ticketflow.auth.repository.RefreshTokenRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Refresh tokens opacos, revogáveis e com rotação a cada uso.
 *
 * <ul>
 *   <li>Só o hash SHA-256 é guardado — o valor em claro existe apenas na resposta ao cliente.</li>
 *   <li>Cada renovação revoga o token usado e emite outro na mesma "família".</li>
 *   <li>Reutilizar um token já rotacionado (possível roubo) revoga a família inteira.</li>
 *   <li>Uma janela curta de tolerância evita derrubar a sessão quando duas abas renovam ao mesmo tempo.</li>
 * </ul>
 */
@Service
public class RefreshTokenService {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenService.class);
    private static final Duration REUSE_GRACE = Duration.ofSeconds(10);

    public record Issued(String rawToken, UUID userId, Instant expiresAt) {}

    private final RefreshTokenRepository repository;
    private final AppProperties.Refresh config;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository repository, AppProperties props, Clock clock) {
        this.repository = repository;
        this.config = props.security().refresh();
        this.clock = clock;
    }

    /** Inicia uma nova família (login/cadastro). */
    @Transactional
    public Issued issueNewFamily(UUID userId, ClientInfo client) {
        return persist(userId, UUID.randomUUID(), client).issued();
    }

    /** Valida e rotaciona. Lança 401 {@code INVALID_REFRESH_TOKEN} se inválido, expirado ou reutilizado. */
    @Transactional(noRollbackFor = ApiException.class)
    public Issued rotate(String rawToken, ClientInfo client) {
        Instant now = clock.instant();
        RefreshToken current = repository
                .findByTokenHashForUpdate(Tokens.sha256(rawToken))
                .orElseThrow(RefreshTokenService::invalid);

        if (current.isRevoked()) {
            boolean justRotated = current.getReplacedBy() != null
                    && Duration.between(current.getRevokedAt(), now).compareTo(REUSE_GRACE) <= 0;
            if (!justRotated) {
                int revoked = repository.revokeFamily(current.getFamilyId(), now);
                log.warn("Reutilização de refresh token detectada: família {} revogada ({} tokens)", current.getFamilyId(), revoked);
            }
            throw invalid();
        }
        if (current.isExpired(now)) {
            throw invalid();
        }

        Persisted next = persist(current.getUserId(), current.getFamilyId(), client);
        current.setRevokedAt(now);
        current.setReplacedBy(next.entity().getId());
        return next.issued();
    }

    /** Revoga um token (logout). Silencioso se desconhecido. */
    @Transactional
    public void revoke(String rawToken) {
        repository.findByTokenHashForUpdate(Tokens.sha256(rawToken)).ifPresent(t -> {
            repository.revokeFamily(t.getFamilyId(), clock.instant());
        });
    }

    @Transactional
    public void revokeAll(UUID userId) {
        repository.revokeAllForUser(userId, clock.instant());
    }

    /** Remove tokens expirados há mais de 1 dia. */
    @Transactional
    public int purgeExpired() {
        return repository.deleteExpiredBefore(clock.instant().minus(Duration.ofDays(1)));
    }

    public Duration ttl() {
        return config.ttl();
    }

    private record Persisted(RefreshToken entity, Issued issued) {}

    private Persisted persist(UUID userId, UUID familyId, ClientInfo client) {
        Instant now = clock.instant();
        String raw = Tokens.random();
        RefreshToken entity = RefreshToken.issue(
                userId, familyId, Tokens.sha256(raw), now, now.plus(config.ttl()), client.userAgent(), client.ip());
        repository.save(entity);
        return new Persisted(entity, new Issued(raw, userId, entity.getExpiresAt()));
    }

    private static ApiException invalid() {
        return ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Sessão expirada");
    }
}
