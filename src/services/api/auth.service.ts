import type { LoginInput, RegisterInput, Session } from '@/types/auth'
import { http } from './http'

export interface ForgotPasswordResult {
  accepted: boolean
  /** Só o mock devolve o token (para abrir o link sem e-mail real). */
  resetToken?: string
}

export const authService = {
  login: (input: LoginInput) => http.post<Session>('/auth/login', input).then((r) => r.data),
  register: (input: RegisterInput) => http.post<Session>('/auth/register', input).then((r) => r.data),
  /** API real: corpo vazio, o refresh token vai no cookie HttpOnly. Mocks: token no corpo. */
  refresh: (refreshToken?: string) =>
    http.post<Session>('/auth/refresh', refreshToken ? { refreshToken } : {}).then((r) => r.data),
  logout: () => http.post('/auth/logout').then(() => undefined),
  forgotPassword: (email: string) =>
    http.post<ForgotPasswordResult>('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token: string, password: string) =>
    http.post('/auth/reset-password', { token, password }).then(() => undefined),
}
