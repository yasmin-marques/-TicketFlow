import { Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/cn'

/** Header mobile: logo + atalho de busca (abre /eventos com o campo focado). */
export function MobileHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex h-14 items-center justify-between border-b-2 border-divider bg-bg px-4',
        className,
      )}
    >
      <Logo size="sm" />
      <Link
        to="/eventos"
        state={{ focusSearch: true }}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-text no-underline"
      >
        Buscar <Search size={14} aria-hidden />
      </Link>
    </header>
  )
}
