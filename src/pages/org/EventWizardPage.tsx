import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EventCard } from '@/components/domain/EventCard'
import { LoadError } from '@/components/domain/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { useToast } from '@/components/ui/Toast'
import { OrgPageHeader } from '@/features/org/components/common'
import { orgKeys, useOrgEvent, useOrgLots } from '@/features/org/hooks'
import { CATEGORY_OPTIONS, WIZARD_STEPS } from '@/features/org/wizard/constants'
import { InfoStep, VenueStep } from '@/features/org/wizard/steps'
import { PublishStep, SeatsStep, TicketsStep } from '@/features/org/wizard/steps2'
import { useOrgTitle } from '@/layouts/AdminLayout'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatTime } from '@/lib/format'
import { orgService } from '@/services/api/org.service'
import { ApiError } from '@/services/api/http'
import type { EventSummary } from '@/types/event'
import type { OrgEvent, OrgEventInput } from '@/types/organizer'

/** /org/eventos/novo e /org/eventos/:id/editar — criação em 5 etapas com rascunho a cada passo. */
export function EventWizardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { data: event, isPending, error, refetch } = useOrgEvent(id ?? '')
  const { data: lots } = useOrgLots(id ?? '')
  const [preview, setPreview] = useState<Partial<OrgEventInput>>({})

  const editing = !!id
  useOrgTitle(editing ? 'Editar evento' : 'Criar evento')
  useDocumentTitle(editing ? 'Editar evento' : 'Criar evento')

  const requested = Math.min(5, Math.max(1, Number(params.get('etapa')) || 1))
  // Sem evento salvo só existe a etapa 1.
  const step = editing ? requested : 1
  const setStep = useCallback((n: number) => setParams({ etapa: String(n) }, { replace: true }), [setParams])
  const onPreview = useCallback((p: Partial<OrgEventInput>) => setPreview((cur) => ({ ...cur, ...p })), [])

  if (editing && error instanceof ApiError && error.isNotFound) return <Navigate to="/org/eventos" replace />
  if (editing && error) return <LoadError title="Não foi possível carregar o evento." error={error} onRetry={() => refetch()} />
  if (editing && isPending) return <Skeleton className="h-96" />
  if (event && (event.status === 'ended' || event.status === 'cancelled')) {
    return <Navigate to={`/org/eventos/${event.id}`} replace />
  }

  const save = async (input: Partial<OrgEventInput>, then: 'next' | 'exit' | 'stay') => {
    const saved: OrgEvent = event ? await orgService.updateEvent(event.id, input) : await orgService.createEvent(input)
    queryClient.setQueryData(orgKeys.event(saved.id), saved)
    await queryClient.invalidateQueries({ queryKey: ['org', 'events'] })
    if (then === 'exit') {
      toast.show({ message: 'Rascunho salvo' })
      navigate('/org/eventos')
    } else if (then === 'next') {
      if (!event) navigate(`/org/eventos/${saved.id}/editar?etapa=2`, { replace: true })
      else setStep(step + 1)
    }
  }

  const exit = () => {
    toast.show({ message: 'Rascunho salvo' })
    navigate('/org/eventos')
  }

  // Pré-visualização: como o evento aparece em Explorar.
  const base = event ?? null
  const cat = (preview.category ?? base?.category ?? 'musica') as OrgEvent['category']
  const previewEvent: EventSummary = {
    id: 'preview',
    slug: base?.slug ?? 'previa',
    title: preview.title || base?.title || 'Nome do evento',
    category: { slug: cat, name: CATEGORY_OPTIONS.find((c) => c.value === cat)?.label ?? 'Categoria' },
    startsAt: preview.startsAt ?? base?.startsAt ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
    venue: { name: preview.venue?.name || base?.venue.name || 'Local a definir', city: preview.venue?.city ?? base?.venue.city ?? '', state: '', distanceKm: null },
    minPrice: lots?.length ? Math.min(...lots.map((l) => l.price)) : null,
    coverUrl: null,
    badges: [],
    hasSeatMap: false,
  }

  return (
    <>
      <OrgPageHeader
        title={editing ? 'Editar evento' : 'Criar evento'}
        subtitle={event ? <>Última alteração: {new Date(event.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</> : 'Comece pelas informações básicas'}
        actions={<Link to="/org/eventos" className="text-sm font-semibold">← Eventos</Link>}
      />
      <div className="mb-6">
        <Stepper steps={WIZARD_STEPS} current={step - 1} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="max-w-[760px] min-w-0">
          {step === 1 && <InfoStep key={event?.id ?? 'new'} event={event ?? null} onSave={save} onPreview={onPreview} />}
          {step === 2 && event && <VenueStep event={event} onSave={save} onBack={() => setStep(1)} onPreview={onPreview} />}
          {step === 3 && event && <TicketsStep event={event} onBack={() => setStep(2)} onNext={() => setStep(4)} onSaveExit={exit} />}
          {step === 4 && event && <SeatsStep event={event} onBack={() => setStep(3)} onNext={() => setStep(5)} onSaveExit={exit} />}
          {step === 5 && event && (
            <PublishStep
              event={event}
              onBack={() => setStep(4)}
              onSaveExit={exit}
              onSaved={async (updated, published) => {
                queryClient.setQueryData(orgKeys.event(updated.id), updated)
                await queryClient.invalidateQueries({ queryKey: orgKeys.all })
                toast.show({ message: published ? 'Evento publicado!' : 'Alterações salvas' })
                navigate(`/org/eventos/${updated.id}`)
              }}
            />
          )}
        </div>

        <aside aria-label="Pré-visualização" className="lg:sticky lg:top-24 lg:self-start">
          <h3 className="mb-3 text-[13px] tracking-[0.08em] uppercase">Pré-visualização</h3>
          <div className="pointer-events-none" aria-hidden>
            <EventCard event={previewEvent} showBadge={false} />
          </div>
          <p className="text-muted mt-3 text-xs">
            Assim o evento aparece em Explorar. {step === 1 ? 'Continuar libera quando os campos obrigatórios estiverem válidos.' : `Horário: ${formatTime(previewEvent.startsAt)}.`}
          </p>
        </aside>
      </div>
    </>
  )
}
