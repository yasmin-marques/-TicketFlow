package br.com.ticketflow.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(@NotBlank(message = "Informe o e-mail") @Size(max = 254) String email) {}
