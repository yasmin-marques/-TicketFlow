package br.com.ticketflow.auth.web;

import br.com.ticketflow.config.AppProperties;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Optional;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** Monta/lê o cookie do refresh token: HttpOnly, Secure (em HTTPS), SameSite e restrito ao caminho de auth. */
@Component
public class RefreshCookies {

    private final AppProperties.Cookie config;

    public RefreshCookies(AppProperties props) {
        this.config = props.security().refresh().cookie();
    }

    public ResponseCookie create(String value, Instant expiresAt, Instant now) {
        Duration maxAge = Duration.between(now, expiresAt);
        return base(value).maxAge(maxAge.isNegative() ? Duration.ZERO : maxAge).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(Duration.ZERO).build();
    }

    public Optional<String> read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        return Arrays.stream(cookies)
                .filter(c -> c.getName().equals(config.name()))
                .map(Cookie::getValue)
                .filter(v -> !v.isBlank())
                .findFirst();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(config.name(), value)
                .httpOnly(true)
                .secure(config.secure())
                .sameSite(config.sameSite())
                .path(config.path());
    }
}
