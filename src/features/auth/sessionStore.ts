import type { Session } from '@/types/auth'

/**
 * Armazém da sessão do cliente.
 *
 * SIMULAÇÃO: hoje a sessão (com tokens fictícios) fica em localStorage.
 * Com a autenticação JWT real, o refresh token deve ir para um cookie
 * `HttpOnly; Secure; SameSite` definido pelo backend e só o access token fica
 * em memória — esta é a única peça que muda; o resto do app usa `useAuth()`.
 */
const KEY = 'tf:mock-session'
const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let current: Session | null = read()

function emit() {
  listeners.forEach((l) => l())
}

export const sessionStore = {
  get: (): Session | null => current,
  set(session: Session) {
    current = session
    try {
      localStorage.setItem(KEY, JSON.stringify(session))
    } catch {
      /* sem persistência */
    }
    emit()
  },
  clear() {
    current = null
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignora */
    }
    emit()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
