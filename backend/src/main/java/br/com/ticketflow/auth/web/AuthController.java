package br.com.ticketflow.auth.web;

import br.com.ticketflow.auth.service.AuthService;
import br.com.ticketflow.auth.service.AuthService.AuthResult;
import br.com.ticketflow.auth.service.ClientInfo;
import br.com.ticketflow.auth.service.PasswordResetService;
import br.com.ticketflow.auth.web.dto.ForgotPasswordRequest;
import br.com.ticketflow.auth.web.dto.LoginRequest;
import br.com.ticketflow.auth.web.dto.RefreshRequest;
import br.com.ticketflow.auth.web.dto.RegisterRequest;
import br.com.ticketflow.auth.web.dto.ResetPasswordRequest;
import br.com.ticketflow.auth.web.dto.SessionResponse;
import br.com.ticketflow.common.ApiError;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.time.Clock;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Autenticação", description = "Cadastro, login, renovação de sessão e recuperação de senha")
public class AuthController {

    private final AuthService auth;
    private final PasswordResetService passwordReset;
    private final RefreshCookies cookies;
    private final AppProperties.Refresh refreshConfig;
    private final AppProperties.PasswordReset resetConfig;
    private final Clock clock;

    public AuthController(
            AuthService auth,
            PasswordResetService passwordReset,
            RefreshCookies cookies,
            AppProperties props,
            Clock clock) {
        this.auth = auth;
        this.passwordReset = passwordReset;
        this.cookies = cookies;
        this.refreshConfig = props.security().refresh();
        this.resetConfig = props.security().passwordReset();
        this.clock = clock;
    }

    @PostMapping("/register")
    @Operation(summary = "Cria uma conta (papel USER) e inicia a sessão")
    public ResponseEntity<SessionResponse> register(@Valid @RequestBody RegisterRequest body, HttpServletRequest request) {
        AuthResult result = auth.register(body.name(), body.email(), body.password(), client(request));
        return session(HttpStatus.CREATED, result);
    }

    @PostMapping("/login")
    @Operation(summary = "Autentica com e-mail e senha")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        return session(HttpStatus.OK, auth.login(body.email(), body.password(), client(request)));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Renova a sessão (rotaciona o refresh token). O token vem do cookie HttpOnly.")
    public ResponseEntity<?> refresh(@Valid @RequestBody(required = false) RefreshRequest body, HttpServletRequest request) {
        String raw = cookies.read(request).orElseGet(() -> refreshConfig.exposeInBody() && body != null ? body.refreshToken() : null);
        try {
            return session(HttpStatus.OK, auth.refresh(raw, client(request)));
        } catch (ApiException e) {
            // Token inválido: limpa o cookie para o navegador não insistir.
            ApiError error = new ApiError(e.status().value(), e.code(), e.getMessage());
            return ResponseEntity.status(e.status()).header(HttpHeaders.SET_COOKIE, cookies.clear().toString()).body(error);
        }
    }

    @PostMapping("/logout")
    @Operation(summary = "Encerra a sessão: revoga o refresh token e limpa o cookie")
    public ResponseEntity<Map<String, Object>> logout(HttpServletRequest request) {
        cookies.read(request).ifPresent(auth::logout);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookies.clear().toString())
                .body(Map.of("ok", true));
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Solicita a redefinição de senha. A resposta é idêntica exista ou não o e-mail.")
    public Map<String, Object> forgotPassword(@Valid @RequestBody ForgotPasswordRequest body) {
        var token = passwordReset.request(body.email());
        // Só em desenvolvimento: permite abrir o link sem provedor de e-mail. Nunca em produção.
        if (resetConfig.exposeTokenInResponse() && token.isPresent()) {
            return Map.of("accepted", true, "resetToken", token.get());
        }
        return Map.of("accepted", true);
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Define a nova senha com o token recebido (uso único)")
    public Map<String, Object> resetPassword(@Valid @RequestBody ResetPasswordRequest body) {
        passwordReset.reset(body.token(), body.password());
        return Map.of("ok", true);
    }

    private ResponseEntity<SessionResponse> session(HttpStatus status, AuthResult result) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookies.create(result.refreshToken(), result.refreshExpiresAt(), clock.instant()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(result.session());
    }

    private static ClientInfo client(HttpServletRequest request) {
        return new ClientInfo(request.getHeader(HttpHeaders.USER_AGENT), request.getRemoteAddr());
    }
}
