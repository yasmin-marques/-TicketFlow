/**
 * Modos de simulação para testar estados de falha e latência sem backend.
 * Ative com `?mock=erro`, `?mock=lento` ou `?mock=vazio` em qualquer URL;
 * o modo persiste na aba até `?mock=off`.
 */
export type MockMode = 'normal' | 'erro' | 'lento' | 'vazio'

const KEY = 'tf:mock-mode'
const VALID: ReadonlyArray<string> = ['erro', 'lento', 'vazio']

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
