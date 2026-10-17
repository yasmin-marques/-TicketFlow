package br.com.ticketflow.common;

import java.text.Normalizer;
import java.util.Locale;

/** Utilidades de texto: normalização para busca e geração de slugs. */
public final class Texts {

    private Texts() {}

    /** Minúsculas e sem acentos, espaços aparados. */
    public static String normalize(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .trim();
    }

    public static String slugify(String value) {
        return normalize(value).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
    }

    /** Escapa curingas do LIKE (usa {@code \} como escape). */
    public static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
