package br.com.ticketflow.org.access;

import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import java.util.EnumSet;
import java.util.Set;

/**
 * O que cada papel de membro pode fazer dentro da própria organização. O papel global (ORGANIZER/ADMIN) só dá
 * acesso ao painel; o que se pode fazer nele é decidido aqui, a partir do vínculo gravado no banco.
 */
public enum OrgPermission {
    VIEW_EVENTS(MemberRole.OWNER, MemberRole.MANAGER, MemberRole.CHECKIN),
    MANAGE_EVENTS(MemberRole.OWNER, MemberRole.MANAGER),
    VIEW_ORDERS(MemberRole.OWNER, MemberRole.MANAGER),
    REFUND_ORDERS(MemberRole.OWNER, MemberRole.MANAGER),
    VIEW_REPORTS(MemberRole.OWNER, MemberRole.MANAGER),
    CHECKIN(MemberRole.OWNER, MemberRole.MANAGER, MemberRole.CHECKIN),
    UNDO_CHECKIN(MemberRole.OWNER, MemberRole.MANAGER),
    VIEW_SETTINGS(MemberRole.OWNER, MemberRole.MANAGER),
    MANAGE_SETTINGS(MemberRole.OWNER);

    private final Set<MemberRole> roles;

    OrgPermission(MemberRole first, MemberRole... rest) {
        this.roles = EnumSet.of(first, rest);
    }

    public boolean allows(MemberRole role) {
        return roles.contains(role);
    }
}
