package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.TicketLot;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Leitura de lotes. Os contadores de estoque só mudam via {@code LotStock} (UPDATEs atômicos condicionais). */
public interface TicketLotRepository extends JpaRepository<TicketLot, UUID> {

    List<TicketLot> findByTicketTypeIdOrderByPositionAsc(UUID ticketTypeId);

    /** Id do evento do lote, se o lote pertence à organização (sem revelar lotes de outras organizações). */
    @Query("select l.ticketType.event.id from TicketLot l where l.id = :id and l.ticketType.event.organization.id = :orgId")
    Optional<UUID> findEventIdIfOwned(@Param("id") UUID id, @Param("orgId") UUID orgId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from TicketLot l where l.id = :id")
    Optional<TicketLot> lockById(@Param("id") UUID id);

    @Query("select l from TicketLot l join fetch l.ticketType t where t.event.id = :eventId order by t.position, l.position")
    List<TicketLot> findByEvent(@Param("eventId") UUID eventId);
}
