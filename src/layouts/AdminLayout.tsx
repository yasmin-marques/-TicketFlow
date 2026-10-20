import { Bell, Menu, X } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom'
import { Logo, LogoMark } from '@/components/ui/Logo'
import { Popover } from '@/components/ui/Popover'
import { useAuth } from '@/features/auth/AuthProvider'
import { OrgNotices } from '@/features/org/components/OrgNotices'
import { useOrgNotices } from '@/features/org/hooks'
import { OrgSearch } from '@/features/org/components/OrgSearch'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/cn'
import { initials } from './SiteHeader'

export interface OrgHandle {
  title: string
}

const NAV = [
  { to: '/org/dashboard', label: 'Dashboard' },
  { to: '/org/eventos', label: 'Eventos' },
  { to: '/org/pedidos', label: 'Pedidos' },
  { to: '/org/participantes', label: 'Participantes' },
  { to: '/org/checkin', label: 'Check-in' },
  { to: '/org/relatorios', label: 'Relatórios' },
  { to: '/org/configuracoes', label: 'Configurações' },
] as const

/** Permite que a página sobrescreva o título da topbar (ex.: nome do evento). */
const TitleContext = createContext<(title: string | null) => void>(() => undefined)

export function useOrgTitle(title: string | null | undefined) {
  const set = useContext(TitleContext)
  useEffect(() => {
    set(title ?? null)
    return () => set(null)
  }, [title, set])
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Painel do organizador" className={cn('flex flex-col gap-0.5 py-3', collapsed ? 'px-2' : 'px-3')}>
      {NAV.map((item, i) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'transition-control flex items-center gap-3 rounded-control py-2.5 text-sm font-semibold no-underline',
              collapsed ? 'justify-center px-0' : 'px-3',
              isActive ? 'bg-text text-bg shadow-sm' : 'text-text hover:bg-text/6',
            )
          }
        >
          <span className="w-[18px] font-mono text-[11px] opacity-60">{String(i + 1).padStart(2, '0')}</span>
          <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

/** Moldura do painel: sidebar numerada e recolhível (208 px), topbar de 64 px, drawer no mobile. */
export function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const matches = useMatches()
  const [override, setOverride] = useState<string | null>(null)
  const handleTitle = [...matches].reverse().map((m) => (m.handle as OrgHandle | undefined)?.title).find(Boolean)
  const title = override ?? handleTitle ?? 'Painel'

  const compactScreen = useMediaQuery('(max-width: 1279px)')
  const mobile = useMediaQuery('(max-width: 1023px)')
  const [pref, setPref] = useLocalStorage<'open' | 'collapsed' | null>('tf:org-sidebar', null)
  const collapsed = pref ? pref === 'collapsed' : compactScreen
  const [drawer, setDrawer] = useState(false)
  const drawerRef = useRef<HTMLDialogElement>(null)

  useEffect(() => setDrawer(false), [pathname])
  useEffect(() => {
    const d = drawerRef.current
    if (!d) return
    if (drawer && !d.open) d.showModal()
    if (!drawer && d.open) d.close()
  }, [drawer])

  const titleCtx = useMemo(() => setOverride, [])

  return (
    <TitleContext.Provider value={titleCtx}>
      <div className="flex min-h-dvh">
        <a href="#org-conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-text focus:px-4 focus:py-2 focus:text-bg">
          Pular para o conteúdo
        </a>

        {/* Sidebar (desktop/tablet) */}
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh flex-none flex-col self-start border-r border-line bg-card lg:flex',
            collapsed ? 'w-16' : 'w-52',
          )}
        >
          <div className={cn('flex h-16 items-center gap-2 border-b border-line', collapsed ? 'justify-center' : 'px-5')}>
            {collapsed ? (
              <Link to="/" aria-label="TicketFlow — página inicial" className="grid size-9 place-items-center rounded-control hover:bg-text/6">
                <LogoMark size={18} />
              </Link>
            ) : (
              <Logo size="sm" badge="Org" />
            )}
          </div>
          <SidebarNav collapsed={collapsed} />
          <div className={cn('mt-auto border-t border-line py-3.5 text-[13px]', collapsed ? 'px-2 text-center' : 'px-5')}>
            {!collapsed && (
              <>
                <div className="kicker text-[11px] tracking-[0.1em] text-neutral-700">Organização</div>
                <div className="mt-0.5 font-semibold">Pulse Produções</div>
              </>
            )}
            <button
              type="button"
              onClick={() => setPref(collapsed ? 'open' : 'collapsed')}
              aria-pressed={collapsed}
              className={cn('transition-control rounded-sm px-1.5 py-0.5 text-neutral-700 hover:bg-text/6 hover:text-text', !collapsed && '-ml-1.5 mt-2')}
            >
              {collapsed ? '›' : '‹ Recolher menu'}
              {collapsed && <span className="sr-only">Expandir menu</span>}
            </button>
          </div>
        </aside>

        {/* Drawer (mobile) */}
        <dialog
          ref={drawerRef}
          aria-label="Menu do painel"
          onClose={() => setDrawer(false)}
          onClick={(e) => e.target === drawerRef.current && setDrawer(false)}
          className="m-0 h-dvh max-h-none w-64 max-w-[80vw] rounded-r-panel border-r border-line bg-card p-0 shadow-lg"
        >
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <Logo size="sm" badge="Org" />
            <button type="button" aria-label="Fechar menu" onClick={() => setDrawer(false)} className="grid size-9 place-items-center rounded-control hover:bg-text/7">
              <X size={18} aria-hidden />
            </button>
          </div>
          <SidebarNav collapsed={false} onNavigate={() => setDrawer(false)} />
          <div className="mt-4 border-t border-line px-5 py-3.5 text-[13px]">
            <div className="kicker text-[11px] text-neutral-700">Organização</div>
            <div className="font-semibold">Pulse Produções</div>
            <Link to="/" className="mt-3 block text-neutral-700 no-underline">
              Ver o site →
            </Link>
          </div>
        </dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass-bar sticky top-0 z-20 flex h-14 items-center gap-3 px-4 lg:h-16 lg:gap-5 lg:px-8">
            {mobile && (
              <button type="button" aria-label="Abrir menu" onClick={() => setDrawer(true)} className="grid size-9 place-items-center rounded-control hover:bg-text/7">
                <Menu size={20} aria-hidden />
              </button>
            )}
            <h1 className="m-0 min-w-0 shrink truncate text-lg tracking-normal lg:text-xl">{title}</h1>
            <OrgSearch className="ml-auto hidden sm:block" />
            <Link to="/org/pedidos" className="ml-auto text-[13px] font-semibold text-text no-underline sm:hidden">
              Buscar ⌕
            </Link>
            <Popover
              align="right"
              panelClassName="w-80 p-0"
              renderTrigger={(props) => <NoticeButton {...props} />}
            >
              {(close) => <OrgNotices onNavigate={close} />}
            </Popover>
            <Popover
              align="right"
              panelClassName="w-56 p-2"
              className="hidden border-l border-line pl-5 sm:block"
              renderTrigger={(props) => (
                <button type="button" {...props} className="transition-control rounded-control px-2 py-1.5 text-sm font-semibold hover:bg-text/6">
                  Pulse Produções ▾
                </button>
              )}
            >
              {(close) => (
                <ul className="m-0 list-none p-0 text-sm">
                  <li>
                    <Link to="/" onClick={close} className="block rounded-sm px-3 py-2 text-text no-underline hover:bg-text/7">
                      Ver o site
                    </Link>
                  </li>
                  <li>
                    <Link to="/conta" onClick={close} className="block rounded-sm px-3 py-2 text-text no-underline hover:bg-text/7">
                      Minha conta
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="block w-full rounded-sm px-3 py-2 text-left hover:bg-text/7"
                      onClick={async () => {
                        close()
                        await logout()
                        navigate('/entrar', { replace: true })
                      }}
                    >
                      Sair
                    </button>
                  </li>
                </ul>
              )}
            </Popover>
            <Link
              to="/conta"
              aria-label={`Minha conta — ${user?.name ?? ''}`}
              className="transition-control grid size-[34px] flex-none place-items-center rounded-full bg-text text-[13px] font-extrabold text-bg no-underline hover:bg-neutral-800 hover:shadow-md"
            >
              {initials(user?.name ?? '')}
            </Link>
          </header>
          <main id="org-conteudo" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:pt-7 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>
    </TitleContext.Provider>
  )
}

function NoticeButton(props: Record<string, unknown>) {
  const { data } = useOrgNotices()
  const unread = data?.filter((n) => !n.read).length ?? 0
  return (
    <button type="button" {...props} aria-label={unread ? `Avisos (${unread} não lidos)` : 'Avisos'} className="relative grid size-9 place-items-center rounded-control hover:bg-text/7">
      <Bell size={18} aria-hidden />
      {unread > 0 && <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" />}
    </button>
  )
}
