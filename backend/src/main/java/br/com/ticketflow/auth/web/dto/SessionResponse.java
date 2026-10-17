package br.com.ticketflow.auth.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Sessão devolvida por login/cadastro/refresh. Compatível com o tipo {@code Session} do frontend.
 * {@code refreshToken} só aparece quando a API está configurada para expô-lo no corpo.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SessionResponse(AuthUserDto user, String accessToken, String refreshToken, long accessExpiresAt) {

    public record AuthUserDto(String id, String name, String email, String role) {}
}
