import { useEffect } from 'react'

const BASE = 'TicketFlow'

/** Define o título da aba; restaura o padrão ao desmontar. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${BASE}` : `${BASE} — Ingressos sem corrida por assento`
  }, [title])
}
