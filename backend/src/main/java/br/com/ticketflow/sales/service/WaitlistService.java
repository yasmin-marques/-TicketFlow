package br.com.ticketflow.sales.service;

import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.catalog.repository.EventRepository;
import br.com.ticketflow.catalog.repository.TicketTypeRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.sales.domain.WaitlistEntry;
import br.com.ticketflow.sales.repository.WaitlistRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** "Avise-me": inscrição idempotente na lista de espera de um tipo de ingresso. */
@Service
public class WaitlistService {

    private final EventRepository events;
    private final TicketTypeRepository ticketTypes;
    private final WaitlistRepository waitlist;
    private final Clock clock;

    public WaitlistService(EventRepository events, TicketTypeRepository ticketTypes, WaitlistRepository waitlist, Clock clock) {
        this.events = events;
        this.ticketTypes = ticketTypes;
        this.waitlist = waitlist;
        this.clock = clock;
    }

    @Transactional
    public void join(UUID userId, UUID eventId, String typeCode) {
        events.findVisibleById(eventId, clock.instant()).orElseThrow(() -> ApiException.notFound("Evento não encontrado."));
        TicketType type = ticketTypes.findByEventIdAndCode(eventId, typeCode)
                .orElseThrow(() -> ApiException.notFound("Tipo de ingresso não encontrado."));
        if (waitlist.existsByUserIdAndTicketTypeId(userId, type.getId())) {
            return;
        }
        try {
            waitlist.saveAndFlush(WaitlistEntry.of(userId, type.getId(), clock.instant()));
        } catch (DataIntegrityViolationException e) {
            // inscrição simultânea da mesma pessoa: já está na lista
        }
    }
}
