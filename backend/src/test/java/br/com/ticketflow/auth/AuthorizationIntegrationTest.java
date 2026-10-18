package br.com.ticketflow.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.RoleRepository;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.support.AbstractIntegrationTest;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

/** A autorização é decidida no backend: as rotas protegidas respondem 401/403 independentemente do frontend. */
class AuthorizationIntegrationTest extends AbstractIntegrationTest {

    private static final String PASSWORD = "Senha123ok";

    @Autowired private UserRepository users;
    @Autowired private RoleRepository roles;
    @Autowired private PasswordEncoder encoder;
    @Autowired private JwtEncoder jwtEncoder;
    @Autowired private Clock clock;

    private String tokenFor(RoleName role) throws Exception {
        String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
        users.save(User.create("Teste " + role, email, encoder.encode(PASSWORD), roles.findByName(role).orElseThrow(), clock.instant()));
        String json = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.accessToken");
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    @Test
    void anonymousIsUnauthenticatedOnProtectedRoutes() throws Exception {
        for (String path : List.of("/api/me", "/api/org/events", "/api/admin/users", "/api/reservations")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        }
    }

    @Test
    void plainUserCannotReachOrganizerOrAdminAreas() throws Exception {
        String token = tokenFor(RoleName.USER);
        mvc.perform(get("/api/org/events").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isForbidden());
    }

    @Test
    void organizerPassesTheOrganizerGuardButNotTheAdminOne() throws Exception {
        String token = tokenFor(RoleName.ORGANIZER);
        // Passa pela autorização do filtro e pelo vínculo (organização própria criada no 1º acesso).
        mvc.perform(get("/api/org/events").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminPassesBothGuards() throws Exception {
        String token = tokenFor(RoleName.ADMIN);
        mvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(token))).andExpect(status().isNotFound());
        mvc.perform(get("/api/org/events").header(HttpHeaders.AUTHORIZATION, bearer(token))).andExpect(status().isOk());
    }

    @Test
    void expiredAccessTokenIsReportedSoTheClientCanRefresh() throws Exception {
        Instant past = clock.instant().minus(1, ChronoUnit.HOURS);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("ticketflow")
                .subject(UUID.randomUUID().toString())
                .issuedAt(past.minus(15, ChronoUnit.MINUTES))
                .expiresAt(past)
                .claim("roles", List.of("USER"))
                .build();
        String expired = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();

        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, bearer(expired)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
    }

    @Test
    void tokenSignedWithAnotherIssuerIsRejected() throws Exception {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("outro-emissor")
                .subject(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(now.plus(5, ChronoUnit.MINUTES))
                .claim("roles", List.of("ADMIN"))
                .build();
        String forged = jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();

        mvc.perform(get("/api/admin/users").header(HttpHeaders.AUTHORIZATION, bearer(forged)))
                .andExpect(status().isUnauthorized());
    }
}
