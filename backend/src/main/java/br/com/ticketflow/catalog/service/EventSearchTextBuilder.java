package br.com.ticketflow.catalog.service;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.common.Texts;

/** Monta o texto normalizado (minúsculas, sem acentos) usado pela busca textual. */
public final class EventSearchTextBuilder {

    private EventSearchTextBuilder() {}

    public static String build(Event e) {
        StringBuilder sb = new StringBuilder();
        append(sb, e.getTitle());
        append(sb, e.getSubtitle());
        append(sb, e.getCategory().getName());
        append(sb, e.getVenue().getName());
        append(sb, e.getVenue().getCity());
        append(sb, e.getVenue().getState());
        append(sb, e.getOrganization().getName());
        return Texts.normalize(sb.toString());
    }

    private static void append(StringBuilder sb, String part) {
        if (part != null && !part.isBlank()) {
            sb.append(part).append(' ');
        }
    }
}
