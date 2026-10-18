package br.com.ticketflow.payment;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.repository.OrderRepository;
import br.com.ticketflow.orders.service.FulfillmentService;
import br.com.ticketflow.outbox.OutboxService;
import br.com.ticketflow.payment.PaymentProvider.WebhookEvent;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Efeitos de um evento de pagamento (webhook). Seguro contra repetição de três formas: assinatura+timestamp
 * (rejeita replays antigos), {@code payment_webhook_events} (um {@code event_id} só é processado uma vez) e o
 * próprio estado do pedido (confirmar um pedido já pago não faz nada).
 */
@Service
public class PaymentConfirmationService {

    public enum Outcome { PROCESSED, DUPLICATE, IGNORED }

    private static final Logger log = LoggerFactory.getLogger(PaymentConfirmationService.class);

    private final OrderRepository orders;
    private final FulfillmentService fulfillment;
    private final PaymentProvider provider;
    private final OutboxService outbox;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public PaymentConfirmationService(OrderRepository orders, FulfillmentService fulfillment, PaymentProvider provider,
                                      OutboxService outbox, JdbcTemplate jdbc, Clock clock) {
        this.orders = orders;
        this.fulfillment = fulfillment;
        this.provider = provider;
        this.outbox = outbox;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    /** Processa um evento já autenticado. Dedupe e efeitos na MESMA transação: se algo falhar, o evento pode ser reenviado. */
    @Transactional
    public Outcome handle(WebhookEvent event) {
        int inserted = jdbc.update("""
                insert into payment_webhook_events (provider, event_id, event_type, received_at) values (?, ?, ?, ?)
                on conflict do nothing
                """, provider.name(), event.id(), event.type(), Timestamp.from(clock.instant()));
        if (inserted == 0) {
            return Outcome.DUPLICATE;
        }
        Order order = orders.lockByProviderRef(provider.name(), event.providerRef()).orElse(null);
        if (order == null) {
            log.warn("Webhook {} para cobrança desconhecida (ignorado)", event.id());
            return Outcome.IGNORED;
        }
        switch (event.type()) {
            case "payment.confirmed" -> confirm(order);
            case "payment.failed" -> fulfillment.markExpired(order);
            default -> {
                return Outcome.IGNORED;
            }
        }
        return Outcome.PROCESSED;
    }

    /** Confirmação de um pedido já travado (usada também pelo endpoint de simulação em dev). */
    @Transactional
    public void confirm(Order order) {
        Instant now = clock.instant();
        switch (order.getStatus()) {
            case PAID, REFUNDED -> { /* já tratado: idempotente */ }
            case PENDING -> {
                if (order.getExpiresAt() != null && !order.getExpiresAt().isAfter(now)) {
                    // Pagamento chegou depois do prazo: o estoque pode já ter sido revendido. Encerra o pedido e estorna.
                    fulfillment.markExpired(order);
                    refundLate(order);
                } else {
                    fulfillment.markPaid(order);
                }
            }
            case EXPIRED -> refundLate(order);
        }
    }

    private void refundLate(Order order) {
        provider.refund(order.getProviderRef(), order.getTotalCents(), "late-" + order.getId());
        outbox.add("order", order.getId(), "payment.late-refunded", Map.of(
                "orderId", order.getId().toString(), "userId", order.getUserId().toString()));
        log.warn("Pagamento tardio do pedido {} estornado", order.getCode());
    }

    /** Bloqueia o pedido para o dono (404 para qualquer outro) — usado pelo endpoint de simulação. */
    @Transactional
    public Order lockOwned(UUID orderId, UUID userId) {
        orders.findByIdAndUserId(orderId, userId).orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        return orders.lockById(orderId).orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
    }
}
