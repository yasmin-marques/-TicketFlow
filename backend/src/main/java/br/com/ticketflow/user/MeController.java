package br.com.ticketflow.user;

import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.orders.service.BuyerValidator;
import br.com.ticketflow.security.CurrentUser;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Conta")
public class MeController {

    private static final DateTimeFormatter BR_DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu");

    public record NotificationsInput(Boolean orderUpdates, Boolean eventReminders, Boolean marketing) {}

    public record UpdateProfileRequest(@Size(max = 120) String name, @Size(max = 20) String phone, @Size(max = 14) String cpf,
                                       @Size(max = 10) String birthDate, NotificationsInput notifications) {}

    private final UserRepository users;
    private final Clock clock;
    private final ZoneId zone;

    public MeController(UserRepository users, Clock clock, AppProperties props) {
        this.users = users;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    @GetMapping
    @Operation(summary = "Perfil do usuário autenticado")
    public ProfileResponse me(@AuthenticationPrincipal Jwt jwt) {
        return ProfileResponse.from(current(jwt));
    }

    /** Edição parcial do perfil. O e-mail é somente leitura. */
    @PatchMapping
    @Transactional
    @Operation(summary = "Atualiza nome, telefone, CPF, nascimento e preferências de notificação")
    public ProfileResponse update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfileRequest in) {
        User u = current(jwt);
        Map<String, String> errors = new LinkedHashMap<>();
        if (in.name() != null && in.name().trim().length() < 2) {
            errors.put("name", "Nome inválido");
        }
        String phone = in.phone() == null ? null : BuyerValidator.digits(in.phone());
        if (phone != null && !phone.isEmpty() && (phone.length() < 10 || phone.length() > 11)) {
            errors.put("phone", "Telefone inválido");
        }
        String cpf = in.cpf() == null ? null : BuyerValidator.digits(in.cpf());
        if (cpf != null && !cpf.isEmpty() && !BuyerValidator.validCpf(cpf)) {
            errors.put("cpf", "CPF inválido");
        }
        LocalDate today = LocalDate.ofInstant(clock.instant(), zone);
        if (in.birthDate() != null && !in.birthDate().isBlank() && !BuyerValidator.validBirthDate(in.birthDate(), today)) {
            errors.put("birthDate", "Data inválida");
        }
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", errors.values().iterator().next()).with("errors", errors);
        }
        if (in.name() != null) {
            u.setName(in.name().trim());
        }
        if (in.phone() != null) {
            u.setPhone(in.phone().isBlank() ? null : in.phone().trim());
        }
        if (in.cpf() != null) {
            u.setCpf(in.cpf().isBlank() ? null : in.cpf().trim());
        }
        if (in.birthDate() != null) {
            u.setBirthDate(in.birthDate().isBlank() ? null : LocalDate.parse(in.birthDate(), BR_DATE));
        }
        if (in.notifications() != null) {
            if (in.notifications().orderUpdates() != null) {
                u.setNotifyOrderUpdates(in.notifications().orderUpdates());
            }
            if (in.notifications().eventReminders() != null) {
                u.setNotifyEventReminders(in.notifications().eventReminders());
            }
            if (in.notifications().marketing() != null) {
                u.setNotifyMarketing(in.notifications().marketing());
            }
        }
        u.touch(clock.instant());
        return ProfileResponse.from(users.save(u));
    }

    /**
     * Cartões salvos dependem do cofre (vault) do gateway de pagamento, que ainda não está integrado: a lista é sempre
     * vazia e o cadastro responde {@code 503}. Número/CVV nunca são aceitos pelo servidor.
     */
    @GetMapping("/cards")
    public List<Object> cards(@AuthenticationPrincipal Jwt jwt) {
        current(jwt);
        return List.of();
    }

    @PostMapping("/cards")
    public void addCard(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) JsonNode body) {
        current(jwt);
        if (body != null && (body.hasNonNull("number") || body.hasNonNull("cvv"))) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CARD_DATA_NOT_ALLOWED",
                    "O servidor não recebe número nem CVV de cartão. Use o token do gateway.");
        }
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "CARD_VAULT_UNAVAILABLE", "Salvar cartões ainda não está disponível.");
    }

    @DeleteMapping("/cards/{id}")
    public void removeCard(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        current(jwt);
        throw ApiException.notFound("Cartão não encontrado");
    }

    private User current(Jwt jwt) {
        return users.findById(CurrentUser.id(jwt))
                .filter(User::isEnabled)
                .orElseThrow(() -> ApiException.unauthorized("UNAUTHENTICATED", "Faça login para continuar"));
    }
}
