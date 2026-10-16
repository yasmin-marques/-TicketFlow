import { useEffect } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { Footer } from './Footer'
import { MobileHeader } from './MobileHeader'
import { MobileTabBar } from './MobileTabBar'
import { SiteHeader } from './SiteHeader'

/** Metadados por rota (`handle` no router). */
export interface RouteHandle {
  /** `none`: esconde header e tab bar no mobile (a página traz a sua própria barra). */
  mobileChrome?: 'none'
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Layout público: header, conteúdo, footer e navegação inferior no mobile. */
export function PublicLayout() {
  const matches = useMatches()
  const minimalMobile = matches.some((m) => (m.handle as RouteHandle | undefined)?.mobileChrome === 'none')

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-text focus:px-4 focus:py-2 focus:text-bg"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader className="hidden lg:flex" />
      {!minimalMobile && <MobileHeader className="lg:hidden" />}
      <main id="conteudo" className={cn('flex-1', !minimalMobile && 'pb-[60px] lg:pb-0')}>
        <Outlet />
      </main>
      <Footer className={cn(minimalMobile && 'pb-24 lg:pb-5')} />
      {!minimalMobile && <MobileTabBar className="lg:hidden" />}
    </div>
  )
}
