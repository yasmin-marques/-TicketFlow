package br.com.ticketflow.sales.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.EventSeatSector;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationItem;
import br.com.ticketflow.sales.domain.ReservationStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.SectorRepository;
import br.com.ticketflow.sales.web.dto.SalesDtos.ReservationDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.ReservationItemDto;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
public class ReservationMapper {

    private final EventSeatRepository seats;
    private final SectorRepository sectors;
    private final Clock clock;
    private final ZoneId zone;

    public ReservationMapper(EventSeatRepository seats, SectorRepository sectors, Clock clock, AppProperties props) {
        this.seats = seats;
        this.sectors = sectors;
        this.clock = clock;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    /** Deve rodar dentro de uma transação (associações preguiçosas). */
    public ReservationDto toDto(Reservation r) {
        Event e = r.getEvent();
        Instant now = clock.instant();
        Map<String, EventSeatSector> sectorByCode = sectors.findByEvent(e.getId()).stream()
                .collect(Collectors.toMap(EventSeatSector::getCode, s -> s));
        Map<String, List<String>> seatsBySector = seats.findByReservationId(r.getId()).stream()
                .sorted(Comparator.comparing(EventSeat::getCode))
                .collect(Collectors.groupingBy(EventSeat::getSectorCode, Collectors.mapping(EventSeat::getCode, Collectors.toList())));

        List<ReservationItemDto> items = r.getItems().stream()
                .sorted(Comparator.comparing((ReservationItem i) -> i.getTicketType().getPosition()))
                .map(i -> {
                    boolean seated = i.getTicketType().getKind() == TicketKind.SEATED;
                    String sectorCode = i.getTicketType().getSectorCode();
                    EventSeatSector sector = sectorCode == null ? null : sectorByCode.get(sectorCode);
                    return new ReservationItemDto(i.getTicketType().getCode(), i.getTicketType().getName(), seated ? "seated" : "general",
                            seated ? sectorCode : null, sector == null ? null : sector.getName(), i.getQuantity(),
                            Money.toReais(i.getUnitPriceCents()), Money.toReais(i.getUnitFeeCents()),
                            seated ? seatsBySector.getOrDefault(sectorCode, List.of()) : List.of());
                })
                .toList();

        return new ReservationDto(r.getId().toString(), e.getId().toString(), e.getSlug(), e.getTitle(),
                e.getStartsAt().atZone(zone).toOffsetDateTime(), e.getVenue().getName(), status(r, now),
                r.getCreatedAt().atZone(zone).toOffsetDateTime(), r.getExpiresAt().atZone(zone).toOffsetDateTime(), items,
                Money.toReais(r.subtotalCents()), Money.toReais(r.feeCents()), Money.toReais(r.totalCents()));
    }

    /** Uma reserva ativa cujo prazo passou já é "expired" para o cliente, mesmo antes do job de limpeza. */
    static String status(Reservation r, Instant now) {
        if (r.getStatus() == ReservationStatus.ACTIVE && r.isExpiredAt(now)) {
            return "expired";
        }
        return r.getStatus().name().toLowerCase();
    }
}
