package br.com.ticketflow.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Dinheiro: internamente em centavos inteiros ({@code long}); na API, em reais (número), como o frontend
 * espera (ex.: 12050 centavos ⇄ {@code 120.5}).
 */
public final class Money {

    private Money() {}

    public static BigDecimal toReais(long cents) {
        return BigDecimal.valueOf(cents, 2);
    }

    public static BigDecimal toReais(Long cents) {
        return cents == null ? null : toReais(cents.longValue());
    }

    public static long toCents(BigDecimal reais) {
        return reais.setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
    }
}
