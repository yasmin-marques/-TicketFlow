package br.com.ticketflow.orders.repository;

import br.com.ticketflow.orders.domain.Order;
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

public interface OrderRepository extends JpaRepository<Order, UUID> {

    Optional<Order> findByIdAndUserId(UUID id, UUID userId);

    List<Order> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.id = :id")
    Optional<Order> lockById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Order o where o.provider = :provider and o.providerRef = :ref")
    Optional<Order> lockByProviderRef(@Param("provider") String provider, @Param("ref") String ref);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("select o from Order o where o.status = :status and o.expiresAt <= :now order by o.expiresAt")
    List<Order> lockDue(@Param("status") Order.Status status, @Param("now") Instant now, Pageable page);

    boolean existsByReservationId(UUID reservationId);
}
