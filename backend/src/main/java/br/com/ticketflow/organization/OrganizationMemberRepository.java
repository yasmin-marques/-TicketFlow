package br.com.ticketflow.organization;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OrganizationMemberRepository extends JpaRepository<OrganizationMember, OrganizationMember.Key> {}
