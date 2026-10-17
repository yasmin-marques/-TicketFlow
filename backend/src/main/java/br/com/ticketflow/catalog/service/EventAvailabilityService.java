package br.com.ticketflow.catalog.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * Recalcula os campos denormalizados do evento (preço mínimo, esgotado, últimos ingressos) a partir dos
 * lotes, para que a listagem não precise juntar lotes a cada consulta.
 */
@Service
public class EventAvailabilityService {

    /** "Últimos ingressos" quando restam poucos: até 10% da capacidade (mínimo de 20). */
    private static final int LAST_TICKETS_FLOOR = 20;

    public void recalculate(Event event, Instant now) {
        List<TicketLot> lots = event.getTicketTypes().stream()
                .flatMap(t -> t.getLots().stream())
                .filter(l -> l.getStatus() == TicketLot.Status.PUBLISHED)
                .toList();

        if (lots.isEmpty()) {
            event.setMinPriceCents(null);
            event.setSoldOut(false);
            event.setLastTickets(false);
            return;
        }

        long capacity = lots.stream().mapToLong(TicketLot::getQuantityTotal).sum();
        long remaining = lots.stream().mapToLong(TicketLot::remaining).sum();
        boolean soldOut = remaining <= 0;

        // Preço "a partir de": o menor entre os lotes ainda disponíveis (à venda ou futuros); se não restar
        // nenhum (esgotado), mantém o menor preço de todos os lotes para o card continuar informativo.
        event.setMinPriceCents(lots.stream()
                .filter(l -> !l.isSoldOut() && l.getSalesEnd().isAfter(now))
                .map(TicketLot::getPriceCents)
                .min(Long::compare)
                .orElseGet(() -> lots.stream().map(TicketLot::getPriceCents).min(Long::compare).orElse(null)));
        event.setSoldOut(soldOut);
        event.setLastTickets(!soldOut && remaining <= Math.max(LAST_TICKETS_FLOOR, capacity / 10));
    }

    /** Lote atual à venda com o menor preço (ou vazio se nenhum estiver aberto). */
    public Optional<TicketLot> currentLot(Event event, Instant now) {
        return event.getTicketTypes().stream()
                .map(TicketType::getLots)
                .flatMap(List::stream)
                .filter(l -> l.isOnSale(now))
                .min(Comparator.comparingLong(TicketLot::getPriceCents));
    }
}
