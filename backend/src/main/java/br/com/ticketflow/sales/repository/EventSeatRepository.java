package br.com.ticketflow.sales.repository;

import br.com.ticketflow.sales.domain.EventSeat;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventSeatRepository extends JpaRepository<EventSeat, UUID> {

    /**
     * Trava os assentos pedidos ({@code SELECT … FOR UPDATE}) SEMPRE em ordem de {@code id}: compradores que
     * disputam conjuntos sobrepostos adquirem os locks na mesma ordem e não geram deadlock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from EventSeat s where s.eventId = :eventId and s.code in :codes order by s.id")
    List<EventSeat> lockByCodes(@Param("eventId") UUID eventId, @Param("codes") Collection<String> codes);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from EventSeat s where s.reservationId = :reservationId order by s.id")
    List<EventSeat> lockByReservation(@Param("reservationId") UUID reservationId);

    List<EventSeat> findByReservationId(UUID reservationId);

    List<EventSeat> findByEventIdOrderByCodeAsc(UUID eventId);

    @Query("select s from EventSeat s where s.eventId = :eventId and (s.status <> br.com.ticketflow.sales.domain.SeatStatus.AVAILABLE or s.blocked = true)")
    List<EventSeat> findNotAvailableOrBlocked(@Param("eventId") UUID eventId);

    @Query("select s.code from EventSeat s where s.eventId = :eventId")
    List<String> findCodesByEvent(@Param("eventId") UUID eventId);

    /** Trava todos os assentos do evento (edição do mapa pelo organizador), em ordem de id. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from EventSeat s where s.eventId = :eventId order by s.id")
    List<EventSeat> lockByEvent(@Param("eventId") UUID eventId);

    List<EventSeat> findByEventIdAndRowLabelOrderBySeatNumberAsc(UUID eventId, String rowLabel);

    long countByEventId(UUID eventId);
}
