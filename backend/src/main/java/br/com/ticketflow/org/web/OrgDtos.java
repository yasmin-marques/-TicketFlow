package br.com.ticketflow.org.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** DTOs do painel do organizador — mesmo formato dos tipos TypeScript de {@code src/types/organizer.ts}. */
public final class OrgDtos {

    private OrgDtos() {}

    // ── Eventos ────────────────────────────────────────────────────────────────────────────────────────

    public record VenueDto(String name, String address, String district, String city, String state, String notes) {}

    public record VenueInput(@Size(max = 160) String name, @Size(max = 200) String address, @Size(max = 120) String district,
                             @Size(max = 80) String city, @Size(max = 2) String state, @Size(max = 400) String notes) {}

    public record SectorDto(@NotBlank @Size(max = 40) String id, @NotBlank @Size(max = 80) String name,
                            @NotNull @DecimalMin("0") @DecimalMax("100000") BigDecimal price) {}

    public record SeatCellDto(@NotBlank @Size(max = 8) String label, @NotBlank @Size(max = 40) String sectorId, boolean blocked) {}

    /** {@code cells}: {@code null} = vão/corredor. */
    public record SeatRowDto(@NotBlank @Size(max = 2) String letter, @NotNull @Size(max = 99) List<@Valid SeatCellDto> cells) {}

    public record SeatMapDto(@NotNull @Size(min = 1, max = 20) List<@Valid SectorDto> sectors,
                             @NotNull @Size(max = 26) List<@Valid SeatRowDto> rows,
                             @Min(0) @Max(100_000) int generalCapacity) {}

    public record SeatMapRequest(@Valid SeatMapDto seatMap) {}

    /** Criação/edição (campos ausentes = sem alteração). */
    public record EventInput(
            @Size(max = 160) String title,
            @Size(max = 120) String slug,
            @Size(max = 40) String category,
            @Min(0) @Max(21) Integer ageRating,
            @Size(max = 10_000) String description,
            OffsetDateTime startsAt,
            OffsetDateTime endsAt,
            @Valid VenueInput venue,
            @Size(max = 200) String coverName,
            Boolean hasSeatMap,
            @Valid SeatMapDto seatMap,
            @Size(max = 10) String cancellationPolicy) {}

    public record OrgEventDto(
            String id,
            String title,
            String slug,
            String category,
            int ageRating,
            String description,
            OffsetDateTime startsAt,
            OffsetDateTime endsAt,
            VenueDto venue,
            @JsonInclude(JsonInclude.Include.ALWAYS) String coverName,
            boolean hasSeatMap,
            @JsonInclude(JsonInclude.Include.ALWAYS) SeatMapDto seatMap,
            String cancellationPolicy,
            String status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            int capacity,
            int sold,
            BigDecimal revenue,
            int checkedIn) {}

    public record OrgEventSummaryDto(String id, String slug, String title, String venueLabel, OffsetDateTime startsAt, String status,
                                     int sold, int capacity, BigDecimal revenue) {}

    public record OrgEventsResponse(List<OrgEventSummaryDto> items, long total, Map<String, Long> counts) {}

    public record SlugAvailability(String slug, boolean available) {}

    // ── Lotes ──────────────────────────────────────────────────────────────────────────────────────────

    /** Datas em {@code YYYY-MM-DD} (fuso de São Paulo). */
    public record LotInput(
            @Size(max = 80) String typeName,
            @Size(max = 60) String name,
            @DecimalMin("0") @DecimalMax("100000") BigDecimal price,
            @Min(1) @Max(1_000_000) Integer quantity,
            @Size(max = 10) String startsAt,
            @Size(max = 10) String endsAt,
            @Min(1) @Max(20) Integer perCustomerLimit,
            Boolean autoOpenNext) {}

    public record OrgLotDto(String id, String eventId, String typeName, String name, BigDecimal price, int quantity, String startsAt,
                            String endsAt, int perCustomerLimit, boolean autoOpenNext, int sold, String status) {}

    // ── Pedidos ────────────────────────────────────────────────────────────────────────────────────────

    public record OrgOrderLineDto(String description, int quantity, BigDecimal unitPrice) {}

    public record OrgOrderDto(String id, String code, String eventId, String eventTitle, String buyerName, String buyerEmail,
                              int quantity, BigDecimal subtotal, BigDecimal fee, BigDecimal total, String paymentMethod,
                              String cardLast4, OffsetDateTime createdAt, String status, List<OrgOrderLineDto> lines) {}

