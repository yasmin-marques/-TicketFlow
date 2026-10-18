package br.com.ticketflow.organization;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, OrganizationMember.Key> {

    /** Vínculos do usuário, do mais antigo para o mais novo (o primeiro é a organização padrão). */
    @Query("select m from OrganizationMember m where m.id.userId = :userId order by m.createdAt, m.id.organizationId")
    List<OrganizationMember> findByUser(@Param("userId") UUID userId);

    @Query("select m from OrganizationMember m where m.id.organizationId = :orgId order by m.createdAt")
    List<OrganizationMember> findByOrganization(@Param("orgId") UUID orgId);
}
