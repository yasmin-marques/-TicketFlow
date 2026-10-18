package br.com.ticketflow.orders.service;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.web.dto.OrderDtos.BuyerInput;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;

/** Mesmas regras do formulário do frontend, revalidadas no servidor. */
final class BuyerValidator {

    private static final Pattern EMAIL = Pattern.compile("^\\S+@\\S+\\.\\S+$");
    private static final DateTimeFormatter BR_DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT);

    private BuyerValidator() {}

    static void validate(BuyerInput b, LocalDate today) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (b.name() == null || b.name().trim().split("\\s+").length < 2) {
            errors.put("name", "Informe nome e sobrenome");
        }
        if (b.email() == null || !EMAIL.matcher(b.email()).matches()) {
            errors.put("email", "E-mail inválido");
        }
        String phone = digits(b.phone());
        if (phone.length() < 10 || phone.length() > 11) {
            errors.put("phone", "Informe o número completo com DDD");
        }
        if (!validCpf(digits(b.cpf()))) {
            errors.put("cpf", "CPF inválido");
        }
        if (!validBirthDate(b.birthDate(), today)) {
            errors.put("birthDate", "Data inválida");
        }
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Confira os dados do comprador").with("errors", errors);
        }
    }

    static String digits(String s) {
        return s == null ? "" : s.replaceAll("\\D", "");
    }

    static boolean validCpf(String cpf) {
        if (cpf.length() != 11 || cpf.chars().distinct().count() == 1) {
            return false;
        }
        return digit(cpf, 9) == cpf.charAt(9) - '0' && digit(cpf, 10) == cpf.charAt(10) - '0';
    }

    private static int digit(String cpf, int len) {
        int sum = 0;
        for (int i = 0; i < len; i++) {
            sum += (cpf.charAt(i) - '0') * (len + 1 - i);
        }
        int r = (sum * 10) % 11;
        return r == 10 ? 0 : r;
    }

    static boolean validBirthDate(String raw, LocalDate today) {
        try {
            LocalDate d = LocalDate.parse(raw, BR_DATE);
            return !d.isAfter(today) && d.isAfter(today.minusYears(120));
        } catch (DateTimeParseException | NullPointerException e) {
            return false;
        }
    }
}
