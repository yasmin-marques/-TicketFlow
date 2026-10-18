package br.com.ticketflow.tickets;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketTransferRepository extends JpaRepository<TicketTransfer, UUID> {}
