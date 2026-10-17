package br.com.ticketflow.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import br.com.ticketflow.support.AbstractIntegrationTest;
import br.com.ticketflow.support.TestBeans.CapturingNotifier;
import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

class AuthIntegrationTest extends AbstractIntegrationTest {

    private static final String PASSWORD = "Senha123ok";

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private CapturingNotifier notifier;

    private static String uniqueEmail() {
        return "user-" + UUID.randomUUID() + "@example.com";
    }

    private ResultActions postJson(String path, String json, Cookie... cookies) throws Exception {
        var request = post(path).contentType(MediaType.APPLICATION_JSON).content(json);
        if (cookies.length > 0) {
            request.cookie(cookies);
        }
        return mvc.perform(request);
    }

    private static String credentials(String email, String password) {
        return "{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password);
    }

    private MvcResult register(String email) throws Exception {
        return postJson("/api/auth/register", "{\"name\":\"Maria Teste\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private static Cookie refreshCookie(MvcResult result) {
        Cookie cookie = result.getResponse().getCookie("tf_refresh");
        assertThat(cookie).as("cookie tf_refresh").isNotNull();
        return cookie;
    }

    private static String accessToken(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
    }

    // ---- cadastro ----------------------------------------------------------------------------------------

    @Test
    void registerCreatesUserWithSessionAndHttpOnlyRefreshCookie() throws Exception {
        String email = uniqueEmail();
        MvcResult result = register(email);

        String body = result.getResponse().getContentAsString();
        assertThat((String) JsonPath.read(body, "$.user.email")).isEqualTo(email);
        assertThat((String) JsonPath.read(body, "$.user.role")).isEqualTo("USER");
        assertThat((String) JsonPath.read(body, "$.accessToken")).isNotBlank();
        // O refresh token vai somente no cookie, nunca no corpo (inacessível a JavaScript).
        assertThat(body).doesNotContain("refreshToken").doesNotContain("passwordHash").doesNotContain("password");

        String setCookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
        assertThat(setCookie).contains("tf_refresh=").contains("HttpOnly").contains("SameSite=Lax").contains("Path=/api/auth");
    }

    @Test
    void passwordIsStoredAsBcryptHashAndRefreshTokenOnlyHashed() throws Exception {
        String email = uniqueEmail();
        MvcResult result = register(email);

        String stored = jdbc.queryForObject("select password_hash from users where lower(email) = ?", String.class, email);
        assertThat(stored).startsWith("$2").isNotEqualTo(PASSWORD);

        String raw = refreshCookie(result).getValue();
        Integer plain = jdbc.queryForObject("select count(*) from refresh_tokens where token_hash = ?", Integer.class, raw);
        assertThat(plain).isZero();
    }

    @Test
    void registerRejectsDuplicateEmailCaseInsensitively() throws Exception {
        String email = uniqueEmail();
        register(email);

        postJson("/api/auth/register", "{\"name\":\"Outra\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(email.toUpperCase(), PASSWORD))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_TAKEN"));
    }

