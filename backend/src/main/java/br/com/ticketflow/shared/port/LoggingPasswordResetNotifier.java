package br.com.ticketflow.shared.port;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Implementação padrão: sem provedor de e-mail, apenas registra (o link só aparece em DEBUG). */
@Component
public class LoggingPasswordResetNotifier implements PasswordResetNotifier {

    private static final Logger log = LoggerFactory.getLogger(LoggingPasswordResetNotifier.class);

    @Override
    public void sendPasswordReset(String email, String name, String resetLink) {
        // O link contém o token: nunca em INFO/produção.
        log.info("Redefinição de senha solicitada (e-mail não enviado: nenhum provedor configurado)");
        log.debug("Link de redefinição para {}: {}", email, resetLink);
    }
}
