package br.com.ticketflow.org.web;

import br.com.ticketflow.catalog.web.dto.PageDto;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.checkin.AttendeeQueries;
import br.com.ticketflow.org.checkin.CheckinService;
import br.com.ticketflow.org.orders.OrgOrderService;
import br.com.ticketflow.org.web.OrgDtos.AttendeeDto;
import br.com.ticketflow.org.web.OrgDtos.AttendeesResponse;
import br.com.ticketflow.org.web.OrgDtos.CheckinRequest;
import br.com.ticketflow.org.web.OrgDtos.CheckinResultDto;
import br.com.ticketflow.org.web.OrgDtos.CheckinStatsDto;
import br.com.ticketflow.org.web.OrgDtos.ManualCheckinRequest;
import br.com.ticketflow.org.web.OrgDtos.OrgOrderDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Pedidos, participantes e portaria da organização. */
@RestController
@RequestMapping("/api/org")
@Tag(name = "Organizador · Operação")
public class OrgOperationsController {

    private final OrgOrderService orders;
    private final AttendeeQueries attendees;
    private final CheckinService checkin;

    public OrgOperationsController(OrgOrderService orders, AttendeeQueries attendees, CheckinService checkin) {
        this.orders = orders;
        this.attendees = attendees;
        this.checkin = checkin;
    }

    @Operation(summary = "Pedidos paginados e filtrados (pageSize ≤ 500, usado também na exportação CSV)")
    @GetMapping("/orders")
    public PageDto<OrgOrderDto> orders(OrgContext ctx,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(required = false) String eventId,
                                       @RequestParam(required = false) String method,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(required = false) String from,
                                       @RequestParam(required = false) String to,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "12") int pageSize) {
        return orders.list(ctx, new OrgOrderService.Query(q, eventId, method, status, from, to, page, pageSize));
    }

    @GetMapping("/orders/{id}")
    public OrgOrderDto order(OrgContext ctx, @PathVariable UUID id) {
        return orders.get(ctx, id);
    }

    @Operation(summary = "Reembolsa um pedido pago (409 se não estiver pago ou tiver ingresso utilizado)")
    @PostMapping("/orders/{id}/refund")
    public OrgOrderDto refund(OrgContext ctx, @PathVariable UUID id) {
        return orders.refund(ctx, id);
    }

    @GetMapping("/attendees")
    public AttendeesResponse attendees(OrgContext ctx,
                                       @RequestParam(required = false) String eventId,
                                       @RequestParam(required = false) String q,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "15") int pageSize) {
        return attendees.list(ctx, eventId, q, status, page, pageSize);
    }

    @Operation(summary = "Check-in manual (409 ALREADY_USED se já entrou)")
    @PostMapping("/attendees/{ticketId}/checkin")
    public AttendeeDto manualCheckin(OrgContext ctx, @PathVariable UUID ticketId,
                                     @Valid @RequestBody(required = false) ManualCheckinRequest body) {
        return checkin.manual(ctx, ticketId, body == null ? null : body.gate());
    }

    @Operation(summary = "Desfaz um check-in (gerente/proprietário)")
    @DeleteMapping("/attendees/{ticketId}/checkin")
    public AttendeeDto undoCheckin(OrgContext ctx, @PathVariable UUID ticketId) {
        return checkin.undo(ctx, ticketId);
    }

    @GetMapping("/events/{id}/checkin")
    public CheckinStatsDto checkinStats(OrgContext ctx, @PathVariable UUID id) {
        return checkin.stats(ctx, id);
    }

    @Operation(summary = "Leitura da portaria: sempre 200 com result = valid | used | invalid")
    @PostMapping("/events/{id}/checkin")
    public CheckinResultDto scan(OrgContext ctx, @PathVariable UUID id, @Valid @RequestBody CheckinRequest body) {
        return checkin.scan(ctx, id, body.code(), body.gate());
    }
}
