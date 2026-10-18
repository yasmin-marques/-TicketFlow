package br.com.ticketflow.security;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.ticketflow.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** Limitador por IP e categoria (contadores locais: sem Redis). */
class RateLimitFilterTest {

    private static AppProperties props(boolean enabled) {
        return new AppProperties(null, new AppProperties.Cors(List.of("https://app.example.com")), null, null, null, null, null,
                new AppProperties.Redis(false), null, null, new AppProperties.RateLimit(enabled, 5, 2, 3, 10));
    }

    private static MockHttpServletResponse call(RateLimitFilter f, String method, String path, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, path);
        req.setRequestURI(path);
        req.setRemoteAddr(ip);
        req.addHeader("Origin", "https://app.example.com");
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(req, res, new MockFilterChain());
        return res;
    }

    @Test
    void blocksAfterTheLimitPerIpAndCategoryWithRetryAfterAndCors() throws Exception {
        Clock clock = Clock.fixed(Instant.parse("2026-10-18T12:00:10Z"), ZoneOffset.UTC);
        RateLimitFilter f = new RateLimitFilter(props(true), null, new ObjectMapper(), clock);

        assertThat(call(f, "POST", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(call(f, "POST", "/api/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        MockHttpServletResponse blocked = call(f, "POST", "/api/auth/login", "1.1.1.1");
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("50");
        assertThat(blocked.getHeader("Access-Control-Allow-Origin")).isEqualTo("https://app.example.com");
        assertThat(blocked.getContentAsString()).contains("RATE_LIMITED");

        // Outro IP e outra categoria têm contadores próprios.
        assertThat(call(f, "POST", "/api/auth/login", "2.2.2.2").getStatus()).isEqualTo(200);
        assertThat(call(f, "GET", "/api/events", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(RateLimitFilter.bucket(new MockHttpServletRequest("POST", "/api/org/events/x/checkin") {{ setRequestURI("/api/org/events/x/checkin"); }}))
                .isEqualTo(RateLimitFilter.Bucket.CHECKIN);
    }

    @Test
    void preflightHealthAndDisabledLimiterAreNotCounted() throws Exception {
        Clock clock = Clock.fixed(Instant.parse("2026-10-18T12:00:00Z"), ZoneOffset.UTC);
        RateLimitFilter on = new RateLimitFilter(props(true), null, new ObjectMapper(), clock);
        for (int i = 0; i < 20; i++) {
            assertThat(call(on, "OPTIONS", "/api/auth/login", "3.3.3.3").getStatus()).isEqualTo(200);
        }
        RateLimitFilter off = new RateLimitFilter(props(false), null, new ObjectMapper(), clock);
        for (int i = 0; i < 20; i++) {
            assertThat(call(off, "POST", "/api/auth/login", "3.3.3.3").getStatus()).isEqualTo(200);
        }
    }
}
