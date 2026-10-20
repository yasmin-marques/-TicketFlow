import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { formatDateShort, formatDateWithTime } from '@/lib/format'
import type { Ticket } from '@/types/purchase'
import { QrCode } from './QrCode'
import { StatusBadge, TICKET_STATUS } from '../ui/StatusBadge'

/** Kicker do setor: "Premium · Fila B". */
export function sectorKicker(t: Ticket): string {
  return [t.sectorName ?? t.typeName, t.row ? `Fila ${t.row}` : null].filter(Boolean).join(' · ')
}

/** Card da lista "Meus ingressos": dados à esquerda, canhoto com QR à direita (picote tracejado). */
export function TicketCard({ ticket }: { ticket: Ticket }) {
  const status = TICKET_STATUS[ticket.status]!
  const valid = ticket.status === 'valid'
  return (
    <article className="ticket-shape surface surface-hover group relative flex">
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="kicker tabular text-[11px] tracking-[0.1em] text-accent-700">{formatDateShort(ticket.eventStartsAt)}</span>
          <StatusBadge label={status.label} tone={status.tone} />
        </div>
        <h3 className="mt-2 mb-1 text-[22px] leading-[1.1] tracking-normal">
          <Link
            to={`/ingressos/${ticket.id}`}
            className="text-text no-underline after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {ticket.eventTitle}
          </Link>
        </h3>
        <div className="text-muted text-[13px]">
          {ticket.venueName}, {ticket.city}
        </div>
        <dl className="m-0 mt-auto flex gap-6 pt-4">
          <div>
            <dt className="text-muted text-[11px] uppercase">{ticket.seatId ? 'Setor' : 'Tipo'}</dt>
            <dd className="m-0 font-extrabold">{ticket.sectorName ?? ticket.typeName}</dd>
          </div>
          <div>
            <dt className="text-muted text-[11px] uppercase">Assento</dt>
            <dd className="m-0 text-xl font-extrabold">{ticket.seatId ?? '—'}</dd>
          </div>
        </dl>
      </div>
      <div className="ticket-stub flex shrink-0 flex-col items-center justify-center gap-2 p-3.5">
        {valid ? (
          <QrCode value={ticket.qrPayload} size={104} label={`QR Code do ingresso ${ticket.code}`} className="rounded-control bg-neutral-100 p-1" />
        ) : (
          <div className="text-muted grid size-[104px] place-items-center rounded-control bg-neutral-100 text-center text-xs font-semibold">
            {ticket.status === 'used' ? 'Já utilizado' : 'Cancelado'}
          </div>
        )}
        <span className="text-xs font-semibold text-accent-700">Abrir ingresso →</span>
      </div>
    </article>
  )
}

/** Ingresso da tela de confirmação (stub grande com o assento em destaque). */
export function TicketStub({ ticket, className }: { ticket: Ticket; className?: string }) {
  return (
    <article className={cn('ticket-shape surface flex', className)}>
      <div className="min-w-0 flex-1 p-[18px]">
        <div className="kicker text-[11px] tracking-[0.1em] text-accent-700">{sectorKicker(ticket)}</div>
        <div className="my-1.5 text-[52px] leading-none font-extrabold">{ticket.seatId ?? 'Geral'}</div>
        <div className="text-[13px]">
          {ticket.eventTitle}
          <br />
          <span className="text-muted">{formatDateWithTime(ticket.eventStartsAt)}</span>
        </div>
        <Link to={`/ingressos/${ticket.id}`} className="mt-2 inline-block text-xs font-semibold">
          Abrir ingresso →
        </Link>
      </div>
      <div className="ticket-stub flex items-center p-3.5">
        <QrCode value={ticket.qrPayload} size={100} label={`QR Code do ingresso ${ticket.code}`} className="rounded-control bg-neutral-100 p-1" />
      </div>
    </article>
  )
}
