package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.Venue;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VenueRepository extends JpaRepository<Venue, UUID> {}
