import { CategoryTile } from '@/components/domain/CategoryTile'
import { LoadError } from '@/components/domain/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCategories } from '../hooks'

/** Grade de categorias (home e /categorias): cards com ícone e contagem. */
export function CategoryGrid() {
  const { data, isPending, error, refetch } = useCategories()

  if (error) return <LoadError title="Não foi possível carregar as categorias." error={error} onRetry={() => refetch()} />

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
      {isPending
        ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="min-h-[132px] rounded-card" />)
        : data.map((c) => <CategoryTile key={c.slug} category={c} />)}
    </div>
  )
}
