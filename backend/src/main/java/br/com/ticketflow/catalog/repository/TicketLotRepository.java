package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.TicketLot;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Leitura de lotes. Os contadores de estoque só mudam via {@code LotStock} (UPDATEs atômicos condicionais). */
public interface TicketLotRepository extends JpaRepository<TicketLot, UUID> {

    List<TicketLot> findByTicketTypeIdOrderByPositionAsc(UUID ticketTypeId);
}
