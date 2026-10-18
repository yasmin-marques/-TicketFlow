package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.TicketType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketTypeRepository extends JpaRepository<TicketType, UUID> {

    @EntityGraph(attributePaths = "lots")
    List<TicketType> findByEventIdOrderByPositionAsc(UUID eventId);

    Optional<TicketType> findByEventIdAndCode(UUID eventId, String code);
}
