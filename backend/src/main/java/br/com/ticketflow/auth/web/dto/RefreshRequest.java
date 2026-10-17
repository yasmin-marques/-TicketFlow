package br.com.ticketflow.auth.web.dto;

import jakarta.validation.constraints.Size;

/**
 * Corpo opcional de {@code POST /auth/refresh}. O caminho preferido é o cookie HttpOnly; o campo só é aceito
 * quando {@code tf.security.refresh.expose-in-body=true} (clientes sem cookie).
 */
public record RefreshRequest(@Size(max = 200) String refreshToken) {}
