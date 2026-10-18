package br.com.ticketflow.shared.port;

import java.util.Map;

/**
 * Envio de notificações transacionais (e-mail/push). Ainda não há provedor: a implementação padrão só registra em log,
 * sem dados pessoais. Trocar por SMTP/SES/SendGrid sem tocar nos consumidores Kafka.
 */
public interface NotificationSender {

    void send(String recipientEmail, String template, Map<String, Object> data);
}
