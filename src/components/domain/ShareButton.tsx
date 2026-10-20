import { Share2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

interface ShareButtonProps {
  title: string
  variant?: 'icon' | 'labeled'
  className?: string
}

/** Usa o compartilhamento nativo quando existe; senão copia o link. */
export function ShareButton({ title, variant = 'labeled', className }: ShareButtonProps) {
  const toast = useToast()

  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.show({ message: 'Link copiado' })
    } catch (err) {
      // Cancelar o diálogo nativo não é erro.
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.show({ message: 'Não foi possível compartilhar. Copie o link da barra de endereço.' })
    }
  }

  return (
    <Button
      variant="secondary"
      size={variant === 'icon' ? 'icon' : 'md'}
      aria-label={variant === 'icon' ? 'Compartilhar' : undefined}
      onClick={share}
      className={cn('shadow-sm', className)}
    >
      <Share2 size={16} aria-hidden />
      {variant === 'labeled' && 'Compartilhar'}
    </Button>
  )
}
