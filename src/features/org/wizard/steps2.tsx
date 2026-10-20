import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatDateWithTime, formatPrice } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { OrgEvent } from '@/types/organizer'
import { useOrgLots } from '../hooks'
import { LotsManager } from '../LotsManager'
import { SeatMapEditor, seatMapCapacity } from '../SeatMapEditor'
import { CATEGORY_OPTIONS } from './constants'
import { StepFooter, type StepProps } from './steps'

/* ── Etapa 3 · Ingressos ─────────────────────────────────────────────── */

export function TicketsStep({ event, onBack, onNext, onSaveExit }: { event: OrgEvent; onBack: () => void; onNext: () => void; onSaveExit: () => void }) {
  const { data: lots } = useOrgLots(event.id)
  const empty = (lots?.length ?? 0) === 0
  return (
    <div>
      <h2 className="mb-0.5 text-[26px]">Ingressos</h2>
      <p className="text-muted mb-5 text-[13px]">Passo 3 de 5 · salvo automaticamente como rascunho</p>
      <LotsManager eventId={event.id} />
      <StepFooter onBack={onBack} onSaveExit={onSaveExit} onContinue={onNext} continueDisabled={empty} hint={empty ? 'Crie ao menos um lote para continuar.' : undefined} />
    </div>
  )
}

/* ── Etapa 4 · Assentos ──────────────────────────────────────────────── */

