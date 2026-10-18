package br.com.ticketflow.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.payment.PaymentProvider.CardChargeRequest;
import br.com.ticketflow.payment.PaymentProvider.InvalidWebhookException;
import br.com.ticketflow.payment.PaymentProvider.PendingPaymentRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PaymentUnitTest {

    private static final String SECRET = "unit-test-secret-unit-test-secret-1234";
    private static final Instant NOW = Instant.parse("2030-01-01T12:00:00Z");

    private SandboxPaymentProvider sandbox() {
        var payments = new AppProperties.Payments(SECRET, Duration.ofMinutes(5));
        var props = new AppProperties(null, null, null, null, null, payments, null, null, null, null);
        return new SandboxPaymentProvider(props, new ObjectMapper(), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    // ── assinatura de webhook ──────────────────────────────────────────────────────────────────────────

    @Test
    void validSignaturePasses() {
        String body = "{\"id\":\"e1\"}";
        String header = WebhookSignature.sign(SECRET, NOW.getEpochSecond(), body);
        WebhookSignature.verify(SECRET, header, body, Duration.ofMinutes(5), NOW);
    }

    @Test
    void tamperedBodyWrongSecretMissingHeaderAndStaleTimestampFail() {
        String body = "{\"id\":\"e1\"}";
        String header = WebhookSignature.sign(SECRET, NOW.getEpochSecond(), body);

        assertThatThrownBy(() -> WebhookSignature.verify(SECRET, header, body + " ", Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
        assertThatThrownBy(() -> WebhookSignature.verify("outro", header, body, Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
        assertThatThrownBy(() -> WebhookSignature.verify(SECRET, null, body, Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
        assertThatThrownBy(() -> WebhookSignature.verify(SECRET, "lixo", body, Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
        assertThatThrownBy(() -> WebhookSignature.verify(SECRET, "t=abc,v1=00", body, Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
        String old = WebhookSignature.sign(SECRET, NOW.minusSeconds(3600).getEpochSecond(), body);
        assertThatThrownBy(() -> WebhookSignature.verify(SECRET, old, body, Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
        // sem segredo configurado, nenhum webhook é aceito
        assertThatThrownBy(() -> WebhookSignature.verify("", header, body, Duration.ofMinutes(5), NOW)).isInstanceOf(InvalidWebhookException.class);
    }

    // ── provedor sandbox ───────────────────────────────────────────────────────────────────────────────

    @Test
    void sandboxApprovesTokensAndDeclinesTheTestCardAndInvalidTokens() {
        SandboxPaymentProvider p = sandbox();
        var ok = p.chargeCard(new CardChargeRequest("tok_4242", 1000, 1, "k1", "x"));
        assertThat(ok.approved()).isTrue();
        assertThat(ok.last4()).isEqualTo("4242");
        // mesma chave de idempotência → mesma cobrança
        assertThat(p.chargeCard(new CardChargeRequest("tok_4242", 1000, 1, "k1", "x")).providerRef()).isEqualTo(ok.providerRef());
        assertThat(p.chargeCard(new CardChargeRequest("tok_4242", 1000, 1, "k2", "x")).providerRef()).isNotEqualTo(ok.providerRef());

        assertThat(p.chargeCard(new CardChargeRequest("tok_0002", 1000, 1, "k", "x")).approved()).isFalse();
        // um número de cartão cru nunca é aceito como "token"
        assertThat(p.chargeCard(new CardChargeRequest("4242424242424242", 1000, 1, "k", "x")).approved()).isFalse();
        assertThat(p.chargeCard(new CardChargeRequest(null, 1000, 1, "k", "x")).approved()).isFalse();
    }

    @Test
    void sandboxParsesSignedWebhooks() {
        SandboxPaymentProvider p = sandbox();
        String body = "{\"id\":\"evt_1\",\"type\":\"payment.confirmed\",\"providerRef\":\"sbx_pix_1\"}";
        var event = p.verifyWebhook(Map.of(WebhookSignature.HEADER, WebhookSignature.sign(SECRET, NOW.getEpochSecond(), body)), body);

        assertThat(event.id()).isEqualTo("evt_1");
        assertThat(event.type()).isEqualTo("payment.confirmed");
        assertThat(event.providerRef()).isEqualTo("sbx_pix_1");

        String incomplete = "{\"id\":\"evt_1\"}";
        assertThatThrownBy(() -> p.verifyWebhook(Map.of(WebhookSignature.HEADER, WebhookSignature.sign(SECRET, NOW.getEpochSecond(), incomplete)), incomplete))
                .isInstanceOf(InvalidWebhookException.class);
    }

    @Test
    void sandboxPendingPaymentsCarryTheDeadline() {
        Instant due = NOW.plusSeconds(1800);
        var pix = sandbox().createPix(new PendingPaymentRequest(12345, "TF-1", "k", due));
        assertThat(pix.code()).isNotBlank();
        assertThat(pix.expiresAt()).isEqualTo(due);
        assertThat(sandbox().createBoleto(new PendingPaymentRequest(12345, "TF-1", "k", due)).code()).contains("00000000012345");
    }

    // ── produção sem gateway ───────────────────────────────────────────────────────────────────────────

    @Test
    void withoutAGatewayChargesAreRefusedInsteadOfPretended() {
        UnconfiguredPaymentProvider p = new UnconfiguredPaymentProvider();
        assertThatThrownBy(() -> p.chargeCard(new CardChargeRequest("tok_4242", 1, 1, "k", "x")))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status().value()).isEqualTo(503);
                    assertThat(e.code()).isEqualTo("PAYMENT_PROVIDER_UNAVAILABLE");
                });
        assertThatThrownBy(() -> p.verifyWebhook(Map.of(), "{}")).isInstanceOf(InvalidWebhookException.class);
    }
}
