package br.com.ticketflow.auth.service;

import br.com.ticketflow.auth.domain.PasswordResetToken;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.PasswordResetTokenRepository;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.shared.port.PasswordResetNotifier;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Recuperação de senha. O pedido nunca revela se o e-mail existe; o token é aleatório (256 bits), expira,
 * é de uso único e só seu hash é persistido. Redefinir a senha revoga todas as sessões do usuário.
 */
@Service
public class PasswordResetService {

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final RefreshTokenService refreshTokens;
    private final PasswordResetNotifier notifier;
    private final PasswordEncoder encoder;
    private final AppProperties.PasswordReset config;
    private final Clock clock;

    public PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository tokens,
            RefreshTokenService refreshTokens,
            PasswordResetNotifier notifier,
            PasswordEncoder encoder,
            AppProperties props,
            Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.refreshTokens = refreshTokens;
        this.notifier = notifier;
        this.encoder = encoder;
        this.config = props.security().passwordReset();
        this.clock = clock;
    }

    /**
     * Gera e "envia" o token se o e-mail existir. Devolve o token em claro apenas para uso interno (testes e a
     * flag de desenvolvimento {@code expose-token-in-response}); o controller decide se o expõe.
     */
    @Transactional
    public Optional<String> request(String email) {
        Optional<User> found = users.findByEmail(email.trim().toLowerCase(Locale.ROOT)).filter(User::isEnabled);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        User user = found.get();
        Instant now = clock.instant();
        tokens.invalidateOutstanding(user.getId(), now);

        String raw = Tokens.random();
        tokens.save(PasswordResetToken.create(user.getId(), Tokens.sha256(raw), now, now.plus(config.ttl())));
        notifier.sendPasswordReset(user.getEmail(), user.getName(), config.linkBaseUrl() + "/redefinir-senha?token=" + raw);
        return Optional.of(raw);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public void reset(String rawToken, String newPassword) {
        Instant now = clock.instant();
        PasswordResetToken token = tokens.findByTokenHashForUpdate(Tokens.sha256(rawToken))
                .filter(t -> t.isUsable(now))
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN", "Link de redefinição inválido ou expirado"));
        User user = users.findById(token.getUserId())
                .filter(User::isEnabled)
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN", "Link de redefinição inválido ou expirado"));

        token.setUsedAt(now); // uso único
        user.setPasswordHash(encoder.encode(newPassword));
        user.touch(now);
        tokens.invalidateOutstanding(user.getId(), now);
        refreshTokens.revokeAll(user.getId()); // quem tinha a senha antiga perde as sessões
    }
}
