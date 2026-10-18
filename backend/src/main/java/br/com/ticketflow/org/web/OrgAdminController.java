package br.com.ticketflow.org.web;

import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.reports.OrgReportService;
import br.com.ticketflow.org.settings.OrgInboxService;
import br.com.ticketflow.org.settings.OrgSettingsService;
import br.com.ticketflow.org.web.OrgDtos.DashboardDto;
import br.com.ticketflow.org.web.OrgDtos.MemberInput;
import br.com.ticketflow.org.web.OrgDtos.NoticeDto;
import br.com.ticketflow.org.web.OrgDtos.ReportDto;
import br.com.ticketflow.org.web.OrgDtos.SearchResults;
import br.com.ticketflow.org.web.OrgDtos.SettingsDto;
import br.com.ticketflow.org.web.OrgDtos.SettingsInput;
import br.com.ticketflow.org.web.OrgDtos.WebhookInput;
import br.com.ticketflow.org.web.OrgDtos.WebhookPatch;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Indicadores, relatórios, configurações, equipe, webhooks, avisos e busca do painel. */
@RestController
@RequestMapping("/api/org")
@Tag(name = "Organizador · Gestão")
public class OrgAdminController {

    private final OrgReportService reports;
    private final OrgSettingsService settings;
    private final OrgInboxService inbox;

    public OrgAdminController(OrgReportService reports, OrgSettingsService settings, OrgInboxService inbox) {
        this.reports = reports;
        this.settings = settings;
        this.inbox = inbox;
    }

    @Operation(summary = "KPIs com variação vs. período anterior (range = 7 | 30 | 90 dias)")
    @GetMapping("/dashboard")
    public DashboardDto dashboard(OrgContext ctx, @RequestParam(defaultValue = "30") int range, @RequestParam(required = false) String eventId) {
        return reports.dashboard(ctx, range, eventId);
    }

    @Operation(summary = "Relatório de um evento no período (datas YYYY-MM-DD)")
    @GetMapping("/reports")
    public ReportDto report(OrgContext ctx, @RequestParam(required = false) String eventId, @RequestParam(required = false) String from,
                            @RequestParam(required = false) String to) {
        return reports.report(ctx, eventId, from, to);
    }

    @GetMapping("/settings")
    public SettingsDto settings(OrgContext ctx) {
        return settings.get(ctx);
    }

    @PatchMapping("/settings")
    public SettingsDto updateSettings(OrgContext ctx, @Valid @RequestBody SettingsInput input) {
        return settings.update(ctx, input);
    }

    @Operation(summary = "Adiciona alguém que já tem conta à equipe (MANAGER ou CHECKIN)")
    @PostMapping("/members")
    public ResponseEntity<SettingsDto> addMember(OrgContext ctx, @Valid @RequestBody MemberInput input) {
        return ResponseEntity.status(HttpStatus.CREATED).body(settings.addMember(ctx, input));
    }

    @DeleteMapping("/members/{id}")
    public SettingsDto removeMember(OrgContext ctx, @PathVariable UUID id) {
        return settings.removeMember(ctx, id);
    }

    @PostMapping("/webhooks")
    public ResponseEntity<SettingsDto> addWebhook(OrgContext ctx, @Valid @RequestBody WebhookInput input) {
        return ResponseEntity.status(HttpStatus.CREATED).body(settings.addWebhook(ctx, input));
    }

    @PatchMapping("/webhooks/{id}")
    public SettingsDto toggleWebhook(OrgContext ctx, @PathVariable UUID id, @RequestBody WebhookPatch body) {
        return settings.setWebhookActive(ctx, id, body.active());
    }

    @DeleteMapping("/webhooks/{id}")
    public SettingsDto removeWebhook(OrgContext ctx, @PathVariable UUID id) {
        return settings.removeWebhook(ctx, id);
    }

    @GetMapping("/notifications")
    public List<NoticeDto> notifications(OrgContext ctx) {
        return inbox.notices(ctx);
    }

    @PostMapping("/notifications/read")
    public Map<String, Boolean> markRead(OrgContext ctx) {
        inbox.markAllRead(ctx);
        return Map.of("ok", true);
    }

    @GetMapping("/search")
    public SearchResults search(OrgContext ctx, @RequestParam(defaultValue = "") String q) {
        return inbox.search(ctx, q);
    }
}
