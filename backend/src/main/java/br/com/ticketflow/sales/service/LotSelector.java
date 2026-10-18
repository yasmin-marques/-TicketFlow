package br.com.ticketflow.sales.service;

import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import java.time.Instant;
import java.util.Comparator;
import java.util.Optional;

/** Regra única de qual lote de um tipo de ingresso está "à venda agora". */
public final class LotSelector {

    private LotSelector() {}

    /** Primeiro lote (por posição) publicado, dentro da janela de venda e com estoque livre. */
    public static Optional<TicketLot> open(TicketType type, Instant now) {
        return type.getLots().stream()
                .filter(l -> l.getStatus() == TicketLot.Status.PUBLISHED)
                .filter(l -> !l.getSalesStart().isAfter(now) && l.getSalesEnd().isAfter(now))
                .filter(l -> l.available() > 0)
                .min(Comparator.comparingInt(TicketLot::getPosition));
    }
}
