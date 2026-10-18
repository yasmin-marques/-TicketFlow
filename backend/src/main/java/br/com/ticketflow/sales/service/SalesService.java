package br.com.ticketflow.sales.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.TicketTypeRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.EventSeatMap;
import br.com.ticketflow.sales.domain.EventSeatSector;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.SeatStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.ReservationRepository;
import br.com.ticketflow.sales.repository.SectorRepository;
import br.com.ticketflow.sales.repository.SeatMapRepository;
import br.com.ticketflow.sales.web.dto.SalesDtos.EventSalesDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.LotDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.SeatAvailabilityDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.SeatMapDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.SectorDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.TicketTypeDto;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Consultas de venda: lotes e mapa (sales), disponibilidade dos assentos e sugestões de vizinhos. */
@Service
@Transactional(readOnly = true)
public class SalesService {

    private static final DateTimeFormatter DAY_MONTH = DateTimeFormatter.ofPattern("dd/MM");

    private final EventRepository events;
    private final TicketTypeRepository ticketTypes;
    private final SeatMapRepository maps;
    private final SectorRepository sectors;
    private final EventSeatRepository seats;
    private final ReservationRepository reservations;
    private final Clock clock;
    private final AppProperties props;
    private final ZoneId zone;

    public SalesService(EventRepository events, TicketTypeRepository ticketTypes, SeatMapRepository maps, SectorRepository sectors,
                        EventSeatRepository seats, ReservationRepository reservations, Clock clock, AppProperties props) {
        this.events = events;
        this.ticketTypes = ticketTypes;
        this.maps = maps;
        this.sectors = sectors;
        this.seats = seats;
        this.reservations = reservations;
        this.clock = clock;
        this.props = props;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    // ── GET /events/{slug}/sales ───────────────────────────────────────────────────────────────────────

    public EventSalesDto sales(String slug) {
        Instant now = clock.instant();
        Event e = events.findVisibleBySlug(slug, now).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));
        List<TicketType> types = ticketTypes.findByEventIdOrderByPositionAsc(e.getId());
        Optional<EventSeatMap> map = maps.findById(e.getId());
        Map<String, EventSeatSector> sectorByCode = sectors.findByEvent(e.getId()).stream()
                .collect(Collectors.toMap(EventSeatSector::getCode, s -> s));

        List<TicketTypeDto> typeDtos = new ArrayList<>();
        Map<UUID, TicketTypeDto> byTypeId = new LinkedHashMap<>();
        for (TicketType t : types) {
            describe(t, now).ifPresent(d -> {
                typeDtos.add(d);
                byTypeId.put(t.getId(), d);
            });
        }

        SeatMapDto seatMap = map.map(m -> {
            List<SectorDto> sectorDtos = sectorByCode.values().stream()
                    .sorted(Comparator.comparing(EventSeatSector::getRows))
                    .map(s -> {
                        TicketTypeDto td = byTypeId.get(s.getTicketTypeId());
                        TicketType tt = types.stream().filter(x -> x.getId().equals(s.getTicketTypeId())).findFirst().orElseThrow();
                        return new SectorDto(s.getCode(), s.getName(), tt.getCode(), td == null ? null : td.price(), toList(s.getRows()));
                    })
                    .toList();
            List<String> accessible = seats.findByEventIdOrderByCodeAsc(e.getId()).stream()
                    .filter(EventSeat::isAccessible).map(EventSeat::getCode).toList();
            return new SeatMapDto(toList(m.getRows()), m.getSeatsPerRow(), m.getAisleAfter(), sectorDtos, accessible);
        }).orElse(null);

