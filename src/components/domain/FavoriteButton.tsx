import { Heart } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import { cn } from '@/lib/cn'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

interface FavoriteButtonProps {
  eventId: string
  /** `icon`: quadrado só com o coração. `labeled`: "♡ Favoritar". */
  variant?: 'icon' | 'icon-lg' | 'labeled'
  className?: string
}

export function FavoriteButton({ eventId, variant = 'icon', className }: FavoriteButtonProps) {
  const { isFavorite, add, remove } = useFavorites()
  const toast = useToast()
  const active = isFavorite(eventId)

  const toggle = () => {
    if (active) {
      remove(eventId)
      toast.show({ message: 'Favorito removido', actionLabel: 'Desfazer', onAction: () => add(eventId) })
    } else {
      add(eventId)
      toast.show({ message: 'Adicionado aos favoritos' })
    }
  }

  const heart = (
    <Heart size={variant === 'labeled' ? 16 : 18} aria-hidden className={cn(active && 'fill-accent text-accent')} />
  )

  return (
    <Button
      variant="secondary"
      size={variant === 'labeled' ? 'md' : variant}
      aria-pressed={active}
      aria-label={variant === 'labeled' ? undefined : active ? 'Remover dos favoritos' : 'Favoritar'}
      onClick={toggle}
      className={cn('shadow-sm', className)}
    >
      {heart}
      {variant === 'labeled' && (active ? 'Favoritado' : 'Favoritar')}
    </Button>
  )
}
