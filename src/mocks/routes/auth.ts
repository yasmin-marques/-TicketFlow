import { emailSchema, passwordSchema } from '@/lib/validation'
import type { Session } from '@/types/auth'
import type { AddRoute } from '../adapter'
import { type DbUser, uid } from '../db'
import { Created, HttpError } from '../httpError'

/**
 * AUTENTICAÇÃO SIMULADA — não é JWT e não protege nada.
 * Os tokens têm o formato `mock.<userId>.<expiraEmMs>` e a senha fica em texto
 * puro no localStorage. A autenticação real (JWT de acesso + refresh token,
 * senha com hash no servidor) substitui isto sem mudar os contratos abaixo.
 */
const ACCESS_TTL_MS = 30 * 60_000
const REFRESH_TTL_MS = 7 * 24 * 3_600_000

function issue(user: DbUser): Session {
  const now = Date.now()
  return {
    user: { id: user.id, name: user.name, email: user.email },
    accessToken: `mock.${user.id}.${now + ACCESS_TTL_MS}`,
    refreshToken: `mockr.${user.id}.${now + REFRESH_TTL_MS}`,
    accessExpiresAt: now + ACCESS_TTL_MS,
  }
}

export function registerAuthRoutes(add: AddRoute): void {
  add('POST', '/auth/login', ({ body, db }) => {
    const email = String(body.email ?? '').trim().toLowerCase()
    const user = db.users.find((u) => u.email === email)
    if (!user || user.password !== body.password) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos')
    }
    return issue(user)
  })

  add('POST', '/auth/register', ({ body, db }) => {
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    if (!name || !emailSchema.safeParse(email).success || !passwordSchema.safeParse(password).success) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Dados inválidos')
    }
    if (db.users.some((u) => u.email === email)) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'Já existe uma conta com este e-mail')
    }
    const user: DbUser = {
      id: uid('usr'),
      name,
      email,
      password,
      phone: '',
      cpf: '',
      birthDate: '',
      notifications: { orderUpdates: true, eventReminders: true, marketing: false },
      cards: [],
    }
    db.users.push(user)
    return new Created(issue(user))
  })

  add('POST', '/auth/refresh', ({ body, db }) => {
    const [prefix, userId, exp] = String(body.refreshToken ?? '').split('.')
    const user = db.users.find((u) => u.id === userId)
    if (prefix !== 'mockr' || !user || Number(exp) < Date.now()) {
      throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Sessão expirada')
    }
    return issue(user)
  })

  add('POST', '/auth/logout', () => ({ ok: true }))

  /**
   * Sempre responde igual, exista o e-mail ou não (evita enumerar contas).
   * `resetToken` só vem no mock, para o link poder ser aberto sem e-mail real.
   */
  add('POST', '/auth/forgot-password', ({ body, db }) => {
    const email = String(body.email ?? '').trim().toLowerCase()
    const user = db.users.find((u) => u.email === email)
    let resetToken: string | undefined
    if (user) {
      resetToken = uid('reset')
      db.resetTokens[resetToken] = user.id
    }
    return { accepted: true, resetToken }
  })

  add('POST', '/auth/reset-password', ({ body, db }) => {
    const token = String(body.token ?? '')
    const userId = db.resetTokens[token]
    const user = db.users.find((u) => u.id === userId)
    if (!user) throw new HttpError(400, 'INVALID_TOKEN', 'Link de redefinição inválido ou expirado')
    if (!passwordSchema.safeParse(body.password).success) throw new HttpError(422, 'VALIDATION_ERROR', 'Senha inválida')
    user.password = String(body.password)
    delete db.resetTokens[token]
    return { ok: true }
  })
}
