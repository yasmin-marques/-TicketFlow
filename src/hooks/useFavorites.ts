import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'

/** Favoritos do navegador (persistência local; o backend assume na parte 2). */
export function useFavorites() {
  const [ids, setIds] = useLocalStorage<string[]>('tf:favorites', [])

  const isFavorite = useCallback((id: string) => ids.includes(id), [ids])
  const add = useCallback((id: string) => setIds((cur) => (cur.includes(id) ? cur : [...cur, id])), [setIds])
  const remove = useCallback((id: string) => setIds((cur) => cur.filter((x) => x !== id)), [setIds])

  return { ids, isFavorite, add, remove }
}
