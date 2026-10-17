package br.com.ticketflow.user;

import br.com.ticketflow.auth.domain.User;
import java.time.format.DateTimeFormatter;

/** Perfil do usuário autenticado ({@code UserProfile} do frontend). {@code birthDate} em dd/MM/aaaa. */
public record ProfileResponse(
        String id, String name, String email, String phone, String cpf, String birthDate, Notifications notifications) {

    public record Notifications(boolean orderUpdates, boolean eventReminders, boolean marketing) {}

    private static final DateTimeFormatter BR_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    public static ProfileResponse from(User u) {
        return new ProfileResponse(
                u.getId().toString(),
                u.getName(),
                u.getEmail(),
                u.getPhone() == null ? "" : u.getPhone(),
                u.getCpf() == null ? "" : u.getCpf(),
                u.getBirthDate() == null ? "" : BR_DATE.format(u.getBirthDate()),
                new Notifications(u.isNotifyOrderUpdates(), u.isNotifyEventReminders(), u.isNotifyMarketing()));
    }
}
