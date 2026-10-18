package br.com.ticketflow.orders.web;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.idempotency.IdempotencyService;
import br.com.ticketflow.orders.service.OrderService;
import br.com.ticketflow.orders.web.dto.OrderDtos.CreateOrderRequest;
import br.com.ticketflow.orders.web.dto.OrderDtos.OrderDto;
import br.com.ticketflow.security.CurrentUser;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Pedidos do usuário autenticado. O cartão trafega como TOKEN do gateway; dados brutos são recusados. */
@RestController
@RequestMapping("/api/orders")
@Tag(name = "Pedidos")
public class OrderController {

    private final OrderService orders;
    private final IdempotencyService idempotency;

    public OrderController(OrderService orders, IdempotencyService idempotency) {
        this.orders = orders;
        this.idempotency = idempotency;
    }

    @Operation(summary = "Cria o pedido a partir da reserva (Idempotency-Key obrigatório)",
            description = "201 paid | 201 pending (Pix/boleto) | 402 PAYMENT_DECLINED (a reserva continua ativa) | 409 ALREADY_COMPLETED | 410 RESERVATION_EXPIRED")
    @PostMapping
    public ResponseEntity<JsonNode> create(@AuthenticationPrincipal Jwt jwt,
                                           @RequestHeader(name = "Idempotency-Key", required = false) String key,
                                           @Valid @RequestBody CreateOrderRequest body, HttpServletRequest request) {
        // ANTES de qualquer registro (inclusive o hash da idempotência): dados brutos de cartão nunca passam daqui.
        if (body.hasRawCardData()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CARD_DATA_NOT_ALLOWED",
                    "Não envie número nem CVV do cartão. Use o token gerado pelo gateway de pagamento.");
        }
        UUID userId = CurrentUser.id(jwt);
        return idempotency.execute(userId, idempotency.requireKey(key), "POST", request.getRequestURI(), body, HttpStatus.CREATED,
                () -> orders.create(userId, body));
    }

    @GetMapping
    public List<OrderDto> list(@AuthenticationPrincipal Jwt jwt) {
        return orders.list(CurrentUser.id(jwt));
    }

    @GetMapping("/{id}")
    public OrderDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return orders.get(CurrentUser.id(jwt), uuid(id));
    }

    @Operation(summary = "Cancela e reembolsa (até 7 dias após a compra e mais de 48 h antes do evento)")
    @PostMapping("/{id}/cancel")
    public OrderDto cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return orders.cancel(CurrentUser.id(jwt), uuid(id));
    }

    private static UUID uuid(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound("Pedido não encontrado");
        }
    }
}
