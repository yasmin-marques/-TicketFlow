import { useCallback, useMemo, useSyncExternalStore } from 'react'

/** Escuta mudanças feitas na mesma aba (o evento `storage` só dispara em outras). */
const LOCAL_EVENT = 'tf:storage'

type Kind = 'local' | 'session'

const store = (kind: Kind): Storage => (kind === 'local' ? localStorage : sessionStorage)

function read(kind: Kind, key: string): string | null {
  try {
    return store(kind).getItem(key)
  } catch {
    return null
  }
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * Estado persistido em localStorage (ou sessionStorage, para dados sensíveis
 * da aba como o rascunho do checkout), sincronizado entre componentes.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
  kind: Kind = 'local',
): [T, (next: T | ((prev: T) => T)) => void] {
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

  // `raw` (string) é o snapshot estável; o JSON só é interpretado quando ele muda.
  const raw = useSyncExternalStore(subscribe, () => read(kind, key), () => null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => parse(raw, initial), [raw])

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = parse<T>(read(kind, key), initial)
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(current) : next
      try {
        store(kind).setItem(key, JSON.stringify(resolved))
      } catch {
        /* armazenamento indisponível: ignora */
      }
      window.dispatchEvent(new Event(LOCAL_EVENT))
    },
    // `initial` é um literal estável nos usos
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, kind],
  )

  return [value, set]
}
