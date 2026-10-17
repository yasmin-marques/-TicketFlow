package br.com.ticketflow.shared.port;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Bloqueia uma chave (e-mail + IP) após N falhas dentro da janela, por um período. */
@Component
public class InMemoryLoginAttemptLimiter implements LoginAttemptLimiter {

    private static final int MAX_TRACKED_KEYS = 50_000;

    private final Map<String, State> states = new ConcurrentHashMap<>();
    private final AppProperties.Login config;
    private final Clock clock;

    public InMemoryLoginAttemptLimiter(AppProperties props, Clock clock) {
        this.config = props.security().login();
        this.clock = clock;
    }

    @Override
    public void assertNotLocked(String key) {
        State s = states.get(key);
        Instant now = clock.instant();
        if (s != null && s.lockedUntil != null && s.lockedUntil.isAfter(now)) {
            long wait = Duration.between(now, s.lockedUntil).toSeconds() + 1;
            throw new ApiException(
                            HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Muitas tentativas. Tente novamente em instantes.")
                    .with("retryAfterSeconds", wait);
        }
    }

    @Override
    public void recordFailure(String key) {
        Instant now = clock.instant();
        if (states.size() > MAX_TRACKED_KEYS) {
            states.entrySet().removeIf(e -> e.getValue().isStale(now, config));
        }
        states.compute(key, (k, s) -> {
            State next = s == null || s.windowStart.plus(config.window()).isBefore(now) ? new State(now) : s;
            next.failures++;
            if (next.failures >= config.maxAttempts()) {
                next.lockedUntil = now.plus(config.lockout());
            }
            return next;
        });
    }

    @Override
    public void reset(String key) {
        states.remove(key);
    }

    private static final class State {
        final Instant windowStart;
        int failures;
        Instant lockedUntil;

        State(Instant windowStart) {
            this.windowStart = windowStart;
        }

        boolean isStale(Instant now, AppProperties.Login c) {
            Instant until = lockedUntil != null ? lockedUntil : windowStart.plus(c.window());
            return until.isBefore(now);
        }
    }
}
