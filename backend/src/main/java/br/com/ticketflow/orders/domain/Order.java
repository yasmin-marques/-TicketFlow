package br.com.ticketflow.orders.domain;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.sales.domain.Reservation;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Order {

    public enum Status { PENDING, PAID, REFUNDED, EXPIRED }

    public enum Method { CARD, PIX, BOLETO }

    @Id
    private UUID id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "event_id")
    private Event event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "reservation_id")
    private Reservation reservation;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false, length = 10)
    private Method paymentMethod;

    @Column(nullable = false, length = 30)
    private String provider;

    @Column(name = "provider_ref", length = 100)
    private String providerRef;

    /** Apenas os 4 últimos dígitos, informados pelo gateway. Nunca o número completo nem o CVV. */
    @Column(name = "card_last4", length = 4)
    private String cardLast4;

    @Column(name = "card_brand", length = 20)
    private String cardBrand;

    private Short installments;

    @Column(name = "pix_code", columnDefinition = "text")
    private String pixCode;

    @Column(name = "pix_expires_at")
    private Instant pixExpiresAt;

    @Column(name = "boleto_line", length = 120)
    private String boletoLine;

    @Column(name = "boleto_due_at")
    private Instant boletoDueAt;

    /** Prazo para pagar (pedido pendente). */
    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "subtotal_cents", nullable = false)
    private long subtotalCents;

    @Column(name = "fee_cents", nullable = false)
    private long feeCents;

    @Column(name = "total_cents", nullable = false)
    private long totalCents;

    @Column(name = "buyer_name", nullable = false, length = 120)
    private String buyerName;

    @Column(name = "buyer_email", nullable = false, length = 254)
    private String buyerEmail;

    @Column(name = "buyer_phone", nullable = false, length = 30)
    private String buyerPhone;

    @Column(name = "buyer_cpf", nullable = false, length = 14)
    private String buyerCpf;

    @Column(name = "buyer_birth_date", nullable = false, length = 10)
    private String buyerBirthDate;

    /** Nome do titular de cada ingresso (slot → nome), usado quando os ingressos são emitidos (possivelmente depois, por webhook). */
    @Column(name = "holders_json", nullable = false, columnDefinition = "text")
    private String holdersJson = "{}";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "refunded_at")
    private Instant refundedAt;

    @Version
    private Long version;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<OrderLine> lines = new ArrayList<>();

    public static Order create(String code, UUID userId, Event event, Reservation reservation, Method method, String provider, Instant now) {
        Order o = new Order();
        o.id = UUID.randomUUID();
        o.code = code;
        o.userId = userId;
        o.event = event;
        o.reservation = reservation;
        o.paymentMethod = method;
        o.provider = provider;
        o.status = Status.PENDING;
        o.createdAt = now.truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        return o;
    }

    public void addLine(OrderLine line) {
        line.setOrder(this);
        lines.add(line);
    }

    public int ticketCount() {
        return lines.stream().mapToInt(OrderLine::getQuantity).sum();
    }
}
