import { useSyncExternalStore } from 'react'

/** Assina uma media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** `lg` do protótipo (1024px). */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')
