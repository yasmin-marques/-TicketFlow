package br.com.ticketflow.security;

import br.com.ticketflow.common.ApiException;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/** Identidade do usuário autenticado, sempre derivada do JWT validado (nunca de parâmetros do cliente). */
public final class CurrentUser {

    private CurrentUser() {}

    public static UUID id(Jwt jwt) {
        if (jwt == null) {
            throw ApiException.unauthorized("UNAUTHENTICATED", "Faça login para continuar");
        }
        return UUID.fromString(jwt.getSubject());
    }

    public static UUID idOrNull(Jwt jwt) {
        return jwt == null ? null : UUID.fromString(jwt.getSubject());
    }
}
