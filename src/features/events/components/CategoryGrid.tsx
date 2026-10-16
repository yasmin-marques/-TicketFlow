import { CategoryTile } from '@/components/domain/CategoryTile'
import { LoadError } from '@/components/domain/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCategories } from '../hooks'

/** Grade de categorias (home e /categorias). Linhas de 1px em `text` entre as células. */
export function CategoryGrid() {
  const { data, isPending, error, refetch } = useCategories()

  if (error) return <LoadError title="Não foi possível carregar as categorias." error={error} onRetry={() => refetch()} />

  return (
    <div className="grid gap-px border-2 border-text bg-text sm:grid-cols-2 lg:grid-cols-3">
      {isPending
        ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="min-h-[110px]" />)
        : data.map((c) => <CategoryTile key={c.slug} category={c} />)}
    </div>
  )
}
