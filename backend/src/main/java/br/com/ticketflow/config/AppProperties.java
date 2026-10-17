package br.com.ticketflow.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuração tipada do TicketFlow (prefixo {@code tf}). */
@ConfigurationProperties(prefix = "tf")
public record AppProperties(Security security, Cors cors, Catalog catalog, Seed seed) {

    public record Security(int bcryptStrength, Jwt jwt, Refresh refresh, PasswordReset passwordReset, Login login) {}

    public record Jwt(String secret, String issuer, Duration accessTtl) {}

    public record Refresh(Duration ttl, boolean exposeInBody, Cookie cookie) {}

    public record Cookie(String name, String path, boolean secure, String sameSite) {}

    public record PasswordReset(Duration ttl, boolean exposeTokenInResponse, String linkBaseUrl) {}

    public record Login(int maxAttempts, Duration window, Duration lockout) {}

    public record Cors(List<String> allowedOrigins) {}

    public record Catalog(
            double originLat,
            double originLng,
            double nearbyRadiusKm,
            String timezone,
            int defaultPageSize,
            int maxPageSize) {}

    public record Seed(boolean enabled) {}
}
