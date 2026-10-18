package br.com.ticketflow.payment;

import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.service.OrderMapper;
import br.com.ticketflow.orders.web.dto.OrderDtos.OrderDto;
import br.com.ticketflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.UUID;
import br.com.ticketflow.common.ApiException;

/**
 * *** SOMENTE DEV/TEST *** — simula a confirmação do webhook para o dono do pedido (equivalente a
 * {@code POST /dev/orders/{id}/simulate-payment} do mock do frontend). Não existe nos demais perfis.
 */
@RestController
@RequestMapping("/api/dev/orders")
@Profile({"dev", "test"})
@Hidden
public class DevPaymentController {

    private final PaymentConfirmationService confirmation;
    private final OrderMapper mapper;
    private final TransactionTemplate tx;

    public DevPaymentController(PaymentConfirmationService confirmation, OrderMapper mapper, TransactionTemplate tx) {
        this.confirmation = confirmation;
        this.mapper = mapper;
        this.tx = tx;
    }

    @PostMapping("/{id}/simulate-payment")
    public OrderDto simulate(@PathVariable UUID id, @AuthenticationPrincipal Jwt jwt) {
        UUID userId = CurrentUser.id(jwt);
        return tx.execute(status -> {
            Order order = confirmation.lockOwned(id, userId);
            if (order.getStatus() != Order.Status.PENDING) {
                throw new ApiException(org.springframework.http.HttpStatus.CONFLICT, "INVALID_STATE", "O pedido não está pendente");
            }
            confirmation.confirm(order);
            return mapper.toDto(order);
        });
    }
}
