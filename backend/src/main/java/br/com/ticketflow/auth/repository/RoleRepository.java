package br.com.ticketflow.auth.repository;

import br.com.ticketflow.auth.domain.Role;
import br.com.ticketflow.auth.domain.RoleName;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<Role, Short> {
    Optional<Role> findByName(RoleName name);
}