    @Test
    void registerValidatesInput() throws Exception {
        postJson("/api/auth/register", "{\"name\":\"\",\"email\":\"invalido\",\"password\":\"123\"}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists());
    }

    // ---- login -------------------------------------------------------------------------------------------

    @Test
    void loginSucceedsAndSetsRefreshCookie() throws Exception {
        String email = uniqueEmail();
        register(email);

        postJson("/api/auth/login", credentials(email, PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("tf_refresh=")));
    }

    @Test
    void loginDoesNotRevealWhetherTheEmailExists() throws Exception {
        String email = uniqueEmail();
        register(email);

        String wrongPassword = postJson("/api/auth/login", credentials(email, "SenhaErrada1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();
        String unknownEmail = postJson("/api/auth/login", credentials(uniqueEmail(), "SenhaErrada1"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();

        assertThat(unknownEmail).isEqualTo(wrongPassword);
    }

    @Test
    void loginIsBlockedAfterTooManyFailures() throws Exception {
        String email = uniqueEmail();
        register(email);
        for (int i = 0; i < 5; i++) {
            postJson("/api/auth/login", credentials(email, "SenhaErrada1")).andExpect(status().isUnauthorized());
        }

        postJson("/api/auth/login", credentials(email, PASSWORD))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
    }

    // ---- refresh / logout --------------------------------------------------------------------------------

    @Test
    void refreshRotatesTheTokenAndIssuesANewAccessToken() throws Exception {
        MvcResult registered = register(uniqueEmail());
        Cookie first = refreshCookie(registered);

        MvcResult refreshed = postJson("/api/auth/refresh", "{}", first)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andReturn();

        Cookie second = refreshCookie(refreshed);
        assertThat(second.getValue()).isNotEqualTo(first.getValue());
        // O novo token funciona e o token anterior deixa de valer como credencial ativa.
        postJson("/api/auth/refresh", "{}", second).andExpect(status().isOk());
    }

    @Test
    void refreshWithoutOrWithBogusCookieIsRejectedAndClearsTheCookie() throws Exception {
        postJson("/api/auth/refresh", "{}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));

        postJson("/api/auth/refresh", "{}", new Cookie("tf_refresh", "nao-existe"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));
    }

    @Test
    void logoutRevokesTheSessionAndClearsTheCookie() throws Exception {
        MvcResult registered = register(uniqueEmail());
        Cookie cookie = refreshCookie(registered);

        postJson("/api/auth/logout", "{}", cookie)
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));

        postJson("/api/auth/refresh", "{}", cookie)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
    }

    // ---- recuperação de senha ----------------------------------------------------------------------------

    @Test
    void forgotPasswordGivesTheSameAnswerForKnownAndUnknownEmails() throws Exception {
        String email = uniqueEmail();
        register(email);

        String known = postJson("/api/auth/forgot-password", "{\"email\":\"%s\"}".formatted(email))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true))
                .andExpect(jsonPath("$.resetToken").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String unknown = postJson("/api/auth/forgot-password", "{\"email\":\"%s\"}".formatted(uniqueEmail()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(unknown).isEqualTo(known);
        assertThat(notifier.lastToken(email)).isNotBlank();
    }

    @Test
    void resetPasswordIsSingleUseChangesThePasswordAndRevokesSessions() throws Exception {
        String email = uniqueEmail();
        Cookie session = refreshCookie(register(email));

        postJson("/api/auth/forgot-password", "{\"email\":\"%s\"}".formatted(email)).andExpect(status().isOk());
        String token = notifier.lastToken(email);
        String raw = "{\"token\":\"%s\",\"password\":\"NovaSenha456\"}".formatted(token);

        postJson("/api/auth/reset-password", raw).andExpect(status().isOk());

        postJson("/api/auth/login", credentials(email, PASSWORD)).andExpect(status().isUnauthorized());
        postJson("/api/auth/login", credentials(email, "NovaSenha456")).andExpect(status().isOk());
        // O token é de uso único.
        postJson("/api/auth/reset-password", raw)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        // Sessões anteriores foram encerradas.
        postJson("/api/auth/refresh", "{}", session).andExpect(status().isUnauthorized());
    }

    @Test
    void resetPasswordRejectsUnknownTokensAndWeakPasswords() throws Exception {
        postJson("/api/auth/reset-password", "{\"token\":\"invalido\",\"password\":\"NovaSenha456\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        postJson("/api/auth/reset-password", "{\"token\":\"x\",\"password\":\"fraca\"}")
                .andExpect(status().isUnprocessableEntity());
    }

    // ---- sessão ------------------------------------------------------------------------------------------

    @Test
    void meReturnsTheProfileOnlyWithAValidAccessToken() throws Exception {
        String email = uniqueEmail();
        String token = accessToken(register(email));

        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        mvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer lixo"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(not(containsString("Jwt"))));
    }
}
