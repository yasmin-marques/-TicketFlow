package br.com.ticketflow.security;

import br.com.ticketflow.common.ApiError;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * Respostas 401/403 no formato {@link ApiError}. Distingue {@code TOKEN_EXPIRED} (o frontend tenta renovar a
 * sessão) de {@code UNAUTHENTICATED} (token ausente ou inválido).
 */
@Component
public class SecurityErrorHandlers implements AuthenticationEntryPoint, AccessDeniedHandler {

    private final ObjectMapper mapper;

    public SecurityErrorHandlers(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex) throws IOException {
        boolean expired = ex instanceof InvalidBearerTokenException && String.valueOf(ex.getMessage()).toLowerCase().contains("expired");
        boolean hadToken = request.getHeader(HttpHeaders.AUTHORIZATION) != null;
        ApiError body = expired
                ? new ApiError(401, "TOKEN_EXPIRED", "Sessão expirada")
                : new ApiError(401, "UNAUTHENTICATED", hadToken ? "Token inválido" : "Faça login para continuar");
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer" + (expired ? " error=\"invalid_token\"" : ""));
        write(response, body);
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) throws IOException {
        write(response, new ApiError(403, "FORBIDDEN", "Você não tem permissão para acessar este recurso"));
    }

    private void write(HttpServletResponse response, ApiError body) throws IOException {
        response.setStatus(body.status());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        mapper.writeValue(response.getOutputStream(), body);
    }
}
