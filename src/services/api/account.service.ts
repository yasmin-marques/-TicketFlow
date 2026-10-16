import type { SavedCard, UpdateProfileInput, UserProfile } from '@/types/auth'
import { http } from './http'

export const accountService = {
  profile: (signal?: AbortSignal) => http.get<UserProfile>('/me', { signal }).then((r) => r.data),
  update: (input: UpdateProfileInput) => http.patch<UserProfile>('/me', input).then((r) => r.data),

  cards: (signal?: AbortSignal) => http.get<SavedCard[]>('/me/cards', { signal }).then((r) => r.data),
  /**
   * O backend real recebe um token do gateway, nunca o número do cartão.
   * O mock aceita o número só para extrair marca e final.
   */
  addCard: (input: { number: string; holderName: string; expiry: string }) =>
    http.post<SavedCard>('/me/cards', input).then((r) => r.data),
  removeCard: (id: string) => http.delete(`/me/cards/${id}`).then(() => undefined),
}
