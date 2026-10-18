package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.Venue;
import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.org.events.EventStats.Stats;
import br.com.ticketflow.org.web.OrgDtos.OrgEventDto;
import br.com.ticketflow.org.web.OrgDtos.OrgEventSummaryDto;
import br.com.ticketflow.org.web.OrgDtos.SeatMapDto;
import br.com.ticketflow.org.web.OrgDtos.VenueDto;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;

/** Evento do painel ({@code OrgEvent}/{@code OrgEventSummary}). Requer transação aberta (associações preguiçosas). */
@Component
public class OrgEventMapper {

    private final SeatLayouts layouts;
    private final ZoneId zone;

    public OrgEventMapper(SeatLayouts layouts, AppProperties props) {
        this.layouts = layouts;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    /** Status do painel: um evento publicado cujo horário já passou aparece como {@code ended}. */
    public static String status(Event e, Instant now) {
        return switch (e.getStatus()) {
            case DRAFT -> "draft";
            case CANCELLED -> "cancelled";
            case ENDED -> "ended";
            case PUBLISHED -> e.hasEnded(now) ? "ended" : "published";
        };
    }

    public OrgEventDto toDto(Event e, Stats s, Instant now) {
        SeatMapDto seatMap = e.isHasSeatMap() ? layouts.read(e) : null;
        return new OrgEventDto(e.getId().toString(), e.getTitle(), e.getSlug(), e.getCategory().getSlug(),
                e.getAgeRating() == null ? 0 : e.getAgeRating(), nz(e.getDescription()), at(e.getStartsAt()),
                at(e.getEndsAt() != null ? e.getEndsAt() : e.getStartsAt()), venue(e.getVenue()), e.getCoverName(),
                seatMap != null, seatMap, e.getCancellationPolicy(), status(e, now), at(e.getCreatedAt()), at(e.getUpdatedAt()),
                s.capacity(), s.sold(), Money.toReais(s.revenueCents()), s.checkedIn());
    }

    public OrgEventSummaryDto toSummary(Event e, Stats s, Instant now) {
        Venue v = e.getVenue();
        String name = v == null || v.getName() == null || v.getName().isBlank() ? "Local a definir" : v.getName();
        String label = v != null && v.getCity() != null && !v.getCity().isBlank() ? name + " · " + v.getCity() : name;
        return new OrgEventSummaryDto(e.getId().toString(), e.getSlug(), e.getTitle(), label, at(e.getStartsAt()), status(e, now),
                s.sold(), s.capacity(), Money.toReais(s.revenueCents()));
    }

    public OffsetDateTime at(Instant i) {
        return i == null ? null : i.truncatedTo(ChronoUnit.SECONDS).atZone(zone).toOffsetDateTime();
    }

    private static VenueDto venue(Venue v) {
        if (v == null) {
            return new VenueDto("", "", "", "", "", "");
        }
        return new VenueDto(nz(v.getName()), nz(v.getAddress()), nz(v.getDistrict()), nz(v.getCity()),
                v.getState() == null ? "" : v.getState().trim(), nz(v.getNotes()));
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
