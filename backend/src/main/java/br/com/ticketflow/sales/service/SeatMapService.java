package br.com.ticketflow.sales.service;

import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.EventSeatMap;
import br.com.ticketflow.sales.domain.EventSeatSector;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.SectorRepository;
import br.com.ticketflow.sales.repository.SeatMapRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Criação da planta de assentos de um evento (usada pelo seeder e, depois, pelo painel do organizador). */
@Service
public class SeatMapService {

    /** Setor: código, nome, tipo de ingresso que o vende e filas ("ABCD"). */
    public record SectorSpec(String code, String name, TicketType ticketType, String rows) {}

    private final SeatMapRepository maps;
    private final SectorRepository sectors;
    private final EventSeatRepository seats;

    public SeatMapService(SeatMapRepository maps, SectorRepository sectors, EventSeatRepository seats) {
        this.maps = maps;
        this.sectors = sectors;
        this.seats = seats;
    }

    /** {@code soldSeats}: assentos já vendidos (dados de demonstração); vazio para um evento novo. */
    @Transactional
    public void create(UUID eventId, String rows, int seatsPerRow, int aisleAfter, List<SectorSpec> specs,
                       Set<String> accessibleSeats, Instant now, Set<String> soldSeats) {
        maps.save(EventSeatMap.of(eventId, rows, seatsPerRow, aisleAfter));
        List<EventSeat> all = new ArrayList<>();
        for (SectorSpec s : specs) {
            sectors.save(EventSeatSector.of(eventId, s.code(), s.name(), s.ticketType().getId(), s.rows()));
            for (char row : s.rows().toCharArray()) {
                for (int n = 1; n <= seatsPerRow; n++) {
                    String code = "" + row + String.format("%02d", n);
                    EventSeat seat = EventSeat.create(eventId, s.code(), String.valueOf(row), n, accessibleSeats.contains(code), now);
                    if (soldSeats.contains(code)) {
                        seat.sell(now);
                    }
                    all.add(seat);
                }
            }
        }
        seats.saveAll(all);
    }
}
