package br.com.ticketflow.support;

import br.com.ticketflow.shared.port.NotificationSender;
import br.com.ticketflow.shared.port.PasswordResetNotifier;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
public class TestBeans {

    /** Guarda o último link de redefinição por e-mail (não há e-mail real nos testes). */
    public static class CapturingNotifier implements PasswordResetNotifier {
        private static final Pattern TOKEN = Pattern.compile("token=([^&]+)");
        private final Map<String, String> links = new ConcurrentHashMap<>();

        @Override
        public void sendPasswordReset(String email, String name, String resetLink) {
            links.put(email.toLowerCase(), resetLink);
        }

        public String lastLink(String email) {
            return links.get(email.toLowerCase());
        }

        public String lastToken(String email) {
            String link = lastLink(email);
            if (link == null) {
                return null;
            }
            Matcher m = TOKEN.matcher(link);
            return m.find() ? m.group(1) : null;
        }
    }

    /** Registra as notificações transacionais disparadas pelos consumidores Kafka. */
    public static class CapturingSender implements NotificationSender {
        public record Sent(String email, String template, Map<String, Object> data) {}

        private final List<Sent> sent = new CopyOnWriteArrayList<>();

        @Override
        public void send(String recipientEmail, String template, Map<String, Object> data) {
            sent.add(new Sent(recipientEmail, template, data));
        }

        public List<Sent> all() {
            return sent;
        }

        public long count(String email, String template) {
            return sent.stream().filter(s -> s.email().equalsIgnoreCase(email) && s.template().equals(template)).count();
        }
    }

    @Bean
    @Primary
    CapturingNotifier capturingNotifier() {
        return new CapturingNotifier();
    }

    @Bean
    @Primary
    CapturingSender capturingSender() {
        return new CapturingSender();
    }
}
