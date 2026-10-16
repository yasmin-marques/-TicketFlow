import { CITIES, DEFAULT_CITY } from '@/features/events/constants'
import { useLocalStorage } from './useLocalStorage'

/** Cidade escolhida pelo usuário ("Próximos de você", padrão da busca). */
export function useUserCity() {
  const [stored, setStored] = useLocalStorage<string>('tf:city', DEFAULT_CITY)
  const city = (CITIES as ReadonlyArray<string>).includes(stored) ? stored : DEFAULT_CITY
  return [city, setStored] as const
}
