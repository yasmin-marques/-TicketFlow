package br.com.ticketflow.sales.service;

import br.com.ticketflow.common.ApiException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Verificação de prazo ANTES de travar a reserva. Se venceu, expira-a em transação própria (libera estoque e
 * assentos de forma definitiva, mesmo que a requisição falhe) e responde {@code 410 RESERVATION_EXPIRED}.
 *
 * <p>Faz uma leitura SQL simples (sem carregar a entidade) de propósito: assim a transação do chamador ainda não
 * tem a reserva em cache nem locks, e a transação independente pode atualizá-la sem deadlock.
 */
@Component
public class ReservationGuard {

    private final JdbcTemplate jdbc;
    private final ReservationExpiryService expiry;
    private final Clock clock;

    public ReservationGuard(JdbcTemplate jdbc, ReservationExpiryService expiry, Clock clock) {
        this.jdbc = jdbc;
        this.expiry = expiry;
        this.clock = clock;
    }

    public void failIfExpired(UUID reservationId, UUID userId) {
        List<Map<String, Object>> rows = jdbc.queryForList("select status, expires_at from reservations where id = ? and user_id = ?", reservationId, userId);
        if (rows.isEmpty()) {
            throw ApiException.notFound("Reserva não encontrada");
        }
        Instant expiresAt = ((Timestamp) rows.get(0).get("expires_at")).toInstant();
        if ("ACTIVE".equals(rows.get(0).get("status")) && !expiresAt.isAfter(clock.instant())) {
            expiry.expireOne(reservationId);
            throw expired();
        }
    }

    public static ApiException expired() {
        return new ApiException(HttpStatus.GONE, "RESERVATION_EXPIRED", "Sua reserva expirou");
    }
}
