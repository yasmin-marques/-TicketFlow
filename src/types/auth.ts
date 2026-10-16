export interface AuthUser {
  id: string
  name: string
  email: string
}

/**
 * Sessão devolvida por `POST /auth/login|register|refresh`.
 * Hoje os tokens são fictícios (ver `mocks/routes/auth.ts`); com o backend
 * serão um JWT de acesso (curto) + refresh token.
 */
export interface Session {
  user: AuthUser
  accessToken: string
  refreshToken: string
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
