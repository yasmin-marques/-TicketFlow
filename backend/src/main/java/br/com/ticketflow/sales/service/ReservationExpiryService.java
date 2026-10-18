package br.com.ticketflow.sales.service;

import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.realtime.SeatUpdateBus;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationStatus;
import br.com.ticketflow.sales.repository.ReservationRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Expiração de reservas. Há três caminhos, todos idempotentes: o job periódico, a limpeza antes de criar uma
 * reserva no mesmo evento e a expiração imediata quando alguém tenta usar uma reserva vencida.
 */
@Service
public class ReservationExpiryService {

    private static final Logger log = LoggerFactory.getLogger(ReservationExpiryService.class);
    private static final int BATCH = 50;

    private final ReservationRepository reservations;
    private final HoldService holds;
    private final SeatUpdateBus bus;
    private final Clock clock;
    private final boolean jobEnabled;
    private final TransactionTemplate tx;

    public ReservationExpiryService(ReservationRepository reservations, HoldService holds, SeatUpdateBus bus, Clock clock, AppProperties props,
                                   TransactionTemplate tx) {
        this.tx = tx;
        this.reservations = reservations;
        this.holds = holds;
        this.bus = bus;
        this.clock = clock;
        this.jobEnabled = props.jobs().expiryEnabled();
    }

    @Scheduled(fixedDelayString = "${tf.sales.expiry-poll-ms:5000}")
    public void poll() {
        if (jobEnabled) {
            expireDue();
        }
    }

    /** Expira (em lotes) todas as reservas vencidas. Devolve quantas. */
    public int expireDue() {
        int total = 0;
        int n;
        do {
            n = expireBatch();
            total += n;
        } while (n == BATCH);
        if (total > 0) {
            log.info("{} reserva(s) expirada(s)", total);
        }
        return total;
    }

    private int expireBatch() {
        Integer n = tx.execute(status -> expireLocked(reservations.lockDue(clock.instant(), PageRequest.of(0, BATCH))));
        return n == null ? 0 : n;
    }

    /** Dentro da transação do chamador: libera reservas vencidas do evento antes de vender nele. */
    @Transactional(propagation = Propagation.MANDATORY)
    public int expireDueForEvent(UUID eventId) {
        return expireLocked(reservations.lockDueForEvent(eventId, clock.instant(), PageRequest.of(0, BATCH)));
    }

    /** Expira uma reserva específica em transação própria (antes de o chamador travá-la). */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void expireOne(UUID reservationId) {
        reservations.lockById(reservationId).filter(r -> r.isActive() && r.isExpiredAt(clock.instant()))
                .ifPresent(r -> expireLocked(List.of(r)));
    }

    private int expireLocked(List<Reservation> due) {
        List<SeatUpdate> updates = new ArrayList<>();
        for (Reservation r : due) {
            holds.release(r, ReservationStatus.EXPIRED, updates);
        }
        bus.publishAfterCommit(updates);
        return due.size();
    }

    Instant now() {
        return clock.instant();
    }
}
