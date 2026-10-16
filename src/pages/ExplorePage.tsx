import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Container } from '@/components/ui/Container'
import { useCategories, useEventList } from '@/features/events/hooks'
import { useEventFilters } from '@/features/events/useEventFilters'
import { EventResults } from '@/features/events/components/EventResults'
import { ExploreSearchBar } from '@/features/events/components/ExploreSearchBar'
import { FilterDrawer } from '@/features/events/components/FilterDrawer'
import { FilterSidebar } from '@/features/events/components/FilterSidebar'
import { ResultsToolbar } from '@/features/events/components/ResultsToolbar'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { CategorySlug } from '@/types/event'

/**
 * /eventos e /categorias/:slug — busca + filtros + catálogo paginado.
 * O estado vive na querystring (ver `filterParams.ts`).
 */
export function ExplorePage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: categories, isSuccess: categoriesLoaded } = useCategories()
  const category = slug ? categories?.find((c) => c.slug === slug) : undefined

  // /categorias/:slug precisa validar o slug assim que as categorias carregam.
  if (slug && categoriesLoaded && !category) return <Navigate to="/404" replace />

  return <ExploreContent categorySlug={category?.slug} categoryName={category?.name} pending={!!slug && !category} />
}

interface ExploreContentProps {
  categorySlug?: CategorySlug
  categoryName?: string
  pending: boolean
}

function ExploreContent({ categorySlug, categoryName, pending }: ExploreContentProps) {
  const { filters, defaults, update, clear, activeCount } = useEventFilters(categorySlug)
  const { data: categories } = useCategories()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const list = useEventList(filters, !pending)

  useDocumentTitle(categoryName ?? 'Explorar eventos')

  const changePage = (page: number) => {
    update({ page })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <section className="border-b-2 border-divider pt-6 pb-6 lg:pt-8">
        <Container>
          {categoryName && <div className="kicker mb-1 text-[11px] text-accent-700">Categoria</div>}
          <h1 className="mb-4 text-[32px] lg:text-[42px]">{categoryName ?? 'Explorar eventos'}</h1>
          <ExploreSearchBar
            values={filters}
            onSubmit={({ q, city, from, to }) => update({ q, city, from, to })}
          />
        </Container>
      </section>

      <Container className="lg:grid lg:grid-cols-[272px_1fr] lg:px-0">
        <div className="hidden lg:block">
          <FilterSidebar values={filters} categories={categories} onChange={update} onClear={clear} />
        </div>
        <div className="py-6 lg:px-10 lg:pb-8">
          <ResultsToolbar
            total={list.data?.total}
            filters={filters}
            defaultCategories={defaults.categories}
            categories={categories}
            activeCount={activeCount}
            onChange={update}
            onOpenFilters={() => setDrawerOpen(true)}
          />
          <EventResults
            data={list.data}
            isPending={list.isPending || pending}
            isFetching={list.isFetching}
            error={list.error}
            filters={filters}
            onRetry={() => list.refetch()}
            onClear={clear}
            onPageChange={changePage}
            onShowAllCities={() => update({ city: '' })}
          />
        </div>
      </Container>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        defaults={defaults}
        categories={categories}
        onApply={(values) => update(values)}
      />
    </>
  )
}
