import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/cn'

/** Header mobile: logo + atalho de busca (abre /eventos com o campo focado). */
export function MobileHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'glass-bar sticky top-0 z-20 flex h-14 items-center justify-between px-4',
        className,
      )}
    >
      <Logo size="sm" />
      <Link
        to="/eventos"
        state={{ focusSearch: true }}
        className="transition-control flex items-center gap-1.5 rounded-full border border-divider bg-card px-3 py-1.5 text-[13px] font-semibold text-text no-underline shadow-xs active:scale-[0.97]"
      >
        Buscar <Search size={14} aria-hidden />
      </Link>
    </header>
  )
}
