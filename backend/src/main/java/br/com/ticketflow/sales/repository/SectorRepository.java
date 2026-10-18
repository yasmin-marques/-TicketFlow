package br.com.ticketflow.sales.repository;

import br.com.ticketflow.sales.domain.EventSeatSector;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SectorRepository extends JpaRepository<EventSeatSector, EventSeatSector.Key> {
    @Query("select s from EventSeatSector s where s.id.eventId = :eventId")
    List<EventSeatSector> findByEvent(@Param("eventId") UUID eventId);
}
