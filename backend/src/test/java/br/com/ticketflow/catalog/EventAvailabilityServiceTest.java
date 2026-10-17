package br.com.ticketflow.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.service.EventAvailabilityService;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class EventAvailabilityServiceTest {

    private static final Instant NOW = Instant.parse("2030-01-01T12:00:00Z");
    private final EventAvailabilityService service = new EventAvailabilityService();

    private Event eventWith(TicketLot... lots) {
        Event e = Event.create(null, null, null, "e", "E", NOW.plus(Duration.ofDays(10)), NOW);
        TicketType type = TicketType.of("geral", "Geral", null, TicketKind.GENERAL, null, 0, NOW);
        for (TicketLot lot : lots) {
            type.addLot(lot);
        }
        e.addTicketType(type);
        return e;
    }

    private TicketLot lot(long price, int total, int sold, int daysUntilEnd) {
        return TicketLot.of("L", price, total, sold, NOW.minus(Duration.ofDays(5)), NOW.plus(Duration.ofDays(daysUntilEnd)), 0, NOW);
    }

    @Test
    void minPriceIsTheCheapestAvailableLot() {
        Event e = eventWith(lot(8000, 100, 100, 5), lot(10000, 100, 10, 5), lot(12000, 100, 0, 8));
        service.recalculate(e, NOW);
        assertThat(e.getMinPriceCents()).isEqualTo(10000);
        assertThat(e.isSoldOut()).isFalse();
    }

    @Test
    void soldOutEventKeepsItsLowestPriceForTheCard() {
        Event e = eventWith(lot(4000, 100, 100, 5));
        service.recalculate(e, NOW);
        assertThat(e.isSoldOut()).isTrue();
        assertThat(e.isLastTickets()).isFalse();
        assertThat(e.getMinPriceCents()).isEqualTo(4000);
    }

    @Test
    void lastTicketsWhenFewRemain() {
        Event e = eventWith(lot(5000, 1000, 990, 5));
        service.recalculate(e, NOW);
        assertThat(e.isLastTickets()).isTrue();
        assertThat(e.isSoldOut()).isFalse();
    }

    @Test
    void freeEventsHaveZeroMinPrice() {
        Event e = eventWith(lot(0, 100, 0, 5));
        service.recalculate(e, NOW);
        assertThat(e.getMinPriceCents()).isZero();
    }

    @Test
    void noLotsMeansNoPrice() {
        Event e = eventWith();
        service.recalculate(e, NOW);
        assertThat(e.getMinPriceCents()).isNull();
        assertThat(e.isSoldOut()).isFalse();
    }
}
