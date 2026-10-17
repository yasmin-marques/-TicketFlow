package br.com.ticketflow.catalog.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** Card de evento ({@code EventSummary} do frontend). Campos "| null" do contrato são sempre enviados. */
public record EventSummaryDto(
        String id,
        String slug,
        String title,
        CategoryRef category,
        OffsetDateTime startsAt,
        VenueSummary venue,
        @JsonInclude(JsonInclude.Include.ALWAYS) BigDecimal minPrice,
        @JsonInclude(JsonInclude.Include.ALWAYS) String coverUrl,
        List<String> badges,
        boolean hasSeatMap) {

    public record CategoryRef(String slug, String name) {}

    public record VenueSummary(
            String name, String city, String state, @JsonInclude(JsonInclude.Include.ALWAYS) Double distanceKm) {}
}
