package br.com.ticketflow.common;

import jakarta.validation.ConstraintViolationException;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Traduz exceções em respostas {@link ApiError} consistentes. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private static final SecureRandom RANDOM = new SecureRandom();

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ApiError> handleApi(ApiException ex) {
        ApiError body = new ApiError(ex.status().value(), ex.code(), ex.getMessage());
        ex.extras().forEach(body::with);
        return ResponseEntity.status(ex.status()).body(body);
    }

    /** Corpo JSON inválido (bean validation): 422 com o mapa campo → mensagem. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> handleBodyValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError fe : ex.getBindingResult().getFieldErrors()) {
            errors.putIfAbsent(fe.getField(), fe.getDefaultMessage());
        }
        ex.getBindingResult().getGlobalErrors().forEach(ge -> errors.putIfAbsent(ge.getObjectName(), ge.getDefaultMessage()));
        return validation(errors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> handleConstraint(ConstraintViolationException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        ex.getConstraintViolations().forEach(v -> {
            String path = v.getPropertyPath().toString();
            errors.putIfAbsent(path.substring(path.lastIndexOf('.') + 1), v.getMessage());
        });
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError(400, "INVALID_PARAMETER", "Parâmetros inválidos").with("errors", errors));
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    ResponseEntity<ApiError> handleMethodValidation(HandlerMethodValidationException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        ex.getAllErrors().forEach(e -> errors.putIfAbsent(String.valueOf(e.getCodes() == null ? "param" : e.getCodes()[e.getCodes().length - 1]), e.getDefaultMessage()));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError(400, "INVALID_PARAMETER", "Parâmetros inválidos").with("errors", errors));
    }

    @ExceptionHandler({MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    ResponseEntity<ApiError> handleBadParam(Exception ex) {
        String name = ex instanceof MethodArgumentTypeMismatchException m
                ? m.getName()
                : ((MissingServletRequestParameterException) ex).getParameterName();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError(400, "INVALID_PARAMETER", "Parâmetro inválido: " + name).with("param", name));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(new ApiError(400, "MALFORMED_REQUEST", "Corpo da requisição inválido"));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ApiError> handleMediaType(HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use application/json"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> handleMethod(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(new ApiError(405, "METHOD_NOT_ALLOWED", "Método não suportado"));
    }

    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    ResponseEntity<ApiError> handleNoResource(Exception ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(404, "NOT_FOUND", "Rota não encontrada"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiError> handleDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiError(403, "FORBIDDEN", "Acesso negado"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        String ref = "%04x-%04x".formatted(RANDOM.nextInt(0x10000), RANDOM.nextInt(0x10000));
        log.error("Erro inesperado [ref={}]", ref, ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(500, "INTERNAL_ERROR", "Algo falhou do nosso lado.").with("ref", ref));
    }

    private static ResponseEntity<ApiError> validation(Map<String, String> errors) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ApiError(422, "VALIDATION_ERROR", "Dados inválidos").with("errors", errors));
    }
}