    // ── Participantes e check-in ───────────────────────────────────────────────────────────────────────

    public record AttendeeDto(String ticketId, String code, String name, String email, String eventId, String orderCode, String typeName,
                              String sector, @JsonInclude(JsonInclude.Include.ALWAYS) String seat, String status,
                              OffsetDateTime checkedInAt, String gate) {}

    public record AttendeesResponse(List<AttendeeDto> items, long total, int page, int pageSize, int totalPages, long checkedIn, long sold) {}

    public record ManualCheckinRequest(@Size(max = 60) String gate) {}

    public record CheckinRequest(@NotBlank @Size(max = 300) String code, @Size(max = 60) String gate) {}

    public record CheckinResultDto(String result, String code, String message, String holderName, String typeName, String sector,
                                   String seat, OffsetDateTime checkedInAt, String gate) {}

    public record CheckinEntryDto(String id, OffsetDateTime at, String result, String code, String holderName, String gate) {}

    public record CheckinStatsDto(String eventId, String eventTitle, long checkedIn, long sold, double perMinute, List<String> gates,
                                  List<CheckinEntryDto> recent) {}

    // ── Dashboard e relatórios ─────────────────────────────────────────────────────────────────────────

    /** {@code delta}: variação vs. período anterior; {@code null} quando não há base de comparação. */
    public record Kpi(BigDecimal value, @JsonInclude(JsonInclude.Include.ALWAYS) BigDecimal delta) {}

    public record CheckinKpi(long value, long pctOfSold) {}

    public record DayTickets(String date, long tickets) {}

    public record NamedTickets(String name, long tickets) {}

    public record EventRevenue(String eventId, String title, BigDecimal revenue) {}

    public record DashboardDto(int range, @JsonInclude(JsonInclude.Include.ALWAYS) String eventId, OffsetDateTime updatedAt, Kpi revenue,
                               Kpi sold, Kpi occupancy, CheckinKpi checkins, List<DayTickets> salesByDay, List<NamedTickets> byType,
                               List<DayTickets> cumulative, long goal, List<EventRevenue> revenueByEvent,
                               List<OrgEventSummaryDto> activeEvents) {}

    public record DayRevenue(String date, BigDecimal revenue) {}

    public record FunnelStep(String label, long value) {}

    public record LotSales(String typeName, String lotName, long sold, long total) {}

    public record SectorOccupancy(String name, long pct) {}

    /**
     * Relatório por evento. Todos os números vêm do banco. {@code funnel}/{@code conversionPct} usam as etapas que o
     * backend registra de fato (reservas → pedidos → pagos); visitas à página não são rastreadas (não há analytics).
     */
    public record ReportDto(String eventId, String from, String to, BigDecimal revenue, long sold, long occupancyPct, BigDecimal avgTicket,
                            long checkins, long checkinPct, BigDecimal conversionPct, BigDecimal expiredReservationsPct,
                            List<DayRevenue> dailyRevenue, List<FunnelStep> funnel, List<LotSales> byLot, List<SectorOccupancy> bySector,
                            String conversionBasis) {}

    // ── Configurações, avisos e busca ──────────────────────────────────────────────────────────────────

    public record PayoutDto(String bank, String agency, String account, String holder) {}

    public record PayoutInput(@Size(max = 60) String bank, @Size(max = 10) String agency, @Size(max = 20) String account,
                              @Size(max = 120) String holder) {}

    public record MemberDto(String id, String name, String email, String role) {}

    public record WebhookDto(String id, String url, List<String> events, boolean active) {}

    public record SettingsDto(String name, String document, String email, String phone, PayoutDto payout, List<MemberDto> members,
                              List<WebhookDto> webhooks) {}

    public record SettingsInput(@Size(max = 120) String name, @Size(max = 18) String document, @Size(max = 254) String email,
                                @Size(max = 20) String phone, @Valid PayoutInput payout) {}

    public record MemberInput(@Size(max = 120) String name, @NotBlank @Size(max = 254) String email, @Size(max = 20) String role) {}

    public record WebhookInput(@NotBlank @Size(max = 500) String url, @Size(max = 10) List<@Size(max = 40) String> events) {}

    public record WebhookPatch(Boolean active) {}

    public record NoticeDto(String id, String title, String body, OffsetDateTime at, boolean read, String href) {}

    public record SearchEvent(String id, String title, String status) {}

    public record SearchOrder(String id, String code, String buyerName, String eventTitle) {}

    public record SearchResults(List<SearchEvent> events, List<SearchOrder> orders) {}
}
