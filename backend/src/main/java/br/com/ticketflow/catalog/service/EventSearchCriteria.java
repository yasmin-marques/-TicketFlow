package br.com.ticketflow.catalog.service;

import java.time.LocalDate;
import java.util.List;

/** Filtros normalizados da listagem pública (já validados pelo controller). */
public record EventSearchCriteria(
        String q,
        String city,
        String state,
        LocalDate from,
        LocalDate to,
        List<String> categories,
        Long minPriceCents,
        Long maxPriceCents,
        WhenFilter when,
        boolean seatMapOnly,
        Sort sort,
        int page,
        int pageSize,
        Double originLat,
        Double originLng) {

    public enum Sort {
        DATA,
        RECENTES,
        PRECO,
        DISTANCIA;

        public static Sort fromParam(String value) {
            return switch (value) {
                case "data" -> DATA;
                case "recentes" -> RECENTES;
                case "preco" -> PRECO;
                case "distancia" -> DISTANCIA;
                default -> throw new IllegalArgumentException(value);
            };
        }
    }

    public enum WhenFilter {
        HOJE,
        FIM_DE_SEMANA,
        MES;

        public static WhenFilter fromParam(String value) {
            return switch (value) {
                case "hoje" -> HOJE;
                case "fim-de-semana" -> FIM_DE_SEMANA;
                case "mes" -> MES;
                default -> throw new IllegalArgumentException(value);
            };
        }
    }

    public EventSearchCriteria withPage(int newPage) {
        return new EventSearchCriteria(q, city, state, from, to, categories, minPriceCents, maxPriceCents, when, seatMapOnly, sort, newPage, pageSize, originLat, originLng);
    }
}
