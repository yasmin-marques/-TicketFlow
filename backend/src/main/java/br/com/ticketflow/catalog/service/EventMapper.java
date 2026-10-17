package br.com.ticketflow.catalog.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.Venue;
import br.com.ticketflow.catalog.web.dto.EventDetailDto;
import br.com.ticketflow.catalog.web.dto.EventSummaryDto;
import br.com.ticketflow.catalog.web.dto.EventSummaryDto.CategoryRef;
import br.com.ticketflow.catalog.web.dto.EventSummaryDto.VenueSummary;
import br.com.ticketflow.common.Money;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/** Converte entidades em DTOs no formato esperado pelo frontend (reais, datas ISO com offset, badges). */
@Component
public class EventMapper {

    private static final double EARTH_RADIUS_KM = 6371.0;

    private final EventAvailabilityService availability;

    public EventMapper(EventAvailabilityService availability) {
        this.availability = availability;
    }

    public EventSummaryDto toSummary(Event e, ZoneId zone, double originLat, double originLng) {
        return new EventSummaryDto(
                e.getId().toString(),
                e.getSlug(),
                e.getTitle(),
                new CategoryRef(e.getCategory().getSlug(), e.getCategory().getName()),
                at(e.getStartsAt(), zone),
                new VenueSummary(
                        e.getVenue().getName(), e.getVenue().getCity(), e.getVenue().getState(),
                        distanceKm(e.getVenue(), originLat, originLng)),
                Money.toReais(e.getMinPriceCents()),
                e.getCoverUrl(),
                badges(e),
                e.isHasSeatMap());
    }

    public EventDetailDto toDetail(Event e, Instant now, ZoneId zone, double originLat, double originLng) {
        Venue v = e.getVenue();
        var lot = availability.currentLot(e, now)
                .map(l -> new EventDetailDto.LotInfoDto(l.getName(), l.remaining()))
                .orElse(null);
        return new EventDetailDto(
                e.getId().toString(),
                e.getSlug(),
                e.getTitle(),
                new CategoryRef(e.getCategory().getSlug(), e.getCategory().getName()),
                at(e.getStartsAt(), zone),
                e.getEndsAt() == null ? null : at(e.getEndsAt(), zone),
                new EventDetailDto.VenueDetail(
                        v.getName(), v.getCity(), v.getState(), distanceKm(v, originLat, originLng),
                        v.getAddress(), v.getDistrict(), v.getNotes()),
                Money.toReais(e.getMinPriceCents()),
                e.getCoverUrl(),
                badges(e),
                e.isHasSeatMap(),
                e.getSubtitle(),
                e.getOrganization().getName(),
                e.getDescription(),
                e.getAgeRating(),
                e.getScheduleItems().stream()
                        .map(i -> new EventDetailDto.ScheduleItemDto(i.getTimeLabel(), i.getTitle(), i.getLocation()))
                        .toList(),
                e.getPolicyItems().stream()
                        .map(i -> new EventDetailDto.PolicyItemDto(i.getTitle(), i.getBody()))
                        .toList(),
                lot,
                e.getServiceFeePct());
    }

    static List<String> badges(Event e) {
        List<String> badges = new ArrayList<>(2);
        if (e.isSoldOut()) {
            badges.add("soldOut");
        } else if (e.isLastTickets()) {
            badges.add("lastTickets");
        }
        return badges;
    }

    private static OffsetDateTime at(Instant instant, ZoneId zone) {
        return instant.truncatedTo(ChronoUnit.SECONDS).atZone(zone).toOffsetDateTime();
    }

    /** Distância em km até a origem (1 casa decimal), ou {@code null} se o local não tem coordenadas. */
    static Double distanceKm(Venue v, double originLat, double originLng) {
        if (!v.hasCoordinates()) {
            return null;
        }
        double lat1 = Math.toRadians(originLat);
        double lat2 = Math.toRadians(v.getLatitude().doubleValue());
        double dLat = lat2 - lat1;
        double dLng = Math.toRadians(v.getLongitude().doubleValue() - originLng);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
        return Math.round(km * 10.0) / 10.0;
    }
}
