package br.com.ticketflow.org.events;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.TicketKind;
import br.com.ticketflow.catalog.domain.TicketLot;
import br.com.ticketflow.catalog.domain.TicketType;
import br.com.ticketflow.common.ApiException;
import br.com.ticketflow.common.Texts;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * No painel, o organizador informa só o "tipo" do lote (texto livre: "Pista", "Premium"…) e os setores do mapa. O
 * backend os traduz para o modelo de venda: um {@link TicketType} por tipo, {@code SEATED} quando corresponde a um
 * setor do mapa (mesmo código ou mesmo nome) e {@code GENERAL} caso contrário.
 */
@Component
public class OrgTicketTypes {

    private static final int MAX_CODE = 40;

    /** Tipo para um lote com o nome informado (reaproveita pelo nome, sem diferenciar acentos/maiúsculas). */
    public TicketType forLot(Event e, String typeName, Instant now) {
        String wanted = Texts.normalize(typeName);
        return e.getTicketTypes().stream()
                .filter(t -> Texts.normalize(t.getName()).equals(wanted))
                .findFirst()
                .orElseGet(() -> {
                    TicketType t = TicketType.of(uniqueCode(e, typeName), typeName.trim(), null, TicketKind.GENERAL, null, nextPosition(e), now);
                    e.addTicketType(t);
                    return t;
                });
    }

    /**
     * Tipo que vende o setor {@code sectorCode}. Prioridade: já vinculado ao setor → mesmo código → mesmo nome (desde que
     * não esteja vinculado a outro setor que continua no mapa). Sem correspondência, cria um tipo com assento.
     */
    public TicketType linkSector(Event e, String sectorCode, String sectorName, Set<String> sectorsInMap, Instant now) {
        Optional<TicketType> linked = e.getTicketTypes().stream().filter(t -> sectorCode.equals(t.getSectorCode())).findFirst();
        if (linked.isPresent()) {
            return linked.get();
        }
        String wanted = Texts.normalize(sectorName);
        Optional<TicketType> candidate = e.getTicketTypes().stream()
                .filter(t -> t.getSectorCode() == null || !sectorsInMap.contains(t.getSectorCode()))
                .filter(t -> t.getCode().equals(sectorCode))
                .findFirst()
                .or(() -> e.getTicketTypes().stream()
                        .filter(t -> t.getSectorCode() == null || !sectorsInMap.contains(t.getSectorCode()))
                        .filter(t -> Texts.normalize(t.getName()).equals(wanted))
                        .findFirst());
        if (candidate.isPresent()) {
            TicketType t = candidate.get();
            if (t.getKind() == TicketKind.GENERAL && hasStockInUse(t)) {
                throw ApiException.conflict("INVALID_STATE",
                        "O tipo " + t.getName() + " já tem vendas sem assento marcado e não pode virar um setor do mapa");
            }
            t.setKind(TicketKind.SEATED);
            t.setSectorCode(sectorCode);
            return t;
        }
        TicketType t = TicketType.of(uniqueCode(e, sectorCode), sectorName.trim(), null, TicketKind.SEATED, sectorCode, nextPosition(e), now);
        e.addTicketType(t);
        return t;
    }

    /** Desfaz o vínculo de um tipo cujo setor saiu do mapa (volta a ser sem assento). */
    public void unlink(TicketType t) {
        if (hasStockInUse(t)) {
            throw ApiException.conflict("INVALID_STATE",
                    "O setor de " + t.getName() + " tem ingressos vendidos ou reservados e não pode sair do mapa");
        }
        t.setKind(TicketKind.GENERAL);
        t.setSectorCode(null);
    }

    /** Há unidades vendidas ou seguradas em algum lote do tipo. */
    public static boolean hasStockInUse(TicketType t) {
        return t.getLots().stream().anyMatch(l -> l.getQuantitySold() + l.getQuantityHeld() > 0);
    }

    public static int seatedLotTotal(TicketType t) {
        return t.getLots().stream().mapToInt(TicketLot::getQuantityTotal).sum();
    }

    private static String uniqueCode(Event e, String raw) {
        String base = Texts.slugify(raw);
        if (base.isEmpty()) {
            base = "tipo";
        }
        base = base.substring(0, Math.min(base.length(), MAX_CODE - 4));
        String code = base;
        for (int i = 2; codeTaken(e, code); i++) {
            code = base + "-" + i;
        }
        return code;
    }

    private static boolean codeTaken(Event e, String code) {
        return e.getTicketTypes().stream().anyMatch(t -> t.getCode().equals(code));
    }

    private static int nextPosition(Event e) {
        return e.getTicketTypes().stream().mapToInt(TicketType::getPosition).max().orElse(-1) + 1;
    }
}
