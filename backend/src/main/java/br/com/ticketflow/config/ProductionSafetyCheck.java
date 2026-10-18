package br.com.ticketflow.config;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * Perfil {@code prod}: recusa subir com configuração insegura (falha rápida, em vez de rodar exposto). Checa segredos,
 * cookie seguro, CORS restrito, ausência dos perfis de desenvolvimento (que habilitam o pagamento sandbox e o endpoint
 * {@code /api/dev/**}) e da semente de demonstração.
 */
@Component
@Profile("prod")
public class ProductionSafetyCheck implements InitializingBean {

    private static final Logger log = LoggerFactory.getLogger(ProductionSafetyCheck.class);

    private final AppProperties props;
    private final Environment env;

    public ProductionSafetyCheck(AppProperties props, Environment env) {
        this.props = props;
        this.env = env;
    }

    @Override
    public void afterPropertiesSet() {
        List<String> problems = problems(props, Arrays.asList(env.getActiveProfiles()), env.getProperty("spring.datasource.password", ""));
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Configuração insegura para produção:\n - " + String.join("\n - ", problems));
        }
        if (blank(props.payments().webhookSecret())) {
            log.warn("TF_WEBHOOK_SECRET vazio: todos os webhooks de pagamento serão recusados.");
        }
        log.info("Verificação de produção concluída.");
    }

    static List<String> problems(AppProperties p, List<String> profiles, String dbPassword) {
        List<String> out = new ArrayList<>();
        if (profiles.contains("dev") || profiles.contains("test")) {
            out.add("os perfis dev/test não podem estar ativos junto com prod (habilitam pagamento sandbox e /api/dev/**)");
        }
        if (bytes(p.security().jwt().secret()) < 32) {
            out.add("TF_JWT_SECRET precisa ter ao menos 32 bytes");
        }
        if (bytes(p.tickets().qrSecret()) < 32) {
            out.add("TF_QR_SECRET precisa ter ao menos 32 bytes");
        }
        if (!p.security().refresh().cookie().secure()) {
            out.add("TF_COOKIE_SECURE precisa ser true (HTTPS)");
        }
        if (p.security().passwordReset().exposeTokenInResponse() || p.security().refresh().exposeInBody()) {
            out.add("tokens não podem ser expostos no corpo das respostas em produção");
        }
        if (p.seed().enabled()) {
            out.add("a semente de demonstração (tf.seed.enabled) precisa estar desligada");
        }
        for (String origin : p.cors().allowedOrigins()) {
            if (origin.contains("*") || !origin.startsWith("https://") || origin.contains("localhost") || origin.contains("127.0.0.1")) {
                out.add("TF_CORS_ORIGINS deve listar só origens HTTPS explícitas (encontrado: " + origin + ")");
            }
        }
        if (blank(dbPassword)) {
            out.add("TF_DB_PASSWORD não definido");
        }
        if (!p.rateLimit().enabled()) {
            out.add("o limite de requisições (tf.rate-limit.enabled) precisa estar ligado");
        }
        return out;
    }

    private static int bytes(String s) {
        return s == null ? 0 : s.getBytes(StandardCharsets.UTF_8).length;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
