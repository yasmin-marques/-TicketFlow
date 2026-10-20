import { LoadError } from '@/components/domain/LoadError'
import { ProgressBar } from '@/components/charts/Charts'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { OrgPageHeader } from '@/features/org/components/common'
import { useOrgEvents } from '@/features/org/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateWithTime } from '@/lib/format'

/** /org/checkin — escolha do evento para abrir o scanner. */
export function CheckinPickerPage() {
  useDocumentTitle('Check-in · Organizador')
  const { data, isPending, error, refetch } = useOrgEvents('published', '')
  return (
    <>
      <OrgPageHeader title="Check-in" subtitle="Escolha o evento para abrir o scanner da portaria. Funciona em tablet e celular." />
      {error && !data ? (
        <LoadError title="Não foi possível carregar os eventos." error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState title="Nenhum evento publicado" description="Publique um evento para liberar o check-in." actions={<Button to="/org/eventos/novo">+ Criar evento</Button>} />
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((e) => (
            <li key={e.id} className="flex flex-col surface p-5">
              <b className="text-xl leading-tight">{e.title}</b>
              <div className="text-muted mb-3 text-[13px]">{formatDateWithTime(e.startsAt)} · {e.venueLabel}</div>
              <div className="tabular text-sm">{e.sold.toLocaleString('pt-BR')} ingressos vendidos</div>
              <ProgressBar pct={e.capacity ? (e.sold / e.capacity) * 100 : 0} className="mt-1.5" />
              <div className="mt-4 flex gap-2">
                <Button to={`/org/checkin/${e.id}`}>Abrir scanner →</Button>
                <Button to={`/org/eventos/${e.id}?aba=participantes`} variant="secondary">Lista</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
