import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ProgressBar } from '@/components/charts/Charts'
import { LoadError } from '@/components/domain/LoadError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { LOT_STATUS, StatusBadge } from '@/components/ui/StatusBadge'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { formatPrice, formatPriceExact } from '@/lib/format'
import { ApiError } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { OrgLot, OrgLotInput } from '@/types/organizer'
import { orgKeys, useOrgLots } from './hooks'

const ddmm = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')

const schemaFor = (sold: number) =>
  z
    .object({
      typeName: z.string().trim().min(1, 'Informe o tipo (ex.: Pista, VIP)'),
      name: z.string().trim().min(1, 'Informe o nome do lote (ex.: 1º lote)'),
      price: z.number({ error: 'Informe o preço' }).min(0, 'O preço não pode ser negativo').max(100000, 'Preço muito alto'),
      quantity: z
        .number({ error: 'Informe a quantidade' })
        .int('Use um número inteiro')
        .min(Math.max(1, sold), sold ? `Mínimo de ${sold} (já vendidos)` : 'Mínimo de 1'),
      startsAt: z.string().min(1, 'Informe o início'),
      endsAt: z.string().min(1, 'Informe o encerramento'),
      perCustomerLimit: z.number({ error: 'Informe o limite' }).int().min(1, 'Mínimo de 1').max(20, 'Máximo de 20'),
      autoOpenNext: z.boolean(),
    })
    .refine((v) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt, { path: ['endsAt'], message: 'O encerramento precisa ser depois do início' })

type LotValues = z.infer<ReturnType<typeof schemaFor>>

const today = () => new Date().toISOString().slice(0, 10)
const inDaysKey = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

