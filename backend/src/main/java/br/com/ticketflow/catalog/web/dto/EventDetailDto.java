package br.com.ticketflow.catalog.web.dto;

import br.com.ticketflow.catalog.web.dto.EventSummaryDto.CategoryRef;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Página do evento ({@code EventDetail} do frontend). Campos opcionais ausentes são omitidos (o frontend
 * trata {@code undefined}); os "| null" do contrato ({@code minPrice}, {@code coverUrl}, {@code distanceKm})
 * são sempre enviados.
 */
public record EventDetailDto(
        String id,
        String slug,
        String title,
        CategoryRef category,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        VenueDetail venue,
        @JsonInclude(JsonInclude.Include.ALWAYS) BigDecimal minPrice,
        @JsonInclude(JsonInclude.Include.ALWAYS) String coverUrl,
        List<String> badges,
        boolean hasSeatMap,
        String subtitle,
        String organizer,
        String description,
        Short ageRating,
        List<ScheduleItemDto> schedule,
        List<PolicyItemDto> cancellationPolicy,
        LotInfoDto lot,
        BigDecimal serviceFeePct) {

    public record VenueDetail(
            String name,
            String city,
            String state,
            @JsonInclude(JsonInclude.Include.ALWAYS) Double distanceKm,
            String address,
            String district,
            String notes) {}

    public record ScheduleItemDto(String time, String title, String location) {}

    public record PolicyItemDto(String title, String body) {}

    /** Lote atual à venda (o de menor preço). */
    public record LotInfoDto(String name, int remaining) {}
}
