package br.com.ticketflow.common;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Corpo padrão de erro: {@code { status, code, message, … }}. Campos extras (ex.: {@code errors},
 * {@code ref}) são "achatados" no mesmo nível, como o frontend espera.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(int status, String code, String message, @JsonAnyGetter Map<String, Object> extras) {

    public ApiError(int status, String code, String message) {
        this(status, code, message, new LinkedHashMap<>());
    }

    public ApiError with(String key, Object value) {
        extras.put(key, value);
        return this;
    }
}
