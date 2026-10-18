package br.com.ticketflow.shared.port;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Limitador de tentativas de login compartilhado entre instâncias (Redis). Falha ABERTA: se o Redis estiver fora,
 * o login continua funcionando (sem o bloqueio) em vez de derrubar a autenticação. Chaves em hash (sem e-mail/IP em claro).
 */
@Component
@ConditionalOnProperty(prefix = "tf.redis", name = "enabled", havingValue = "true")
public class RedisLoginAttemptLimiter implements LoginAttemptLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisLoginAttemptLimiter.class);

    private final StringRedisTemplate redis;
    private final AppProperties.Login config;

    public RedisLoginAttemptLimiter(StringRedisTemplate redis, AppProperties props) {
        this.redis = redis;
        this.config = props.security().login();
    }

    @Override
    public void assertNotLocked(String key) {
        Long ttl;
        try {
            ttl = redis.getExpire(lockKey(key));
        } catch (RuntimeException e) {
            log.warn("Redis indisponível no limitador de login (liberado): {}", e.toString());
            return;
        }
        if (ttl != null && ttl > 0) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Muitas tentativas. Tente novamente em instantes.")
                    .with("retryAfterSeconds", ttl);
        }
    }

    @Override
    public void recordFailure(String key) {
        try {
            String failKey = failKey(key);
            Long count = redis.opsForValue().increment(failKey);
            if (count != null && count == 1) {
                redis.expire(failKey, config.window());
            }
            if (count != null && count >= config.maxAttempts()) {
                redis.opsForValue().set(lockKey(key), "1", config.lockout());
                redis.delete(failKey);
            }
        } catch (RuntimeException e) {
            log.warn("Redis indisponível ao registrar falha de login: {}", e.toString());
        }
    }

    @Override
    public void reset(String key) {
        try {
            redis.delete(failKey(key));
        } catch (RuntimeException e) {
            log.warn("Redis indisponível ao limpar tentativas de login: {}", e.toString());
        }
    }

    private static String failKey(String key) {
        return "tf:login:fail:" + hash(key);
    }

    private static String lockKey(String key) {
        return "tf:login:lock:" + hash(key);
    }

    private static String hash(String key) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @SuppressWarnings("unused")
    private static final Duration UNUSED = Duration.ZERO;
}
