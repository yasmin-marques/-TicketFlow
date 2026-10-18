package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.EventStatus;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.org.web.OrgDtos.SeatCellDto;
import br.com.ticketflow.org.web.OrgDtos.SeatMapDto;
import br.com.ticketflow.org.web.OrgDtos.SeatRowDto;
import br.com.ticketflow.org.web.OrgDtos.SectorDto;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.realtime.SeatUpdateBus;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.SeatStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Salva o mapa do editor e o traduz para o modelo de venda ({@code event_seats}, setores e grade).
 *
 * <p>Roda com o evento travado e TODOS os assentos do evento travados ({@code FOR UPDATE}, em ordem de id — a mesma
 * ordem usada pelos compradores, sem deadlock). Assim nenhuma reserva/venda muda um assento durante a edição, e:
 * <ul>
 *   <li>assento vendido ou com reserva ativa não pode ser removido, bloqueado nem mudar de setor ({@code 409 SEAT_SOLD});</li>
 *   <li>assento com histórico de ingresso (ex.: reembolsado) não é apagado: fica bloqueado;</li>
 *   <li>mudanças de bloqueio são anunciadas no SSE do comprador depois do commit.</li>
 * </ul>
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class OrgSeatMapService {

    private static final Pattern LABEL = Pattern.compile("^([A-Z])(\\d{2,3})$");
    private static final Pattern ROW = Pattern.compile("^[A-Z]$");
    private static final int MAX_SEATS = 2_600;

    private record Desired(String code, String row, int number, String sectorCode, boolean blocked) {}

    private final EventSeatRepository seats;
    private final OrgTicketTypes ticketTypes;
    private final SeatLayouts layouts;
    private final SeatUpdateBus bus;
    private final JdbcTemplate jdbc;
    private final EntityManager em;

    public OrgSeatMapService(EventSeatRepository seats, OrgTicketTypes ticketTypes, SeatLayouts layouts, SeatUpdateBus bus, JdbcTemplate jdbc,
                             EntityManager em) {
        this.seats = seats;
        this.ticketTypes = ticketTypes;
        this.layouts = layouts;
        this.bus = bus;
        this.jdbc = jdbc;
        this.em = em;
    }

    /** {@code e} deve estar travado pelo chamador. {@code map == null} remove o mapa (evento sem assento marcado). */
    public void apply(Event e, SeatMapDto map, Instant now) {
        Map<String, String> sectorCodes = map == null ? Map.of() : sectorCodes(map);
        Map<String, Desired> desired = map == null ? Map.of() : desiredSeats(map, sectorCodes);

        List<EventSeat> current = seats.lockByEvent(e.getId());
        Set<UUID> ticketed = new HashSet<>(jdbc.queryForList(
                "select distinct seat_id from tickets where event_id = ? and seat_id is not null", UUID.class, e.getId()));
        List<SeatUpdate> updates = new ArrayList<>();
        Map<String, EventSeat> byCode = new HashMap<>();
        current.forEach(s -> byCode.put(s.getCode(), s));

        // 1) Assentos que saem do mapa
        List<EventSeat> toDelete = new ArrayList<>();
        for (EventSeat s : current) {
            if (desired.containsKey(s.getCode())) {
                continue;
            }
            assertNotBusy(s, now, "removido");
            freeExpiredHold(s, now);
            if (ticketed.contains(s.getId())) {
                if (!s.isBlocked()) {
                    s.setBlocked(true); // histórico de ingresso: não apaga, só tira de venda
                    s.setUpdatedAt(now);
                    updates.add(new SeatUpdate(e.getId(), s.getCode(), "sold", null));
                }
            } else {
                toDelete.add(s);
                updates.add(new SeatUpdate(e.getId(), s.getCode(), "sold", null));
            }
        }

        // 2) Assentos mantidos (setor/bloqueio) e novos
        List<EventSeat> created = new ArrayList<>();
        for (Desired d : desired.values()) {
            EventSeat s = byCode.get(d.code());
            if (s == null) {
                EventSeat seat = EventSeat.create(e.getId(), d.sectorCode(), d.row(), d.number(), false, now);
                seat.setBlocked(d.blocked());
                created.add(seat);
                updates.add(new SeatUpdate(e.getId(), d.code(), d.blocked() ? "sold" : "available", null));
                continue;
            }
            boolean sectorChanged = !s.getSectorCode().equals(d.sectorCode());
            boolean blockChanged = s.isBlocked() != d.blocked();
            if (sectorChanged) {
                assertNotBusy(s, now, "trocado de setor");
            }
            if (blockChanged && d.blocked()) {
                assertNotBusy(s, now, "bloqueado");
            }
            if (sectorChanged || blockChanged) {
                freeExpiredHold(s, now);
                s.setSectorCode(d.sectorCode());
                s.setBlocked(d.blocked());
                s.setUpdatedAt(now);
            }
            if (blockChanged) {
                updates.add(new SeatUpdate(e.getId(), s.getCode(), d.blocked() ? "sold" : "available", null));
            }
        }
        seats.deleteAll(toDelete);
        seats.saveAll(created);
        seats.flush();

        // 3) Setores ↔ tipos de ingresso, grade de venda e planta do editor
        Set<String> inMap = new HashSet<>(sectorCodes.values());
        for (TicketType t : e.getTicketTypes()) {
            if (t.getKind() == TicketKind.SEATED && !inMap.contains(t.getSectorCode())) {
                ticketTypes.unlink(t);
            }
        }
        jdbc.update("delete from event_seat_sectors where event_id = ?", e.getId());
        if (map == null) {
            jdbc.update("delete from event_seat_maps where event_id = ?", e.getId());
            e.setSeatLayout(null);
            e.setHasSeatMap(false);
        } else {
            saveSalesGrid(e, map, sectorCodes, now);
            e.setSeatLayout(layouts.write(normalized(map, sectorCodes)));
            e.setHasSeatMap(true);
        }
        if (e.getStatus() == EventStatus.PUBLISHED) {
            bus.publishAfterCommit(updates);
        }
    }

    /** Assentos não bloqueados de cada setor (para a validação de publicação). */
    public Map<String, Integer> sellableSeatsBySector(UUID eventId) {
        Map<String, Integer> out = new LinkedHashMap<>();
        jdbc.query("select sector_code, count(*) from event_seats where event_id = ? and not blocked group by sector_code",
                rs -> {
                    out.put(rs.getString(1), rs.getInt(2));
                }, eventId);
        return out;
    }

    // ── interno ────────────────────────────────────────────────────────────────────────────────────────

    private void saveSalesGrid(Event e, SeatMapDto map, Map<String, String> sectorCodes, Instant now) {
        StringBuilder letters = new StringBuilder();
        int seatsPerRow = 1;
        for (SeatRowDto r : map.rows()) {
            letters.append(r.letter());
            seatsPerRow = Math.max(seatsPerRow, r.cells().size());
        }
        int aisleAfter = aisleAfter(map, seatsPerRow);
        jdbc.update("""
                insert into event_seat_maps (event_id, rows, seats_per_row, aisle_after) values (?, ?, ?, ?)
                on conflict (event_id) do update set rows = excluded.rows, seats_per_row = excluded.seats_per_row, aisle_after = excluded.aisle_after
                """, e.getId(), letters.toString(), seatsPerRow, aisleAfter);

        Set<String> inMap = new HashSet<>(sectorCodes.values());
        Map<String, TicketType> typeBySector = new LinkedHashMap<>();
        for (SectorDto sector : map.sectors()) {
            String code = sectorCodes.get(sector.id());
            typeBySector.put(sector.id(), ticketTypes.linkSector(e, code, sector.name(), inMap, now));
        }
        em.flush(); // tipos recém-criados precisam existir antes dos setores que os referenciam
        for (SectorDto sector : map.sectors()) {
            jdbc.update("insert into event_seat_sectors (event_id, code, name, ticket_type_id, rows) values (?, ?, ?, ?, ?)",
                    e.getId(), sectorCodes.get(sector.id()), sector.name().trim(), typeBySector.get(sector.id()).getId(),
                    majorityRows(map, sector.id()));
        }
    }

    /** Primeira coluna (1-based, interna) vazia em todas as fileiras = corredor; sem corredor, depois do último assento. */
    private static int aisleAfter(SeatMapDto map, int seatsPerRow) {
        for (int c = 1; c < seatsPerRow - 1; c++) {
            final int col = c;
            boolean gap = map.rows().stream().allMatch(r -> col >= r.cells().size() || r.cells().get(col) == null);
            if (gap) {
                return c;
            }
        }
        return seatsPerRow;
    }

    /** Fileiras em que o setor tem a maioria dos assentos (a grade do comprador associa um setor por fileira). */
    private static String majorityRows(SeatMapDto map, String sectorId) {
        StringBuilder majority = new StringBuilder();
        StringBuilder any = new StringBuilder();
        for (SeatRowDto r : map.rows()) {
            Map<String, Integer> counts = new HashMap<>();
            r.cells().stream().filter(c -> c != null).forEach(c -> counts.merge(c.sectorId(), 1, Integer::sum));
            if (counts.containsKey(sectorId)) {
                any.append(r.letter());
                int mine = counts.get(sectorId);
                if (counts.values().stream().allMatch(v -> v <= mine)) {
                    majority.append(r.letter());
                }
            }
        }
        return majority.length() > 0 ? majority.toString() : any.toString();
    }

    private static void assertNotBusy(EventSeat s, Instant now, String action) {
        if (s.getStatus() == SeatStatus.SOLD) {
            throw new ApiException(HttpStatus.CONFLICT, "SEAT_SOLD", "O assento " + s.getCode() + " já foi vendido e não pode ser " + action)
                    .with("seatId", s.getCode());
        }
        if (s.getStatus() == SeatStatus.RESERVED && s.getHeldUntil() != null && s.getHeldUntil().isAfter(now)) {
            throw new ApiException(HttpStatus.CONFLICT, "SEAT_SOLD",
                    "O assento " + s.getCode() + " está reservado por um comprador agora e não pode ser " + action)
                    .with("seatId", s.getCode());
        }
    }

    /** Hold vencido (a reserva já não vale): solta o assento antes de alterá-lo. */
    private static void freeExpiredHold(EventSeat s, Instant now) {
        if (s.getStatus() == SeatStatus.RESERVED) {
            s.release(now);
        }
    }

    /** id do setor no editor → código de setor no modelo de venda (slug estável, único no evento). */
    private static Map<String, String> sectorCodes(SeatMapDto map) {
        Map<String, String> out = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();
        int i = 1;
        for (SectorDto s : map.sectors()) {
            if (out.containsKey(s.id())) {
                throw validation("Setor repetido: " + s.id());
            }
            String code = Texts.slugify(s.id());
            if (code.isEmpty()) {
                code = "setor-" + i;
            }
            code = code.substring(0, Math.min(40, code.length()));
            if (!used.add(code)) {
                throw validation("Dois setores com o mesmo identificador: " + s.id());
            }
            if (s.name().isBlank()) {
                throw validation("Informe o nome de todos os setores");
            }
            out.put(s.id(), code);
            i++;
        }
        return out;
    }

    private static Map<String, Desired> desiredSeats(SeatMapDto map, Map<String, String> sectorCodes) {
        Map<String, Desired> out = new LinkedHashMap<>();
        Set<String> letters = new HashSet<>();
        for (SeatRowDto r : map.rows()) {
            if (!ROW.matcher(r.letter()).matches() || !letters.add(r.letter())) {
                throw validation("Fileira inválida ou repetida: " + r.letter());
            }
            for (SeatCellDto c : r.cells()) {
                if (c == null) {
                    continue;
                }
                Matcher m = LABEL.matcher(c.label());
                if (!m.matches() || !m.group(1).equals(r.letter())) {
                    throw validation("Assento " + c.label() + " inválido na fileira " + r.letter() + " (use, por exemplo, " + r.letter() + "01)");
                }
                int number = Integer.parseInt(m.group(2));
                if (number < 1 || !String.format("%02d", number).equals(m.group(2))) {
                    throw validation("Numeração inválida no assento " + c.label());
                }
                String sector = sectorCodes.get(c.sectorId());
                if (sector == null) {
                    throw validation("Assento " + c.label() + " com setor inexistente");
                }
                if (out.put(c.label(), new Desired(c.label(), r.letter(), number, sector, c.blocked())) != null) {
                    throw validation("Assento repetido: " + c.label());
                }
                if (out.size() > MAX_SEATS) {
                    throw validation("O mapa pode ter no máximo " + MAX_SEATS + " assentos");
                }
            }
        }
        return out;
    }

    /** Planta gravada com os ids de setor normalizados para o código de venda (estáveis entre edições). */
    private static SeatMapDto normalized(SeatMapDto map, Map<String, String> sectorCodes) {
        List<SectorDto> sectors = map.sectors().stream()
                .map(s -> new SectorDto(sectorCodes.get(s.id()), s.name().trim(), s.price())).toList();
        List<SeatRowDto> rows = map.rows().stream().map(r -> new SeatRowDto(r.letter(), r.cells().stream()
                .map(c -> c == null ? null : new SeatCellDto(c.label(), sectorCodes.get(c.sectorId()), c.blocked()))
                .toList())).toList();
        return new SeatMapDto(sectors, rows, map.generalCapacity());
    }

    private static ApiException validation(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", message);
    }
}
