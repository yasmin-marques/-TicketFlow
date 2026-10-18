package br.com.ticketflow.catalog.seed;

import br.com.ticketflow.auth.domain.RoleName;
import br.com.ticketflow.auth.domain.User;
import br.com.ticketflow.auth.repository.RoleRepository;
import br.com.ticketflow.auth.repository.UserRepository;
import br.com.ticketflow.config.AppProperties;
import br.com.ticketflow.organization.Organization;
import br.com.ticketflow.organization.OrganizationMember;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import br.com.ticketflow.organization.OrganizationMemberRepository;
import br.com.ticketflow.organization.OrganizationRepository;
import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * *** SOMENTE DEMONSTRAÇÃO (perfil dev) *** — contas para testar o painel: um organizador (proprietário da
 * "Pulse Produções", dona do Neon Horizon Festival e de outros eventos do catálogo de demonstração), um membro de
 * portaria e um comprador. Idempotente (cria só o que falta). Sem {@code tf.seed.demo-password}, não cria nada.
 */
@Component
@Order(2) // depois do DemoDataSeeder (organizações e eventos)
@ConditionalOnProperty(prefix = "tf.seed", name = "enabled", havingValue = "true")
public class DemoUsersSeeder implements ApplicationRunner {

    public static final String ORGANIZER = "organizador@ticketflow.dev";
    public static final String CHECKIN = "portaria@ticketflow.dev";
    public static final String BUYER = "comprador@ticketflow.dev";
    private static final String DEMO_ORG = "Pulse Produções";
    private static final Logger log = LoggerFactory.getLogger(DemoUsersSeeder.class);

    private final UserRepository users;
    private final RoleRepository roles;
    private final OrganizationRepository organizations;
    private final OrganizationMemberRepository members;
    private final PasswordEncoder encoder;
    private final Clock clock;
    private final String password;

    public DemoUsersSeeder(UserRepository users, RoleRepository roles, OrganizationRepository organizations, OrganizationMemberRepository members,
                           PasswordEncoder encoder, Clock clock, AppProperties props) {
        this.users = users;
        this.roles = roles;
        this.organizations = organizations;
        this.members = members;
        this.encoder = encoder;
        this.clock = clock;
        this.password = props.seed().demoPassword();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (password == null || password.isBlank()) {
            return;
        }
        Instant now = clock.instant();
        User organizer = ensure("Olívia Organizadora", ORGANIZER, RoleName.ORGANIZER, now);
        User checkin = ensure("Paulo Portaria", CHECKIN, RoleName.ORGANIZER, now);
        ensure("Carla Compradora", BUYER, RoleName.USER, now);
        Organization org = organizations.findBySlug("pulse-producoes")
                .orElseGet(() -> organizations.save(Organization.create(DEMO_ORG, "pulse-producoes", now)));
        link(org, organizer, MemberRole.OWNER, now);
        link(org, checkin, MemberRole.CHECKIN, now);
        log.warn("Contas de DEMONSTRAÇÃO disponíveis (perfil dev): {} / {} / {} — senha em TF_DEMO_PASSWORD.", ORGANIZER, CHECKIN, BUYER);
    }

    private User ensure(String name, String email, RoleName role, Instant now) {
        return users.findByEmail(email).orElseGet(() ->
                users.save(User.create(name, email, encoder.encode(password), roles.findByName(role).orElseThrow(), now)));
    }

    private void link(Organization org, User user, MemberRole role, Instant now) {
        OrganizationMember.Key key = new OrganizationMember.Key(org.getId(), user.getId());
        if (!members.existsById(key)) {
            members.save(OrganizationMember.of(org.getId(), user.getId(), role, now));
        }
    }
}
