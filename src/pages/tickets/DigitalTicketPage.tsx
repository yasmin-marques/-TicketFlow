import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LoadError } from '@/components/domain/LoadError'
import { QrCode } from '@/components/domain/QrCode'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { purchaseKeys, useTicket, useTickets } from '@/features/purchase/hooks'
import { downloadTicket } from '@/features/tickets/ticketFile'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDateWithTime } from '@/lib/format'
import { emailSchema } from '@/lib/validation'
import { ApiError } from '@/services/api/http'
import { ticketsService } from '@/services/api/purchase.service'
import type { Ticket } from '@/types/purchase'
import { NotFoundPage } from '../NotFoundPage'

const STATUS_COPY: Record<Ticket['status'], { kicker: string; tone: string }> = {
  valid: { kicker: 'Ingresso válido', tone: 'text-accent-700' },
  used: { kicker: 'Ingresso já utilizado', tone: 'text-neutral-700' },
  cancelled: { kicker: 'Ingresso cancelado', tone: 'text-accent-700' },
}

/** /ingressos/:id — ingresso digital com QR Code (pensado para o celular, na porta do evento). */
export function DigitalTicketPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: ticket, isPending, error, refetch } = useTicket(id)
  const { data: all } = useTickets()
  const [transferOpen, setTransferOpen] = useState(false)

  useDocumentTitle(ticket ? `Ingresso ${ticket.code}` : 'Ingresso')

  if (error instanceof ApiError && error.isNotFound) return <NotFoundPage />

  // "1 de 2": ingressos do mesmo pedido.
  const siblings = ticket ? (all ?? []).filter((t) => t.orderId === ticket.orderId) : []
  const index = ticket ? siblings.findIndex((t) => t.id === ticket.id) : -1

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[430px] flex-col lg:my-8 lg:min-h-0 lg:overflow-hidden lg:rounded-panel lg:border lg:border-line lg:bg-card lg:shadow-md">
      <div className="flex h-14 flex-none items-center justify-between border-b border-divider px-4">
        <Link to="/meus-ingressos" className="font-extrabold text-text no-underline">
          ← Meus ingressos
        </Link>
        {siblings.length > 1 && index >= 0 && (
          <span className="text-muted flex items-center gap-2 text-[13px]">
            <button
              type="button"
              aria-label="Ingresso anterior"
              disabled={index === 0}
              className="px-1 disabled:opacity-30"
              onClick={() => navigate(`/ingressos/${siblings[index - 1]!.id}`, { replace: true })}
            >
              ‹
            </button>
            {index + 1} de {siblings.length}
            <button
              type="button"
              aria-label="Próximo ingresso"
              disabled={index === siblings.length - 1}
              className="px-1 disabled:opacity-30"
              onClick={() => navigate(`/ingressos/${siblings[index + 1]!.id}`, { replace: true })}
            >
              ›
            </button>
          </span>
        )}
      </div>

      {error ? (
        <div className="p-4">
          <LoadError title="Não foi possível carregar o ingresso." error={error} onRetry={() => refetch()} />
        </div>
      ) : isPending ? (
        <div className="space-y-4 p-5" aria-busy="true" aria-label="Carregando ingresso">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10" />
          <Skeleton className="aspect-square" />
        </div>
      ) : (
        <TicketBody ticket={ticket} onTransfer={() => setTransferOpen(true)} />
      )}

      {ticket && <TransferModal ticket={ticket} open={transferOpen} onClose={() => setTransferOpen(false)} />}
    </div>
  )
}

function TicketBody({ ticket, onTransfer }: { ticket: Ticket; onTransfer: () => void }) {
  const copy = STATUS_COPY[ticket.status]
  const valid = ticket.status === 'valid'
  const fields: Array<[string, string, boolean?]> = [
    ['Titular', ticket.holderName],
    ['Data', formatDateWithTime(ticket.eventStartsAt)],
    [ticket.seatId ? 'Setor' : 'Tipo', ticket.sectorName ?? ticket.typeName],
    ['Assento', ticket.seatId ?? '—', true],
  ]

  return (
    <>
      <div className="px-5 pt-5">
        <div className={`kicker text-[10.5px] tracking-[0.1em] ${copy.tone}`}>{copy.kicker}</div>
        <h1 className="mt-1.5 mb-4 text-[30px] leading-none tracking-[-0.03em]">{ticket.eventTitle}</h1>
      </div>

      <div className="mx-5 flex justify-center surface bg-white p-5">
        {valid ? (
          <QrCode value={ticket.qrPayload} size={270} label={`QR Code do ingresso ${ticket.code}`} className="h-auto w-full max-w-[270px]" />
        ) : (
          <div role="status" className="text-muted grid aspect-square w-full max-w-[270px] place-items-center text-center text-sm font-semibold">
            {ticket.status === 'used'
              ? `Utilizado${ticket.usedAt ? ` em ${formatDateWithTime(ticket.usedAt)}` : ''}`
              : 'Este ingresso foi cancelado e não é mais válido.'}
          </div>
        )}
      </div>
      <div className="py-2.5 text-center font-mono text-[13px] font-semibold tracking-[0.14em]">{ticket.code}</div>

      <dl className="m-0 mx-5 grid grid-cols-2 border-t border-divider text-sm">
        {fields.map(([k, v, big], i) => (
          <div key={k} className={`py-2.5 ${i > 1 ? 'border-t border-line' : ''}`}>
            <dt className="text-muted text-[11px] uppercase">{k}</dt>
            <dd className={`m-0 font-extrabold ${big ? 'text-xl' : ''}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-muted mx-5 mt-1 text-xs">
        {ticket.venueName}, {ticket.city} · Pedido #{ticket.orderCode}
      </p>

      <div className="mx-5 mt-auto flex gap-2 pt-6 pb-4">
        <Button variant="secondary" className="flex-1" onClick={() => downloadTicket(ticket)}>
          Salvar ingresso
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onTransfer} disabled={!valid}>
          Transferir
        </Button>
      </div>
    </>
  )
}

function TransferModal({ ticket, open, onClose }: { ticket: Ticket; open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const parsed = emailSchema.safeParse(email)
  const fieldError = touched && !parsed.success ? (parsed.error.issues[0]?.message ?? 'E-mail inválido') : undefined

  const transfer = useMutation({
    mutationFn: () => ticketsService.transfer(ticket.id, email),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.tickets() })
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.orders() })
      toast.show({ message: `Ingresso transferido para ${r.recipient}. Ele sai da sua conta.` })
      onClose()
      navigate('/meus-ingressos', { replace: true })
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Não foi possível transferir. Tente novamente.'),
  })

  return (
    <Modal open={open} onClose={onClose} title="Transferir ingresso">
      <p className="text-muted text-sm">
        Informe o e-mail de quem vai receber o ingresso <b className="text-text">{ticket.code}</b>. Ele deixa de valer na sua conta
        (transferência simulada neste ambiente).
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          setServerError(null)
          if (parsed.success) transfer.mutate()
        }}
      >
        <TextField
          label="E-mail do destinatário"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          error={fieldError}
        />
        {serverError && <Alert className="mt-3" title={serverError} />}
        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={transfer.isPending}>
            {transfer.isPending ? 'Transferindo…' : 'Transferir'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
