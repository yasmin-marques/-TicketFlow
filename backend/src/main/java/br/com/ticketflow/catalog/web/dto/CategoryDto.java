package br.com.ticketflow.catalog.web.dto;

/** Categoria com a quantidade de eventos disponíveis. */
public record CategoryDto(String slug, String name, long eventCount) {}
