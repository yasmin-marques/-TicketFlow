package br.com.ticketflow.outbox;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;

public interface OutboxRepository extends JpaRepository<OutboxEvent, UUID> {

    /** Lote de pendentes na ordem de criação; SKIP LOCKED permite vários relays sem duplicar o trabalho. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-2"))
    @Query("select e from OutboxEvent e where e.publishedAt is null order by e.createdAt, e.id")
    List<OutboxEvent> lockPending(Pageable page);

    long countByPublishedAtIsNull();
}
