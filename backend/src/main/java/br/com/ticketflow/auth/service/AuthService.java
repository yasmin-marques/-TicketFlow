package br.com.ticketflow.auth.service;

import br.com.ticketflow.auth.domain.Role;
import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.RoleRepository;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.auth.web.dto.SessionResponse;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.shared.port.LoginAttemptLimiter;
import java.time.Clock;
import java.time.Instant;
import java.util.Locale;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cadastro, login, renovação e logout. */
@Service
public class AuthService {

    /** Resultado de uma autenticação: a sessão para o corpo da resposta e o refresh token para o cookie. */
    public record AuthResult(SessionResponse session, String refreshToken, Instant refreshExpiresAt) {}

    private final UserRepository users;
    private final RoleRepository roles;
    private final PasswordEncoder encoder;
    private final AccessTokenService accessTokens;
    private final RefreshTokenService refreshTokens;
    private final LoginAttemptLimiter limiter;
    private final AppProperties.Refresh refreshConfig;
    private final Clock clock;
    /** Hash de uma senha qualquer: igualado ao tempo de verificação quando o e-mail não existe. */
    private final String dummyHash;

    public AuthService(
            UserRepository users,
            RoleRepository roles,
            PasswordEncoder encoder,
            AccessTokenService accessTokens,
            RefreshTokenService refreshTokens,
            LoginAttemptLimiter limiter,
            AppProperties props,
            Clock clock) {
        this.users = users;
        this.roles = roles;
        this.encoder = encoder;
        this.accessTokens = accessTokens;
        this.refreshTokens = refreshTokens;
        this.limiter = limiter;
        this.refreshConfig = props.security().refresh();
        this.clock = clock;
        this.dummyHash = encoder.encode("senha-inexistente-" + System.nanoTime());
    }

    @Transactional
    public AuthResult register(String name, String email, String password, ClientInfo client) {
        String normalized = normalizeEmail(email);
        if (users.existsByEmail(normalized)) {
            throw emailTaken();
        }
        Role role = roles.findByName(RoleName.USER).orElseThrow(() -> new IllegalStateException("Papel USER ausente"));
        User user = User.create(name.trim(), normalized, encoder.encode(password), role, clock.instant());
        try {
            users.saveAndFlush(user);
        } catch (DataIntegrityViolationException e) {
            // Corrida entre dois cadastros com o mesmo e-mail: o índice único é a garantia final.
            throw emailTaken();
        }
        return start(user, client);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult login(String email, String password, ClientInfo client) {
        String normalized = normalizeEmail(email);
        String key = normalized + "|" + client.ip();
        limiter.assertNotLocked(key);

        User user = users.findByEmail(normalized).orElse(null);
        // Sempre verifica um hash: evita distinguir "e-mail inexistente" de "senha errada" pelo tempo de resposta.
        boolean matches = encoder.matches(password, user != null ? user.getPasswordHash() : dummyHash);
        if (user == null || !user.isEnabled() || !matches) {
            limiter.recordFailure(key);
            throw ApiException.unauthorized("INVALID_CREDENTIALS", "E-mail ou senha incorretos");
        }
        limiter.reset(key);
        return start(user, client);
    }

    /** Troca um refresh token válido por uma nova sessão (e um novo refresh token). */
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResult refresh(String rawRefreshToken, ClientInfo client) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Sessão expirada");
        }
        RefreshTokenService.Issued issued = refreshTokens.rotate(rawRefreshToken, client);
        User user = users.findById(issued.userId())
                .filter(User::isEnabled)
                .orElseThrow(() -> ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Sessão expirada"));
        return build(user, issued);
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        if (rawRefreshToken != null && !rawRefreshToken.isBlank()) {
            refreshTokens.revoke(rawRefreshToken);
        }
    }

    private AuthResult start(User user, ClientInfo client) {
        return build(user, refreshTokens.issueNewFamily(user.getId(), client));
    }

    private AuthResult build(User user, RefreshTokenService.Issued issued) {
        AccessTokenService.IssuedAccessToken access = accessTokens.issue(user);
        SessionResponse session = new SessionResponse(
                new SessionResponse.AuthUserDto(user.getId().toString(), user.getName(), user.getEmail(), user.highestRole().name()),
                access.token(),
                refreshConfig.exposeInBody() ? issued.rawToken() : null,
                access.expiresAt().toEpochMilli());
        return new AuthResult(session, issued.rawToken(), issued.expiresAt());
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private static ApiException emailTaken() {
        return ApiException.conflict("EMAIL_TAKEN", "Já existe uma conta com este e-mail");
    }
}
