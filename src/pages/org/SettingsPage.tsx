import { zodResolver } from '@hookform/resolvers/zod'
import { Tabs } from '@/components/ui/Tabs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { LoadError } from '@/components/domain/LoadError'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TextField } from '@/components/ui/TextField'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { OrgPageHeader } from '@/features/org/components/common'
import { orgKeys, useOrgSettings } from '@/features/org/hooks'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { emailSchema, isValidPhone, maskPhone } from '@/lib/validation'
import { ApiError } from '@/services/api/http'
import { orgService } from '@/services/api/org.service'
import type { OrgMember, OrgSettings, OrgWebhook } from '@/types/organizer'

const TABS = [
  { key: 'organizacao', label: 'Organização' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'webhooks', label: 'Webhooks' },
] as const

const ROLE_LABEL: Record<OrgMember['role'], string> = { OWNER: 'Proprietário', MANAGER: 'Gerente', CHECKIN: 'Portaria' }
const WEBHOOK_EVENTS = ['order.paid', 'order.refunded', 'ticket.checked_in']

/** /org/configuracoes — organização, equipe, pagamentos e webhooks. */
export function SettingsPage() {
  useDocumentTitle('Configurações · Organizador')
  const [params, setParams] = useSearchParams()
  const { data, isPending, error, refetch } = useOrgSettings()
  const active = TABS.find((t) => t.key === params.get('aba')) ?? TABS[0]

  return (
    <>
      <OrgPageHeader title="Configurações" subtitle="Organização, equipe, pagamentos e integrações" />
      <Tabs
        label="Seções"
        idPrefix="set"
        className="mb-6"
        tabs={TABS}
        active={active.key}
        onChange={(k) => setParams(k === 'organizacao' ? {} : { aba: k }, { replace: true })}
      />
      <div id="set-panel" role="tabpanel" aria-labelledby={`set-${active.key}`} className="max-w-[760px]">
        {error && !data ? (
          <LoadError title="Não foi possível carregar as configurações." error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : active.key === 'organizacao' ? (
          <OrgForm settings={data} />
        ) : active.key === 'equipe' ? (
          <TeamTab settings={data} />
        ) : active.key === 'pagamentos' ? (
          <PayoutForm settings={data} />
        ) : (
          <WebhooksTab settings={data} />
        )}
      </div>
    </>
  )
}

function useSaveSettings() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (input: Partial<Omit<OrgSettings, 'members' | 'webhooks'>>) => orgService.updateSettings(input),
    onSuccess: (s) => {
      queryClient.setQueryData(orgKeys.settings(), s)
      toast.show({ message: 'Configurações salvas' })
    },
  })
}

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da organização'),
  document: z.string().trim().refine((v) => v === '' || /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(v) || /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(v), 'CNPJ ou CPF inválido'),
  email: emailSchema,
  phone: z.string().refine((v) => v === '' || isValidPhone(v), 'Informe o número completo com DDD'),
})

function OrgForm({ settings }: { settings: OrgSettings }) {
  const save = useSaveSettings()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(orgSchema),
    mode: 'onTouched',
    defaultValues: { name: settings.name, document: settings.document, email: settings.email, phone: settings.phone },
  })
  const phone = register('phone')
  return (
    <form
      noValidate
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={handleSubmit(async (v) => {
        setFormError(null)
        try {
          const s = await save.mutateAsync(v)
          reset({ name: s.name, document: s.document, email: s.email, phone: s.phone })
        } catch (err) {
          setFormError(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
        }
      })}
    >
      {formError && <Alert className="sm:col-span-2" title={formError} />}
      <TextField wrapperClassName="sm:col-span-2" label="Nome da organização" error={errors.name?.message} {...register('name')} />
      <TextField label="CNPJ ou CPF" error={errors.document?.message} {...register('document')} />
      <TextField label="E-mail de contato" type="email" error={errors.email?.message} {...register('email')} />
      <TextField label="Telefone" type="tel" error={errors.phone?.message} {...phone} onChange={(e) => { e.target.value = maskPhone(e.target.value); void phone.onChange(e) }} />
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={!isDirty || save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar alterações'}</Button>
      </div>
    </form>
  )
}

const payoutSchema = z.object({
  bank: z.string().trim().min(2, 'Informe o banco'),
  agency: z.string().trim().regex(/^\d{3,5}$/, 'Agência inválida'),
  account: z.string().trim().regex(/^\d{3,12}-?\d$/, 'Conta inválida (ex.: 12345-6)'),
  holder: z.string().trim().min(3, 'Informe o titular'),
})

function PayoutForm({ settings }: { settings: OrgSettings }) {
  const save = useSaveSettings()
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(payoutSchema),
    mode: 'onTouched',
    defaultValues: settings.payout,
  })
  return (
    <form
      noValidate
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={handleSubmit(async (v) => {
        const s = await save.mutateAsync({ payout: v })
        reset(s.payout)
      })}
    >
      <p className="text-muted text-sm sm:col-span-2">Conta que recebe os repasses das vendas. Dados bancários reais seriam validados e guardados pelo gateway — aqui é uma simulação.</p>
      <TextField label="Banco" error={errors.bank?.message} {...register('bank')} />
      <TextField label="Titular" error={errors.holder?.message} {...register('holder')} />
      <TextField label="Agência" inputMode="numeric" error={errors.agency?.message} {...register('agency')} />
      <TextField label="Conta" inputMode="numeric" error={errors.account?.message} {...register('account')} />
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={!isDirty || save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar conta de repasse'}</Button>
      </div>
    </form>
  )
}

