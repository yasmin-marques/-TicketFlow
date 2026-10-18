package br.com.ticketflow.payment;

import br.com.ticketflow.common.ApiException;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Usado fora de dev/test enquanto nenhum gateway real estiver implementado: recusa cobranças com
 * {@code 503 PAYMENT_PROVIDER_UNAVAILABLE} em vez de fingir que cobrou. Substitua por uma implementação real.
 */
@Component
@Profile("!(dev | test)")
public class UnconfiguredPaymentProvider implements PaymentProvider {

    @Override
    public String name() {
        return "unconfigured";
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "PAYMENT_PROVIDER_UNAVAILABLE", "Pagamentos indisponíveis no momento.");
    }

    @Override
    public CardChargeResult chargeCard(CardChargeRequest request) {
        throw unavailable();
    }

    @Override
    public PendingPayment createPix(PendingPaymentRequest request) {
        throw unavailable();
    }

    @Override
    public PendingPayment createBoleto(PendingPaymentRequest request) {
        throw unavailable();
    }

    @Override
    public RefundResult refund(String providerRef, long amountCents, String idempotencyKey) {
        throw unavailable();
    }

    @Override
    public WebhookEvent verifyWebhook(Map<String, String> headers, String rawBody) {
        throw new InvalidWebhookException("nenhum gateway configurado");
    }
}
