package br.com.ticketflow.catalog.service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Intervalos [from, to) usados nos filtros por data, sempre no fuso do catálogo (São Paulo). */
public final class TimeRanges {

    public record Range(Instant from, Instant toExclusive) {}

    private TimeRanges() {}

    public static Range between(LocalDate from, LocalDate to, ZoneId zone) {
        Instant start = from == null ? null : from.atStartOfDay(zone).toInstant();
        Instant end = to == null ? null : to.plusDays(1).atStartOfDay(zone).toInstant();
        return new Range(start, end);
    }

    public static Range today(Instant now, ZoneId zone) {
        LocalDate d = now.atZone(zone).toLocalDate();
        return between(d, d, zone);
    }

    public static Range month(Instant now, ZoneId zone) {
        LocalDate first = now.atZone(zone).toLocalDate().withDayOfMonth(1);
        return new Range(first.atStartOfDay(zone).toInstant(), first.plusMonths(1).atStartOfDay(zone).toInstant());
    }

    /** Sábado e domingo "deste fim de semana": o próximo, ou o atual se hoje já for sábado/domingo. */
    public static Range weekend(Instant now, ZoneId zone) {
        LocalDate today = now.atZone(zone).toLocalDate();
        LocalDate saturday = switch (today.getDayOfWeek()) {
            case SUNDAY -> today.minusDays(1);
            case SATURDAY -> today;
            default -> today.plusDays(DayOfWeek.SATURDAY.getValue() - today.getDayOfWeek().getValue());
        };
        return between(saturday, saturday.plusDays(1), zone);
    }
}
