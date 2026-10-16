/**
 * Modos de simulação para testar estados de falha e latência sem backend.
 * Ative com `?mock=<modo>` em qualquer URL; o modo persiste na aba até `?mock=off`.
 *
 *  erro     todas as chamadas falham com 500
 *  lento    latência de 3 s
 *  vazio    listagens de eventos vazias
 *  conflito toda seleção de assento perde a disputa (409) — mostra o fluxo de conflito
 *  expira   reservas duram 45 s — mostra o aviso e o modal de reserva expirada
 */
export type MockMode = 'normal' | 'erro' | 'lento' | 'vazio' | 'conflito' | 'expira'

const KEY = 'tf:mock-mode'
const VALID: ReadonlyArray<string> = ['erro', 'lento', 'vazio', 'conflito', 'expira']

/** Lê (e persiste) o modo já no carregamento do app, antes de qualquer navegação interna. */
export function initMockMode(): void {
  getMockMode()
}

export function getMockMode(): MockMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mock')
    if (fromUrl === 'off') sessionStorage.removeItem(KEY)
    else if (fromUrl && VALID.includes(fromUrl)) sessionStorage.setItem(KEY, fromUrl)
    const stored = sessionStorage.getItem(KEY)
    return stored && VALID.includes(stored) ? (stored as MockMode) : 'normal'
  } catch {
    return 'normal'
  }
}
