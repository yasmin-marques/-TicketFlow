package br.com.ticketflow.auth.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User {

    @Id
    private UUID id;

    @Column(nullable = false, length = 254)
    private String email;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(length = 20)
    private String phone;

    @Column(length = 14)
    private String cpf;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "notify_order_updates", nullable = false)
    private boolean notifyOrderUpdates = true;

    @Column(name = "notify_event_reminders", nullable = false)
    private boolean notifyEventReminders = true;

    @Column(name = "notify_marketing", nullable = false)
    private boolean notifyMarketing = false;

    @Column(nullable = false)
    private boolean enabled = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    private long version;

    // Poucos papéis por usuário: carregamento imediato evita LazyInitializationException ao montar o token.
    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
            name = "user_roles",
            joinColumns = @JoinColumn(name = "user_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id"))
    private Set<Role> roles = new HashSet<>();

    public static User create(String name, String email, String passwordHash, Role role, Instant now) {
        User u = new User();
        u.id = UUID.randomUUID();
        u.name = name;
        u.email = email;
        u.passwordHash = passwordHash;
        u.roles.add(role);
        u.createdAt = now;
        u.updatedAt = now;
        return u;
    }

    /** Papel de maior precedência (ADMIN > ORGANIZER > USER). */
    public RoleName highestRole() {
        return roles.stream().map(Role::getName).max(Comparator.naturalOrder()).orElse(RoleName.USER);
    }

    public void touch(Instant now) {
        this.updatedAt = now;
    }
}
