import { useState } from 'react'
import { EventRow } from '@/components/domain/EventCard'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useUserCity } from '@/hooks/useUserCity'
import type { CategorySlug } from '@/types/event'
import { CITIES } from '../constants'
import { useCategories, useUpcomingEvents } from '../hooks'

/** "Próximos de você": eventos da cidade escolhida; no mobile ganha chips de categoria. */
export function UpcomingEvents() {
  const [city, setCity] = useUserCity()
  const [category, setCategory] = useState<CategorySlug | undefined>()
  const { data: categories } = useCategories()
  const { data, isPending, error, refetch } = useUpcomingEvents(city, 5, category)

  return (
    <section aria-labelledby="proximos" className="pt-10 pb-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="proximos" className="m-0 text-xl lg:text-[32px]">
          Próximos de você
        </h2>
        <Select
          bare
          value={city}
          onChange={setCity}
          aria-label="Cidade"
          options={CITIES.map((c) => ({ value: c, label: c }))}
          className="text-muted"
        />
      </div>

      <div
        role="group"
        aria-label="Filtrar por categoria"
        className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto border-b border-neutral-400 px-4 py-3.5 lg:hidden"
      >
        <Chip label="Tudo" size="lg" selected={!category} onClick={() => setCategory(undefined)} />
        {categories?.map((c) => (
          <Chip
            key={c.slug}
            label={c.name}
            size="lg"
            selected={category === c.slug}
            onClick={() => setCategory(c.slug)}
          />
        ))}
      </div>

      {error ? (
        <LoadError title="Não foi possível carregar os eventos." error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-5 border-t-2 border-divider py-4">
              <Skeleton className="h-10 w-16 lg:w-32" />
              <div className="flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title="Nada por aqui"
          description={`Nenhum evento próximo em ${city}${category ? ' nessa categoria' : ''}.`}
          actions={
            <>
              {category && (
                <Button variant="secondary" onClick={() => setCategory(undefined)}>
                  Ver todas as categorias
                </Button>
              )}
              <Button to="/eventos?cidade=todas" variant="ghost">
                Ver eventos em todas as cidades →
              </Button>
            </>
          }
        />
      ) : (
        <div className="border-b-2 border-divider">
          {data.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </div>
      )}
    </section>
  )
}
