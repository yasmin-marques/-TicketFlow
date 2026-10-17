package br.com.ticketflow.auth.web.dto;

import br.com.ticketflow.auth.web.ValidPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank(message = "Informe o nome") @Size(max = 120, message = "Máximo de 120 caracteres") String name,
        @NotBlank(message = "Informe o e-mail") @Email(message = "E-mail inválido") @Size(max = 254, message = "E-mail muito longo") String email,
        @ValidPassword String password) {}
