package br.com.ticketflow.org.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.org.access.OrgPermission;
import br.com.ticketflow.organization.OrganizationMember.MemberRole;
import org.junit.jupiter.api.Test;

class OrgRulesTest {

    @Test
    void permissionMatrix() {
        assertThat(OrgPermission.MANAGE_SETTINGS.allows(MemberRole.OWNER)).isTrue();
        assertThat(OrgPermission.MANAGE_SETTINGS.allows(MemberRole.MANAGER)).isFalse();
        assertThat(OrgPermission.REFUND_ORDERS.allows(MemberRole.MANAGER)).isTrue();
        assertThat(OrgPermission.REFUND_ORDERS.allows(MemberRole.CHECKIN)).isFalse();
        assertThat(OrgPermission.CHECKIN.allows(MemberRole.CHECKIN)).isTrue();
        assertThat(OrgPermission.UNDO_CHECKIN.allows(MemberRole.CHECKIN)).isFalse();
        assertThat(OrgPermission.VIEW_ORDERS.allows(MemberRole.CHECKIN)).isFalse();
    }

    @Test
    void webhookUrlsMustBePublicHttps() {
        assertThat(OrgSettingsService.validateWebhookUrl("https://hooks.example.com/tf?x=1")).isEqualTo("https://hooks.example.com/tf?x=1");
        for (String bad : new String[] {"http://hooks.example.com", "https://localhost/x", "https://10.0.0.1/x", "https://[::1]/x",
                "https://intranet/x", "https://api.local/x", "https://user:pw@hooks.example.com/x", "https://hooks.example.com:8443/x",
                "ftp://hooks.example.com", "https://0x7f.0x0.0x0.0x1/x", "nota url"}) {
            assertThatThrownBy(() -> OrgSettingsService.validateWebhookUrl(bad)).as(bad).isInstanceOf(ApiException.class);
        }
    }
}
