package br.com.ticketflow.org.settings;

import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.RoleRepository;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.org.access.AuditService;
import br.com.ticketflow.org.access.OrgContext;
import br.com.ticketflow.org.access.OrgNotifications;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.org.web.OrgDtos.MemberDto;
import br.com.ticketflow.org.web.OrgDtos.MemberInput;
import br.com.ticketflow.org.web.OrgDtos.PayoutDto;
import br.com.ticketflow.org.web.OrgDtos.SettingsDto;
import br.com.ticketflow.org.web.OrgDtos.SettingsInput;
import br.com.ticketflow.org.web.OrgDtos.WebhookDto;
import br.com.ticketflow.org.web.OrgDtos.WebhookInput;
import br.com.ticketflow.organization.Organization;
import br.com.ticketflow.organization.OrganizationMember;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.organization.OrganizationMemberRepository;
import br.com.ticketflow.organization.OrganizationRepository;
import java.net.IDN;
import java.net.URI;
import java.net.URISyntaxException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Configurações da organização (dados, conta de repasse), equipe e webhooks. Leitura: proprietário e gerente; escrita:
 * só o proprietário. Membros só podem ser pessoas que JÁ têm conta (sem convite por e-mail: o cadastro não verifica
 * e-mail, então um convite "pendente" poderia ser reivindicado por quem registrasse o endereço primeiro).
 */
@Service
public class OrgSettingsService {

