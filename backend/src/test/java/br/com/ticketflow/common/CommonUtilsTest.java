package br.com.ticketflow.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import br.com.ticketflow.auth.web.ValidPassword;
import br.com.ticketflow.catalog.service.TimeRanges;
import jakarta.validation.ConstraintValidatorContext;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mockito;

class CommonUtilsTest {

    private static final ZoneId SP = ZoneId.of("America/Sao_Paulo");

    private static Instant startOf(String date) {
        return LocalDate.parse(date).atStartOfDay(SP).toInstant();
    }

    @Test
    void moneyConvertsBetweenCentsAndReais() {
        assertThat(Money.toReais(12050L)).isEqualByComparingTo("120.50");
        assertThat(Money.toReais(0L)).isEqualByComparingTo("0");
        assertThat(Money.toReais((Long) null)).isNull();
        assertThat(Money.toCents(new BigDecimal("120.5"))).isEqualTo(12050L);
        assertThat(Money.toCents(new BigDecimal("0.1"))).isEqualTo(10L);
        assertThat(Money.toCents(new BigDecimal("19.999"))).isEqualTo(2000L);
        assertThatThrownBy(() -> Money.toCents(new BigDecimal("1e30"))).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void textsNormalizeAndSlugify() {
        assertThat(Texts.normalize("  São PAULO  ")).isEqualTo("sao paulo");
        assertThat(Texts.normalize(null)).isEmpty();
        assertThat(Texts.slugify("Orquestra Sinfônica: Beethoven")).isEqualTo("orquestra-sinfonica-beethoven");
        assertThat(Texts.escapeLike("100%_\\")).isEqualTo("100\\%\\_\\\\");
    }

    @ParameterizedTest
    @CsvSource({"Senha123ok,true", "senha123,true", "curta1,false", "semnumeros,false", "12345678,false"})
    void passwordRule(String password, boolean valid) {
        var ctx = Mockito.mock(ConstraintValidatorContext.class, Mockito.RETURNS_DEEP_STUBS);
        assertThat(new ValidPassword.Validator().isValid(password, ctx)).isEqualTo(valid);
    }

    @Test
    void passwordLongerThanBcryptLimitIsRejected() {
        var ctx = Mockito.mock(ConstraintValidatorContext.class, Mockito.RETURNS_DEEP_STUBS);
        assertThat(new ValidPassword.Validator().isValid("a1".repeat(40), ctx)).isFalse();
        assertThat(new ValidPassword.Validator().isValid(null, ctx)).isFalse();
    }

    @Test
    void timeRangesUseTheSaoPauloZone() {
        // quarta-feira 2030-01-02 23:30 em São Paulo = 02:30Z do dia seguinte
        Instant now = Instant.parse("2030-01-03T02:30:00Z");

        TimeRanges.Range today = TimeRanges.today(now, SP);
        assertThat(today.from()).isEqualTo(startOf("2030-01-02"));
        assertThat(today.toExclusive()).isEqualTo(startOf("2030-01-03"));

        TimeRanges.Range month = TimeRanges.month(now, SP);
        assertThat(month.from()).isEqualTo(startOf("2030-01-01"));
        assertThat(month.toExclusive()).isEqualTo(startOf("2030-02-01"));

        TimeRanges.Range weekend = TimeRanges.weekend(now, SP);
        assertThat(weekend.from()).isEqualTo(startOf("2030-01-05")); // sábado
        assertThat(weekend.toExclusive()).isEqualTo(startOf("2030-01-07"));
    }

    @Test
    void weekendOnSundayStillCoversTheCurrentWeekend() {
        TimeRanges.Range weekend = TimeRanges.weekend(Instant.parse("2030-01-06T15:00:00Z"), SP);
        assertThat(weekend.from()).isEqualTo(startOf("2030-01-05"));
        assertThat(weekend.toExclusive()).isEqualTo(startOf("2030-01-07"));
    }

    @Test
    void openEndedRangesAreSupported() {
        TimeRanges.Range r = TimeRanges.between(LocalDate.parse("2030-03-01"), null, SP);
        assertThat(r.from()).isEqualTo(startOf("2030-03-01"));
        assertThat(r.toExclusive()).isNull();
    }
}
