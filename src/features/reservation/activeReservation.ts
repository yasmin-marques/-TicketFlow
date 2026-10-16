/**
 * A reserva ativa é guardada só como id (por aba); o estado real
 * (itens, `expiresAt`) vem sempre do servidor.
 */
const KEY = 'tf:active-reservation'
const listeners = new Set<() => void>()

export function getActiveReservationId(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setActiveReservation(id: string): void {
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    /* ignora */
  }
  listeners.forEach((l) => l())
}

export function clearActiveReservation(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignora */
  }
  listeners.forEach((l) => l())
}

export function subscribeActiveReservation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
