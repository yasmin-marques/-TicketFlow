import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { TextField } from '@/components/ui/TextField'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/cn'
import { formatTime, toDateKey } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { CategorySlug } from '@/types/event'
import type { OrgEvent, OrgEventInput } from '@/types/organizer'
import { CATEGORY_OPTIONS } from './constants'

export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const toIso = (date: string, time: string) => `${date}T${time}:00-03:00`

/** Linha de botões comum às etapas: Voltar · Salvar e sair · Continuar. */
export function StepFooter({
  onBack,
  onSaveExit,
  continueLabel = 'Continuar →',
  continueDisabled,
  busy,
  hint,
  submit,
  onContinue,
}: {
  onBack?: () => void
  onSaveExit?: () => void
  continueLabel?: string
  continueDisabled?: boolean
  busy?: boolean
  hint?: ReactNode
  submit?: boolean
  onContinue?: () => void
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-2.5 border-t-2 border-divider pt-4">
      {onBack && (
        <Button variant="secondary" onClick={onBack}>
          ← Voltar
        </Button>
      )}
      {hint && <span className="text-muted text-xs">{hint}</span>}
      <span className="ml-auto flex gap-2">
        {onSaveExit && (
          <Button variant="secondary" onClick={onSaveExit} disabled={busy}>
            Salvar e sair
          </Button>
        )}
        <Button type={submit ? 'submit' : 'button'} onClick={onContinue} disabled={continueDisabled || busy}>
          {busy ? 'Salvando…' : continueLabel}
        </Button>
      </span>
    </div>
  )
}

/* ── Etapa 1 · Informações ───────────────────────────────────────────── */

const infoSchema = z
  .object({
    title: z.string().trim().min(3, 'Informe o nome do evento (mín. 3 caracteres)').max(80, 'Máximo de 80 caracteres'),
    category: z.string().min(1),
    ageRating: z.number(),
    startDate: z.string().min(1, 'Informe a data de início'),
    startTime: z.string().min(1, 'Informe a hora'),
    endDate: z.string().min(1, 'Informe a data de término'),
    endTime: z.string().min(1, 'Informe a hora'),
    description: z.string().trim().min(80, 'Mínimo de 80 caracteres').max(2000, 'Máximo de 2000 caracteres'),
  })
  .refine((v) => !v.startDate || !v.endDate || toIso(v.endDate, v.endTime || '00:00') > toIso(v.startDate, v.startTime || '00:00'), {
    path: ['endDate'],
    message: 'O término precisa ser depois do início',
  })
type InfoValues = z.infer<typeof infoSchema>

const AGE_OPTIONS = [0, 10, 12, 14, 16, 18]

export interface StepProps {
  event: OrgEvent | null
  /** Salva (cria ou atualiza) e avança ou sai. */
  onSave: (input: Partial<OrgEventInput>, then: 'next' | 'exit' | 'stay') => Promise<void>
}

