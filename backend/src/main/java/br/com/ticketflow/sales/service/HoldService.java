package br.com.ticketflow.sales.service;

import br.com.ticketflow.outbox.OutboxService;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationItem;
import br.com.ticketflow.sales.domain.ReservationStatus;
import br.com.ticketflow.sales.domain.SeatStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Devolve ao estoque (lotes e assentos) o que uma reserva ou um pedido pendente estava segurando. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class HoldService {

    private final LotStock stock;
    private final EventSeatRepository seats;
    private final OutboxService outbox;
    private final Clock clock;

    public HoldService(LotStock stock, EventSeatRepository seats, OutboxService outbox, Clock clock) {
        this.stock = stock;
        this.seats = seats;
        this.outbox = outbox;
        this.clock = clock;
    }

    /**
     * Libera tudo que {@code r} segura e fecha a reserva com {@code newStatus}. As mudanças de assento são
     * acrescentadas a {@code updates} (publicadas só depois do commit).
     */
    public void release(Reservation r, ReservationStatus newStatus, List<SeatUpdate> updates) {
        Instant now = clock.instant();
        releaseHolds(r, updates, now);
        if (r.isActive() || newStatus != null) {
            r.close(newStatus, now);
        }
    }

    /** Libera estoque e assentos de uma reserva já finalizada (pedido pendente que expirou ou foi cancelado). */
    public void releaseHolds(Reservation r, List<SeatUpdate> updates, Instant now) {
        r.getItems().stream()
                .sorted(Comparator.comparing(i -> i.getLot().getId())) // ordem estável de locks entre transações
                .forEach(i -> stock.release(i.getLot().getId(), i.getQuantity()));

        for (EventSeat seat : seats.lockByReservation(r.getId())) {
            if (seat.getStatus() == SeatStatus.RESERVED) {
                seat.release(now);
                updates.add(new SeatUpdate(seat.getEventId(), seat.getCode(), "available", null));
            }
        }
        List<String> typeIds = r.getItems().stream().map(i -> i.getTicketType().getId().toString()).toList();
        outbox.add("event", r.getEvent().getId(), "stock.released", Map.of(
                "eventId", r.getEvent().getId().toString(),
                "reservationId", r.getId().toString(),
                "ticketTypeIds", typeIds));
    }

    /** Quantidade total de ingressos da reserva. */
    public static int quantity(Reservation r) {
        return r.getItems().stream().mapToInt(ReservationItem::getQuantity).sum();
    }
}
