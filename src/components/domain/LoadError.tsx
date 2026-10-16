import { ApiError } from '@/services/api/http'
import { Alert } from '../ui/Alert'

interface LoadErrorProps {
  /** Ex.: "Não foi possível carregar os eventos." */
  title: string
  error?: unknown
  onRetry: () => void
  className?: string
}

/** Erro de carregamento em linha, com "Tentar de novo" (bloco 4b do protótipo). */
export function LoadError({ title, error, onRetry, className }: LoadErrorProps) {
  const offline = error instanceof ApiError && error.status === null
  return (
    <Alert title={title} className={className}>
      {offline ? 'Verifique sua conexão.' : 'Tivemos um problema do nosso lado.'}{' '}
      <button type="button" onClick={onRetry} className="text-accent-700 underline underline-offset-[3px] hover:text-accent">
        Tentar de novo
      </button>
      {error instanceof ApiError && error.ref && (
        <span className="text-muted ml-2 font-mono text-xs">ref: {error.ref}</span>
      )}
    </Alert>
  )
}
