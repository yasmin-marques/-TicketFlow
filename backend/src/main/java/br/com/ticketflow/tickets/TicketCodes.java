package br.com.ticketflow.tickets;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/** Códigos legíveis de ingresso ({@code TF-XXXX-XXXX}, sem 0/O/1/I/L), únicos no banco ({@code UNIQUE(code)} é a barreira final). */
@Component
public class TicketCodes {

    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TicketRepository tickets;

    public TicketCodes(TicketRepository tickets) {
        this.tickets = tickets;
    }

    public String next() {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = "TF-" + random(4) + "-" + random(4);
            if (!tickets.existsByCode(code)) {
                return code;
            }
        }
        throw new IllegalStateException("Não foi possível gerar um código de ingresso único");
    }

    private static String random(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }
}
