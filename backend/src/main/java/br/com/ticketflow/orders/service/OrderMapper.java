package br.com.ticketflow.orders.service;

import br.com.ticketflow.common.Money;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.web.dto.OrderDtos.BoletoDto;
import br.com.ticketflow.orders.web.dto.OrderDtos.BuyerDto;
import br.com.ticketflow.orders.web.dto.OrderDtos.OrderDto;
import br.com.ticketflow.orders.web.dto.OrderDtos.OrderLineDto;
import br.com.ticketflow.orders.web.dto.OrderDtos.PixDto;
import br.com.ticketflow.tickets.Ticket;
import br.com.ticketflow.tickets.TicketMapper;
import br.com.ticketflow.tickets.TicketRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class OrderMapper {

    private final TicketRepository tickets;
    private final TicketMapper ticketMapper;
    private final Clock clock;
    private final AppProperties props;
    private final ZoneId zone;

    public OrderMapper(TicketRepository tickets, TicketMapper ticketMapper, Clock clock, AppProperties props) {
        this.tickets = tickets;
        this.ticketMapper = ticketMapper;
        this.clock = clock;
        this.props = props;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    /** Deve rodar dentro de uma transação (associações preguiçosas). */
    public OrderDto toDto(Order o) {
        Instant now = clock.instant();
        // Do ponto de vista do comprador só aparecem os ingressos que ainda são dele (os transferidos saem do pedido).
        List<Ticket> own = tickets.findByOrderIdOrderByCodeAsc(o.getId()).stream()
                .filter(t -> o.getUserId().equals(t.getOwnerUserId())).toList();
        boolean allOwnedValid = own.size() == o.ticketCount() && own.stream().allMatch(t -> t.getStatus() == Ticket.Status.VALID);

        return new OrderDto(o.getId().toString(), o.getCode(), o.getEvent().getId().toString(), o.getEvent().getSlug(),
                o.getEvent().getTitle(), at(o.getEvent().getStartsAt()), o.getEvent().getVenue().getName(), o.getEvent().getVenue().getCity(),
                at(o.getCreatedAt()), status(o, now), o.getPaymentMethod().name().toLowerCase(), o.getCardLast4(),
                o.getInstallments() == null ? null : o.getInstallments().intValue(),
                o.getPixCode() == null ? null : new PixDto(o.getPixCode(), at(o.getPixExpiresAt())),
                o.getBoletoLine() == null ? null : new BoletoDto(o.getBoletoLine(), at(o.getBoletoDueAt())),
                o.getLines().stream().map(l -> new OrderLineDto(l.getDescription(), l.getQuantity(), Money.toReais(l.getUnitPriceCents()), l.seats())).toList(),
                o.ticketCount(), Money.toReais(o.getSubtotalCents()), Money.toReais(o.getFeeCents()), Money.toReais(o.getTotalCents()),
                new BuyerDto(o.getBuyerName(), o.getBuyerEmail(), o.getBuyerPhone(), o.getBuyerCpf(), o.getBuyerBirthDate()),
                o.getRefundedAt() == null ? null : at(o.getRefundedAt()), refundable(o, now, allOwnedValid),
                o.getStatus() == Order.Status.PAID ? ticketMapper.toDtos(own) : List.of());
    }

    /** Pedido pendente com prazo vencido já aparece como "expired", mesmo antes do job de limpeza. */
    static String status(Order o, Instant now) {
        if (o.getStatus() == Order.Status.PENDING && o.getExpiresAt() != null && !o.getExpiresAt().isAfter(now)) {
            return "expired";
        }
        return o.getStatus().name().toLowerCase();
    }

    /** Pago, até 7 dias após a compra, mais de 48 h antes do evento e com todos os ingressos ainda válidos e do comprador. */
    boolean refundable(Order o, Instant now, boolean allOwnedValid) {
        return o.getStatus() == Order.Status.PAID && allOwnedValid
                && !o.getCreatedAt().plus(props.sales().refundWindow()).isBefore(now)
                && o.getEvent().getStartsAt().minus(props.sales().refundMinLead()).isAfter(now);
    }

    private OffsetDateTime at(Instant i) {
        return i.atZone(zone).toOffsetDateTime();
    }
}
