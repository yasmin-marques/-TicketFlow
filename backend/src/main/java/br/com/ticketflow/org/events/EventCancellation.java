package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.repository.OrderRepository;
import br.com.ticketflow.orders.service.FulfillmentService;
import br.com.ticketflow.orders.service.FulfillmentService.RefundPolicy;
import br.com.ticketflow.org.orders.OrgRefunds;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.realtime.SeatUpdateBus;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationStatus;
import br.com.ticketflow.sales.repository.ReservationRepository;
import br.com.ticketflow.sales.service.HoldService;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Desfaz as vendas de um evento cancelado, na transação do cancelamento (com o evento travado e os lotes já fora de
 * venda): libera reservas ativas, expira pedidos pendentes e reembolsa os pagos. A ordem importa — reservas primeiro
 * (um checkout em andamento termina antes, porque a reserva está travada por ele) e depois os pedidos.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class EventCancellation {

    public record Result(int released, int expired, int refunded) {}

    private final ReservationRepository reservations;
    private final OrderRepository orders;
    private final HoldService holds;
    private final FulfillmentService fulfillment;
    private final OrgRefunds refunds;
    private final SeatUpdateBus bus;

    public EventCancellation(ReservationRepository reservations, OrderRepository orders, HoldService holds,
                             FulfillmentService fulfillment, OrgRefunds refunds, SeatUpdateBus bus) {
        this.reservations = reservations;
        this.orders = orders;
        this.holds = holds;
        this.fulfillment = fulfillment;
        this.refunds = refunds;
        this.bus = bus;
    }

    public Result cancelSales(Event e) {
        List<SeatUpdate> updates = new ArrayList<>();
        List<Reservation> active = reservations.lockActiveForEvent(e.getId());
        active.forEach(r -> holds.release(r, ReservationStatus.RELEASED, updates));
        bus.publishAfterCommit(updates);

        int expired = 0;
        int refunded = 0;
        for (Order o : orders.lockByEventAndStatus(e.getId(), List.of(Order.Status.PENDING, Order.Status.PAID))) {
            if (o.getStatus() == Order.Status.PENDING) {
                fulfillment.markExpired(o);
                expired++;
            } else {
                refunds.refund(o, RefundPolicy.EVENT_CANCELLED);
                refunded++;
            }
        }
        return new Result(active.size(), expired, refunded);
    }
}
