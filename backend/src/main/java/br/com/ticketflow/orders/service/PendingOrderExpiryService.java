package br.com.ticketflow.orders.service;

import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.repository.OrderRepository;
import java.time.Clock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** Pedidos Pix/boleto não pagos no prazo viram {@code expired} e devolvem estoque e assentos. */
@Service
public class PendingOrderExpiryService {

    private static final Logger log = LoggerFactory.getLogger(PendingOrderExpiryService.class);
    private static final int BATCH = 50;

    private final OrderRepository orders;
    private final FulfillmentService fulfillment;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final boolean enabled;

    public PendingOrderExpiryService(OrderRepository orders, FulfillmentService fulfillment, TransactionTemplate tx, Clock clock, AppProperties props) {
        this.orders = orders;
        this.fulfillment = fulfillment;
        this.tx = tx;
        this.clock = clock;
        this.enabled = props.jobs().expiryEnabled();
    }

    @Scheduled(fixedDelayString = "${tf.sales.pending-expiry-poll-ms:30000}")
    public void poll() {
        if (enabled) {
            expireDue();
        }
    }

    public int expireDue() {
        int total = 0;
        int n;
        do {
            Integer done = tx.execute(s -> {
                var due = orders.lockDue(Order.Status.PENDING, clock.instant(), PageRequest.of(0, BATCH));
                due.forEach(fulfillment::markExpired);
                return due.size();
            });
            n = done == null ? 0 : done;
            total += n;
        } while (n == BATCH);
        if (total > 0) {
            log.info("{} pedido(s) pendente(s) expirado(s)", total);
        }
        return total;
    }
}
