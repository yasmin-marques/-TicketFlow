package br.com.ticketflow.catalog.web.dto;

import java.util.List;

/** Página de resultados ({@code Paginated<T>} do frontend). {@code page} é 1-based. */
public record PageDto<T>(List<T> items, long total, int page, int pageSize, int totalPages) {

    public static <T> PageDto<T> of(List<T> items, long total, int page, int pageSize) {
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) pageSize));
        return new PageDto<>(items, total, page, pageSize, totalPages);
    }
}
