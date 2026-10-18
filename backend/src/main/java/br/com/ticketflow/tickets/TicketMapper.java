package br.com.ticketflow.tickets;

import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.orders.web.dto.OrderDtos.TicketDto;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.EventSeatSector;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.SectorRepository;
import java.time.ZoneId;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Converte ingressos em DTOs (em lote, sem N+1 para assentos e setores). Requer transação aberta. */
@Component
public class TicketMapper {

    private final EventSeatRepository seats;
    private final SectorRepository sectors;
    private final TicketQrService qr;
    private final ZoneId zone;

    public TicketMapper(EventSeatRepository seats, SectorRepository sectors, TicketQrService qr, AppProperties props) {
        this.seats = seats;
        this.sectors = sectors;
        this.qr = qr;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    public List<TicketDto> toDtos(Collection<Ticket> tickets) {
        if (tickets.isEmpty()) {
            return List.of();
        }
        Set<UUID> seatIds = tickets.stream().map(Ticket::getSeatId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<UUID, EventSeat> seatById = seatIds.isEmpty() ? Map.of()
                : seats.findAllById(seatIds).stream().collect(Collectors.toMap(EventSeat::getId, s -> s));
        Map<UUID, Map<String, String>> sectorNames = new HashMap<>();
        return tickets.stream().map(t -> {
            UUID eventId = t.getEvent().getId();
            Map<String, String> names = sectorNames.computeIfAbsent(eventId,
                    id -> sectors.findByEvent(id).stream().collect(Collectors.toMap(EventSeatSector::getCode, EventSeatSector::getName)));
            String sectorCode = t.getTicketType().getSectorCode();
            EventSeat seat = t.getSeatId() == null ? null : seatById.get(t.getSeatId());
            return new TicketDto(t.getId().toString(), t.getCode(), t.getOrder().getId().toString(), t.getOrder().getCode(),
                    eventId.toString(), t.getEvent().getSlug(), t.getEvent().getTitle(),
                    t.getEvent().getStartsAt().atZone(zone).toOffsetDateTime(), t.getEvent().getVenue().getName(),
                    t.getEvent().getVenue().getCity(), t.getTicketType().getName(), sectorCode == null ? null : names.get(sectorCode),
                    seat == null ? null : seat.getCode(), seat == null ? null : seat.getRowLabel(), t.getHolderName(),
                    t.getStatus().name().toLowerCase(), t.getUsedAt() == null ? null : t.getUsedAt().atZone(zone).toOffsetDateTime(),
                    qr.payload(t.getId(), t.getQrVersion()));
        }).toList();
    }

    public TicketDto toDto(Ticket t) {
        return toDtos(List.of(t)).get(0);
    }
}
