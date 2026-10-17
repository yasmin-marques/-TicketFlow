package br.com.ticketflow.auth.web.dto;

import br.com.ticketflow.auth.web.ValidPassword;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(
        @NotBlank(message = "Token ausente") @Size(max = 200) String token,
        @ValidPassword String password) {}
