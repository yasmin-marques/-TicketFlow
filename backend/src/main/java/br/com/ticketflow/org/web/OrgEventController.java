package br.com.ticketflow.org.web;

import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.events.OrgEventService;
import br.com.ticketflow.org.events.OrgLotService;
import br.com.ticketflow.org.web.OrgDtos.EventInput;
import br.com.ticketflow.org.web.OrgDtos.LotInput;
import br.com.ticketflow.org.web.OrgDtos.OrgEventDto;
import br.com.ticketflow.org.web.OrgDtos.OrgEventsResponse;
import br.com.ticketflow.org.web.OrgDtos.OrgLotDto;
import br.com.ticketflow.org.web.OrgDtos.SeatMapRequest;
import br.com.ticketflow.org.web.OrgDtos.SlugAvailability;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Eventos e lotes da organização. Papel ORGANIZER/ADMIN no filtro de segurança; organização e permissões no serviço. */
@RestController
@RequestMapping("/api/org")
@Tag(name = "Organizador · Eventos")
public class OrgEventController {

    private final OrgEventService events;
    private final OrgLotService lots;

    public OrgEventController(OrgEventService events, OrgLotService lots) {
        this.events = events;
        this.lots = lots;
    }

    @Operation(summary = "Eventos da organização com contagem por status")
    @GetMapping("/events")
    public OrgEventsResponse list(OrgContext ctx, @RequestParam(required = false) String status, @RequestParam(required = false) String q) {
        return events.list(ctx, status, q);
    }

    @Operation(summary = "Disponibilidade de um slug (global, inclui o catálogo público)")
    @GetMapping("/events/slug-available")
    public SlugAvailability slugAvailable(OrgContext ctx, @RequestParam(defaultValue = "") String slug,
                                          @RequestParam(required = false) UUID exceptId) {
        return events.slugAvailable(ctx, slug, exceptId);
    }

    @Operation(summary = "Cria um rascunho (campos parciais)")
    @PostMapping("/events")
    public ResponseEntity<OrgEventDto> create(OrgContext ctx, @Valid @RequestBody EventInput input) {
        return ResponseEntity.status(HttpStatus.CREATED).body(events.create(ctx, input));
    }

    @GetMapping("/events/{id}")
    public OrgEventDto get(OrgContext ctx, @PathVariable UUID id) {
        return events.get(ctx, id);
    }

    @PatchMapping("/events/{id}")
    public OrgEventDto update(OrgContext ctx, @PathVariable UUID id, @Valid @RequestBody EventInput input) {
        return events.update(ctx, id, input);
    }

    @Operation(summary = "Publica (422 PUBLISH_BLOCKED com a lista de pendências)")
    @PostMapping("/events/{id}/publish")
    public OrgEventDto publish(OrgContext ctx, @PathVariable UUID id) {
        return events.publish(ctx, id);
    }

    @PostMapping("/events/{id}/unpublish")
    public OrgEventDto unpublish(OrgContext ctx, @PathVariable UUID id) {
        return events.unpublish(ctx, id);
    }

    @Operation(summary = "Cancela o evento e reembolsa todos os pedidos pagos")
    @PostMapping("/events/{id}/cancel")
    public OrgEventDto cancel(OrgContext ctx, @PathVariable UUID id) {
        return events.cancel(ctx, id);
    }

    @DeleteMapping("/events/{id}")
    public ResponseEntity<Void> delete(OrgContext ctx, @PathVariable UUID id) {
        events.delete(ctx, id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Salva o mapa inteiro (null remove o mapa)")
    @PutMapping("/events/{id}/seat-map")
    public OrgEventDto saveSeatMap(OrgContext ctx, @PathVariable UUID id, @Valid @RequestBody SeatMapRequest body) {
        return events.saveSeatMap(ctx, id, body.seatMap());
    }

    // ── Lotes ──────────────────────────────────────────────────────────────────────────────────────────

    @GetMapping("/events/{id}/lots")
    public List<OrgLotDto> lots(OrgContext ctx, @PathVariable UUID id) {
        return lots.list(ctx, id);
    }

    @PostMapping("/events/{id}/lots")
    public ResponseEntity<OrgLotDto> createLot(OrgContext ctx, @PathVariable UUID id, @Valid @RequestBody LotInput input) {
        return ResponseEntity.status(HttpStatus.CREATED).body(lots.create(ctx, id, input));
    }

    @PatchMapping("/lots/{id}")
    public OrgLotDto updateLot(OrgContext ctx, @PathVariable UUID id, @Valid @RequestBody LotInput input) {
        return lots.update(ctx, id, input);
    }

    @DeleteMapping("/lots/{id}")
    public ResponseEntity<Void> deleteLot(OrgContext ctx, @PathVariable UUID id) {
        lots.delete(ctx, id);
        return ResponseEntity.noContent().build();
    }
}
