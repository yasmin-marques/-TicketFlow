package br.com.ticketflow.org.access;

import br.com.ticketflow.auth.domain.Role;
import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Texts;
import br.com.ticketflow.organization.Organization;
import br.com.ticketflow.organization.OrganizationMember;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.organization.OrganizationMemberRepository;
import br.com.ticketflow.organization.OrganizationRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Decide em nome de qual organização o usuário age — a cada requisição, a partir do BANCO (não só do JWT):
 *
 * <ol>
 *   <li>o usuário precisa existir, estar ativo e ter hoje o papel ORGANIZER ou ADMIN (um papel revogado deixa de valer
 *       na hora, sem esperar o access token expirar);</li>
 *   <li>a organização é a do vínculo em {@code organization_members}. Com várias, o cliente pode escolher uma pelo
 *       cabeçalho {@code X-Organization-Id}, que só é aceito se o vínculo existir (ADMIN pode escolher qualquer uma);</li>
 *   <li>um ORGANIZER ainda sem organização (promovido pelo administrador) recebe uma nova, da qual é OWNER.</li>
 * </ol>
 */
@Service
public class OrgAccessService {

    private static final Logger log = LoggerFactory.getLogger(OrgAccessService.class);

    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final OrganizationMemberRepository members;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public OrgAccessService(UserRepository users, OrganizationRepository organizations, OrganizationMemberRepository members,
                            JdbcTemplate jdbc, Clock clock) {
        this.users = users;
        this.organizations = organizations;
        this.members = members;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public OrgContext resolve(UUID userId, String requestedOrganization) {
        User user = users.findById(userId).filter(User::isEnabled)
                .orElseThrow(() -> ApiException.unauthorized("UNAUTHENTICATED", "Faça login para continuar"));
        Set<RoleName> roles = user.getRoles().stream().map(Role::getName).collect(Collectors.toSet());
        boolean admin = roles.contains(RoleName.ADMIN);
        if (!admin && !roles.contains(RoleName.ORGANIZER)) {
            throw forbidden("Você não tem acesso ao painel do organizador");
        }

        if (requestedOrganization != null && !requestedOrganization.isBlank()) {
            UUID orgId = parse(requestedOrganization);
            if (admin) {
                organizations.findById(orgId).orElseThrow(() -> forbidden("Organização inexistente ou sem acesso"));
                return new OrgContext(orgId, userId, MemberRole.OWNER, true);
            }
            OrganizationMember m = members.findById(new OrganizationMember.Key(orgId, userId))
                    .orElseThrow(() -> forbidden("Organização inexistente ou sem acesso"));
            return new OrgContext(orgId, userId, m.getMemberRole(), false);
        }

        List<OrganizationMember> memberships = members.findByUser(userId);
        if (memberships.isEmpty()) {
            // Serializa a criação para o mesmo usuário (duas abas abrindo o painel ao mesmo tempo).
            jdbc.queryForList("select pg_advisory_xact_lock(?)", userId.getMostSignificantBits() ^ userId.getLeastSignificantBits());
            memberships = members.findByUser(userId);
            if (memberships.isEmpty()) {
                return provision(user, admin);
            }
        }
        OrganizationMember first = memberships.get(0);
        MemberRole role = admin ? MemberRole.OWNER : first.getMemberRole();
        return new OrgContext(first.getId().getOrganizationId(), userId, role, admin);
    }

    private OrgContext provision(User user, boolean admin) {
        Instant now = clock.instant();
        String name = "Organização de " + user.getName();
        String base = Texts.slugify(name);
        String slug = base.isEmpty() ? "org" : base;
        for (int i = 2; organizations.findBySlug(slug).isPresent(); i++) {
            slug = base + "-" + i;
        }
        // O nome também é único (sem diferenciar maiúsculas): desambigua com um sufixo curto.
        String uniqueName = jdbc.queryForObject("select count(*) from organizations where lower(name) = lower(?)", Long.class, name) > 0
                ? name + " (" + user.getId().toString().substring(0, 4) + ")"
                : name;
        Organization org = organizations.save(Organization.create(uniqueName, slug, now));
        org.setEmail(user.getEmail());
        members.save(OrganizationMember.of(org.getId(), user.getId(), MemberRole.OWNER, now));
        log.info("Organização {} criada para o organizador {}", org.getId(), user.getId());
        return new OrgContext(org.getId(), user.getId(), MemberRole.OWNER, admin);
    }

    private static UUID parse(String raw) {
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException e) {
            throw forbidden("Organização inexistente ou sem acesso");
        }
    }

    private static ApiException forbidden(String message) {
        return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
    }
}
