package br.com.ticketflow.org.access;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import java.util.UUID;
import org.springframework.http.HttpStatus;

/**
 * Organização em nome da qual a requisição age, resolvida SEMPRE no servidor a partir do usuário autenticado e do
 * vínculo no banco ({@link OrgAccessService}). Todo serviço do painel recebe este contexto e filtra as consultas por
 * {@link #organizationId()} — um id de organização vindo do cliente nunca é usado sem essa validação.
 *
 * @param role papel do usuário na organização (um ADMIN da plataforma age como {@code OWNER})
 */
public record OrgContext(UUID organizationId, UUID userId, MemberRole role, boolean platformAdmin) {

    public boolean can(OrgPermission permission) {
        return permission.allows(role);
    }

    /** {@code 403 FORBIDDEN} se o papel do membro não permite a operação. */
    public void require(OrgPermission permission) {
        if (!can(permission)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Seu papel na organização não permite esta ação");
        }
    }
}
