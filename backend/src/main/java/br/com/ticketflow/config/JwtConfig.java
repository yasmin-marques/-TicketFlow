package br.com.ticketflow.config;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

/** Assinatura (HS256) e validação dos access tokens JWT. */
@Configuration
public class JwtConfig {

    private static final Logger log = LoggerFactory.getLogger(JwtConfig.class);
    private static final int MIN_SECRET_BYTES = 32;

    @Bean
    SecretKey jwtSecretKey(AppProperties props) {
        String secret = props.security().jwt().secret();
        byte[] bytes;
        if (secret == null || secret.isBlank()) {
            // Sem segredo configurado: chave efêmera (tokens deixam de valer ao reiniciar). Só para desenvolvimento.
            bytes = new byte[64];
            new SecureRandom().nextBytes(bytes);
            log.warn("TF_JWT_SECRET não definido: usando chave JWT efêmera. Defina TF_JWT_SECRET em produção.");
        } else {
            bytes = secret.getBytes(StandardCharsets.UTF_8);
            if (bytes.length < MIN_SECRET_BYTES) {
                throw new IllegalStateException("TF_JWT_SECRET precisa ter ao menos 32 bytes");
            }
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey jwtSecretKey) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(jwtSecretKey));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey jwtSecretKey, AppProperties props) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtSecretKey).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> validator = new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(props.security().jwt().issuer()));
        decoder.setJwtValidator(validator);
        return decoder;
    }
}
