/**
 * Papel do usuário. No frontend serve só para esconder/mostrar telas (UX): a
 * autorização de verdade é do backend, que deve validar o papel em cada rota.
 */
export type UserRole = 'USER' | 'ORGANIZER' | 'ADMIN'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

/**
 * Sessão devolvida por `POST /auth/login|register|refresh`.
 * Hoje os tokens são fictícios (ver `mocks/routes/auth.ts`); com o backend
 * serão um JWT de acesso (curto) + refresh token.
 */
export interface Session {
  user: AuthUser
  accessToken: string
  /** Só nos mocks. Com a API real o refresh token fica num cookie HttpOnly e nunca chega ao JavaScript. */
  refreshToken?: string
  /** Fim de validade do access token (epoch ms). */
  accessExpiresAt: number
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export interface NotificationPrefs {
  orderUpdates: boolean
  eventReminders: boolean
  marketing: boolean
}

export interface UserProfile {
  id: string
  name: string
  email: string
  phone: string
  cpf: string
  /** dd/mm/aaaa */
  birthDate: string
  notifications: NotificationPrefs
}

export type UpdateProfileInput = Partial<Pick<UserProfile, 'name' | 'phone' | 'cpf' | 'birthDate' | 'notifications'>>

export interface SavedCard {
  id: string
  brand: 'Visa' | 'Mastercard' | 'Elo' | 'Amex' | 'Cartão'
  last4: string
  holderName: string
  expiry: string
}
