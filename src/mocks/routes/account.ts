import { birthDateSchema, cardBrand, cpfSchema, nameSchema, phoneSchema } from '@/lib/validation'
import type { SavedCard, UpdateProfileInput, UserProfile } from '@/types/auth'
import type { AddRoute } from '../adapter'
import { type DbUser, uid } from '../db'
import { Created, HttpError } from '../httpError'

const profile = (u: DbUser): UserProfile => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  cpf: u.cpf,
  birthDate: u.birthDate,
  notifications: u.notifications,
})

/** Perfil, preferências e cartões salvos (só marca, final e validade — nunca o número). */
export function registerAccountRoutes(add: AddRoute): void {
  add('GET', '/me', ({ user }) => profile(user!), { auth: true })

  add(
    'PATCH',
    '/me',
    ({ body, user }) => {
      const input = body as UpdateProfileInput
      if (input.name !== undefined && !nameSchema.safeParse(input.name).success) throw new HttpError(422, 'VALIDATION_ERROR', 'Nome inválido')
      if (input.phone && !phoneSchema.safeParse(input.phone).success) throw new HttpError(422, 'VALIDATION_ERROR', 'Telefone inválido')
      if (input.cpf && !cpfSchema.safeParse(input.cpf).success) throw new HttpError(422, 'VALIDATION_ERROR', 'CPF inválido')
      if (input.birthDate && !birthDateSchema.safeParse(input.birthDate).success) throw new HttpError(422, 'VALIDATION_ERROR', 'Data inválida')
      Object.assign(user!, {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.cpf !== undefined && { cpf: input.cpf }),
        ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
        ...(input.notifications && { notifications: { ...user!.notifications, ...input.notifications } }),
      })
      return profile(user!)
    },
    { auth: true },
  )

  add('GET', '/me/cards', ({ user }) => user!.cards, { auth: true })

  add(
    'POST',
    '/me/cards',
    ({ body, user }) => {
      const digits = String(body.number ?? '').replace(/\D/g, '')
      if (digits.length < 13) throw new HttpError(422, 'VALIDATION_ERROR', 'Número de cartão inválido')
      const card: SavedCard = {
        id: uid('card'),
        brand: cardBrand(digits),
        last4: digits.slice(-4),
        holderName: String(body.holderName ?? '').toUpperCase(),
        expiry: String(body.expiry ?? ''),
      }
      user!.cards.push(card)
      return new Created(card)
    },
    { auth: true },
  )

  add(
    'DELETE',
    '/me/cards/:id',
    ({ params, user }) => {
      user!.cards = user!.cards.filter((c) => c.id !== params.id)
      return { ok: true }
    },
    { auth: true },
  )
}
