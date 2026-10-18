package br.com.ticketflow.sales.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** DTOs de venda, assentos e reservas (formato dos tipos TypeScript em {@code src/types/purchase.ts}). */
public final class SalesDtos {

    private SalesDtos() {}

    // ── GET /events/{slug}/sales ───────────────────────────────────────────────────────────────────────

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record LotDto(String name, String status, int total, int remaining, OffsetDateTime opensAt) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TicketTypeDto(String id, String name, String description, String kind, String sectorId, BigDecimal price,
                                LotDto lot, String nextLotNote) {}

    public record SectorDto(String id, String name, String ticketTypeId, BigDecimal price, List<String> rows) {}

    public record SeatMapDto(List<String> rows, int seatsPerRow, int aisleAfter, List<SectorDto> sectors, List<String> accessibleSeatIds) {}

    public record EventSalesDto(String eventId, String slug, String title, OffsetDateTime startsAt, String venueName, String city,
                                String state, @JsonInclude(JsonInclude.Include.ALWAYS) String coverUrl, BigDecimal serviceFeePct,
                                int maxPerOrder, List<TicketTypeDto> ticketTypes,
                                @JsonInclude(JsonInclude.Include.ALWAYS) SeatMapDto seatMap) {}

    // ── GET /events/{eventId}/seats ────────────────────────────────────────────────────────────────────

    public record SeatAvailabilityDto(String eventId, Map<String, String> seats, OffsetDateTime updatedAt) {}

    // ── Reserva ────────────────────────────────────────────────────────────────────────────────────────

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReservationItemDto(String ticketTypeId, String name, String kind, String sectorId, String sectorName, int quantity,
                                     BigDecimal unitPrice, BigDecimal unitFee, List<String> seatIds) {}

    public record ReservationDto(String id, String eventId, String eventSlug, String eventTitle, OffsetDateTime eventStartsAt,
                                 String venueName, String status, OffsetDateTime createdAt, OffsetDateTime expiresAt,
                                 List<ReservationItemDto> items, BigDecimal subtotal, BigDecimal fee, BigDecimal total) {}

    public record ReservationItemRequest(@NotBlank @Size(max = 40) String ticketTypeId, int quantity, @Size(max = 20) List<@Size(max = 8) String> seatIds) {}

    public record CreateReservationRequest(@NotBlank @Size(max = 60) String eventId, @NotEmpty @Size(max = 20) List<@Valid ReservationItemRequest> items) {}

    public record SetSeatsRequest(@Size(max = 20) List<@Size(max = 8) String> seatIds) {}
}
