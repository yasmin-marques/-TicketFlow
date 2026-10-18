package br.com.ticketflow.realtime;

import java.util.UUID;

/**
 * Mudança de estado de um assento. {@code status}: {@code available | reserved | sold}. {@code actorUserId} é quem
 * causou a mudança (o stream não a reenvia a ele: o cliente já aplicou a própria ação) e nunca sai da API.
 */
public record SeatUpdate(UUID eventId, String seatId, String status, UUID actorUserId) {}
