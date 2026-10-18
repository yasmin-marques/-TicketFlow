package br.com.ticketflow.shared.port;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingNotificationSender implements NotificationSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingNotificationSender.class);

    @Override
    public void send(String recipientEmail, String template, Map<String, Object> data) {
        // Sem provedor configurado: não registra o e-mail (dado pessoal) nem o conteúdo.
        log.info("Notificação '{}' não enviada (nenhum provedor de e-mail configurado)", template);
    }
}
