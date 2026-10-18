package br.com.ticketflow.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProductionSafetyCheckTest {

    private static final String SECRET = "s".repeat(40);

    private static AppProperties props(String jwt, boolean cookieSecure, List<String> origins, boolean seed, boolean rateLimit) {
        var security = new AppProperties.Security(12, new AppProperties.Jwt(jwt, "ticketflow", Duration.ofMinutes(15)),
                new AppProperties.Refresh(Duration.ofDays(7), false, new AppProperties.Cookie("tf_refresh", "/api/auth", cookieSecure, "Lax")),
                new AppProperties.PasswordReset(Duration.ofHours(1), false, "https://app.example.com"), null);
        return new AppProperties(security, new AppProperties.Cors(origins), null, new AppProperties.Seed(seed, ""), null,
                new AppProperties.Payments("", Duration.ofMinutes(5)), new AppProperties.Tickets(SECRET), null, null, null,
                new AppProperties.RateLimit(rateLimit, 300, 30, 240, 600));
    }

    @Test
    void aSafeConfigurationPasses() {
        assertThat(ProductionSafetyCheck.problems(props(SECRET, true, List.of("https://app.example.com"), false, true), List.of("prod"), "pw"))
                .isEmpty();
    }

    @Test
    void insecureSettingsAreAllReported() {
        List<String> problems = ProductionSafetyCheck.problems(
                props("curto", false, List.of("http://localhost:5173", "*"), true, false), List.of("prod", "dev"), "");
        assertThat(problems).hasSize(8);
        assertThat(String.join("\n", problems)).contains("dev/test", "TF_JWT_SECRET", "TF_COOKIE_SECURE", "semente", "TF_CORS_ORIGINS",
                "TF_DB_PASSWORD", "limite de requisições");
    }
}
