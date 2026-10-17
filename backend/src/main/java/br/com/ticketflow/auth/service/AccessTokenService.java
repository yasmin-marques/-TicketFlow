package br.com.ticketflow.auth.service;

import br.com.ticketflow.auth.domain.Role;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.config.AppProperties;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/** Emite access tokens JWT de curta duração (o refresh token é opaco e fica no banco). */
@Service
public class AccessTokenService {

    public record IssuedAccessToken(String token, Instant expiresAt) {}

    private final JwtEncoder encoder;
    private final AppProperties.Jwt config;
    private final Clock clock;

    public AccessTokenService(JwtEncoder encoder, AppProperties props, Clock clock) {
        this.encoder = encoder;
        this.config = props.security().jwt();
        this.clock = clock;
    }

    public IssuedAccessToken issue(User user) {
        Instant now = clock.instant();
        Instant expiresAt = now.plus(config.accessTtl());
        List<String> roles = user.getRoles().stream().map(Role::getName).map(Enum::name).sorted().toList();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(config.issuer())
                .subject(user.getId().toString())
                .id(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(expiresAt)
                .claim("roles", roles)
                .claim("name", user.getName())
                .claim("email", user.getEmail())
                .build();
        String token = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new IssuedAccessToken(token, expiresAt);
    }
}
