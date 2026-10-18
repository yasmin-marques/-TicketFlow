import { subscribeSeatUpdates } from '@/mocks/seats'
import type { SeatUpdate } from '@/types/purchase'
import { authBridge } from '../api/authBridge'
import { API_BASE_URL, USE_MOCKS } from '../api/http'

export type StreamStatus = 'open' | 'error'

/**
 * Abre o fluxo SSE de disponibilidade de um evento e devolve a função de
 * fechamento.
 *
 * Contrato real: `GET {API}/events/{eventId}/seats/stream`, `text/event-stream`,
 * mensagens `event: seat.updated` com `data: {"seatId":"B03","status":"reserved"}`.
 * `EventSource` não envia `Authorization`; o backend deve aceitar cookie de
 * sessão ou um token de curta duração na query. Com mocks, o equivalente local
 * emite atualizações simuladas.
 */
export function openSeatStream(
  eventId: string,
  handlers: { onUpdate: (update: SeatUpdate) => void; onStatus: (status: StreamStatus) => void },
): () => void {
  if (USE_MOCKS) return subscribeSeatUpdates(eventId, handlers.onUpdate, handlers.onStatus)

  // EventSource não envia Authorization: o token de acesso vai na query (opcional; evita receber o eco das próprias ações).
  const token = authBridge.getAccessToken()
  const query = token ? `?access_token=${encodeURIComponent(token)}` : ''
  const source = new EventSource(`${API_BASE_URL}/events/${eventId}/seats/stream${query}`, { withCredentials: true })
  source.onopen = () => handlers.onStatus('open')
  source.onerror = () => handlers.onStatus('error') // o navegador reconecta sozinho
  source.addEventListener('seat.updated', (e) => {
    try {
      handlers.onUpdate(JSON.parse((e as MessageEvent<string>).data) as SeatUpdate)
    } catch {
      /* mensagem malformada: ignora */
    }
  })
  return () => source.close()
}
