import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { LoadError } from '@/components/domain/LoadError'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Select } from '@/components/ui/Select'
import { ATTENDEE_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toast'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { formatTime } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { OrgAttendee } from '@/types/organizer'
import { orgKeys, useOrgAttendees, useOrgEvents } from './hooks'

const PAGE_SIZE = 15
const STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'checked-in', label: 'Check-in feito' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'cancelled', label: 'Cancelados' },
] as const

interface AttendeesPanelProps {
  eventId: string
  /** Mostra o seletor de evento (página Participantes). */
  onEventChange?: (id: string) => void
}

/** Lista de participantes com busca, filtro de status e check-in manual. */
export function AttendeesPanel({ eventId, onEventChange }: AttendeesPanelProps) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [undo, setUndo] = useState<OrgAttendee | null>(null)
  const debounced = useDebouncedValue(q.trim(), 250)
  const events = useOrgEvents('', '')
  const toast = useToast()
  const queryClient = useQueryClient()

  useEffect(() => setPage(1), [debounced, status, eventId])

  const { data, isPending, error, refetch } = useOrgAttendees({ eventId, q: debounced, status, page, pageSize: PAGE_SIZE })

  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKeys.all })
  const checkin = useMutation({
    mutationFn: (a: OrgAttendee) => orgService.manualCheckin(a.ticketId),
    onSuccess: async (a) => {
      await refresh()
      toast.show({ message: `Check-in de ${a.name} registrado` })
    },
    onError: (err) => toast.show({ message: err instanceof ApiError ? err.message : 'Não foi possível registrar o check-in.' }),
  })

  const columns: Column<OrgAttendee>[] = [
    { key: 'name', header: 'Participante', cell: (a) => <b>{a.name}</b> },
    { key: 'code', header: 'Ingresso', cell: (a) => <span className="font-mono text-[13px]">{a.code}</span> },
    { key: 'sector', header: 'Setor', cell: (a) => a.sector },
    { key: 'seat', header: 'Assento', cell: (a) => a.seat ?? '—' },
    { key: 'time', header: 'Horário', cell: (a) => <span className="tabular">{a.checkedInAt ? formatTime(a.checkedInAt) : '—'}</span> },
    { key: 'status', header: 'Check-in', cell: (a) => <StatusBadge {...ATTENDEE_STATUS[a.status]!} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (a) =>
        a.status === 'waiting' ? (
          <Button variant="ghost" disabled={checkin.isPending} onClick={() => checkin.mutate(a)} aria-label={`Fazer check-in de ${a.name}`}>
            Fazer check-in
          </Button>
        ) : a.status === 'checked-in' ? (
          <Button variant="ghost" onClick={() => setUndo(a)} aria-label={`Desfazer check-in de ${a.name}`}>
            Desfazer
          </Button>
        ) : null,
    },
  ]

  const pct = data && data.sold ? Math.round((data.checkedIn / data.sold) * 100) : 0

  return (
    <section aria-label="Participantes">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {onEventChange && (
          <Select
            value={eventId}
            onChange={onEventChange}
            aria-label="Evento"
            options={[{ value: '', label: 'Todos os eventos' }, ...(events.data?.items.filter((e) => e.status !== 'draft').map((e) => ({ value: e.id, label: e.title })) ?? [])]}
            className="max-w-64"
          />
        )}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome ou código"
          aria-label="Buscar participante por nome ou código"
          className="field sm:w-64"
        />
        <span className="tabular ml-auto text-sm" aria-live="polite">
          <b>{data?.checkedIn.toLocaleString('pt-BR') ?? '—'}</b> / {data?.sold.toLocaleString('pt-BR') ?? '—'} com check-in
          <span className="text-muted"> · {pct}%</span>
        </span>
      </div>
      <div role="group" aria-label="Filtrar por situação" className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Chip key={s.value} label={s.label} selected={status === s.value} onClick={() => setStatus(s.value)} />
        ))}
      </div>

      {error && !data ? (
        <LoadError title="Não foi possível carregar os participantes." error={error} onRetry={() => refetch()} />
      ) : !isPending && data?.items.length === 0 ? (
        <EmptyState
          title="Nenhum participante encontrado"
          description={debounced || status ? 'Tente outra busca ou filtro.' : 'Quando houver vendas, os participantes aparecem aqui.'}
          actions={(debounced || status) ? <Button variant="secondary" onClick={() => { setQ(''); setStatus('') }}>Limpar filtros</Button> : undefined}
        />
      ) : (
        <>
          <DataTable
            caption="Participantes e check-in"
            columns={columns}
            rows={data?.items}
            loading={isPending}
            rowKey={(a) => a.ticketId}
            mobileCard={(a) => (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <b>{a.name}</b>
                  <StatusBadge {...ATTENDEE_STATUS[a.status]!} />
                </div>
                <div className="text-muted mt-0.5 font-mono text-xs">{a.code}</div>
                <div className="text-muted mt-0.5 text-xs">{a.sector}{a.seat ? ` · ${a.seat}` : ''}{a.checkedInAt ? ` · ${formatTime(a.checkedInAt)}` : ''}</div>
                <div className="mt-1">
                  {a.status === 'waiting' && <Button variant="ghost" onClick={() => checkin.mutate(a)}>Fazer check-in</Button>}
                  {a.status === 'checked-in' && <Button variant="ghost" onClick={() => setUndo(a)}>Desfazer</Button>}
                </div>
              </div>
            )}
          />
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />}
        </>
      )}

      <ConfirmModal
        open={!!undo}
        title="Desfazer check-in?"
        confirmLabel="Desfazer check-in"
        onClose={() => setUndo(null)}
        onConfirm={async () => {
          await orgService.undoCheckin(undo!.ticketId)
          await refresh()
          toast.show({ message: 'Check-in desfeito' })
        }}
      >
        {undo && `${undo.name} (${undo.code}) volta para “Aguardando” e o ingresso poderá ser validado de novo.`}
      </ConfirmModal>
    </section>
  )
}
