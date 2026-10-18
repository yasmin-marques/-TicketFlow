package br.com.ticketflow.realtime;

import br.com.ticketflow.config.AppProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Collection;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Publica mudanças de assento SOMENTE depois do commit (nunca anuncia algo que a transação pode desfazer).
 * Com Redis habilitado, a mensagem vai ao canal pub/sub e cada instância entrega às próprias conexões SSE; sem
 * Redis, entrega localmente. É um canal "melhor esforço": a verdade continua no PostgreSQL e o cliente se
 * ressincroniza com {@code GET /events/{id}/seats} (e automaticamente ao reconectar o stream).
 */
@Component
public class SeatUpdateBus {

    public static final String CHANNEL = "tf:seat-updates";
    private static final Logger log = LoggerFactory.getLogger(SeatUpdateBus.class);

    private final SeatStreamRegistry registry;
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final boolean redisEnabled;

    public SeatUpdateBus(SeatStreamRegistry registry, StringRedisTemplate redis, ObjectMapper mapper, AppProperties props) {
        this.registry = registry;
        this.redis = redis;
        this.mapper = mapper;
        this.redisEnabled = props.redis().enabled();
    }

    public void publishAfterCommit(Collection<SeatUpdate> updates) {
        if (updates.isEmpty()) {
            return;
        }
        List<SeatUpdate> copy = List.copyOf(updates);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publishNow(copy);
                }
            });
        } else {
            publishNow(copy);
        }
    }

    void publishNow(List<SeatUpdate> updates) {
        for (SeatUpdate u : updates) {
            try {
                if (redisEnabled) {
                    redis.convertAndSend(CHANNEL, mapper.writeValueAsString(u));
                } else {
                    registry.dispatch(u);
                }
            } catch (JsonProcessingException | RuntimeException e) {
                // Não pode derrubar a requisição já confirmada; o cliente se ressincroniza pelo GET.
                log.warn("Falha ao publicar atualização de assento {}: {}", u.seatId(), e.toString());
                registry.dispatch(u);
            }
        }
    }
}
