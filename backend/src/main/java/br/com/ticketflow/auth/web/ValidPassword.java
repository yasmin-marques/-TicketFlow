package br.com.ticketflow.auth.web;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.nio.charset.StandardCharsets;

/** Senha: 8+ caracteres, ao menos uma letra e um número (mesma regra do frontend), até 72 bytes (limite do BCrypt). */
@Documented
@Constraint(validatedBy = ValidPassword.Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidPassword {

    String message() default "Use ao menos 8 caracteres, com letras e números";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<ValidPassword, String> {

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            if (value == null || value.length() < 8) {
                return false;
            }
            if (value.getBytes(StandardCharsets.UTF_8).length > 72) {
                context.disableDefaultConstraintViolation();
                context.buildConstraintViolationWithTemplate("A senha pode ter no máximo 72 bytes").addConstraintViolation();
                return false;
            }
            return value.chars().anyMatch(Character::isLetter) && value.chars().anyMatch(Character::isDigit);
        }
    }
}
