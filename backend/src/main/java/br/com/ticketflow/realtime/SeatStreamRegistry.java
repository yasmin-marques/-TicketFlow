package br.com.ticketflow.realtime;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Conexões SSE abertas, por evento. Cada instância da API mantém as suas; o Redis (ou, sem ele, a própria
 * instância) entrega cada {@link SeatUpdate} a todas elas.
 */
@Component
public class SeatStreamRegistry {

    private static final Logger log = LoggerFactory.getLogger(SeatStreamRegistry.class);
    static final Duration TIMEOUT = Duration.ofMinutes(30);

    private record Subscriber(SseEmitter emitter, UUID userId) {}

    private final Map<UUID, Set<Subscriber>> byEvent = new ConcurrentHashMap<>();
    private final AtomicInteger connections = new AtomicInteger();
    private final AtomicLong sequence = new AtomicLong(System.currentTimeMillis());
    private final int maxConnections;

    public SeatStreamRegistry(AppProperties props) {
        this.maxConnections = props.sales().maxSseConnections();
    }

    public SseEmitter subscribe(UUID eventId, UUID userId) {
        if (connections.get() >= maxConnections) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STREAM_CAPACITY", "Muitas conexões abertas. Tente novamente em instantes.");
        }
        SseEmitter emitter = new SseEmitter(TIMEOUT.toMillis());
        Subscriber sub = new Subscriber(emitter, userId);
        byEvent.computeIfAbsent(eventId, k -> ConcurrentHashMap.newKeySet()).add(sub);
        connections.incrementAndGet();
        Runnable cleanup = () -> remove(eventId, sub);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(() -> {
            emitter.complete();
            cleanup.run();
        });
        emitter.onError(e -> cleanup.run());
        return emitter;
    }

    private void remove(UUID eventId, Subscriber sub) {
        Set<Subscriber> subs = byEvent.get(eventId);
        if (subs != null && subs.remove(sub)) {
            connections.decrementAndGet();
            if (subs.isEmpty()) {
                byEvent.remove(eventId, subs);
            }
        }
    }

    /** Entrega a mudança às conexões locais do evento (exceto à de quem a causou). */
    public void dispatch(SeatUpdate update) {
        Set<Subscriber> subs = byEvent.get(update.eventId());
        if (subs == null) {
            return;
        }
        for (Subscriber sub : subs) {
            if (update.actorUserId() != null && update.actorUserId().equals(sub.userId())) {
                continue;
            }
            send(update.eventId(), sub, update.seatId(), update.status());
        }
    }

    /** Envia um estado diretamente a uma conexão (ressincronização após reconexão). */
    public void sendTo(SseEmitter emitter, String seatId, String status) throws IOException {
        emitter.send(SseEmitter.event().id(String.valueOf(sequence.incrementAndGet())).name("seat.updated").data(payload(seatId, status)));
    }

    private void send(UUID eventId, Subscriber sub, String seatId, String status) {
        try {
            sub.emitter().send(SseEmitter.event().id(String.valueOf(sequence.incrementAndGet())).name("seat.updated").data(payload(seatId, status)));
        } catch (IOException | IllegalStateException e) {
            // Cliente desconectou: remove a conexão (o EventSource do navegador reconecta sozinho).
            remove(eventId, sub);
        }
    }

    private static String payload(String seatId, String status) {
        return "{\"seatId\":\"" + seatId + "\",\"status\":\"" + status + "\"}";
    }

    /** Comentário periódico: mantém proxies abertos e detecta conexões mortas. */
    @Scheduled(fixedDelay = 15_000)
    public void heartbeat() {
        byEvent.forEach((eventId, subs) -> {
            for (Subscriber sub : subs) {
                try {
                    sub.emitter().send(SseEmitter.event().comment("hb"));
                } catch (IOException | IllegalStateException e) {
                    remove(eventId, sub);
                }
            }
        });
    }

    public int connectionCount() {
        return connections.get();
    }

    void logState() {
        log.debug("{} conexões SSE", connections.get());
    }
}
