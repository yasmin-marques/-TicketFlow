package br.com.ticketflow.payment;

import br.com.ticketflow.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * *** PROVEDOR DE TESTES — NÃO COBRA NADA ***
 *
 * Existe apenas nos perfis {@code dev} e {@code test}. Simula um gateway para que o fluxo completo funcione sem
 * credenciais. Convenção dos tokens de cartão (um token real vem do gateway; aqui é combinado com o frontend):
 *
 * <ul>
 *   <li>{@code tok_<4 dígitos>} → aprovado, com esses últimos dígitos (ex.: {@code tok_4242});</li>
 *   <li>{@code tok_0002} → recusado (mesma regra do mock do frontend);</li>
 *   <li>qualquer outro valor → recusado como token inválido.</li>
 * </ul>
 */
@Component
@Profile({"dev", "test"})
public class SandboxPaymentProvider implements PaymentProvider {

    public static final String NAME = "sandbox";
    private static final Logger log = LoggerFactory.getLogger(SandboxPaymentProvider.class);
    private static final Pattern TOKEN = Pattern.compile("^tok_(\\d{4})$");

    private final AppProperties.Payments config;
    private final ObjectMapper mapper;
    private final Clock clock;

    public SandboxPaymentProvider(AppProperties props, ObjectMapper mapper, Clock clock) {
        this.config = props.payments();
        this.mapper = mapper;
        this.clock = clock;
    }

    @PostConstruct
    void banner() {
        log.warn("╔══ PROVEDOR DE PAGAMENTO SANDBOX ATIVO: nenhuma cobrança real será feita (perfil dev/test) ══╗");
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public CardChargeResult chargeCard(CardChargeRequest request) {
        Matcher m = request.token() == null ? null : TOKEN.matcher(request.token());
        if (m == null || !m.matches()) {
            return new CardChargeResult(false, null, null, null, "invalid_token");
        }
        String last4 = m.group(1);
        if ("0002".equals(last4)) {
            return new CardChargeResult(false, null, last4, "sandbox", "card_declined");
        }
        // Determinístico por chave de idempotência: repetir a chamada devolve a MESMA cobrança.
        return new CardChargeResult(true, "sbx_ch_" + stable(request.idempotencyKey()), last4, "sandbox", null);
    }

    @Override
    public PendingPayment createPix(PendingPaymentRequest request) {
        String ref = "sbx_pix_" + stable(request.idempotencyKey());
        String code = "SANDBOX-PIX-0002012658" + ref.substring(ref.length() - 12) + "5204000053039865406" + request.amountCents() + "5802BR";
        return new PendingPayment(ref, code, request.expiresAt());
    }

    @Override
    public PendingPayment createBoleto(PendingPaymentRequest request) {
        String ref = "sbx_bol_" + stable(request.idempotencyKey());
        String line = "SANDBOX 00000.00000 00000.000000 " + ref.substring(ref.length() - 10) + " 0 " + String.format("%014d", request.amountCents());
        return new PendingPayment(ref, line, request.expiresAt());
    }

    @Override
    public RefundResult refund(String providerRef, long amountCents, String idempotencyKey) {
        return new RefundResult(true, "sbx_rf_" + stable(idempotencyKey));
    }

    @Override
    public WebhookEvent verifyWebhook(Map<String, String> headers, String rawBody) {
        WebhookSignature.verify(config.webhookSecret(), headers.get(WebhookSignature.HEADER), rawBody, config.webhookTolerance(), clock.instant());
        try {
            JsonNode n = mapper.readTree(rawBody);
            String id = n.path("id").asText(null);
            String type = n.path("type").asText(null);
            String ref = n.path("providerRef").asText(null);
            if (id == null || type == null || ref == null) {
                throw new InvalidWebhookException("evento incompleto");
            }
            return new WebhookEvent(id, type, ref);
        } catch (InvalidWebhookException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidWebhookException("corpo ilegível");
        }
    }

    private static String stable(String key) {
        return UUID.nameUUIDFromBytes(String.valueOf(key).getBytes(StandardCharsets.UTF_8)).toString().replace("-", "");
    }
}
