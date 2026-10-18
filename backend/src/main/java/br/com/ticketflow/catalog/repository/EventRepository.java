package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.Event;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface EventRepository extends JpaRepository<Event, UUID> {

    boolean existsBySlug(String slug);

    long count();

    /** Evento visível no catálogo (publicado e ainda não encerrado), com as associações da página de detalhe. */
    @Query("""
            select e from Event e
              join fetch e.category join fetch e.venue join fetch e.organization
            where e.slug = :slug and e.status = br.com.ticketflow.catalog.domain.EventStatus.PUBLISHED
              and e.publishedAt <= :now and coalesce(e.endsAt, e.startsAt) >= :now
            """)
    Optional<Event> findVisibleBySlug(@Param("slug") String slug, @Param("now") Instant now);

    @Query("""
            select e from Event e
              join fetch e.category join fetch e.venue join fetch e.organization
            where e.id = :id and e.status = br.com.ticketflow.catalog.domain.EventStatus.PUBLISHED
              and e.publishedAt <= :now and coalesce(e.endsAt, e.startsAt) >= :now
            """)
    Optional<Event> findVisibleById(@Param("id") UUID id, @Param("now") Instant now);

    @Query("""
            select e from Event e join fetch e.category join fetch e.venue
            where e.featured = true and e.status = br.com.ticketflow.catalog.domain.EventStatus.PUBLISHED
              and e.publishedAt <= :now and coalesce(e.endsAt, e.startsAt) >= :now
            order by e.featuredRank asc, e.startsAt asc
            """)
    List<Event> findFeatured(@Param("now") Instant now, Pageable pageable);

    /** Relacionados: primeiro a mesma categoria, depois as demais; sempre por data e excluindo o próprio evento. */
    @Query("""
            select e from Event e join fetch e.category join fetch e.venue
            where e.id <> :id and e.status = br.com.ticketflow.catalog.domain.EventStatus.PUBLISHED
              and e.publishedAt <= :now and coalesce(e.endsAt, e.startsAt) >= :now
            order by case when e.category.id = :categoryId then 0 else 1 end, e.startsAt asc, e.id asc
            """)
    List<Event> findRelated(@Param("id") UUID id, @Param("categoryId") Short categoryId, @Param("now") Instant now, Pageable pageable);

    // ── Painel do organizador: SEMPRE filtrado pela organização da sessão ─────────────────────────────

    @Query("""
            select e from Event e left join fetch e.venue join fetch e.category
            where e.id = :id and e.organization.id = :orgId
            """)
    Optional<Event> findOwned(@Param("id") UUID id, @Param("orgId") UUID orgId);

    /** Trava o evento da organização (sem joins: só a linha de {@code events}). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Event e where e.id = :id and e.organization.id = :orgId")
    Optional<Event> lockOwned(@Param("id") UUID id, @Param("orgId") UUID orgId);

    @Query("""
            select e from Event e left join fetch e.venue join fetch e.category
            where e.organization.id = :orgId order by e.startsAt desc, e.id
            """)
    List<Event> findAllOwned(@Param("orgId") UUID orgId);

    boolean existsBySlugAndIdNot(String slug, UUID id);

    @Query("select count(e) from Event e where e.venue.id = :venueId")
    long countByVenue(@Param("venueId") UUID venueId);
}
