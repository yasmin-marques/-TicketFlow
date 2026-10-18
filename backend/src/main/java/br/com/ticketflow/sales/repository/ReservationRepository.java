package br.com.ticketflow.sales.repository;

import br.com.ticketflow.sales.domain.Reservation;
import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    Optional<Reservation> findByIdAndUserId(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.id = :id")
    Optional<Reservation> lockById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.id = :id and r.userId = :userId")
    Optional<Reservation> lockByIdAndUserId(@Param("id") UUID id, @Param("userId") UUID userId);

    @Query("select r from Reservation r where r.userId = :userId and r.status = br.com.ticketflow.sales.domain.ReservationStatus.ACTIVE")
    Optional<Reservation> findActiveByUser(@Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Reservation r where r.userId = :userId and r.status = br.com.ticketflow.sales.domain.ReservationStatus.ACTIVE")
    Optional<Reservation> lockActiveByUser(@Param("userId") UUID userId);

    /** Reservas vencidas, travadas com SKIP LOCKED: várias instâncias do job não se atropelam. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            select r from Reservation r
            where r.status = br.com.ticketflow.sales.domain.ReservationStatus.ACTIVE and r.expiresAt <= :now
            order by r.expiresAt
            """)
    List<Reservation> lockDue(@Param("now") Instant now, Pageable page);

    /** Idem, restrito a um evento (usado antes de criar uma reserva nele). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("""
            select r from Reservation r
            where r.status = br.com.ticketflow.sales.domain.ReservationStatus.ACTIVE and r.expiresAt <= :now and r.event.id = :eventId
            order by r.expiresAt
            """)
    List<Reservation> lockDueForEvent(@Param("eventId") UUID eventId, @Param("now") Instant now, Pageable page);

    /** Reservas ativas de um evento, travadas em ordem de id (cancelamento do evento pelo organizador). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from Reservation r
            where r.event.id = :eventId and r.status = br.com.ticketflow.sales.domain.ReservationStatus.ACTIVE
            order by r.id
            """)
    List<Reservation> lockActiveForEvent(@Param("eventId") UUID eventId);
}
