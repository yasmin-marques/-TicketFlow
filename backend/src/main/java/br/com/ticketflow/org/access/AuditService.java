package br.com.ticketflow.org.access;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Trilha de auditoria das ações administrativas (quem, o quê, sobre qual recurso, de onde). {@code MANDATORY}: o
 * registro é gravado na MESMA transação da ação — se a ação for desfeita, o registro também é, e vice-versa.
 * Não grava dados pessoais além do necessário (sem CPF, sem dados de pagamento).
 */
@Service
public class AuditService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Clock clock;

    public AuditService(JdbcTemplate jdbc, ObjectMapper mapper, Clock clock) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(OrgContext ctx, String action, String entityType, Object entityId, Map<String, ?> details) {
        String json;
        try {
            json = mapper.writeValueAsString(details == null ? Map.of() : details);
        } catch (JsonProcessingException e) {
            json = "{}";
        }
        jdbc.update("""
                insert into audit_log (id, organization_id, actor_user_id, action, entity_type, entity_id, details, ip_address, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID(), ctx.organizationId(), ctx.userId(), action, entityType,
                entityId == null ? null : String.valueOf(entityId), json, clientIp(), Timestamp.from(clock.instant()));
    }

    /** IP do cliente (com {@code server.forward-headers-strategy=framework}, já considera o proxy confiável). */
    private static String clientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest request = attrs.getRequest();
            String ip = request.getRemoteAddr();
            return ip == null ? null : ip.substring(0, Math.min(45, ip.length()));
        }
        return null;
    }
}
