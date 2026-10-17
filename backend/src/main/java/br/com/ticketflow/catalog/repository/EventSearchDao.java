package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.Event;
import br.com.ticketflow.catalog.domain.EventStatus;
import br.com.ticketflow.catalog.service.EventSearchCriteria;
import br.com.ticketflow.catalog.service.EventSearchCriteria.Sort;
import br.com.ticketflow.catalog.service.TimeRanges;
import br.com.ticketflow.catalog.service.TimeRanges.Range;
import br.com.ticketflow.common.Texts;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.ParameterExpression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Repository;

/**
 * Busca paginada do catálogo público com filtros dinâmicos (Criteria API).
 *
 * <p>Sempre restringe a eventos PUBLICADOS e ainda não encerrados. Evita N+1 trazendo categoria e local com
 * {@code fetch join}; a contagem usa uma consulta separada sem fetch.
 */
@Repository
public class EventSearchDao {

    public record Result(List<Event> items, long total) {}

    @PersistenceContext
    private EntityManager em;

    public Result search(EventSearchCriteria c, Instant now, ZoneId zone, double defaultLat, double defaultLng) {
        CriteriaBuilder cb = em.getCriteriaBuilder();

        // Total
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<Event> countRoot = countQuery.from(Event.class);
        Join<?, ?> countVenue = countRoot.join("venue");
        Join<?, ?> countCategory = countRoot.join("category");
        countQuery.select(cb.count(countRoot)).where(predicates(cb, countRoot, countVenue, countCategory, c, now, zone).toArray(Predicate[]::new));
        long total = em.createQuery(countQuery).getSingleResult();
        if (total == 0) {
            return new Result(List.of(), 0);
        }

        // Página
        CriteriaQuery<Event> query = cb.createQuery(Event.class);
        Root<Event> root = query.from(Event.class);
        Join<?, ?> venue = (Join<?, ?>) root.fetch("venue", JoinType.INNER);
        Join<?, ?> category = (Join<?, ?>) root.fetch("category", JoinType.INNER);
        // Constantes da fórmula de distância vão como parâmetros: literais no ORDER BY quebram o binding do Hibernate.
        Origin origin = new Origin(cb);
        query.select(root)
                .where(predicates(cb, root, venue, category, c, now, zone).toArray(Predicate[]::new))
                .orderBy(order(cb, root, venue, c, origin));
        TypedQuery<Event> typed = em.createQuery(query);
        if (c.sort() == Sort.DISTANCIA) {
            typed.setParameter("one", 1.0);
            typed.setParameter("minusOne", -1.0);
            origin.bind(typed, c.originLat() != null ? c.originLat() : defaultLat, c.originLng() != null ? c.originLng() : defaultLng);
        }
        typed.setFirstResult((c.page() - 1) * c.pageSize());
        typed.setMaxResults(c.pageSize());
        return new Result(typed.getResultList(), total);
    }

    private List<Predicate> predicates(
            CriteriaBuilder cb, Root<Event> e, Join<?, ?> venue, Join<?, ?> category, EventSearchCriteria c, Instant now, ZoneId zone) {
        List<Predicate> p = new ArrayList<>();

        // Visível no catálogo: publicado e ainda não terminou.
        p.add(cb.equal(e.get("status"), EventStatus.PUBLISHED));
        p.add(cb.isNotNull(e.get("publishedAt")));
        p.add(cb.lessThanOrEqualTo(e.<Instant>get("publishedAt"), now));
        p.add(cb.greaterThanOrEqualTo(cb.coalesce(e.<Instant>get("endsAt"), e.<Instant>get("startsAt")), now));

        if (c.q() != null && !c.q().isBlank()) {
            for (String term : Texts.normalize(c.q()).split("\\s+")) {
                p.add(cb.like(e.<String>get("searchText"), "%" + Texts.escapeLike(term) + "%", '\\'));
            }
        }
        if (c.city() != null) {
            p.add(cb.equal(cb.lower(venue.<String>get("city")), c.city().toLowerCase()));
            if (c.state() != null) {
                p.add(cb.equal(cb.upper(venue.<String>get("state")), c.state().toUpperCase()));
            }
        }
        if (c.from() != null || c.to() != null) {
            Range r = TimeRanges.between(c.from(), c.to(), zone);
            addRange(cb, e, p, r);
        }
        if (c.when() != null) {
            Range r = switch (c.when()) {
                case HOJE -> TimeRanges.today(now, zone);
                case FIM_DE_SEMANA -> TimeRanges.weekend(now, zone);
                case MES -> TimeRanges.month(now, zone);
            };
            addRange(cb, e, p, r);
        }
        if (c.categories() != null && !c.categories().isEmpty()) {
            p.add(category.get("slug").in(c.categories()));
        }
        // Eventos sem preço definido contam como 0 (mesma regra do contrato anterior).
        Expression<Long> price = cb.coalesce(e.<Long>get("minPriceCents"), 0L);
        if (c.minPriceCents() != null) {
            p.add(cb.greaterThanOrEqualTo(price, c.minPriceCents()));
        }
        if (c.maxPriceCents() != null) {
            p.add(cb.lessThanOrEqualTo(price, c.maxPriceCents()));
        }
        if (c.seatMapOnly()) {
            p.add(cb.isTrue(e.get("hasSeatMap")));
        }
        return p;
    }