export function SeatsStep({ event, onBack, onNext, onSaveExit }: { event: OrgEvent; onBack: () => void; onNext: () => void; onSaveExit: () => void }) {
  const [seated, setSeated] = useState(event.hasSeatMap)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = async () => {
    setError(null)
    if (!seated && event.hasSeatMap) {
      setBusy(true)
      try {
        await orgService.saveSeatMap(event.id, null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    onNext()
  }

  return (
    <div>
      <h2 className="mb-0.5 text-[26px]">Assentos</h2>
      <p className="text-muted mb-4 text-[13px]">Passo 4 de 5 · salvo automaticamente como rascunho</p>

      <div role="radiogroup" aria-label="Tipo de venda" className="mb-5 inline-flex max-w-full gap-1 rounded-control bg-surface p-1">
        {[
          { v: true, label: 'Com assento marcado' },
          { v: false, label: 'Sem assento marcado' },
        ].map((o) => (
          <label key={String(o.v)} className={cn('transition-control cursor-pointer rounded-sm px-5 py-2 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent', seated === o.v ? 'bg-card text-text shadow-sm' : 'text-neutral-700 hover:text-text')}>
            <input type="radio" className="sr-only" checked={seated === o.v} onChange={() => setSeated(o.v)} />
            {o.label}
          </label>
        ))}
      </div>

      {error && <Alert className="mb-4" title={error} />}
      {seated ? (
        <SeatMapEditor eventId={event.id} initial={event.seatMap} onSaved={() => setDirty(false)} onDirtyChange={setDirty} />
      ) : (
        <p className="text-muted max-w-xl text-sm">O comprador escolhe apenas o tipo e a quantidade de ingressos — não há mapa de lugares.</p>
      )}

      <StepFooter
        onBack={onBack}
        onSaveExit={onSaveExit}
        onContinue={next}
        busy={busy}
        continueDisabled={seated && (dirty || !event.hasSeatMap)}
        hint={seated && dirty ? 'Salve o mapa para continuar.' : seated && !event.hasSeatMap ? 'Crie e salve o mapa para continuar.' : undefined}
      />
    </div>
  )
}

/* ── Etapa 5 · Publicação ────────────────────────────────────────────── */

export function PublishStep({
  event,
  onBack,
  onSaved,
  onSaveExit,
}: {
  event: OrgEvent
  onBack: () => void
  onSaved: (updated: OrgEvent, published: boolean) => void
  onSaveExit: () => void
}) {
  const { data: lots } = useOrgLots(event.id)
  const [policy, setPolicy] = useState(event.cancellationPolicy)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const published = event.status === 'published'

  const cap = seatMapCapacity(event.seatMap)
  const lotsTotal = (lots ?? []).reduce((n, l) => n + l.quantity, 0)
  const checklist: Array<{ ok: boolean; label: string }> = [
    { ok: event.title.trim().length >= 3, label: 'Nome do evento' },
    { ok: event.description.trim().length >= 80, label: 'Descrição com ao menos 80 caracteres' },
    { ok: !!event.venue.name.trim(), label: 'Local informado' },
    { ok: new Date(event.endsAt) > new Date(event.startsAt), label: 'Datas válidas' },
    { ok: (lots?.length ?? 0) > 0, label: 'Ao menos um lote de ingressos' },
    { ok: !event.hasSeatMap || cap.total > 0, label: 'Mapa de assentos com lugares' },
  ]
  const ready = checklist.every((c) => c.ok)
  const mismatch = event.hasSeatMap && lotsTotal !== cap.total

  const run = async (publish: boolean) => {
    setBusy(true)
    setErrors([])
    try {
      let ev = await orgService.updateEvent(event.id, { cancellationPolicy: policy })
      if (publish && ev.status === 'draft') ev = await orgService.publishEvent(ev.id)
      onSaved(ev, publish)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PUBLISH_BLOCKED') setErrors((err.details.errors as string[]) ?? [err.message])
      else setErrors([err instanceof ApiError ? err.message : 'Não foi possível concluir. Tente novamente.'])
    } finally {
      setBusy(false)
    }
  }

  const category = CATEGORY_OPTIONS.find((c) => c.value === event.category)?.label

  return (
    <div>
      <h2 className="mb-0.5 text-[26px]">Publicação</h2>
      <p className="text-muted mb-5 text-[13px]">Passo 5 de 5 · revise antes de publicar</p>

      <ul aria-label="Lista de verificação" className="m-0 list-none border-t border-divider p-0">
        {checklist.map((c) => (
          <li key={c.label} className="flex items-center gap-3 border-b border-line py-2.5 text-sm">
            <span aria-hidden className={cn('grid size-5 place-items-center text-xs font-extrabold text-white', c.ok ? 'bg-success' : 'bg-accent-700')}>{c.ok ? '✓' : '✕'}</span>
            <span>{c.label}</span>
            <span className="sr-only">{c.ok ? '(ok)' : '(pendente)'}</span>
          </li>
        ))}
      </ul>
      {mismatch && (
        <Alert tone="warning" className="mt-4" title="Capacidade diferente">
          {' '}A soma dos lotes ({lotsTotal}) difere da capacidade do mapa ({cap.total}). Você pode publicar assim, mas confira.
        </Alert>
      )}

      <dl className="m-0 mt-6 grid grid-cols-[130px_1fr] border-t border-divider text-sm">
        {[
          ['Evento', event.title],
          ['Categoria', `${category ?? ''} · ${event.ageRating === 0 ? 'Livre' : `${event.ageRating} anos`}`],
          ['Quando', `${formatDateWithTime(event.startsAt)} → ${formatDateWithTime(event.endsAt)}`],
          ['Local', [event.venue.name, event.venue.city].filter(Boolean).join(', ') || '—'],
          ['Link', `/eventos/${event.slug}`],
          ['Ingressos', `${lots?.length ?? 0} lotes · ${lotsTotal} lugares · a partir de ${lots?.length ? formatPrice(Math.min(...lots.map((l) => l.price))) : '—'}`],
        ].map(([k, v], i) => (
          <div key={k} className="contents">
            <dt className={cn('text-muted py-2', i > 0 && 'border-t border-line')}>{k}</dt>
            <dd className={cn('m-0 py-2 font-semibold break-words', i > 0 && 'border-t border-line')}>{v}</dd>
          </div>
        ))}
      </dl>

      <fieldset className="mt-6 min-w-0 border-0 p-0">
        <legend className="mb-2 p-0 font-extrabold">Política de cancelamento</legend>
        {[
          { v: 'full-7d' as const, label: 'Reembolso integral até 7 dias após a compra' },
          { v: 'none' as const, label: 'Sem reembolso (exceto cancelamento do evento)' },
        ].map((o) => (
          <label key={o.v} className="mb-1.5 flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="radio" name="policy" className="size-4 accent-[var(--color-text)]" checked={policy === o.v} onChange={() => setPolicy(o.v)} />
            {o.label}
          </label>
        ))}
      </fieldset>

      {errors.length > 0 && (
        <Alert className="mt-5" title="Não foi possível publicar">
          <ul className="mt-1 mb-0 pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Alert>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2.5 border-t border-divider pt-4">
        <Button variant="secondary" onClick={onBack}>← Voltar</Button>
        <span className="ml-auto flex gap-2">
          {!published && (
            <Button variant="secondary" disabled={busy} onClick={async () => { await run(false); onSaveExit() }}>
              Salvar rascunho
            </Button>
          )}
          <Button disabled={busy || (!published && !ready)} onClick={() => void run(!published)}>
            {busy ? 'Salvando…' : published ? 'Salvar alterações' : 'Publicar evento'}
          </Button>
        </span>
      </div>
      {!published && !ready && <p className="text-muted mt-2 text-right text-xs">Resolva os itens pendentes para publicar.</p>}
    </div>
  )
}

export type { StepProps }
