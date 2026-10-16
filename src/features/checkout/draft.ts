import { useLocalStorage } from '@/hooks/useLocalStorage'
import type { Buyer } from '@/types/purchase'

/** Rascunho do checkout. Fica só na aba (sessionStorage) por conter dados pessoais. */
export interface CheckoutDraft {
  buyer: Buyer
  /** Nome do titular por ingresso, na ordem dos `slots` da reserva. */
  holders: string[]
}

export function useCheckoutDraft(reservationId: string) {
  return useLocalStorage<CheckoutDraft | null>(`tf:checkout:${reservationId}`, null, 'session')
}
