package br.com.ticketflow.payment;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.payment.PaymentConfirmationService.Outcome;
import br.com.ticketflow.payment.PaymentProvider.InvalidWebhookException;
import br.com.ticketflow.payment.PaymentProvider.WebhookEvent;
import io.swagger.v3.oas.annotations.Hidden;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Entrada pública dos webhooks do gateway. A autenticação é a ASSINATURA do corpo (não há token de usuário). O corpo
 * é lido cru ({@code String}) porque a assinatura cobre exatamente os bytes recebidos.
 */
@RestController
@RequestMapping("/api/webhooks/payments")
@Hidden
public class WebhookController {

    private static final Logger log = LoggerFactory.getLogger(WebhookController.class);

    private final PaymentProvider provider;
    private final PaymentConfirmationService confirmation;

    public WebhookController(PaymentProvider provider, PaymentConfirmationService confirmation) {
        this.provider = provider;
        this.confirmation = confirmation;
    }

    @PostMapping("/{providerName}")
    public Map<String, Object> receive(@PathVariable String providerName, @RequestBody String rawBody, @RequestHeader HttpHeaders headers) {
        if (!provider.name().equals(providerName)) {
            throw ApiException.notFound("Rota não encontrada");
        }
        Map<String, String> lower = new HashMap<>();
        headers.forEach((k, v) -> lower.put(k.toLowerCase(), v.isEmpty() ? "" : v.get(0)));

        WebhookEvent event;
        try {
            event = provider.verifyWebhook(lower, rawBody);
        } catch (InvalidWebhookException e) {
            // Não detalha o motivo ao chamador (evita ajudar quem tenta forjar).
            log.warn("Webhook rejeitado: {}", e.getMessage());
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_SIGNATURE", "Assinatura inválida");
        }
        Outcome outcome = confirmation.handle(event);
        return Map.of("received", true, "duplicate", outcome == Outcome.DUPLICATE);
    }
}
