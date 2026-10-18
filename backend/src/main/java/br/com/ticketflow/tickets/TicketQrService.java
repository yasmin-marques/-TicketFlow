package br.com.ticketflow.tickets;

import br.com.ticketflow.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Optional;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Conteúdo assinado do QR Code: {@code TF1.<ticketId>.<versão>.<assinatura>}, com
 * {@code assinatura = base64url(HMAC-SHA256(segredo, "TF1|ticketId|versão"))}.
 *
 * <p>A assinatura impede forjar QR codes sem a chave do servidor; a {@code versão} sobe a cada transferência, então o
 * QR do dono anterior deixa de valer. O check-in (Parte 3) deve (1) {@link #verify} a assinatura e (2) comparar a
 * versão e o estado ({@code VALID}) com o banco, marcando o uso de forma atômica.
 */
@Component
public class TicketQrService {

    private static final Logger log = LoggerFactory.getLogger(TicketQrService.class);
    private static final String PREFIX = "TF1";

    public record Verified(UUID ticketId, int version) {}

    private final byte[] key;

    public TicketQrService(AppProperties props) {
        String secret = props.tickets().qrSecret();
        if (secret == null || secret.isBlank()) {
            key = new byte[64];
            new SecureRandom().nextBytes(key);
            log.warn("TF_QR_SECRET não definido: usando chave efêmera (QR codes emitidos deixam de valer ao reiniciar). Defina em produção.");
        } else {
            key = secret.getBytes(StandardCharsets.UTF_8);
            if (key.length < 32) {
                throw new IllegalStateException("TF_QR_SECRET precisa ter ao menos 32 bytes");
            }
        }
    }

    public String payload(UUID ticketId, int version) {
        return PREFIX + "." + ticketId + "." + version + "." + sign(ticketId, version);
    }

    /** Valida formato e assinatura (tempo constante). Não consulta o banco. */
    public Optional<Verified> verify(String payload) {
        if (payload == null) {
            return Optional.empty();
        }
        String[] parts = payload.split("\\.");
        if (parts.length != 4 || !PREFIX.equals(parts[0])) {
            return Optional.empty();
        }
        try {
            UUID id = UUID.fromString(parts[1]);
            int version = Integer.parseInt(parts[2]);
            boolean ok = MessageDigest.isEqual(sign(id, version).getBytes(StandardCharsets.UTF_8), parts[3].getBytes(StandardCharsets.UTF_8));
            return ok ? Optional.of(new Verified(id, version)) : Optional.empty();
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private String sign(UUID ticketId, int version) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            byte[] sig = mac.doFinal((PREFIX + "|" + ticketId + "|" + version).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
