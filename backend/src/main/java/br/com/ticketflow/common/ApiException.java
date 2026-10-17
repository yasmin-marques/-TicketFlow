package br.com.ticketflow.common;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/** Erro de negócio com status HTTP e {@code code} estável (lido pelo frontend). */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final transient Map<String, Object> extras = new LinkedHashMap<>();

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public ApiException with(String key, Object value) {
        extras.put(key, value);
        return this;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, Object> extras() {
        return extras;
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public static ApiException conflict(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException unauthorized(String code, String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }
}
