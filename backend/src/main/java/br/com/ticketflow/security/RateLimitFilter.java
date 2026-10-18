package br.com.ticketflow.security;

import br.com.ticketflow.common.ApiError;
import br.com.ticketflow.config.AppProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.lang.Nullable;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Limite de requisições por IP em janelas de 1 minuto, por categoria (autenticação, portaria, webhooks, geral). Roda
 * ANTES da segurança (contém abuso mesmo sem token). Contadores no Redis (compartilhados entre instâncias); se o Redis
 * cair, usa contadores locais em memória — o serviço continua protegido, só que por instância. O IP já considera o proxy
 * confiável ({@code server.forward-headers-strategy}). Chaves em hash (sem IP em claro no Redis).
 */
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);
    private static final Duration WINDOW = Duration.ofMinutes(1);

    enum Bucket { AUTH, CHECKIN, WEBHOOK, GENERAL }

    private final AppProperties.RateLimit config;
    private final AppProperties.Cors cors;
    @Nullable private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Map<String, AtomicLong> local = new ConcurrentHashMap<>();
    private volatile long localWindow = -1;

    public RateLimitFilter(AppProperties props, @Nullable StringRedisTemplate redis, ObjectMapper mapper, Clock clock) {
        this.config = props.rateLimit();
        this.cors = props.cors();
        this.redis = props.redis().enabled() ? redis : null;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !config.enabled() || HttpMethod.OPTIONS.matches(request.getMethod()) || path.startsWith("/actuator/health");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Bucket bucket = bucket(request);
        int limit = switch (bucket) {
            case AUTH -> config.authPerMinute();
            case CHECKIN -> config.checkinPerMinute();
            case WEBHOOK -> config.webhookPerMinute();
            case GENERAL -> config.generalPerMinute();
        };
        long window = clock.millis() / WINDOW.toMillis();
        long count = increment(bucket.name().toLowerCase() + ":" + hash(request.getRemoteAddr()), window);
        if (count > limit) {
            long retryAfter = Math.max(1, (window + 1) * WINDOW.toSeconds() - clock.millis() / 1000);
            reject(request, response, retryAfter);
            return;
        }
        chain.doFilter(request, response);
    }

    static Bucket bucket(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.startsWith("/api/auth/")) {
            return Bucket.AUTH;
        }
        if (path.startsWith("/api/webhooks/")) {
            return Bucket.WEBHOOK;
        }
        if (path.startsWith("/api/org/") && (path.endsWith("/checkin"))) {
            return Bucket.CHECKIN;
        }
        return Bucket.GENERAL;
    }

    private long increment(String key, long window) {
        if (redis != null) {
            try {
                String k = "tf:rl:" + key + ":" + window;
                Long n = redis.opsForValue().increment(k);
                if (n != null && n == 1) {
                    redis.expire(k, WINDOW.plusSeconds(10));
                }
                return n == null ? 0 : n;
            } catch (RuntimeException e) {
                log.warn("Redis indisponível no limitador de requisições (usando contadores locais): {}", e.toString());
            }
        }
        if (window != localWindow) {
            synchronized (local) {
                if (window != localWindow) {
                    local.clear();
                    localWindow = window;
                }
            }
        }
        return local.computeIfAbsent(key, k -> new AtomicLong()).incrementAndGet();
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, long retryAfter) throws IOException {
        // Fora da cadeia de segurança: devolve os cabeçalhos CORS (origem autorizada) para o navegador conseguir ler o 429.
        String origin = request.getHeader(HttpHeaders.ORIGIN);
        if (origin != null && cors.allowedOrigins().contains(origin)) {
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, origin);
            response.setHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true");
            response.setHeader(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, HttpHeaders.RETRY_AFTER);
            response.setHeader(HttpHeaders.VARY, HttpHeaders.ORIGIN);
        }
        response.setStatus(429);
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfter));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        mapper.writeValue(response.getOutputStream(), new ApiError(429, "RATE_LIMITED", "Muitas requisições. Tente novamente em instantes.")
                .with("retryAfterSeconds", retryAfter));
    }

    private static String hash(String value) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d, 0, 12);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
