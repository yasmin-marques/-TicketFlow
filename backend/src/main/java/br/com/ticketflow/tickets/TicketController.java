package br.com.ticketflow.tickets;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.web.dto.OrderDtos.TicketDto;
import br.com.ticketflow.orders.web.dto.OrderDtos.TransferRequest;
import br.com.ticketflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Ingressos do usuário autenticado. Ingressos de outras pessoas respondem 404 (não revelam existência). */
@RestController
@RequestMapping("/api/tickets")
@Tag(name = "Ingressos")
public class TicketController {

    private final TicketService tickets;

    public TicketController(TicketService tickets) {
        this.tickets = tickets;
    }

    @GetMapping
    public List<TicketDto> list(@AuthenticationPrincipal Jwt jwt) {
        return tickets.list(CurrentUser.id(jwt));
    }

    @GetMapping("/{id}")
    public TicketDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return tickets.get(CurrentUser.id(jwt), uuid(id));
    }

    @Operation(summary = "Transfere o ingresso para outro e-mail (o QR atual deixa de valer)")
    @PostMapping("/{id}/transfer")
    public Map<String, Object> transfer(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @Valid @RequestBody TransferRequest body) {
        return tickets.transfer(CurrentUser.id(jwt), uuid(id), body.email());
    }

    private static UUID uuid(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound("Ingresso não encontrado");
        }
    }
}
