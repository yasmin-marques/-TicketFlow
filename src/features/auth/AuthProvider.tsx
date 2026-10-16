import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { authService } from '@/services/api/auth.service'
import { authBridge } from '@/services/api/authBridge'
import type { AuthUser, LoginInput, RegisterInput } from '@/types/auth'
import { clearActiveReservation } from '../reservation/activeReservation'
import { sessionStore } from './sessionStore'

/* ── Liga o cliente HTTP à sessão (token + renovação) ─────────────────── */

let refreshing: Promise<string | null> | null = null

authBridge.getAccessToken = () => sessionStore.get()?.accessToken ?? null
authBridge.onSessionLost = () => sessionStore.clear()
authBridge.refresh = () => {
  refreshing ??= (async () => {
    const session = sessionStore.get()
    if (!session) return null
    try {
      const next = await authService.refresh(session.refreshToken)
      sessionStore.set(next)
      return next.accessToken
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Caches que pertencem a um usuário e devem sumir ao trocar/encerrar a sessão. */
const USER_SCOPED_KEYS = ['me', 'orders', 'tickets', 'reservation', 'cards', 'seats']

interface AuthContextValue {
  status: 'authenticated' | 'anonymous'
  user: AuthUser | null
  login: (input: LoginInput) => Promise<AuthUser>
  register: (input: RegisterInput) => Promise<AuthUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get)
  const queryClient = useQueryClient()

  const resetUserCaches = useCallback(() => {
    for (const key of USER_SCOPED_KEYS) queryClient.removeQueries({ queryKey: [key] })
    clearActiveReservation()
  }, [queryClient])

  const login = useCallback(
    async (input: LoginInput) => {
      const next = await authService.login(input)
      resetUserCaches()
      sessionStore.set(next)
      return next.user
    },
    [resetUserCaches],
  )

  const register = useCallback(
    async (input: RegisterInput) => {
      const next = await authService.register(input)
      resetUserCaches()
      sessionStore.set(next)
      return next.user
    },
    [resetUserCaches],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      /* encerrar localmente mesmo que a API falhe */
    }
    sessionStore.clear()
    resetUserCaches()
  }, [resetUserCaches])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session ? 'authenticated' : 'anonymous',
      user: session?.user ?? null,
      login,
      register,
      logout,
    }),
    [session, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
