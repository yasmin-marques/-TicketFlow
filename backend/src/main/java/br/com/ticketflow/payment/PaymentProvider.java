package br.com.ticketflow.payment;

import java.time.Instant;
import java.util.Map;

/**
 * Abstração do gateway de pagamento. A aplicação NUNCA recebe número de cartão nem CVV: o navegador troca os dados
 * do cartão por um {@code token} direto com o gateway e só o token chega aqui.
 *
 * <p>Para integrar um gateway real, implemente esta interface, registre o bean (e remova/desative o
 * {@code SandboxPaymentProvider}, que só existe nos perfis {@code dev} e {@code test}).
 */
public interface PaymentProvider {

    /** Identificador gravado nos pedidos e usado na rota do webhook ({@code /api/webhooks/payments/{name}}). */
    String name();

    /** Cobra o cartão. {@code idempotencyKey} é repassada ao gateway: repetir a chamada não cobra duas vezes. */
    CardChargeResult chargeCard(CardChargeRequest request);

    /** Cria uma cobrança Pix (pagamento confirmado depois, por webhook). */
    PendingPayment createPix(PendingPaymentRequest request);

    /** Cria um boleto (pagamento confirmado depois, por webhook). */
    PendingPayment createBoleto(PendingPaymentRequest request);

    /** Estorna uma cobrança confirmada. */
    RefundResult refund(String providerRef, long amountCents, String idempotencyKey);

    /**
     * Valida a assinatura do webhook e interpreta o evento.
     *
     * @throws InvalidWebhookException assinatura ausente/inválida, timestamp fora da tolerância ou corpo ilegível
     */
    WebhookEvent verifyWebhook(Map<String, String> headers, String rawBody);

    record CardChargeRequest(String token, long amountCents, int installments, String idempotencyKey, String description) {}

    /** {@code last4}/{@code brand} vêm do gateway (não do cliente). */
    record CardChargeResult(boolean approved, String providerRef, String last4, String brand, String declineReason) {}

    record PendingPaymentRequest(long amountCents, String orderCode, String idempotencyKey, Instant expiresAt) {}

    /** {@code code}: "copia e cola" do Pix ou linha digitável do boleto. */
    record PendingPayment(String providerRef, String code, Instant expiresAt) {}

    record RefundResult(boolean success, String providerRef) {}

    /** {@code type}: {@code payment.confirmed | payment.failed}. */
    record WebhookEvent(String id, String type, String providerRef) {}

    class InvalidWebhookException extends RuntimeException {
        public InvalidWebhookException(String message) {
            super(message);
        }
    }
}
