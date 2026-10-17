package br.com.ticketflow.catalog.repository;

import br.com.ticketflow.catalog.domain.Category;
import br.com.ticketflow.catalog.web.dto.CategoryDto;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CategoryRepository extends JpaRepository<Category, Short> {

    Optional<Category> findBySlug(String slug);

    /** Categorias na ordem de exibição, com a contagem de eventos visíveis (inclui categorias com 0). */
    @Query("""
            select new br.com.ticketflow.catalog.web.dto.CategoryDto(c.slug, c.name, count(e.id))
            from Category c
              left join Event e on e.category = c
                and e.status = br.com.ticketflow.catalog.domain.EventStatus.PUBLISHED
                and e.publishedAt <= :now and coalesce(e.endsAt, e.startsAt) >= :now
            group by c.id, c.slug, c.name, c.sortOrder
            order by c.sortOrder
            """)
    List<CategoryDto> findAllWithVisibleCount(@Param("now") Instant now);
}
