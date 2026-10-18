package br.com.ticketflow.idempotency;

import br.com.ticketflow.common.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Idempotência persistente por {@code Idempotency-Key}.
 *
 * <ol>
 *   <li>A chave é reservada (INSERT … ON CONFLICT DO NOTHING) numa transação própria — o banco decide quem chegou primeiro.</li>
 *   <li>A ação de negócio roda em OUTRA transação, e o resultado é gravado nela mesma: ou o efeito e o registro da
 *       resposta são confirmados juntos, ou nenhum dos dois.</li>
 *   <li>Erros de negócio definitivos (4xx) desfazem a ação e também ficam registrados: repetir a chave devolve o mesmo erro.</li>
 *   <li>Falhas inesperadas (5xx/infra) liberam a chave para uma nova tentativa.</li>
 * </ol>
 *
 * Mesma chave com outro método, caminho ou corpo → {@code 422 IDEMPOTENCY_KEY_REUSED}. Mesma chave ainda em
 * processamento → {@code 409 REQUEST_IN_PROGRESS}.
 */
@Service
public class IdempotencyService {

    private static final Pattern KEY = Pattern.compile("^[A-Za-z0-9._:-]{8,120}$");
    private static final Duration STALE_AFTER = Duration.ofMinutes(2);

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final TransactionTemplate business;
    private final TransactionTemplate separate;

    public IdempotencyService(JdbcTemplate jdbc, ObjectMapper mapper, Clock clock, PlatformTransactionManager txManager) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
        this.business = new TransactionTemplate(txManager);
        this.separate = new TransactionTemplate(txManager);
        this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Valida o cabeçalho; lança 422 se ausente ou malformado. */
    public String requireKey(String header) {
        if (header == null || header.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "IDEMPOTENCY_KEY_REQUIRED", "Envie o cabeçalho Idempotency-Key.");
        }
        if (!KEY.matcher(header).matches()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Idempotency-Key inválida (8 a 120 caracteres: letras, números, . _ : -).");
        }
        return header;
    }

    public ResponseEntity<JsonNode> execute(UUID userId, String key, String method, String path, Object requestBody,
                                            HttpStatus successStatus, Supplier<?> action) {
        String hash = hash(requestBody);
        final UUID newRowId = UUID.randomUUID();
        UUID rowId = newRowId;

        Boolean claimed = separate.execute(s -> jdbc.update("""
                insert into idempotency_keys (id, user_id, idem_key, http_method, path, request_hash, status, created_at)
                values (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?) on conflict (user_id, idem_key) do nothing
                """, newRowId, userId, key, method, path, hash, Timestamp.from(clock.instant())) == 1);

        if (!Boolean.TRUE.equals(claimed)) {
            ResponseEntity<JsonNode> replay = replayOrTakeOver(userId, key, method, path, hash);
            if (replay != null) {
                return replay;
            }
            // retomou uma chave abandonada: segue e executa
            rowId = existingId(userId, key);
        }

        final UUID id = rowId;
        try {
            JsonNode body = business.execute(s -> {
                Object result = action.get();
                JsonNode json = mapper.valueToTree(result);
                complete(id, successStatus.value(), json);
                return json;
            });
            return ResponseEntity.status(successStatus).body(body);
        } catch (ApiException e) {
            // A ação foi desfeita; registra o erro definitivo para que a repetição receba a mesma resposta.
            separate.executeWithoutResult(s -> complete(id, e.status().value(), errorBody(e)));
            throw e;
        } catch (RuntimeException e) {
            separate.executeWithoutResult(s -> jdbc.update("delete from idempotency_keys where id = ? and status = 'IN_PROGRESS'", id));
            throw e;
        }
    }

    private ResponseEntity<JsonNode> replayOrTakeOver(UUID userId, String key, String method, String path, String hash) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, http_method, path, request_hash, status, response_status, response_body, created_at
                from idempotency_keys where user_id = ? and idem_key = ?
                """, userId, key);
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "REQUEST_IN_PROGRESS", "Requisição em andamento. Tente novamente.");
        }
        Map<String, Object> row = rows.get(0);
        if (!method.equals(row.get("http_method")) || !path.equals(row.get("path")) || !hash.trim().equals(String.valueOf(row.get("request_hash")).trim())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "IDEMPOTENCY_KEY_REUSED",
                    "Esta Idempotency-Key já foi usada em outra requisição.");
        }
        if ("COMPLETED".equals(row.get("status"))) {
            try {
                JsonNode body = mapper.readTree((String) row.get("response_body"));
                return ResponseEntity.status(((Number) row.get("response_status")).intValue()).header("Idempotent-Replayed", "true").body(body);
            } catch (Exception e) {
                throw new IllegalStateException("Resposta idempotente corrompida", e);
            }
        }
        Instant created = ((Timestamp) row.get("created_at")).toInstant();
        if (created.plus(STALE_AFTER).isBefore(clock.instant())) {
            // O processo que reservou a chave morreu sem concluir: assume a execução (atomicamente).
            Integer took = separate.execute(s -> jdbc.update(
                    "update idempotency_keys set created_at = ? where id = ? and status = 'IN_PROGRESS' and created_at = ?",
                    Timestamp.from(clock.instant()), row.get("id"), row.get("created_at")));
            if (took != null && took == 1) {
                return null;
            }
        }
        throw new ApiException(HttpStatus.CONFLICT, "REQUEST_IN_PROGRESS", "Requisição em andamento. Tente novamente.");
    }

    private UUID existingId(UUID userId, String key) {
        return jdbc.queryForObject("select id from idempotency_keys where user_id = ? and idem_key = ?", UUID.class, userId, key);
    }

    private void complete(UUID id, int status, JsonNode body) {
        jdbc.update("update idempotency_keys set status = 'COMPLETED', response_status = ?, response_body = ?, completed_at = ? where id = ?",
                status, body.toString(), Timestamp.from(clock.instant()), id);
    }

    private JsonNode errorBody(ApiException e) {
        ObjectNode n = mapper.createObjectNode();
        n.put("status", e.status().value());
        n.put("code", e.code());
        n.put("message", e.getMessage());
        e.extras().forEach((k, v) -> n.set(k, mapper.valueToTree(v)));
        return n;
    }

    private String hash(Object body) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(body));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    @SuppressWarnings("unused")
    private static final java.nio.charset.Charset UTF8 = StandardCharsets.UTF_8;
}
