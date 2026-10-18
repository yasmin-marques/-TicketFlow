package br.com.ticketflow.orders.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/** DTOs de pedidos e ingressos (formato de {@code src/types/purchase.ts}). */
public final class OrderDtos {

    private OrderDtos() {}

    // ── entrada ────────────────────────────────────────────────────────────────────────────────────────

    public record BuyerInput(@NotBlank @Size(max = 120) String name, @NotBlank @Size(max = 254) String email,
                             @NotBlank @Size(max = 30) String phone, @NotBlank @Size(max = 14) String cpf,
                             @NotBlank @Size(max = 10) String birthDate) {}

    public record HolderInput(@NotBlank @Size(max = 60) String slot, @NotBlank @Size(max = 120) String name) {}

    /**
     * Cartão tokenizado pelo gateway. {@code number}, {@code cvv} e {@code expiry} existem SOMENTE para detectar e
     * RECUSAR clientes que ainda enviam o cartão cru: o servidor nunca os processa, grava ou registra.
     */
    public record CardInput(@Size(max = 100) String token, Integer installments,
                            String number, String cvv, String expiry, String holderName) {
        public boolean hasRawCardData() {
            return (number != null && !number.isBlank()) || (cvv != null && !cvv.isBlank());
        }
    }

    public record PaymentInput(@NotBlank @Size(max = 10) String method, @Valid CardInput card) {}

    public record CreateOrderRequest(@NotBlank @Size(max = 60) String reservationId, @NotNull @Valid BuyerInput buyer,
                                     @Size(max = 20) List<@Valid HolderInput> holders, @NotNull @Valid PaymentInput payment) {
        public boolean hasRawCardData() {
            return payment != null && payment.card() != null && payment.card().hasRawCardData();
        }
    }

    public record TransferRequest(@NotBlank @Size(max = 254) String email) {}

    // ── saída ──────────────────────────────────────────────────────────────────────────────────────────

    public record OrderLineDto(String description, int quantity, BigDecimal unitPrice, List<String> seatIds) {}

    public record PixDto(String code, OffsetDateTime expiresAt) {}

    public record BoletoDto(String line, OffsetDateTime dueAt) {}

    public record BuyerDto(String name, String email, String phone, String cpf, String birthDate) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TicketDto(String id, String code, String orderId, String orderCode, String eventId, String eventSlug, String eventTitle,
                            OffsetDateTime eventStartsAt, String venueName, String city, String typeName, String sectorName,
                            String seatId, String row, String holderName, String status, OffsetDateTime usedAt, String qrPayload) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OrderDto(String id, String code, String eventId, String eventSlug, String eventTitle, OffsetDateTime eventStartsAt,
                           String venueName, String city, OffsetDateTime createdAt, String status, String paymentMethod,
                           String cardLast4, Integer installments, PixDto pix, BoletoDto boleto, List<OrderLineDto> lines,
                           int ticketCount, BigDecimal subtotal, BigDecimal fee, BigDecimal total, BuyerDto buyer,
                           OffsetDateTime refundedAt, boolean refundable, List<TicketDto> tickets) {}
}