const inviteSchema = z.object({ name: z.string().trim().max(60), email: emailSchema, role: z.enum(['MANAGER', 'CHECKIN']) })

function TeamTab({ settings }: { settings: OrgSettings }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [removing, setRemoving] = useState<OrgMember | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(inviteSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', role: 'CHECKIN' as const },
  })
  return (
    <div>
      <ul className="m-0 list-none border-t border-divider p-0">
        {settings.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
            <div className="min-w-0">
              <b>{m.name}</b>
              <div className="text-muted truncate text-sm">{m.email}</div>
            </div>
            <span className="flex items-center gap-2">
              <StatusBadge label={ROLE_LABEL[m.role]} tone={m.role === 'OWNER' ? 'success' : 'neutral'} />
              {m.role !== 'OWNER' && <Button variant="ghost" className="text-accent-700" onClick={() => setRemoving(m)} aria-label={`Remover ${m.name}`}>Remover</Button>}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mt-8 mb-3 text-xl">Convidar pessoa</h3>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end"
        onSubmit={handleSubmit(async (v) => {
          setFormError(null)
          try {
            const s = await orgService.addMember(v)
            queryClient.setQueryData(orgKeys.settings(), s)
            toast.show({ message: `Convite simulado para ${v.email}` })
            reset()
          } catch (err) {
            setFormError(err instanceof ApiError ? err.message : 'Não foi possível convidar.')
          }
        })}
      >
        {formError && <Alert className="sm:col-span-4" title={formError} />}
        <TextField label="Nome" error={errors.name?.message} {...register('name')} />
        <TextField label="E-mail" type="email" error={errors.email?.message} {...register('email')} />
        <div>
          <label htmlFor="role" className="mb-[5px] block text-xs text-text/70">Papel</label>
          <select id="role" className="field" {...register('role')}>
            <option value="CHECKIN">Portaria</option>
            <option value="MANAGER">Gerente</option>
          </select>
        </div>
        <Button type="submit" disabled={isSubmitting}>Convidar</Button>
      </form>
      <ConfirmModal
        open={!!removing}
        title="Remover da equipe?"
        confirmLabel="Remover"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const s = await orgService.removeMember(removing!.id)
          queryClient.setQueryData(orgKeys.settings(), s)
          toast.show({ message: 'Pessoa removida da equipe' })
        }}
      >
        {removing && `${removing.name} perde o acesso ao painel.`}
      </ConfirmModal>
    </div>
  )
}

const hookSchema = z.object({ url: z.string().trim().regex(/^https:\/\/.+\..+/, 'Use uma URL https:// válida') })

function WebhooksTab({ settings }: { settings: OrgSettings }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [formError, setFormError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>(['order.paid'])
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(hookSchema), mode: 'onTouched', defaultValues: { url: '' } })
  const apply = (s: OrgSettings) => queryClient.setQueryData(orgKeys.settings(), s)

  return (
    <div>
      <p className="text-muted text-sm">O TicketFlow envia um POST assinado a cada evento. A entrega real e a assinatura (HMAC) são responsabilidade do backend; aqui é uma simulação.</p>
      {settings.webhooks.length === 0 ? (
        <p className="text-muted callout p-4 text-sm">Nenhum webhook configurado.</p>
      ) : (
        <ul className="m-0 list-none border-t border-divider p-0">
          {settings.webhooks.map((w: OrgWebhook) => (
            <li key={w.id} className="flex items-center justify-between gap-3 border-b border-line py-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-[13px]">{w.url}</div>
                <div className="text-muted text-xs">{w.events.join(' · ')}</div>
              </div>
              <span className="flex items-center gap-3">
                <Toggle checked={w.active} onChange={async (v) => apply(await orgService.toggleWebhook(w.id, v))}>
                  <span className="sr-only">Webhook {w.url} ativo</span>
                </Toggle>
                <Button variant="ghost" className="text-accent-700" onClick={async () => { apply(await orgService.removeWebhook(w.id)); toast.show({ message: 'Webhook removido' }) }}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-8 mb-3 text-xl">Novo webhook</h3>
      <form
        noValidate
        className="grid gap-4"
        onSubmit={handleSubmit(async (v) => {
          setFormError(null)
          try {
            apply(await orgService.addWebhook({ url: v.url, events: selected }))
            toast.show({ message: 'Webhook adicionado' })
            reset()
          } catch (err) {
            setFormError(err instanceof ApiError ? err.message : 'Não foi possível adicionar.')
          }
        })}
      >
        {formError && <Alert title={formError} />}
        <TextField label="URL de destino" placeholder="https://seu-sistema.com/hooks/ticketflow" error={errors.url?.message} {...register('url')} />
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1 p-0 text-xs text-text/70">Eventos</legend>
          <div className="flex flex-wrap gap-4">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[var(--color-text)]" checked={selected.includes(ev)} onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, ev] : cur.filter((x) => x !== ev)))} />
                <span className="font-mono text-[13px]">{ev}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div><Button type="submit" disabled={isSubmitting || selected.length === 0}>Adicionar webhook</Button></div>
      </form>
    </div>
  )
}
