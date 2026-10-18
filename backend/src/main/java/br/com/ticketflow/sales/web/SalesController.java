package br.com.ticketflow.sales.web;

import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.realtime.SeatStreamRegistry;
import br.com.ticketflow.sales.service.SalesService;
import br.com.ticketflow.sales.service.WaitlistService;
import br.com.ticketflow.sales.web.dto.SalesDtos.EventSalesDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.SeatAvailabilityDto;
import br.com.ticketflow.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/events")
@Tag(name = "Venda", description = "Lotes, mapa de assentos e disponibilidade em tempo real")
public class SalesController {

    private static final Logger log = LoggerFactory.getLogger(SalesController.class);

    private final SalesService sales;
    private final WaitlistService waitlist;
    private final SeatStreamRegistry streams;
    private final EventRepository events;
    private final JwtDecoder jwtDecoder;
    private final Clock clock;

    public SalesController(SalesService sales, WaitlistService waitlist, SeatStreamRegistry streams, EventRepository events,
                           JwtDecoder jwtDecoder, Clock clock) {
        this.sales = sales;
        this.waitlist = waitlist;
        this.streams = streams;
        this.events = events;
        this.jwtDecoder = jwtDecoder;
        this.clock = clock;
    }

    @Operation(summary = "Lotes, preços, taxa e planta de assentos do evento")
    @GetMapping("/{slug}/sales")
    public EventSalesDto sales(@PathVariable String slug) {
        return sales.sales(slug);
    }

    @Operation(summary = "Assentos indisponíveis (vendidos/reservados); os da reserva do próprio usuário não aparecem")
    @GetMapping("/{eventId}/seats")
    public SeatAvailabilityDto seats(@PathVariable String eventId, @AuthenticationPrincipal Jwt jwt) {
        return sales.seats(uuid(eventId), CurrentUser.idOrNull(jwt));
    }

    /**
     * SSE de disponibilidade ({@code event: seat.updated}). {@code EventSource} não envia cabeçalhos, então o token de
     * acesso (curto, 15 min) pode vir em {@code ?access_token=}. Sem token o stream é público (o mapa também é);
     * com token, mudanças causadas pelo próprio usuário não são reenviadas a ele. Ao reconectar
     * ({@code Last-Event-ID}), o estado completo dos assentos é reenviado para cobrir mensagens perdidas.
     */
    @Operation(summary = "Stream SSE de atualizações de assentos")
    @GetMapping(path = "/{eventId}/seats/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String eventId,
                             @RequestParam(name = "access_token", required = false) String accessToken,
                             @RequestHeader(name = "Last-Event-ID", required = false) String lastEventId,
                             @AuthenticationPrincipal Jwt jwt,
                             HttpServletResponse response) throws IOException {
        UUID event = uuid(eventId);
        UUID userId = CurrentUser.idOrNull(jwt);
        if (userId == null && accessToken != null && !accessToken.isBlank()) {
            try {
                userId = UUID.fromString(jwtDecoder.decode(accessToken).getSubject());
            } catch (JwtException | IllegalArgumentException e) {
                throw ApiException.unauthorized("UNAUTHENTICATED", "Token inválido ou expirado");
            }
        }
        events.findVisibleById(event, clock.instant()).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));

        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no"); // proxies (nginx) não podem armazenar o stream em buffer

        SseEmitter emitter = streams.subscribe(event, userId);
        try {
            emitter.send(SseEmitter.event().reconnectTime(3_000).comment("connected"));
            if (lastEventId != null) {
                for (Map.Entry<String, String> e : sales.snapshot(event, userId, clock.instant(), true).entrySet()) {
                    streams.sendTo(emitter, e.getKey(), e.getValue());
                }
            }
        } catch (IOException | IllegalStateException e) {
            log.debug("Cliente SSE desconectou durante a abertura");
            emitter.complete();
        }
        return emitter;
    }

    @Operation(summary = "\"Avise-me\" de um tipo de ingresso esgotado")
    @PostMapping("/{eventId}/ticket-types/{typeId}/waitlist")
    public Map<String, Boolean> waitlist(@PathVariable String eventId, @PathVariable String typeId, @AuthenticationPrincipal Jwt jwt) {
        waitlist.join(CurrentUser.id(jwt), uuid(eventId), typeId);
        return Map.of("ok", true);
    }

    private static UUID uuid(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound("Evento não encontrado.");
        }
    }
}
