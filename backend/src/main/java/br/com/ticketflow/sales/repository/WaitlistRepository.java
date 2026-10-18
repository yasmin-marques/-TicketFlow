package br.com.ticketflow.sales.repository;

import br.com.ticketflow.sales.domain.WaitlistEntry;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistRepository extends JpaRepository<WaitlistEntry, UUID> {
    boolean existsByUserIdAndTicketTypeId(UUID userId, UUID ticketTypeId);

    List<WaitlistEntry> findByTicketTypeIdInAndNotifiedAtIsNull(Collection<UUID> ticketTypeIds);
}
