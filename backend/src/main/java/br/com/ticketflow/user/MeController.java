package br.com.ticketflow.user;

import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.common.ApiException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Conta")
public class MeController {

    private final UserRepository users;

    public MeController(UserRepository users) {
        this.users = users;
    }

    /** Perfil do usuário autenticado. (Edição, cartões e preferências entram na Parte 2.) */
    @GetMapping
    @Operation(summary = "Perfil do usuário autenticado")
    public ProfileResponse me(@AuthenticationPrincipal Jwt jwt) {
        return users.findById(UUID.fromString(jwt.getSubject()))
                .filter(u -> u.isEnabled())
                .map(ProfileResponse::from)
                .orElseThrow(() -> ApiException.unauthorized("UNAUTHENTICATED", "Faça login para continuar"));
    }
}
