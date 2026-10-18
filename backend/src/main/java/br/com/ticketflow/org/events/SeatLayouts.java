package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.org.web.OrgDtos.SeatCellDto;
import br.com.ticketflow.org.web.OrgDtos.SeatMapDto;
import br.com.ticketflow.org.web.OrgDtos.SeatRowDto;
import br.com.ticketflow.org.web.OrgDtos.SectorDto;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.EventSeatMap;
import br.com.ticketflow.sales.domain.EventSeatSector;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.SeatMapRepository;
import br.com.ticketflow.sales.repository.SectorRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Planta do editor ({@code OrgSeatMap}). Para eventos editados no painel ela fica em {@code events.seat_layout} (JSON);
 * para eventos que só têm o modelo de venda (ex.: dados de demonstração) ela é derivada de {@code event_seats}.
 */
@Component
public class SeatLayouts {

    private final ObjectMapper json;
    private final SeatMapRepository maps;
    private final SectorRepository sectors;
    private final EventSeatRepository seats;

    public SeatLayouts(ObjectMapper json, SeatMapRepository maps, SectorRepository sectors, EventSeatRepository seats) {
        this.json = json;
        this.maps = maps;
        this.sectors = sectors;
        this.seats = seats;
    }

    public SeatMapDto read(Event e) {
        if (e.getSeatLayout() != null) {
            try {
                return json.readValue(e.getSeatLayout(), SeatMapDto.class);
            } catch (JsonProcessingException ex) {
                throw new IllegalStateException("Planta inválida no evento " + e.getId(), ex);
            }
        }
        return derive(e).orElse(null);
    }

    public String write(SeatMapDto map) {
        try {
            return json.writeValueAsString(map);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    /** Monta a planta a partir da grade retangular de venda (filas × assentos), com vãos onde não há assento. */
    private Optional<SeatMapDto> derive(Event e) {
        Optional<EventSeatMap> map = maps.findById(e.getId());
        if (map.isEmpty()) {
            return Optional.empty();
        }
        EventSeatMap m = map.get();
        Map<String, EventSeat> byCode = seats.findByEventIdOrderByCodeAsc(e.getId()).stream()
                .collect(Collectors.toMap(EventSeat::getCode, Function.identity()));
        Map<java.util.UUID, TicketType> types = e.getTicketTypes().stream().collect(Collectors.toMap(TicketType::getId, Function.identity()));

        List<SectorDto> sectorDtos = sectors.findByEvent(e.getId()).stream()
                .sorted(Comparator.comparing(EventSeatSector::getRows))
                .map(s -> new SectorDto(s.getCode(), s.getName(), price(types.get(s.getTicketTypeId()))))
                .toList();
        List<SeatRowDto> rows = new ArrayList<>();
        for (char letter : m.getRows().toCharArray()) {
            List<SeatCellDto> cells = new ArrayList<>();
            for (int n = 1; n <= m.getSeatsPerRow(); n++) {
                EventSeat s = byCode.get("" + letter + String.format("%02d", n));
                cells.add(s == null ? null : new SeatCellDto(s.getCode(), s.getSectorCode(), s.isBlocked()));
            }
            rows.add(new SeatRowDto(String.valueOf(letter), cells));
        }
        int general = e.getTicketTypes().stream().filter(t -> t.getKind() == TicketKind.GENERAL)
                .flatMap(t -> t.getLots().stream()).mapToInt(TicketLot::getQuantityTotal).sum();
        return Optional.of(new SeatMapDto(sectorDtos, rows, general));
    }

    /** Preço exibido do setor: o do primeiro lote do tipo vinculado (o preço cobrado é sempre o do lote). */
    private static BigDecimal price(TicketType t) {
        if (t == null || t.getLots().isEmpty()) {
            return BigDecimal.ZERO;
        }
        return Money.toReais(t.getLots().stream().min(Comparator.comparingInt(TicketLot::getPosition)).orElseThrow().getPriceCents());
    }
}
