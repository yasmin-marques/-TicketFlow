import { emailSchema } from '@/lib/validation'
import type { Ticket } from '@/types/purchase'
import type { AddRoute } from '../adapter'
import type { DbTicket } from '../db'
import { HttpError } from '../httpError'

const strip = ({ ownerId: _o, ...t }: DbTicket): Ticket => t

export function registerTicketRoutes(add: AddRoute): void {
  add(
    'GET',
    '/tickets',
    ({ db, user }) =>
      db.tickets
        .filter((t) => t.ownerId === user!.id)
        .map(strip)
        .sort((a, b) => a.eventStartsAt.localeCompare(b.eventStartsAt) || a.code.localeCompare(b.code)),
    { auth: true },
  )

  add(
    'GET',
    '/tickets/:id',
    ({ params, db, user }) => {
      const ticket = db.tickets.find((t) => t.id === params.id && t.ownerId === user!.id)
      if (!ticket) throw new HttpError(404, 'NOT_FOUND', 'Ingresso não encontrado')
      return strip(ticket)
    },
    { auth: true },
  )

  /**
   * Transferência SIMULADA: o ingresso sai da conta do remetente. No backend
   * real o QR antigo é invalidado e um novo é emitido para o destinatário.
   */
  add(
    'POST',
    '/tickets/:id/transfer',
    ({ params, body, db, user }) => {
      const ticket = db.tickets.find((t) => t.id === params.id && t.ownerId === user!.id)
      if (!ticket) throw new HttpError(404, 'NOT_FOUND', 'Ingresso não encontrado')
      if (ticket.status !== 'valid') throw new HttpError(409, 'INVALID_STATE', 'Só ingressos válidos podem ser transferidos')
      const email = String(body.email ?? '').trim().toLowerCase()
      if (!emailSchema.safeParse(email).success) throw new HttpError(422, 'VALIDATION_ERROR', 'E-mail inválido')
      if (email === user!.email) throw new HttpError(422, 'VALIDATION_ERROR', 'Informe o e-mail de outra pessoa')
      const recipient = db.users.find((u) => u.email === email)
      ticket.ownerId = recipient?.id ?? `transferred:${email}`
      return { ok: true, recipient: email }
    },
    { auth: true },
  )
}
