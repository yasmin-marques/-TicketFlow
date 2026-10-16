import { useMemo } from 'react'
import { StatusPanel } from '@/components/domain/StatusPanel'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDay, formatMonthShort, formatTime } from '@/lib/format'
import { ApiError } from '@/services/api/http'

interface ServerErrorPageProps {
  error?: unknown
  /** Ação de nova tentativa; padrão: recarregar a página. */
  onRetry?: () => void
}

/** 500 — "Algo falhou do nosso lado." Mostra a referência do erro para o suporte. */
export function ServerErrorPage({ error, onRetry }: ServerErrorPageProps) {
  useDocumentTitle('Algo deu errado')
  const reference = useMemo(() => {
    const ref =
      error instanceof ApiError && error.ref
        ? error.ref
        : `${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 6)}`
    const now = new Date().toISOString()
    return `ref: ${ref} · ${formatDay(now)} ${formatMonthShort(now).toLowerCase()} ${formatTime(now)}`
  }, [error])

  return (
    <StatusPanel
      tone="error"
      code="500"
      title="Algo falhou do nosso lado."
      description="Seus ingressos e reservas estão seguros. Já fomos avisados — tente novamente em instantes."
      reference={reference}
      actions={
        <>
          <Button size="lg" onClick={onRetry ?? (() => window.location.reload())}>
            Tentar novamente
          </Button>
          <Button to="/ajuda" variant="secondary" size="lg">
            Falar com o suporte
          </Button>
        </>
      }
    />
  )
}