    private static void addRange(CriteriaBuilder cb, Root<Event> e, List<Predicate> p, Range r) {
        if (r.from() != null) {
            p.add(cb.greaterThanOrEqualTo(e.<Instant>get("startsAt"), r.from()));
        }
        if (r.toExclusive() != null) {
            p.add(cb.lessThan(e.<Instant>get("startsAt"), r.toExclusive()));
        }
    }

    private List<Order> order(CriteriaBuilder cb, Root<Event> e, Join<?, ?> venue, EventSearchCriteria c, Origin origin) {
        Order byDate = cb.asc(e.get("startsAt"));
        Order tie = cb.asc(e.get("id"));
        Sort sort = c.sort() == null ? Sort.DATA : c.sort();
        return switch (sort) {
            case RECENTES -> List.of(cb.desc(e.get("createdAt")), tie);
            case PRECO -> List.of(cb.asc(cb.coalesce(e.<Long>get("minPriceCents"), Long.MAX_VALUE)), byDate, tie);
            // PostgreSQL ordena NULL por último em ASC: locais sem coordenadas ficam no fim.
            case DISTANCIA -> List.of(cb.asc(distanceKm(cb, venue, origin)), byDate, tie);
            default -> List.of(byDate, tie);
        };
    }

    /** Origem da ordenação por distância, passada à consulta como parâmetros (seno/cosseno já calculados). */
    private static final class Origin {
        final ParameterExpression<Double> sinLat;
        final ParameterExpression<Double> cosLat;
        final ParameterExpression<Double> lngRad;

        Origin(CriteriaBuilder cb) {
            sinLat = cb.parameter(Double.class, "originSinLat");
            cosLat = cb.parameter(Double.class, "originCosLat");
            lngRad = cb.parameter(Double.class, "originLngRad");
        }

        void bind(TypedQuery<?> q, double lat, double lng) {
            q.setParameter(sinLat, Math.sin(Math.toRadians(lat)));
            q.setParameter(cosLat, Math.cos(Math.toRadians(lat)));
            q.setParameter(lngRad, Math.toRadians(lng));
        }
    }

    /** Distância em km (lei dos cossenos esférica) entre o local e a origem; NULL se o local não tem coordenadas. */
    private static Expression<Double> distanceKm(CriteriaBuilder cb, Join<?, ?> venue, Origin o) {
        Expression<Double> vLat = cb.function("radians", Double.class, venue.get("latitude"));
        Expression<Double> vLng = cb.function("radians", Double.class, venue.get("longitude"));
        Expression<Double> cosPart = cb.prod(
                cb.prod(o.cosLat, cb.function("cos", Double.class, vLat)),
                cb.function("cos", Double.class, cb.diff(vLng, o.lngRad)));
        Expression<Double> sinPart = cb.prod(o.sinLat, cb.function("sin", Double.class, vLat));
        Expression<Double> inner = cb.sum(cosPart, sinPart);
        // acos() só aceita [-1, 1]; erros de arredondamento podem passar disso.
        Expression<Double> clamped = cb.function("least", Double.class, cb.parameter(Double.class, "one"),
                cb.function("greatest", Double.class, cb.parameter(Double.class, "minusOne"), inner));
        return cb.function("acos", Double.class, clamped);
    }
}
