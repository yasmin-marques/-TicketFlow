package br.com.ticketflow.support;

import br.com.ticketflow.shared.port.PasswordResetNotifier;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
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

    @Bean
    @Primary
    CapturingNotifier capturingNotifier() {
        return new CapturingNotifier();
    }
}
