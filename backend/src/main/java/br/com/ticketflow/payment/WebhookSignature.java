package br.com.ticketflow.payment;

import br.com.ticketflow.payment.PaymentProvider.InvalidWebhookException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Assinatura de webhooks: cabeçalho {@code X-TF-Signature: t=<unix>,v1=<hex>}, onde
 * {@code v1 = HMAC-SHA256(segredo, t + "." + corpo)}. O timestamp assinado limita a janela de repetição
 * (replay); o {@code id} do evento, gravado no banco, impede reprocessar o mesmo evento dentro da janela.
 */
public final class WebhookSignature {

    public static final String HEADER = "x-tf-signature";

    private WebhookSignature() {}

    public static String sign(String secret, long timestamp, String body) {
        return "t=" + timestamp + ",v1=" + hmac(secret, timestamp + "." + body);
    }

    public static void verify(String secret, String header, String body, Duration tolerance, Instant now) {
        if (secret == null || secret.isBlank()) {
            throw new InvalidWebhookException("webhook não configurado");
        }
        if (header == null || header.isBlank()) {
            throw new InvalidWebhookException("assinatura ausente");
        }
        Long timestamp = null;
        String signature = null;
        for (String part : header.split(",")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2 && kv[0].equals("t")) {
                try {
                    timestamp = Long.parseLong(kv[1]);
                } catch (NumberFormatException e) {
                    throw new InvalidWebhookException("timestamp inválido");
                }
            } else if (kv.length == 2 && kv[0].equals("v1")) {
                signature = kv[1];
            }
        }
        if (timestamp == null || signature == null) {
            throw new InvalidWebhookException("assinatura malformada");
        }
        String expected = hmac(secret, timestamp + "." + body);
        // Comparação em tempo constante.
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signature.toLowerCase().getBytes(StandardCharsets.UTF_8))) {
            throw new InvalidWebhookException("assinatura inválida");
        }
        Duration age = Duration.between(Instant.ofEpochSecond(timestamp), now).abs();
        if (age.compareTo(tolerance) > 0) {
            throw new InvalidWebhookException("timestamp fora da tolerância");
        }
    }

    private static String hmac(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
