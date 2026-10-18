package br.com.ticketflow.orders.service;

import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.outbox.OutboxService;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.realtime.SeatUpdateBus;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationItem;
import br.com.ticketflow.sales.domain.SeatStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.service.HoldService;
import br.com.ticketflow.sales.service.LotStock;
import br.com.ticketflow.tickets.Ticket;
import br.com.ticketflow.tickets.TicketRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transições de estado do pedido que mexem em estoque e ingressos. Todas rodam na transação do chamador (com o
 * pedido já travado) e gravam os eventos de negócio no outbox na mesma transação.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class FulfillmentService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I/L
    private static final SecureRandom RANDOM = new SecureRandom();

    private final LotStock stock;
    private final HoldService holds;
    private final EventSeatRepository seats;
    private final TicketRepository tickets;
    private final OutboxService outbox;
    private final SeatUpdateBus bus;
    private final ObjectMapper mapper;
    private final Clock clock;

    public FulfillmentService(LotStock stock, HoldService holds, EventSeatRepository seats, TicketRepository tickets,
                              OutboxService outbox, SeatUpdateBus bus, ObjectMapper mapper, Clock clock) {
        this.stock = stock;
        this.holds = holds;
        this.seats = seats;
        this.tickets = tickets;
        this.outbox = outbox;
        this.bus = bus;
        this.mapper = mapper;
        this.clock = clock;
    }

    /**
     * Pagamento confirmado: vende o estoque, marca os assentos como vendidos e emite os ingressos. Idempotente: um
     * pedido que já não está pendente não é tocado, e {@code UNIQUE(order_id, slot)} impede ingressos duplicados
     * mesmo sob execução concorrente.
     */
    public void markPaid(Order order) {
        if (order.getStatus() == Order.Status.PAID) {
            return;
        }
        if (order.getStatus() != Order.Status.PENDING) {
            throw new IllegalStateException("Pedido " + order.getCode() + " não pode ser pago no estado " + order.getStatus());
        }
        Instant now = clock.instant();
        Reservation reservation = order.getReservation();
        List<SeatUpdate> updates = new ArrayList<>();

        reservation.getItems().stream()
                .sorted(Comparator.comparing(i -> i.getLot().getId()))
                .forEach(i -> stock.confirmSale(i.getLot().getId(), i.getQuantity()));

        List<EventSeat> held = seats.lockByReservation(reservation.getId());
        for (EventSeat seat : held) {
            seat.sell(now);
            updates.add(new SeatUpdate(seat.getEventId(), seat.getCode(), "sold", order.getUserId()));
        }

        Map<String, String> holders = readHolders(order);
        List<Ticket> issued = new ArrayList<>();
        for (ReservationItem item : reservation.getItems().stream().sorted(Comparator.comparingInt(i -> i.getTicketType().getPosition())).toList()) {
            TicketType type = item.getTicketType();
            if (type.getKind() == TicketKind.SEATED) {
                List<EventSeat> own = held.stream().filter(s -> s.getSectorCode().equals(type.getSectorCode()))
                        .sorted(Comparator.comparing(EventSeat::getCode)).toList();
                if (own.size() != item.getQuantity()) {
                    throw new IllegalStateException("Assentos incompletos ao emitir ingressos do pedido " + order.getCode());
                }
                for (EventSeat s : own) {
                    issued.add(issue(order, type, s.getCode(), s.getId(), holders, now));
                }
            } else {
                for (int n = 1; n <= item.getQuantity(); n++) {
                    issued.add(issue(order, type, type.getCode() + "#" + n, null, holders, now));
                }
            }
        }
        tickets.saveAll(issued);

        order.setStatus(Order.Status.PAID);
        order.setPaidAt(now);
        order.setExpiresAt(null);

        outbox.add("order", order.getId(), "order.paid", Map.of(
                "orderId", order.getId().toString(), "orderCode", order.getCode(), "userId", order.getUserId().toString(),
                "eventId", order.getEvent().getId().toString(), "totalCents", order.getTotalCents(), "ticketCount", issued.size()));
        outbox.add("order", order.getId(), "ticket.issued", Map.of(
                "orderId", order.getId().toString(), "userId", order.getUserId().toString(),
                "ticketIds", issued.stream().map(t -> t.getId().toString()).toList()));
        bus.publishAfterCommit(updates);
    }

    /** Pedido pendente que venceu ou foi cancelado/recusado: devolve estoque e assentos. */
    public void markExpired(Order order) {
        if (order.getStatus() != Order.Status.PENDING) {
            return;
        }
        List<SeatUpdate> updates = new ArrayList<>();
        holds.releaseHolds(order.getReservation(), updates, clock.instant());
        order.setStatus(Order.Status.EXPIRED);
        outbox.add("order", order.getId(), "order.expired", Map.of(
                "orderId", order.getId().toString(), "orderCode", order.getCode(), "userId", order.getUserId().toString()));
        bus.publishAfterCommit(updates);
    }

    /** Reembolso de pedido pago: cancela ingressos, devolve vendidos ao estoque e libera os assentos. */
    public void markRefunded(Order order) {
        Instant now = clock.instant();
        List<Ticket> orderTickets = tickets.lockByOrder(order.getId());
        for (Ticket t : orderTickets) {
            if (t.getStatus() != Ticket.Status.VALID || !order.getUserId().equals(t.getOwnerUserId())) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "REFUND_NOT_ALLOWED",
                        "Este pedido não pode ser reembolsado: há ingressos usados ou transferidos.");
            }
        }
        orderTickets.forEach(t -> t.setStatus(Ticket.Status.CANCELLED));

        List<SeatUpdate> updates = new ArrayList<>();
        for (EventSeat seat : seats.lockByReservation(order.getReservation().getId())) {
            if (seat.getStatus() == SeatStatus.SOLD) {
                seat.release(now);
                updates.add(new SeatUpdate(seat.getEventId(), seat.getCode(), "available", order.getUserId()));
            }
        }
        order.getReservation().getItems().stream()
                .sorted(Comparator.comparing(i -> i.getLot().getId()))
                .forEach(i -> stock.returnSold(i.getLot().getId(), i.getQuantity()));

        order.setStatus(Order.Status.REFUNDED);
        order.setRefundedAt(now);
        outbox.add("order", order.getId(), "order.refunded", Map.of(
                "orderId", order.getId().toString(), "orderCode", order.getCode(), "userId", order.getUserId().toString()));
        outbox.add("event", order.getEvent().getId(), "stock.released", Map.of(
                "eventId", order.getEvent().getId().toString(),
                "ticketTypeIds", order.getReservation().getItems().stream().map(i -> i.getTicketType().getId().toString()).toList()));
        bus.publishAfterCommit(updates);
    }

    private Ticket issue(Order order, TicketType type, String slot, UUID seatId, Map<String, String> holders, Instant now) {
        String holder = holders.getOrDefault(slot, "").trim();
        return Ticket.issue(newCode(), order, order.getEvent(), type, slot, seatId, holder.isEmpty() ? order.getBuyerName() : holder, order.getUserId(), now);
    }

    private String newCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = "TF-" + random(4) + "-" + random(4);
            if (!tickets.existsByCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Não foi possível gerar um código de ingresso único");
    }

    private static String random(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    private Map<String, String> readHolders(Order order) {
        try {
            return mapper.readValue(order.getHoldersJson(), new TypeReference<Map<String, String>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** Lista de códigos de assentos de um conjunto (utilitário de teste/diagnóstico). */
    static List<String> codes(List<EventSeat> list) {
        return list.stream().map(EventSeat::getCode).collect(Collectors.toList());
    }
}
