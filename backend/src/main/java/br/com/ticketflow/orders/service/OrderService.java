package br.com.ticketflow.orders.service;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.orders.domain.Order;
import br.com.ticketflow.orders.domain.OrderLine;
import br.com.ticketflow.orders.repository.OrderRepository;
import br.com.ticketflow.orders.web.dto.OrderDtos.BuyerInput;
import br.com.ticketflow.orders.web.dto.OrderDtos.CardInput;
import br.com.ticketflow.orders.web.dto.OrderDtos.CreateOrderRequest;
import br.com.ticketflow.orders.web.dto.OrderDtos.HolderInput;
import br.com.ticketflow.orders.web.dto.OrderDtos.OrderDto;
import br.com.ticketflow.outbox.OutboxService;
import br.com.ticketflow.payment.PaymentProvider;
import br.com.ticketflow.payment.PaymentProvider.CardChargeRequest;
import br.com.ticketflow.payment.PaymentProvider.CardChargeResult;
import br.com.ticketflow.payment.PaymentProvider.PendingPayment;
import br.com.ticketflow.payment.PaymentProvider.PendingPaymentRequest;
import br.com.ticketflow.realtime.SeatUpdate;
import br.com.ticketflow.realtime.SeatUpdateBus;
import br.com.ticketflow.sales.domain.EventSeat;
import br.com.ticketflow.sales.domain.EventSeatSector;
import br.com.ticketflow.sales.domain.Reservation;
import br.com.ticketflow.sales.domain.ReservationItem;
import br.com.ticketflow.sales.domain.ReservationStatus;
import br.com.ticketflow.sales.repository.EventSeatRepository;
import br.com.ticketflow.sales.repository.ReservationRepository;
import br.com.ticketflow.sales.repository.SectorRepository;
import br.com.ticketflow.sales.service.ReservationGuard;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    private final OrderRepository orders;
    private final ReservationRepository reservations;
    private final ReservationGuard guard;
    private final EventSeatRepository seats;
    private final SectorRepository sectors;
    private final PaymentProvider provider;
    private final FulfillmentService fulfillment;
    private final OutboxService outbox;
    private final SeatUpdateBus bus;
    private final OrderMapper mapper;
    private final ObjectMapper json;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final AppProperties props;
    private final ZoneId zone;

    public OrderService(OrderRepository orders, ReservationRepository reservations, ReservationGuard guard, EventSeatRepository seats,
                        SectorRepository sectors, PaymentProvider provider, FulfillmentService fulfillment, OutboxService outbox,
                        SeatUpdateBus bus, OrderMapper mapper, ObjectMapper json, JdbcTemplate jdbc, Clock clock, AppProperties props) {
        this.orders = orders;
        this.reservations = reservations;
        this.guard = guard;
        this.seats = seats;
        this.sectors = sectors;
        this.provider = provider;
        this.fulfillment = fulfillment;
        this.outbox = outbox;
        this.bus = bus;
        this.mapper = mapper;
        this.json = json;
        this.jdbc = jdbc;
        this.clock = clock;
        this.props = props;
        this.zone = ZoneId.of(props.catalog().timezone());
    }

    // ── POST /orders ───────────────────────────────────────────────────────────────────────────────────

    /**
     * Checkout. A reserva é travada ({@code FOR UPDATE}) para o tempo todo do checkout: dois checkouts da mesma
     * reserva se serializam e o segundo recebe {@code 409 ALREADY_COMPLETED}; {@code UNIQUE(orders.reservation_id)}
     * é a barreira final. Recusa de pagamento ({@code 402}) desfaz tudo — a reserva continua ativa.
     */
    @Transactional
    public OrderDto create(UUID userId, CreateOrderRequest req) {
        UUID reservationId = parseReservation(req.reservationId());
        guard.failIfExpired(reservationId, userId);

        Instant now = clock.instant();
        Reservation reservation = reservations.lockByIdAndUserId(reservationId, userId)
                .orElseThrow(() -> ApiException.notFound("Reserva não encontrada"));
        if (reservation.getStatus() == ReservationStatus.COMPLETED) {
            throw new ApiException(HttpStatus.CONFLICT, "ALREADY_COMPLETED", "Esta reserva já virou um pedido");
        }
        if (!reservation.isActive() || reservation.isExpiredAt(now)) {
            throw ReservationGuard.expired();
        }

        List<EventSeat> held = seats.findByReservationId(reservation.getId());
        for (ReservationItem item : reservation.getItems()) {
            if (item.getTicketType().getKind() == br.com.ticketflow.catalog.domain.TicketKind.SEATED) {
                long chosen = held.stream().filter(s -> s.getSectorCode().equals(item.getTicketType().getSectorCode())).count();
                if (chosen != item.getQuantity()) {
                    throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "SEATS_INCOMPLETE", "Escolha todos os assentos antes de pagar");
                }
            }
        }

        BuyerInput buyer = req.buyer();
        BuyerValidator.validate(buyer, LocalDate.ofInstant(now, zone));
        Order.Method method = parseMethod(req.payment().method());
        CardInput card = req.payment().card();
        if (method == Order.Method.CARD && (card == null || card.token() == null || card.token().isBlank())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Informe o token do cartão gerado pelo gateway.");
        }

        long total = reservation.totalCents();
        Order order = Order.create(nextCode(), userId, reservation.getEvent(), reservation, method, provider.name(), now);
        String chargeKey = "order-" + reservation.getId(); // estável por reserva: repetir nunca cobra duas vezes

        switch (method) {
            case CARD -> {
                int installments = Math.max(1, Math.min(6, card.installments() == null ? 1 : card.installments()));
                CardChargeResult result = provider.chargeCard(new CardChargeRequest(card.token(), total, installments, chargeKey, order.getCode()));
                if (!result.approved()) {
                    throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "PAYMENT_DECLINED", "Pagamento recusado pelo banco. Nenhum valor foi cobrado.");
                }
                order.setProviderRef(result.providerRef());
                order.setCardLast4(result.last4());
                order.setCardBrand(result.brand());
                order.setInstallments((short) installments);
            }
            case PIX -> {
                Instant expires = now.plus(props.sales().pixTtl());
                PendingPayment p = provider.createPix(new PendingPaymentRequest(total, order.getCode(), chargeKey, expires));
                order.setProviderRef(p.providerRef());
                order.setPixCode(p.code());
                order.setPixExpiresAt(expires);
                order.setExpiresAt(expires);
            }
            case BOLETO -> {
                Instant due = now.plus(props.sales().boletoTtl());
                PendingPayment p = provider.createBoleto(new PendingPaymentRequest(total, order.getCode(), chargeKey, due));
                order.setProviderRef(p.providerRef());
                order.setBoletoLine(p.code());
                order.setBoletoDueAt(due);
                order.setExpiresAt(due);
            }
        }

        order.setSubtotalCents(reservation.subtotalCents());
        order.setFeeCents(reservation.feeCents());
        order.setTotalCents(total);
        order.setBuyerName(buyer.name().trim());
        order.setBuyerEmail(buyer.email().trim());
        order.setBuyerPhone(buyer.phone().trim());
        order.setBuyerCpf(buyer.cpf().trim());
        order.setBuyerBirthDate(buyer.birthDate().trim());
        order.setHoldersJson(holdersJson(req.holders()));
        addLines(order, reservation, held);

        reservation.close(ReservationStatus.COMPLETED, now);
        orders.saveAndFlush(order);

        if (method == Order.Method.CARD) {
            fulfillment.markPaid(order);
        } else {
            // Pendente: o estoque continua segurado até o pagamento (ou o prazo). Estende o hold dos assentos.
            List<SeatUpdate> updates = new ArrayList<>();
            for (EventSeat s : seats.lockByReservation(reservation.getId())) {
                s.hold(reservation.getId(), order.getExpiresAt(), now);
            }
            outbox.add("order", order.getId(), "order.pending", Map.of(
                    "orderId", order.getId().toString(), "orderCode", order.getCode(), "userId", userId.toString(),
                    "method", method.name().toLowerCase(), "totalCents", total));
            bus.publishAfterCommit(updates);
        }
        return mapper.toDto(order);
    }

    // ── GET ────────────────────────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<OrderDto> list(UUID userId) {
        return orders.findByUserIdOrderByCreatedAtDesc(userId).stream().map(mapper::toDto).toList();
    }

    @Transactional(readOnly = true)
    public OrderDto get(UUID userId, UUID id) {
        return mapper.toDto(orders.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Pedido não encontrado")));
    }

    // ── POST /orders/{id}/cancel ───────────────────────────────────────────────────────────────────────

    @Transactional
    public OrderDto cancel(UUID userId, UUID id) {
        orders.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        Order order = orders.lockById(id).orElseThrow(() -> ApiException.notFound("Pedido não encontrado"));
        Instant now = clock.instant();

        switch (order.getStatus()) {
            case PENDING -> fulfillment.markExpired(order);
            case PAID -> {
                OrderDto current = mapper.toDto(order);
                if (!current.refundable()) {
                    throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "REFUND_NOT_ALLOWED",
                            "Este pedido não pode mais ser reembolsado pela política do evento.");
                }
                // Primeiro o gateway (com chave de idempotência por pedido), depois o estado local.
                if (order.getProviderRef() != null && !provider.refund(order.getProviderRef(), order.getTotalCents(), "refund-" + order.getId()).success()) {
                    throw new ApiException(HttpStatus.BAD_GATEWAY, "REFUND_FAILED", "Não foi possível processar o reembolso agora. Tente novamente.");
                }
                fulfillment.markRefunded(order);
            }
            default -> throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATE", "Este pedido já foi encerrado");
        }
        orders.flush();
        return mapper.toDto(order);
    }

    // ── internos ───────────────────────────────────────────────────────────────────────────────────────

    private void addLines(Order order, Reservation reservation, List<EventSeat> held) {
        Map<String, EventSeatSector> sectorByCode = sectors.findByEvent(reservation.getEvent().getId()).stream()
                .collect(Collectors.toMap(EventSeatSector::getCode, s -> s));
        int pos = 0;
        for (ReservationItem item : reservation.getItems().stream()
                .sorted(Comparator.comparingInt((ReservationItem i) -> i.getTicketType().getPosition())).toList()) {
            String name = item.getTicketType().getName();
            String sectorCode = item.getTicketType().getSectorCode();
            EventSeatSector sector = sectorCode == null ? null : sectorByCode.get(sectorCode);
            String description = sector != null && !sector.getName().equals(name) ? name + " · " + sector.getName() : name;
            List<String> seatCodes = sectorCode == null ? List.of() : held.stream()
                    .filter(s -> s.getSectorCode().equals(sectorCode)).map(EventSeat::getCode).sorted().toList();
            order.addLine(OrderLine.of(pos++, item.getTicketType(), description, item.getQuantity(), item.getUnitPriceCents(), seatCodes));
        }
    }

    private String holdersJson(List<HolderInput> holders) {
        Map<String, String> map = new LinkedHashMap<>();
        if (holders != null) {
            holders.forEach(h -> map.put(h.slot(), h.name().trim()));
        }
        try {
            return json.writeValueAsString(map);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String nextCode() {
        Long seq = jdbc.queryForObject("select nextval('order_code_seq')", Long.class);
        return "TF-" + seq;
    }

    private static Order.Method parseMethod(String raw) {
        try {
            return Order.Method.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Forma de pagamento inválida");
        }
    }

    private static UUID parseReservation(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw ApiException.notFound("Reserva não encontrada");
        }
    }
}
