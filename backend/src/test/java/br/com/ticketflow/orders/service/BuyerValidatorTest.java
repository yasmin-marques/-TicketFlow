package br.com.ticketflow.orders.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.orders.web.dto.OrderDtos.BuyerInput;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class BuyerValidatorTest {

    private static final LocalDate TODAY = LocalDate.of(2030, 6, 15);

    @ParameterizedTest
    @CsvSource({"52998224725,true", "529.982.247-25,false", "11111111111,false", "52998224724,false", "123,false", "'',false"})
    void cpfCheckDigits(String cpf, boolean valid) {
        assertThat(BuyerValidator.validCpf(cpf)).isEqualTo(valid);
    }

    @ParameterizedTest
    @CsvSource({"14/03/1994,true", "29/02/2000,true", "29/02/2001,false", "31/04/1990,false", "15/06/2031,false", "14-03-1994,false", "01/01/1850,false"})
    void birthDates(String date, boolean valid) {
        assertThat(BuyerValidator.validBirthDate(date, TODAY)).isEqualTo(valid);
    }

    @Test
    void reportsEveryInvalidFieldAtOnce() {
        BuyerInput bad = new BuyerInput("Maria", "sem-arroba", "123", "000", "99/99/9999");
        assertThatThrownBy(() -> BuyerValidator.validate(bad, TODAY)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.status().value()).isEqualTo(422);
            @SuppressWarnings("unchecked")
            Map<String, String> errors = (Map<String, String>) e.extras().get("errors");
            assertThat(errors).containsKeys("name", "email", "phone", "cpf", "birthDate");
        });
    }

    @Test
    void acceptsAValidBuyer() {
        BuyerValidator.validate(new BuyerInput("Maria Compradora", "maria@example.com", "(11) 98877-6655", "529.982.247-25", "14/03/1994"), TODAY);
    }
}