export function InfoStep({ event, onSave, onPreview }: StepProps & { onPreview: (p: Partial<OrgEventInput>) => void }) {
  const tomorrow = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InfoValues>({
    resolver: zodResolver(infoSchema),
    mode: 'onTouched',
    defaultValues: {
      title: event?.title ?? '',
      category: event?.category ?? 'musica',
      ageRating: event?.ageRating ?? 0,
      startDate: event ? toDateKey(event.startsAt) : tomorrow,
      startTime: event ? formatTime(event.startsAt) : '20:00',
      endDate: event ? toDateKey(event.endsAt) : tomorrow,
      endTime: event ? formatTime(event.endsAt) : '23:00',
      description: event?.description ?? '',
    },
  })
  const [coverError, setCoverError] = useState<string | null>(null)
  const [cover, setCover] = useState<{ name: string; size: number; url: string } | null>(event?.coverName ? { name: event.coverName, size: 0, url: '' } : null)
  const [formError, setFormError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const title = watch('title')
  const description = watch('description')
  const slug = slugify(title)
  const debouncedSlug = useDebouncedValue(slug, 300)
  const slugCheck = useQuery({
    queryKey: ['org', 'slug', debouncedSlug, event?.id ?? ''],
    queryFn: ({ signal }) => orgService.slugAvailable(debouncedSlug, event?.id, signal),
    enabled: debouncedSlug.length >= 3,
  })
  const slugOk = slugCheck.data?.available
  const checking = slug !== debouncedSlug || slugCheck.isFetching

  // Pré-visualização ao vivo
  const live = watch()
  const previewKey = JSON.stringify(live)
  useEffect(() => {
    onPreview({
      title: live.title,
      category: live.category as CategorySlug,
      startsAt: live.startDate && live.startTime ? toIso(live.startDate, live.startTime) : undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey])

  const pickFile = (file: File | undefined) => {
    setCoverError(null)
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setCoverError('Use uma imagem JPG ou PNG.')
    if (file.size > 5 * 1024 * 1024) return setCoverError('A imagem passa de 5 MB.')
    setCover({ name: file.name, size: file.size, url: URL.createObjectURL(file) })
  }

  const submit = (then: 'next' | 'exit') =>
    handleSubmit(async (v) => {
      setFormError(null)
      if (slugOk === false) return setFormError('Este nome gera um link que já está em uso. Altere o nome do evento.')
      try {
        await onSave(
          {
            title: v.title.trim(),
            slug,
            category: v.category as CategorySlug,
            ageRating: v.ageRating,
            description: v.description.trim(),
            startsAt: toIso(v.startDate, v.startTime),
            endsAt: toIso(v.endDate, v.endTime),
            coverName: cover?.name ?? null,
          },
          then,
        )
      } catch (err) {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.')
      }
    })

  return (
    <form onSubmit={submit('next')} noValidate>
      <h2 className="mb-0.5 text-[26px]">Informações do evento</h2>
      <p className="text-muted mb-5 text-[13px]">Passo 1 de 5 · salvo automaticamente como rascunho</p>
      {formError && <Alert className="mb-4" title={formError} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          wrapperClassName="sm:col-span-2"
          label="Nome do evento"
          error={errors.title?.message}
          success={!errors.title && slug.length >= 3 && !checking && slugOk ? `Disponível para o link /eventos/${slug}` : undefined}
          hint={checking && slug.length >= 3 ? 'Verificando link…' : undefined}
          {...register('title')}
        />
        {slugOk === false && !errors.title && <div className="-mt-3 text-xs font-semibold text-accent-700 sm:col-span-2">✕ O link /eventos/{slug} já está em uso. Altere o nome.</div>}

        <div>
          <label htmlFor="category" className="mb-[5px] block text-xs text-text/70">Categoria</label>
          <select id="category" className="min-h-9 w-full border border-divider bg-surface px-2.5 py-1.5 text-sm" {...register('category')}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-[5px] text-xs text-text/70" id="age-label">Classificação</div>
          <Controller
            control={control}
            name="ageRating"
            render={({ field }) => (
              <div role="radiogroup" aria-labelledby="age-label" className="flex flex-wrap gap-1.5">
                {AGE_OPTIONS.map((a) => (
                  <Chip key={a} size="lg" label={a === 0 ? 'Livre' : String(a)} selected={field.value === a} onClick={() => field.onChange(a)} role="radio" aria-checked={field.value === a} />
                ))}
              </div>
            )}
          />
        </div>

        <TextField label="Início · data" type="date" error={errors.startDate?.message} {...register('startDate')} />
        <TextField label="Hora" type="time" error={errors.startTime?.message} {...register('startTime')} />
        <TextField label="Término · data" type="date" error={errors.endDate?.message} {...register('endDate')} />
        <TextField label="Hora" type="time" error={errors.endTime?.message} {...register('endTime')} />

        <div className="sm:col-span-2">
          <label htmlFor="description" className="mb-[5px] block text-xs text-text/70">Descrição</label>
          <textarea
            id="description"
            rows={5}
            aria-invalid={errors.description ? true : undefined}
            className={cn('w-full resize-y border bg-surface px-2.5 py-2 text-sm', errors.description ? 'border-2 border-accent-700' : 'border-divider')}
            {...register('description')}
          />
          <div className={cn('mt-1 text-xs font-semibold', errors.description ? 'text-accent-700' : 'text-muted')} aria-live="polite">
            {errors.description ? `✕ ${errors.description.message} ` : ''}
            ({description.trim().length} / 80)
          </div>
        </div>

        <div className="sm:col-span-2">
          <div className="mb-[5px] text-xs text-text/70">Imagem de capa</div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pickFile(e.dataTransfer.files[0])
            }}
            className="border-2 border-dashed border-neutral-500 p-5 text-center"
          >
            {cover ? (
              <div className="flex items-center justify-between gap-3 text-left text-sm">
                <span className="flex items-center gap-3">
                  {cover.url ? <img src={cover.url} alt="" className="grayscale-photo size-14 object-cover" /> : <span aria-hidden className="bg-stripes size-14" />}
                  <span>
                    <b>{cover.name}</b>
                    <span className="text-muted block text-xs">{cover.size ? `${(cover.size / 1024 / 1024).toFixed(2)} MB · ` : ''}envio simulado: o arquivo não sai do navegador</span>
                  </span>
                </span>
                <Button variant="secondary" onClick={() => { setCover(null); if (fileRef.current) fileRef.current.value = '' }}>Remover</Button>
              </div>
            ) : (
              <>
                <Upload size={20} aria-hidden className="mx-auto mb-1" />
                <div className="text-sm font-semibold">Arraste uma imagem ou escolha um arquivo</div>
                <div className="text-muted text-xs">1920×800 · JPG ou PNG · até 5 MB</div>
                <Button variant="secondary" className="mt-3" onClick={() => fileRef.current?.click()}>Escolher arquivo</Button>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Imagem de capa" onChange={(e) => pickFile(e.target.files?.[0])} />
          </div>
          {coverError && <div className="mt-1 text-xs font-semibold text-accent-700">✕ {coverError}</div>}
        </div>
      </div>

      <StepFooter
        submit
        busy={isSubmitting}
        onSaveExit={() => void submit('exit')()}
        hint={event ? 'Rascunho salvo' : undefined}
      />
    </form>
  )
}

/* ── Etapa 2 · Local ─────────────────────────────────────────────────── */

const venueSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do local'),
  address: z.string().trim().min(3, 'Informe o endereço'),
  district: z.string().trim().max(80),
  city: z.string().trim().min(2, 'Informe a cidade'),
  state: z.string().trim().length(2, 'Use a sigla (ex.: SP)'),
  notes: z.string().trim().max(300, 'Máximo de 300 caracteres'),
})
type VenueValues = z.infer<typeof venueSchema>

export function VenueStep({ event, onSave, onBack, onPreview }: StepProps & { onBack: () => void; onPreview: (p: Partial<OrgEventInput>) => void }) {
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VenueValues>({
    resolver: zodResolver(venueSchema),
    mode: 'onTouched',
    defaultValues: { name: event?.venue.name ?? '', address: event?.venue.address ?? '', district: event?.venue.district ?? '', city: event?.venue.city || 'São Paulo', state: event?.venue.state || 'SP', notes: event?.venue.notes ?? '' },
  })
  const live = watch()
  const previewKey = JSON.stringify(live)
  useEffect(() => {
    onPreview({ venue: { ...live } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey])

  const submit = (then: 'next' | 'exit') =>
    handleSubmit(async (v) => {
      setFormError(null)
      try {
        await onSave({ venue: { ...v, state: v.state.toUpperCase() } }, then)
      } catch (err) {
        setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.')
      }
    })

  return (
    <form onSubmit={submit('next')} noValidate>
      <h2 className="mb-0.5 text-[26px]">Local</h2>
      <p className="text-muted mb-5 text-[13px]">Passo 2 de 5 · salvo automaticamente como rascunho</p>
      {formError && <Alert className="mb-4" title={formError} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField wrapperClassName="sm:col-span-2" label="Nome do local" placeholder="Centro de Eventos" error={errors.name?.message} {...register('name')} />
        <TextField wrapperClassName="sm:col-span-2" label="Endereço" placeholder="Av. das Nações Unidas, 14401" error={errors.address?.message} {...register('address')} />
        <TextField label="Bairro" error={errors.district?.message} {...register('district')} />
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <TextField label="Cidade" error={errors.city?.message} {...register('city')} />
          <TextField label="UF" maxLength={2} style={{ textTransform: 'uppercase' }} error={errors.state?.message} {...register('state')} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="mb-[5px] block text-xs text-text/70">Como chegar e acessibilidade (opcional)</label>
          <textarea id="notes" rows={3} placeholder="Estacionamento no local · Metrô (700 m) · Acessível" className="w-full resize-y border border-divider bg-surface px-2.5 py-2 text-sm" {...register('notes')} />
          {errors.notes && <div className="mt-1 text-xs font-semibold text-accent-700">✕ {errors.notes.message}</div>}
        </div>
      </div>
      <StepFooter submit busy={isSubmitting} onBack={onBack} onSaveExit={() => void submit('exit')()} />
    </form>
  )
}
