package br.com.ticketflow.auth.service;

/** Metadados do cliente (auditoria de sessões e chave do limitador). */
public record ClientInfo(String userAgent, String ip) {

    public static ClientInfo unknown() {
        return new ClientInfo(null, "unknown");
    }
}
