package br.com.ticketflow.sales.service;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Contadores de estoque dos lotes, alterados SOMENTE por UPDATEs atômicos condicionais: a linha do lote serializa
 * compradores concorrentes (o segundo espera o primeiro confirmar e então reavalia a condição) e o {@code CHECK}
 * {@code sold + held <= total} do banco é a barreira final. Não usa entidades JPA de propósito — assim não há
 * estado em cache que possa ficar defasado.
 */
@Component
@Transactional(propagation = Propagation.MANDATORY)
public class LotStock {

    private final JdbcTemplate jdbc;

    public LotStock(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Segura {@code q} unidades se ainda houver estoque. {@code false} = sem estoque suficiente. */
    public boolean hold(UUID lotId, int q) {
        return jdbc.update("""
                update ticket_lots set quantity_held = quantity_held + ?, version = version + 1
                where id = ? and status = 'PUBLISHED' and quantity_sold + quantity_held + ? <= quantity_total
                """, q, lotId, q) == 1;
    }

    public void release(UUID lotId, int q) {
        requireOne(jdbc.update("update ticket_lots set quantity_held = quantity_held - ?, version = version + 1 where id = ? and quantity_held >= ?", q, lotId, q), "release");
    }

    /** Converte unidades seguradas em vendidas. */
    public void confirmSale(UUID lotId, int q) {
        requireOne(jdbc.update("""
                update ticket_lots set quantity_held = quantity_held - ?, quantity_sold = quantity_sold + ?, version = version + 1
                where id = ? and quantity_held >= ?
                """, q, q, lotId, q), "confirmSale");
    }

    /** Devolve unidades vendidas (reembolso). */
    public void returnSold(UUID lotId, int q) {
        requireOne(jdbc.update("update ticket_lots set quantity_sold = quantity_sold - ?, version = version + 1 where id = ? and quantity_sold >= ?", q, lotId, q), "returnSold");
    }

    private static void requireOne(int updated, String op) {
        if (updated != 1) {
            // Contadores inconsistentes: aborta a transação em vez de seguir com estoque errado.
            throw new IllegalStateException("Estoque inconsistente em " + op);
        }
    }
}
