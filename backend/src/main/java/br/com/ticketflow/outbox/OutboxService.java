package br.com.ticketflow.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registra eventos de negócio no outbox. {@code MANDATORY}: só pode ser chamado dentro da transação que muda o
 * estado — assim ou ambos (mudança + evento) são confirmados, ou nenhum.
 */
@Service
public class OutboxService {

    private final OutboxRepository repository;
    private final ObjectMapper mapper;
    private final Clock clock;

    public OutboxService(OutboxRepository repository, ObjectMapper mapper, Clock clock) {
        this.repository = repository;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void add(String aggregateType, Object aggregateId, String eventType, Map<String, ?> data) {
        try {
            repository.save(OutboxEvent.of(aggregateType, String.valueOf(aggregateId), eventType, mapper.writeValueAsString(data), clock.instant()));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Payload do outbox não serializável", e);
        }
    }
}
