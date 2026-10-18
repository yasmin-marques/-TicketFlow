package br.com.ticketflow.tickets;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {

    List<Ticket> findByOrderIdOrderByCodeAsc(UUID orderId);

    boolean existsByCode(String code);

    /** Ingressos do usuário (os cancelados também, para o histórico). */
    @Query("""
            select t from Ticket t join fetch t.event e join fetch e.venue join fetch t.ticketType join fetch t.order
            where t.ownerUserId = :userId order by e.startsAt, t.code
            """)
    List<Ticket> findOwnedBy(@Param("userId") UUID userId);

    @Query("""
            select t from Ticket t join fetch t.event e join fetch e.venue join fetch t.ticketType join fetch t.order
            where t.id = :id and t.ownerUserId = :userId
            """)
    Optional<Ticket> findOwned(@Param("id") UUID id, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Ticket t where t.id = :id")
    Optional<Ticket> lockById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Ticket t where t.order.id = :orderId order by t.id")
    List<Ticket> lockByOrder(@Param("orderId") UUID orderId);

    /** Transferências pendentes (destinatário ainda sem conta) para um e-mail. */
    @Query("select t from Ticket t where t.ownerUserId is null and lower(t.transferEmail) = lower(:email)")
    List<Ticket> findPendingFor(@Param("email") String email);

    long countByOrderId(UUID orderId);

    List<Ticket> findByIdIn(Collection<UUID> ids);
}
