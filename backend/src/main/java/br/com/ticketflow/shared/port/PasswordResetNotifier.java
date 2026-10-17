package br.com.ticketflow.shared.port;

/**
 * Entrega do link de redefinição de senha ao usuário. Ainda não há provedor de e-mail: a implementação padrão
 * só registra em log (nível DEBUG, para desenvolvimento). Trocar por SMTP/SES/SendGrid em produção.
 */
public interface PasswordResetNotifier {

    void sendPasswordReset(String email, String name, String resetLink);
}
