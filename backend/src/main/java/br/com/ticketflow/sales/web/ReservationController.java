package br.com.ticketflow.sales.web;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.idempotency.IdempotencyService;
import br.com.ticketflow.sales.service.ReservationService;
import br.com.ticketflow.sales.web.dto.SalesDtos.CreateReservationRequest;
import br.com.ticketflow.sales.web.dto.SalesDtos.ReservationDto;
import br.com.ticketflow.sales.web.dto.SalesDtos.SetSeatsRequest;
import br.com.ticketflow.security.CurrentUser;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Reservas temporárias (10 min). Cada usuário só enxerga e altera as suas. */
@RestController
@RequestMapping("/api/reservations")
@Tag(name = "Reservas")
public class ReservationController {

    private final ReservationService reservations;
    private final IdempotencyService idempotency;

    public ReservationController(ReservationService reservations, IdempotencyService idempotency) {
        this.reservations = reservations;
        this.idempotency = idempotency;
    }

    @Operation(summary = "Cria a reserva (Idempotency-Key obrigatório); libera a reserva ativa anterior do usuário")
    @PostMapping
    public ResponseEntity<JsonNode> create(@AuthenticationPrincipal Jwt jwt,
                                           @RequestHeader(name = "Idempotency-Key", required = false) String key,
                                           @Valid @RequestBody CreateReservationRequest body, HttpServletRequest request) {
        UUID userId = CurrentUser.id(jwt);
        return idempotency.execute(userId, idempotency.requireKey(key), "POST", request.getRequestURI(), body, HttpStatus.CREATED,
                () -> reservations.create(userId, body));
    }

    @GetMapping("/{id}")
    public ReservationDto get(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        return reservations.get(CurrentUser.id(jwt), uuid(id));
    }

    @Operation(summary = "Substitui os assentos de um item (idempotente por natureza; Idempotency-Key opcional)")
    @PutMapping("/{id}/items/{ticketTypeId}/seats")
    public ResponseEntity<?> setSeats(@AuthenticationPrincipal Jwt jwt, @PathVariable String id, @PathVariable String ticketTypeId,
                                             @RequestHeader(name = "Idempotency-Key", required = false) String key,
                                             @Valid @RequestBody SetSeatsRequest body, HttpServletRequest request) {
        UUID userId = CurrentUser.id(jwt);
        UUID reservationId = uuid(id);
        List<String> seatIds = body.seatIds() == null ? List.of() : body.seatIds();
        if (key == null || key.isBlank()) {
            return ResponseEntity.ok(reservations.setSeats(userId, reservationId, ticketTypeId, seatIds));
        }
        return idempotency.execute(userId, idempotency.requireKey(key), "PUT", request.getRequestURI(), body, HttpStatus.OK,
                () -> reservations.setSeats(userId, reservationId, ticketTypeId, seatIds));
    }

    @Operation(summary = "Libera a reserva (o usuário saiu do fluxo)")
    @DeleteMapping("/{id}")
    public Map<String, Boolean> release(@AuthenticationPrincipal Jwt jwt, @PathVariable String id) {
        reservations.release(CurrentUser.id(jwt), uuid(id));
        return Map.of("ok", true);
    }

    private static UUID uuid(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            throw ApiException.notFound("Reserva não encontrada");
        }
    }
}