/** Modal "Editar · VIP 1º lote" / "Novo lote". */
export function LotFormModal({
  eventId,
  lot,
  open,
  onClose,
}: {
  eventId: string
  lot: OrgLot | null
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)
  const sold = lot?.sold ?? 0

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LotValues>({
    resolver: zodResolver(schemaFor(sold)),
    mode: 'onTouched',
    values: lot
      ? { typeName: lot.typeName, name: lot.name, price: lot.price, quantity: lot.quantity, startsAt: lot.startsAt, endsAt: lot.endsAt, perCustomerLimit: lot.perCustomerLimit, autoOpenNext: lot.autoOpenNext }
      : { typeName: '', name: '', price: 0, quantity: 100, startsAt: today(), endsAt: inDaysKey(30), perCustomerLimit: 6, autoOpenNext: true },
  })

  const close = () => {
    setServerError(null)
    reset()
    onClose()
  }

  const submit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      const input: OrgLotInput = v
      if (lot) await orgService.updateLot(lot.id, input)
      else await orgService.createLot(eventId, input)
      await queryClient.invalidateQueries({ queryKey: orgKeys.all })
      toast.show({ message: lot ? 'Lote atualizado' : 'Lote criado' })
      close()
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Não foi possível salvar o lote. Tente novamente.')
    }
  })

  return (
    <Modal open={open} onClose={close} title={lot ? `Editar · ${lot.typeName} ${lot.name}` : 'Novo lote'} className="w-[min(520px,calc(100%-32px))]">
      <form onSubmit={submit} noValidate className="mt-3 grid gap-4 sm:grid-cols-2">
        {serverError && <Alert className="sm:col-span-2" title={serverError} />}
        {!lot && (
          <>
            <TextField label="Tipo" placeholder="Pista, VIP…" error={errors.typeName?.message} {...register('typeName')} />
            <TextField label="Nome do lote" placeholder="1º lote" error={errors.name?.message} {...register('name')} />
          </>
        )}
        <TextField label="Preço (R$)" type="number" inputMode="decimal" step="0.01" min={0} error={errors.price?.message} {...register('price', { valueAsNumber: true })} />
        <TextField
          label="Quantidade"
          type="number"
          inputMode="numeric"
          min={1}
          error={errors.quantity?.message}
          hint={sold ? `${sold} já vendidos` : undefined}
          {...register('quantity', { valueAsNumber: true })}
        />
        <TextField label="Início das vendas" type="date" error={errors.startsAt?.message} {...register('startsAt')} />
        <TextField label="Encerramento" type="date" error={errors.endsAt?.message} {...register('endsAt')} />
        <TextField label="Limite por cliente" type="number" inputMode="numeric" min={1} max={20} error={errors.perCustomerLimit?.message} {...register('perCustomerLimit', { valueAsNumber: true })} />
        <label className="flex cursor-pointer items-center gap-2.5 self-end pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-text)]" {...register('autoOpenNext')} />
          Abrir próximo lote ao esgotar
        </label>
        {lot && sold > 0 && (
          <p className="text-muted text-xs sm:col-span-2">Alterar o preço de um lote com vendas só vale para novas compras.</p>
        )}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando…' : 'Salvar lote'}
          </Button>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Tabela "Tipos e lotes" com criar, editar e remover. */
export function LotsManager({ eventId, readOnly }: { eventId: string; readOnly?: boolean }) {
  const { data, isPending, error, refetch } = useOrgLots(eventId)
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<OrgLot | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<OrgLot | null>(null)

  const columns: Column<OrgLot>[] = [
    { key: 'type', header: 'Tipo', cell: (l) => <b>{l.typeName}</b> },
    { key: 'name', header: 'Lote', cell: (l) => l.name },
    { key: 'price', header: 'Preço', cell: (l) => <span className="tabular">{formatPriceExact(l.price)}</span> },
    {
      key: 'sold',
      header: 'Vendidos',
      cell: (l) => (
        <span className="tabular">
          {l.sold} / {l.quantity}
          <ProgressBar pct={l.quantity ? (l.sold / l.quantity) * 100 : 0} className="mt-1 w-24" tone={l.status === 'sold-out' ? 'accent' : 'text'} />
        </span>
      ),
    },
    { key: 'window', header: 'Janela de venda', cell: (l) => <span className="tabular whitespace-nowrap">{ddmm(l.startsAt)} → {ddmm(l.endsAt)}</span> },
    { key: 'limit', header: 'Limite', cell: (l) => <span className="tabular">{l.perCustomerLimit} <span className="text-muted">/ cliente</span></span> },
    { key: 'status', header: 'Status', cell: (l) => <StatusBadge {...LOT_STATUS[l.status]!} /> },
    ...(readOnly
      ? []
      : [
          {
            key: 'actions',
            header: '',
            align: 'right' as const,
            cell: (l: OrgLot) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" onClick={() => setEditing(l)} aria-label={`Editar ${l.typeName} ${l.name}`}>
                  Editar
                </Button>
                {l.sold === 0 && (
                  <Button variant="ghost" className="text-accent-700" onClick={() => setRemoving(l)} aria-label={`Remover ${l.typeName} ${l.name}`}>
                    Remover
                  </Button>
                )}
              </span>
            ),
          },
        ]),
  ]

  if (error && !data) return <LoadError title="Não foi possível carregar os lotes." error={error} onRetry={() => refetch()} />

  return (
    <section aria-labelledby="lotes-titulo">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="lotes-titulo" className="m-0 text-xl">Tipos e lotes</h3>
        {!readOnly && <Button onClick={() => setCreating(true)}>+ Novo lote</Button>}
      </div>

      {!isPending && data?.length === 0 ? (
        <EmptyState title="Nenhum lote criado" description="Crie ao menos um lote para poder publicar o evento." actions={!readOnly ? <Button onClick={() => setCreating(true)}>+ Novo lote</Button> : undefined} />
      ) : (
        <DataTable
          caption="Tipos e lotes de ingresso"
          columns={columns}
          rows={data}
          loading={isPending}
          rowKey={(l) => l.id}
          mobileCard={(l) => (
            <div>
              <div className="flex items-center justify-between gap-2">
                <b>{l.typeName} · {l.name}</b>
                <StatusBadge {...LOT_STATUS[l.status]!} />
              </div>
              <div className="text-muted tabular mt-1 flex justify-between text-xs">
                <span>{formatPrice(l.price)} · {l.sold}/{l.quantity}</span>
                <span>{ddmm(l.startsAt)} → {ddmm(l.endsAt)}</span>
              </div>
              {!readOnly && (
                <div className="mt-1 flex gap-2">
                  <Button variant="ghost" onClick={() => setEditing(l)}>Editar</Button>
                  {l.sold === 0 && <Button variant="ghost" className="text-accent-700" onClick={() => setRemoving(l)}>Remover</Button>}
                </div>
              )}
            </div>
          )}
        />
      )}
      <p className="text-muted mt-3 text-[13px]">
        Quando um lote esgota ou a janela encerra, o próximo abre automaticamente. Alterar preço de lote com vendas só vale para novas compras.
      </p>

      <LotFormModal eventId={eventId} lot={editing} open={!!editing || creating} onClose={() => { setEditing(null); setCreating(false) }} />
      <ConfirmModal
        open={!!removing}
        title="Remover este lote?"
        confirmLabel="Remover lote"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await orgService.deleteLot(removing!.id)
          await queryClient.invalidateQueries({ queryKey: orgKeys.all })
          toast.show({ message: 'Lote removido' })
        }}
      >
        {removing && `${removing.typeName} · ${removing.name} será removido. Só lotes sem vendas podem ser removidos.`}
      </ConfirmModal>
    </section>
  )
}
