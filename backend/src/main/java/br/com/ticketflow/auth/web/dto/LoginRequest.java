package br.com.ticketflow.auth.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "Informe o e-mail") @Size(max = 254) String email,
        @NotBlank(message = "Informe a senha") @Size(max = 200) String password) {}
