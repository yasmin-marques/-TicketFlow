package br.com.ticketflow.outbox;

import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.repository.TicketLotRepository;
import br.com.ticketflow.sales.domain.WaitlistEntry;
import br.com.ticketflow.sales.repository.WaitlistRepository;
import br.com.ticketflow.shared.port.NotificationSender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumidores dos eventos de negócio. Cada um tem seu grupo (recebe todas as mensagens) e registra o que já
 * processou em {@code processed_events}, na mesma transação dos efeitos — reentregas não repetem nada.
 */
@Component
@ConditionalOnProperty(prefix = "tf.kafka", name = "enabled", havingValue = "true")
public class DomainEventConsumers {

    private static final Logger log = LoggerFactory.getLogger(DomainEventConsumers.class);
    public static final String NOTIFICATIONS = "notifications";
    public static final String WAITLIST = "waitlist";

    private final ObjectMapper mapper;
    private final ProcessedEvents processed;
    private final NotificationSender notifier;
    private final UserRepository users;
    private final WaitlistRepository waitlist;
    private final TicketLotRepository lots;
    private final br.com.ticketflow.catalog.repository.TicketTypeRepository ticketTypes;
    private final Clock clock;

    public DomainEventConsumers(ObjectMapper mapper, ProcessedEvents processed, NotificationSender notifier, UserRepository users,
                                WaitlistRepository waitlist, TicketLotRepository lots,
                                br.com.ticketflow.catalog.repository.TicketTypeRepository ticketTypes, Clock clock) {
        this.mapper = mapper;
        this.processed = processed;
        this.notifier = notifier;
        this.users = users;
        this.waitlist = waitlist;
        this.lots = lots;
        this.ticketTypes = ticketTypes;
        this.clock = clock;
    }

    /** Notificações transacionais ao comprador. */
    @KafkaListener(topics = "${tf.kafka.topic}", groupId = "ticketflow-notifications")
    @Transactional
    public void notifications(String message) throws Exception {
        JsonNode event = mapper.readTree(message);
        UUID id = UUID.fromString(event.get("id").asText());
        if (!processed.markIfNew(NOTIFICATIONS, id)) {
            return;
        }
        String type = event.get("type").asText();
        JsonNode data = event.get("data");
        switch (type) {
            case "order.paid", "order.pending", "order.refunded", "order.expired" -> notifyUser(data.path("userId").asText(), type, data);
            case "ticket.transferred" -> {
                notifyUser(data.path("toUserId").asText(null), "ticket.received", data);
                notifyUser(data.path("fromUserId").asText(null), "ticket.transferred", data);
            }
            default -> { /* outros tipos não geram notificação */ }
        }
    }

    /** Avisa quem está na lista de espera quando volta a haver estoque. */
    @KafkaListener(topics = "${tf.kafka.topic}", groupId = "ticketflow-waitlist")
    @Transactional
    public void waitlist(String message) throws Exception {
        JsonNode event = mapper.readTree(message);
        UUID id = UUID.fromString(event.get("id").asText());
        if (!processed.markIfNew(WAITLIST, id)) {
            return;
        }
        if (!"stock.released".equals(event.get("type").asText())) {
            return;
        }
        List<UUID> typeIds = new ArrayList<>();
        event.path("data").path("ticketTypeIds").forEach(n -> typeIds.add(UUID.fromString(n.asText())));
        if (typeIds.isEmpty()) {
            return;
        }
        Instant now = clock.instant();
        for (WaitlistEntry entry : waitlist.findByTicketTypeIdInAndNotifiedAtIsNull(typeIds)) {
            boolean stock = lots.findByTicketTypeIdOrderByPositionAsc(entry.getTicketTypeId()).stream()
                    .anyMatch(l -> l.getStatus() == TicketLot.Status.PUBLISHED && l.available() > 0 && l.getSalesEnd().isAfter(now));
            if (stock) {
                entry.setNotifiedAt(now);
                String typeName = ticketTypes.findById(entry.getTicketTypeId()).map(t -> t.getName()).orElse("");
                notifyUser(entry.getUserId().toString(), "waitlist.available", Map.of("ticketType", typeName));
            }
        }
    }

    private void notifyUser(String userId, String template, JsonNode data) {
        notifyUser(userId, template, mapper.convertValue(data, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}));
    }

    private void notifyUser(String userId, String template, Map<String, Object> data) {
        if (userId == null || userId.isBlank() || "null".equals(userId)) {
            return;
        }
        users.findById(UUID.fromString(userId)).map(User::getEmail).ifPresentOrElse(
                email -> notifier.send(email, template, data),
                () -> log.debug("Usuário {} não encontrado para a notificação {}", userId, template));
    }
}
