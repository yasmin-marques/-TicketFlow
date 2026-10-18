package br.com.ticketflow.sales.repository;

import br.com.ticketflow.sales.domain.EventSeatMap;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SeatMapRepository extends JpaRepository<EventSeatMap, UUID> {}