        return new EventSalesDto(e.getId().toString(), e.getSlug(), e.getTitle(), e.getStartsAt().atZone(zone).toOffsetDateTime(),
                e.getVenue().getName(), e.getVenue().getCity(), e.getVenue().getState(), e.getCoverUrl(), e.getServiceFeePct(),
                props.sales().maxPerOrder(), typeDtos, seatMap);
    }

    private Optional<TicketTypeDto> describe(TicketType t, Instant now) {
        List<TicketLot> lots = t.getLots().stream()
                .filter(l -> l.getStatus() == TicketLot.Status.PUBLISHED)
                .sorted(Comparator.comparingInt(TicketLot::getPosition))
                .toList();
        if (lots.isEmpty()) {
            return Optional.empty();
        }
        TicketLot chosen;
        String status;
        String note = null;
        Optional<TicketLot> open = LotSelector.open(t, now);
        if (open.isPresent()) {
            chosen = open.get();
            status = "open";
        } else {
            Optional<TicketLot> soldOutNow = lots.stream()
                    .filter(l -> !l.getSalesStart().isAfter(now) && l.getSalesEnd().isAfter(now)).findFirst();
            Optional<TicketLot> upcoming = lots.stream().filter(l -> l.getSalesStart().isAfter(now))
                    .min(Comparator.comparing(TicketLot::getSalesStart));
            if (soldOutNow.isPresent()) {
                chosen = soldOutNow.get();
                status = "sold-out";
                note = upcoming.map(u -> u.getName() + " abre em " + DAY_MONTH.format(u.getSalesStart().atZone(zone))).orElse(null);
            } else if (upcoming.isPresent()) {
                chosen = upcoming.get();
                status = "upcoming";
            } else {
                chosen = lots.get(lots.size() - 1);
                status = "sold-out";
            }
        }
        int remaining = "sold-out".equals(status) ? 0 : Math.max(0, chosen.available());
        LotDto lot = new LotDto(chosen.getName(), status, chosen.getQuantityTotal(), remaining,
                "upcoming".equals(status) ? chosen.getSalesStart().atZone(zone).toOffsetDateTime() : null);
        return Optional.of(new TicketTypeDto(t.getCode(), t.getName(), t.getDescription(), t.getKind() == TicketKind.SEATED ? "seated" : "general",
                t.getSectorCode(), Money.toReais(chosen.getPriceCents()), lot, note));
    }

    private static List<String> toList(String letters) {
        return letters.chars().mapToObj(c -> String.valueOf((char) c)).toList();
    }

    // ── GET /events/{eventId}/seats ────────────────────────────────────────────────────────────────────

    /** Assentos indisponíveis. Os que pertencem à reserva ativa do próprio usuário não aparecem. */
    public SeatAvailabilityDto seats(UUID eventId, UUID userId) {
        Instant now = clock.instant();
        events.findVisibleById(eventId, now).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));
        Map<String, String> state = snapshot(eventId, userId, now, false);
        return new SeatAvailabilityDto(eventId.toString(), state, now.atZone(zone).toOffsetDateTime());
    }

    /**
     * Estado dos assentos. {@code includeAvailable}: inclui também os livres (ressincronização do stream após
     * reconexão, quando o cliente pode ter perdido liberações).
     */
    public Map<String, String> snapshot(UUID eventId, UUID userId, Instant now, boolean includeAvailable) {
        UUID mine = userId == null ? null : reservations.findActiveByUser(userId)
                .filter(r -> r.getEvent().getId().equals(eventId)).map(Reservation::getId).orElse(null);
        Map<String, String> out = new LinkedHashMap<>();
        List<EventSeat> source = includeAvailable ? seats.findByEventIdOrderByCodeAsc(eventId) : seats.findNotAvailable(eventId);
        for (EventSeat s : source) {
            if (s.getStatus() == SeatStatus.SOLD) {
                out.put(s.getCode(), "sold");
            } else if (s.isEffectivelyAvailable(now)) {
                if (includeAvailable) {
                    out.put(s.getCode(), "available");
                }
            } else if (mine != null && mine.equals(s.getReservationId())) {
                // assento da própria reserva: para o usuário é "selecionado", não "reservado"
                continue;
            } else {
                out.put(s.getCode(), "reserved");
            }
        }
        return out;
    }

    /** Vizinhos livres (mesma fila e setor) mais próximos do assento perdido. */
    public List<String> neighbors(UUID eventId, EventSeat lost, Set<String> exclude, UUID reservationId, Instant now) {
        return seats.findByEventIdAndRowLabelOrderBySeatNumberAsc(eventId, lost.getRowLabel()).stream()
                .filter(s -> s.getSectorCode().equals(lost.getSectorCode()))
                .filter(s -> !s.getCode().equals(lost.getCode()) && !exclude.contains(s.getCode()))
                .filter(s -> s.isFreeFor(reservationId, now))
                .sorted(Comparator.comparingInt((EventSeat s) -> Math.abs(s.getSeatNumber() - lost.getSeatNumber())).thenComparing(EventSeat::getCode))
                .limit(2)
                .map(EventSeat::getCode)
                .toList();
    }
}
