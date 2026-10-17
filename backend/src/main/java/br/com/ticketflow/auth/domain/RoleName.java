package br.com.ticketflow.auth.domain;

/** Papéis da plataforma. A ordem define a precedência (o maior papel é exposto ao frontend). */
public enum RoleName {
    USER,
    ORGANIZER,
    ADMIN
}
