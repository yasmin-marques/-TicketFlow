package br.com.ticketflow.shared.port;

/**
 * Limitador de tentativas de login (anti força-bruta). A implementação atual é em memória; na Parte 2 será
 * trocada por uma baseada em Redis, compartilhada entre instâncias.
 */
public interface LoginAttemptLimiter {

    /** Lança {@code 429 TOO_MANY_ATTEMPTS} se a chave está bloqueada. */
    void assertNotLocked(String key);

    void recordFailure(String key);

    void reset(String key);
}
