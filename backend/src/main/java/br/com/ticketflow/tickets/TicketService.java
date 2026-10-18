package br.com.ticketflow.tickets;

import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.web.dto.OrderDtos.TicketDto;
import br.com.ticketflow.outbox.OutboxService;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TicketService {

    private static final Pattern EMAIL = Pattern.compile("^\\S+@\\S+\\.\\S+$");

    private final TicketRepository tickets;
    private final TicketTransferRepository transfers;
    private final UserRepository users;
    private final TicketMapper mapper;
    private final OutboxService outbox;
    private final Clock clock;
    private final TicketCodes codes;

    public TicketService(TicketRepository tickets, TicketTransferRepository transfers, UserRepository users, TicketMapper mapper,
                         OutboxService outbox, Clock clock, TicketCodes codes) {
        this.tickets = tickets;
        this.transfers = transfers;
        this.users = users;
        this.mapper = mapper;
        this.outbox = outbox;
        this.clock = clock;
        this.codes = codes;
    }

    @Transactional
    public List<TicketDto> list(UUID userId) {
        claimPendingTransfers(userId);
        return mapper.toDtos(tickets.findOwnedBy(userId));
    }

    @Transactional(readOnly = true)
    public TicketDto get(UUID userId, UUID id) {
        return mapper.toDto(tickets.findOwned(id, userId).orElseThrow(() -> ApiException.notFound("Ingresso não encontrado")));
    }

    /**
     * Transfere o ingresso. O dono é validado com o ingresso TRAVADO; a versão do QR sobe (o QR anterior deixa de
     * valer) e a associação anterior é removida na mesma transação. Se o destinatário ainda não tem conta, o
     * ingresso fica reservado ao e-mail e é entregue quando ele criar a conta e abrir "Meus ingressos".
     */
    @Transactional
    public Map<String, Object> transfer(UUID userId, UUID ticketId, String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
        Ticket ticket = tickets.lockById(ticketId).filter(t -> userId.equals(t.getOwnerUserId()))
                .orElseThrow(() -> ApiException.notFound("Ingresso não encontrado"));
        if (!EMAIL.matcher(email).matches()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "E-mail inválido");
        }
        User sender = users.findById(userId).orElseThrow(() -> ApiException.notFound("Ingresso não encontrado"));
        if (email.equalsIgnoreCase(sender.getEmail())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Informe o e-mail de outra pessoa");
        }
        if (ticket.getStatus() != Ticket.Status.VALID) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "Só ingressos válidos podem ser transferidos");
        }
        Instant now = clock.instant();
        if (!ticket.getEvent().getStartsAt().isAfter(now)) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "Este evento já começou");
        }

        User recipient = users.findByEmail(email).filter(User::isEnabled).orElse(null);
        ticket.setOwnerUserId(recipient == null ? null : recipient.getId());
        ticket.setTransferEmail(recipient == null ? email : null);
        ticket.setQrVersion(ticket.getQrVersion() + 1);
        // O código digitável também muda: quem transferiu não consegue entrar digitando o código antigo na portaria.
        ticket.setCode(codes.next());
        if (recipient != null) {
            ticket.setHolderName(recipient.getName());
        }
        transfers.save(TicketTransfer.of(ticket.getId(), userId, recipient == null ? null : recipient.getId(), email, now));

        Map<String, Object> event = new HashMap<>();
        event.put("ticketId", ticket.getId().toString());
        event.put("fromUserId", userId.toString());
        event.put("toUserId", recipient == null ? null : recipient.getId().toString());
        outbox.add("ticket", ticket.getId(), "ticket.transferred", event);
        return Map.of("ok", true, "recipient", email);
    }

    private void claimPendingTransfers(UUID userId) {
        users.findById(userId).ifPresent(u -> tickets.findPendingFor(u.getEmail()).forEach(t -> {
            t.setOwnerUserId(userId);
            t.setTransferEmail(null);
            t.setHolderName(u.getName());
        }));
    }
}
