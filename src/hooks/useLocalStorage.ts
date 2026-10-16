import { useCallback, useSyncExternalStore } from 'react'

/** Escuta mudanças feitas na mesma aba (o evento `storage` só dispara em outras). */
const LOCAL_EVENT = 'tf:storage'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Estado persistido em localStorage, sincronizado entre componentes e abas. */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (notify: () => void) => {
      const onStorage = (e: StorageEvent) => e.key === key && notify()
      window.addEventListener('storage', onStorage)
      window.addEventListener(LOCAL_EVENT, notify)
      return () => {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener(LOCAL_EVENT, notify)
      }
    },
    [key],
  )

  const raw = useSyncExternalStore(subscribe, () => read(key), () => null)

  let value = initial
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T
    } catch {
      value = initial
    }
  }

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = (() => {
        const r = read(key)
        if (r === null) return initial
        try {
          return JSON.parse(r) as T
        } catch {
          return initial
        }
      })()
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(current) : next
      try {
        localStorage.setItem(key, JSON.stringify(resolved))
      } catch {
        /* armazenamento indisponível: ignora */
      }
      window.dispatchEvent(new Event(LOCAL_EVENT))
    },
    // `initial` é estável o suficiente para os usos (literais/constantes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  return [value, set]
}
