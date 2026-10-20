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
      <aside className="relative m-4 hidden flex-col justify-between overflow-hidden rounded-panel bg-text p-12 text-bg lg:flex">
        <div aria-hidden className="auth-flow pointer-events-none absolute inset-0" />
        <Logo tone="inverse" className="relative" />
        <div className="relative">
          <h2 className="max-w-[560px] text-[76px] leading-[0.95] tracking-[-0.04em] xl:text-[84px]">
            Ingressos sem corrida por <span className="text-accent-400">assento.</span>
          </h2>
          <p className="mt-5 max-w-[460px] text-lg text-neutral-300">
            Escolha seu lugar, a reserva fica guardada por 10 minutos e o ingresso chega no seu celular.
          </p>
        </div>
        <span className="relative text-[13px] text-neutral-400">© {new Date().getFullYear()} TicketFlow</span>
      </aside>

      <main className="flex flex-col px-4 py-6 lg:px-14 lg:py-12">
        <Logo className="mb-10 lg:hidden" />
        <div className="m-auto w-full max-w-[420px]">
          <h1 className="mb-1.5 text-[32px] lg:text-[42px]">{title}</h1>
          {subtitle && <p className="text-muted mb-6 text-sm">{subtitle}</p>}
          {children}
          {footer && <div className="mt-6 border-t border-line pt-4 text-sm">{footer}</div>}
        </div>
      </main>
    </div>
  )
}