    /** Eventos que um webhook pode assinar (os mesmos oferecidos pelo frontend). */
    public static final List<String> WEBHOOK_EVENTS = List.of("order.paid", "order.refunded", "ticket.checked_in");
    private static final int MAX_WEBHOOKS = 10;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern CNPJ = Pattern.compile("^\\d{2}\\.?\\d{3}\\.?\\d{3}/?\\d{4}-?\\d{2}$");
    private static final Pattern CPF = Pattern.compile("^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final OrganizationRepository organizations;
    private final OrganizationMemberRepository members;
    private final UserRepository users;
    private final RoleRepository roles;
    private final AuditService audit;
    private final OrgNotifications notifications;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public OrgSettingsService(OrganizationRepository organizations, OrganizationMemberRepository members, UserRepository users,
                              RoleRepository roles, AuditService audit, OrgNotifications notifications, JdbcTemplate jdbc, Clock clock) {
        this.organizations = organizations;
        this.members = members;
        this.users = users;
        this.roles = roles;
        this.audit = audit;
        this.notifications = notifications;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SettingsDto get(OrgContext ctx) {
        ctx.require(OrgPermission.VIEW_SETTINGS);
        return load(ctx);
    }

    @Transactional
    public SettingsDto update(OrgContext ctx, SettingsInput in) {
        ctx.require(OrgPermission.MANAGE_SETTINGS);
        Organization org = organizations.findById(ctx.organizationId()).orElseThrow();
        if (in.name() != null) {
            if (in.name().isBlank()) {
                throw validation("Informe o nome da organização");
            }
            Long same = jdbc.queryForObject("select count(*) from organizations where lower(name) = lower(?) and id <> ?", Long.class,
                    in.name().trim(), org.getId());
            if (same != null && same > 0) {
                throw ApiException.conflict("NAME_TAKEN", "Já existe uma organização com este nome");
            }
            org.setName(in.name().trim());
        }
        if (in.document() != null) {
            String doc = in.document().trim();
            if (!doc.isEmpty() && !CNPJ.matcher(doc).matches() && !CPF.matcher(doc).matches()) {
                throw validation("CNPJ ou CPF inválido");
            }
            org.setDocument(doc.isEmpty() ? null : doc);
        }
        if (in.email() != null) {
            String email = in.email().trim();
            if (!email.isEmpty() && !EMAIL.matcher(email).matches()) {
                throw validation("E-mail inválido");
            }
            org.setEmail(email.isEmpty() ? null : email);
        }
        if (in.phone() != null) {
            org.setPhone(in.phone().trim().isEmpty() ? null : in.phone().trim());
        }
        if (in.payout() != null) {
            if (in.payout().bank() != null) {
                org.setPayoutBank(blankToNull(in.payout().bank()));
            }
            if (in.payout().agency() != null) {
                org.setPayoutAgency(blankToNull(in.payout().agency()));
            }
            if (in.payout().account() != null) {
                org.setPayoutAccount(blankToNull(in.payout().account()));
            }
            if (in.payout().holder() != null) {
                org.setPayoutHolder(blankToNull(in.payout().holder()));
            }
        }
        org.setUpdatedAt(clock.instant());
        organizations.saveAndFlush(org);
        // Não registra os valores da conta de repasse na auditoria, só que ela mudou.
        audit.record(ctx, "settings.updated", "organization", org.getId(), Map.of("payoutChanged", in.payout() != null));
        return load(ctx);
    }

    // ── Equipe ─────────────────────────────────────────────────────────────────────────────────────────

    @Transactional
    public SettingsDto addMember(OrgContext ctx, MemberInput in) {
        ctx.require(OrgPermission.MANAGE_SETTINGS);
        String email = in.email().trim().toLowerCase(Locale.ROOT);
        if (!EMAIL.matcher(email).matches()) {
            throw validation("E-mail inválido");
        }
        MemberRole role = "MANAGER".equals(in.role()) ? MemberRole.MANAGER : MemberRole.CHECKIN;
        User user = users.findByEmail(email).filter(User::isEnabled).orElseThrow(() -> new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,
                "USER_NOT_FOUND", "Não há uma conta com este e-mail. Peça para a pessoa se cadastrar no TicketFlow e tente de novo."));
        if (members.existsById(new OrganizationMember.Key(ctx.organizationId(), user.getId()))) {
            throw ApiException.conflict("EMAIL_TAKEN", "Este e-mail já faz parte da equipe");
        }
        members.saveAndFlush(OrganizationMember.of(ctx.organizationId(), user.getId(), role, clock.instant())); // lido por SQL logo abaixo
        // Acesso ao painel exige o papel ORGANIZER; vale no próximo login/renovação da sessão.
        if (user.getRoles().stream().noneMatch(r -> r.getName() == RoleName.ORGANIZER || r.getName() == RoleName.ADMIN)) {
            user.getRoles().add(roles.findByName(RoleName.ORGANIZER).orElseThrow());
            users.save(user);
        }
        notifications.add(ctx.organizationId(), "Novo membro na equipe", user.getName() + " entrou na equipe.", "/org/configuracoes");
        audit.record(ctx, "member.added", "user", user.getId(), Map.of("role", role.name()));
        return load(ctx);
    }

    @Transactional
    public SettingsDto removeMember(OrgContext ctx, UUID userId) {
        ctx.require(OrgPermission.MANAGE_SETTINGS);
        OrganizationMember m = members.findById(new OrganizationMember.Key(ctx.organizationId(), userId))
                .orElseThrow(() -> ApiException.notFound("Membro não encontrado"));
        if (m.getMemberRole() == MemberRole.OWNER) {
            throw ApiException.conflict("INVALID_STATE", "O proprietário não pode ser removido");
        }
        members.delete(m);
        members.flush();
        // Sem nenhuma outra organização, a pessoa perde o acesso ao painel (o papel ORGANIZER veio do vínculo).
        if (members.findByUser(userId).isEmpty()) {
            users.findById(userId).ifPresent(u -> {
                if (u.getRoles().stream().noneMatch(r -> r.getName() == RoleName.ADMIN)) {
                    u.getRoles().removeIf(r -> r.getName() == RoleName.ORGANIZER);
                    users.save(u);
                }
            });
        }
        audit.record(ctx, "member.removed", "user", userId, Map.of());
        return load(ctx);
    }

    // ── Webhooks ───────────────────────────────────────────────────────────────────────────────────────

    @Transactional
    public SettingsDto addWebhook(OrgContext ctx, WebhookInput in) {
        ctx.require(OrgPermission.MANAGE_SETTINGS);
        String url = validateWebhookUrl(in.url());
        List<String> events = in.events() == null || in.events().isEmpty() ? List.of("order.paid") : in.events();
        Set<String> unique = new LinkedHashSet<>();
        for (String ev : events) {
            if (!WEBHOOK_EVENTS.contains(ev)) {
                throw validation("Evento de webhook inválido: " + ev);
            }
            unique.add(ev);
        }
        Long count = jdbc.queryForObject("select count(*) from org_webhooks where organization_id = ?", Long.class, ctx.organizationId());
        if (count != null && count >= MAX_WEBHOOKS) {
            throw validation("Limite de " + MAX_WEBHOOKS + " webhooks por organização");
        }
        UUID id = UUID.randomUUID();
        byte[] secret = new byte[24];
        RANDOM.nextBytes(secret);
        jdbc.update("insert into org_webhooks (id, organization_id, url, events, active, secret, created_at) values (?, ?, ?, ?, true, ?, ?)",
                id, ctx.organizationId(), url, String.join(",", unique), "whsec_" + HexFormat.of().formatHex(secret), Timestamp.from(clock.instant()));
        audit.record(ctx, "webhook.created", "webhook", id, Map.of("url", url, "events", unique));
        return load(ctx);
    }

    @Transactional
    public SettingsDto setWebhookActive(OrgContext ctx, UUID id, Boolean active) {
        ctx.require(OrgPermission.MANAGE_SETTINGS);
        if (active == null) {
            throw validation("Informe se o webhook está ativo");
        }
        if (jdbc.update("update org_webhooks set active = ? where id = ? and organization_id = ?", active, id, ctx.organizationId()) == 0) {
            throw ApiException.notFound("Webhook não encontrado");
        }
        audit.record(ctx, "webhook.updated", "webhook", id, Map.of("active", active));
        return load(ctx);
    }

    @Transactional
    public SettingsDto removeWebhook(OrgContext ctx, UUID id) {
        ctx.require(OrgPermission.MANAGE_SETTINGS);
        if (jdbc.update("delete from org_webhooks where id = ? and organization_id = ?", id, ctx.organizationId()) == 0) {
            throw ApiException.notFound("Webhook não encontrado");
        }
        audit.record(ctx, "webhook.deleted", "webhook", id, Map.of());
        return load(ctx);
    }

    /**
     * Só HTTPS, porta padrão e host público: recusa {@code localhost}, IPs literais privados/reservados e nomes internos
     * (proteção básica contra SSRF no cadastro; a entrega — ainda não implementada — deve revalidar o IP resolvido).
     */
    static String validateWebhookUrl(String raw) {
        URI uri;
        try {
            uri = new URI(raw.trim());
        } catch (URISyntaxException e) {
            throw validation("URL inválida");
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
            throw validation("A URL precisa começar com https://");
        }
        if (uri.getPort() != -1 && uri.getPort() != 443) {
            throw validation("Use a porta padrão do HTTPS (443)");
        }
        String host = IDN.toASCII(uri.getHost()).toLowerCase(Locale.ROOT);
        if (host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
                || !host.contains(".") || isIpLiteral(host)) {
            throw validation("Use um endereço público (domínio), não localhost nem IP");
        }
        return uri.toString();
    }

    private static boolean isIpLiteral(String host) {
        return host.startsWith("[") || host.matches("^[0-9.]+$") || Arrays.stream(host.split("\\.")).allMatch(p -> p.matches("\\d+|0x[0-9a-f]+"));
    }

    // ── leitura ────────────────────────────────────────────────────────────────────────────────────────

    private SettingsDto load(OrgContext ctx) {
        Organization org = organizations.findById(ctx.organizationId()).orElseThrow();
        List<MemberDto> team = jdbc.query("""
                select u.id, u.name, u.email, m.member_role from organization_members m join users u on u.id = m.user_id
                where m.organization_id = ? order by case m.member_role when 'OWNER' then 0 when 'MANAGER' then 1 else 2 end, m.created_at
                """, (rs, i) -> new MemberDto(rs.getObject("id", UUID.class).toString(), rs.getString("name"), rs.getString("email"),
                rs.getString("member_role")), ctx.organizationId());
        List<WebhookDto> hooks = jdbc.query("select id, url, events, active from org_webhooks where organization_id = ? order by created_at",
                (rs, i) -> new WebhookDto(rs.getObject("id", UUID.class).toString(), rs.getString("url"),
                        List.of(rs.getString("events").split(",")), rs.getBoolean("active")), ctx.organizationId());
        return new SettingsDto(org.getName(), nz(org.getDocument()), nz(org.getEmail()), nz(org.getPhone()),
                new PayoutDto(nz(org.getPayoutBank()), nz(org.getPayoutAgency()), nz(org.getPayoutAccount()), nz(org.getPayoutHolder())),
                team, hooks);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String blankToNull(String s) {
        return s.isBlank() ? null : s.trim();
    }

    private static ApiException validation(String message) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", message);
    }
}
