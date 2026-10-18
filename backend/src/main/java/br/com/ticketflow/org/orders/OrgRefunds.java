package br.com.ticketflow.org.orders;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.service.FulfillmentService;
import br.com.ticketflow.orders.service.FulfillmentService.RefundPolicy;
import br.com.ticketflow.payment.PaymentProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reembolso iniciado pelo organizador (um pedido, ou todos no cancelamento do evento). Valida o estado local ANTES de
 * chamar o gateway; o gateway recebe uma chave de idempotência estável por pedido ({@code refund-<id>}), então repetir
 * depois de uma falha nunca estorna duas vezes.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class OrgRefunds {

    private final PaymentProvider provider;
    private final FulfillmentService fulfillment;

    public OrgRefunds(PaymentProvider provider, FulfillmentService fulfillment) {
        this.provider = provider;
        this.fulfillment = fulfillment;
    }

    /** {@code order} já travado pelo chamador e no estado {@code PAID}. */
    public void refund(Order order, RefundPolicy policy) {
        if (order.getStatus() != Order.Status.PAID) {
            throw ApiException.conflict("INVALID_STATE", "Só pedidos pagos podem ser reembolsados");
        }
        // Estado local primeiro (lança 409 se houver ingresso usado); a transação só confirma se o gateway estornar.
        fulfillment.markRefunded(order, policy);
        if (order.getProviderRef() != null
                && !provider.refund(order.getProviderRef(), order.getTotalCents(), "refund-" + order.getId()).success()) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "O gateway não confirmou o reembolso. Tente novamente.");
        }
    }
}
