import type { ReactNode } from 'react'
import { Logo } from '@/components/ui/Logo'

interface AuthLayoutProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Moldura das telas de acesso: manifesto da marca à esquerda, formulário à direita. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.2fr_1fr]">
      <aside className="hidden flex-col justify-between border-r-2 border-divider p-12 lg:flex">
        <Logo />
        <div>
          <h2 className="max-w-[560px] text-[84px] leading-[0.95] tracking-[-0.04em]">
            Ingressos sem corrida por assento.
          </h2>
          <p className="mt-5 max-w-[460px] text-lg text-neutral-800">
            Escolha seu lugar, a reserva fica guardada por 10 minutos e o ingresso chega no seu celular.
          </p>
        </div>
        <span className="text-muted text-[13px]">© {new Date().getFullYear()} TicketFlow</span>
      </aside>

      <main className="flex flex-col px-4 py-6 lg:px-14 lg:py-12">
        <Logo className="mb-10 lg:hidden" />
        <div className="m-auto w-full max-w-[420px]">
          <h1 className="mb-1.5 text-[32px] lg:text-[42px]">{title}</h1>
          {subtitle && <p className="text-muted mb-6 text-sm">{subtitle}</p>}
          {children}
          {footer && <div className="mt-6 border-t-2 border-divider pt-4 text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
