import type { ComponentType, ReactElement } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { RequireRole } from '@/features/auth/RequireRole'
import { AdminLayout, type OrgHandle } from '@/layouts/AdminLayout'
import { OrganizersPage } from '@/pages/OrganizersPage'
import { CheckoutLayout } from '@/layouts/CheckoutLayout'
import { PublicLayout, type RouteHandle } from '@/layouts/PublicLayout'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { ExplorePage } from '@/pages/ExplorePage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'

/**
 * Páginas da jornada de compra e da área do cliente são carregadas sob demanda
 * (code-splitting): quem só navega pelo catálogo não baixa QR Code, formulários etc.
 */
const lazyPage = (load: () => Promise<ReactElement>): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ element: await load() }),
})

const lazyAccount = lazyPage(async () => {
  const { AccountPage } = await import('@/pages/account/AccountPage')
  return <AccountPage />
})
const lazyOrders = lazyPage(async () => {
  const { OrdersPage } = await import('@/pages/orders/OrdersPage')
  return <OrdersPage />
})
const lazyOrder = lazyPage(async () => {
  const { OrderPage } = await import('@/pages/orders/OrderPage')
  return <OrderPage />
})
const lazyMyTickets = lazyPage(async () => {
  const { MyTicketsPage } = await import('@/pages/tickets/MyTicketsPage')
  return <MyTicketsPage />
})
const lazyDigitalTicket = lazyPage(async () => {
  const { DigitalTicketPage } = await import('@/pages/tickets/DigitalTicketPage')
  return <DigitalTicketPage />
})
const lazyTicketSelection = lazyPage(async () => {
  const { TicketSelectionPage } = await import('@/pages/purchase/TicketSelectionPage')
  return <TicketSelectionPage />
})
const lazySeatSelection = lazyPage(async () => {
  const { SeatSelectionPage } = await import('@/pages/purchase/SeatSelectionPage')
  return <SeatSelectionPage />
})
const lazyCheckout = (step: 'dados' | 'pagamento') =>
  lazyPage(async () => {
    const { CheckoutPage } = await import('@/pages/purchase/CheckoutPage')
    return <CheckoutPage step={step} />
  })
const lazyAuth = (name: 'LoginPage' | 'RegisterPage' | 'ForgotPasswordPage' | 'ResetPasswordPage') =>
  lazyPage(async () => {
    const pages = {
      LoginPage: () => import('@/pages/auth/LoginPage').then((m) => <m.LoginPage />),
      RegisterPage: () => import('@/pages/auth/RegisterPage').then((m) => <m.RegisterPage />),
      ForgotPasswordPage: () => import('@/pages/auth/ForgotPasswordPage').then((m) => <m.ForgotPasswordPage />),
      ResetPasswordPage: () => import('@/pages/auth/ResetPasswordPage').then((m) => <m.ResetPasswordPage />),
    }
    return pages[name]()
  })

/* Painel do organizador (tudo sob demanda). */
const lazyOrg = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazyPage(async () => {
    const Page = (await load())[name] as ComponentType
    return <Page />
  })
const orgRoutes = {
  dashboard: lazyOrg(() => import('@/pages/org/DashboardPage'), 'DashboardPage'),
  events: lazyOrg(() => import('@/pages/org/EventsPage'), 'OrgEventsPage'),
  wizard: lazyOrg(() => import('@/pages/org/EventWizardPage'), 'EventWizardPage'),
  event: lazyOrg(() => import('@/pages/org/OrgEventDetailPage'), 'OrgEventDetailPage'),
  orders: lazyOrg(() => import('@/pages/org/OrdersPage'), 'OrgOrdersPage'),
  attendees: lazyOrg(() => import('@/pages/org/ParticipantsPage'), 'ParticipantsPage'),
  checkinPicker: lazyOrg(() => import('@/pages/org/CheckinPickerPage'), 'CheckinPickerPage'),
  checkin: lazyOrg(() => import('@/pages/org/CheckinPage'), 'CheckinPage'),
  reports: lazyOrg(() => import('@/pages/org/ReportsPage'), 'ReportsPage'),
  settings: lazyOrg(() => import('@/pages/org/SettingsPage'), 'SettingsPage'),
}

const orgHandle = (title: string): OrgHandle => ({ title })

/** Exibido enquanto o primeiro módulo da rota é baixado. */
const HydrateFallback = () => (
  <div className="grid min-h-dvh place-items-center">
    <Spinner label="Carregando" />
  </div>
)

/** Rotas institucionais ainda sem tela: existem para a navegação não quebrar. */
const placeholders: Array<{ path: string; title: string; description?: string }> = [
  { path: 'ajuda', title: 'Ajuda' },
  { path: 'termos', title: 'Termos de uso' },
  { path: 'privacidade', title: 'Privacidade' },
]

const minimalMobile: RouteHandle = { mobileChrome: 'none' }

export const routes: RouteObject[] = [
  /* Site público + área do cliente */
  {
    path: '/',
    element: <PublicLayout />,
    HydrateFallback,
    children: [
      {
        // Rota sem path só para que erros de página renderizem dentro do layout.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'eventos', element: <ExplorePage /> },
          { path: 'eventos/:slug', element: <EventDetailPage />, handle: minimalMobile },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'categorias/:slug', element: <ExplorePage /> },
          {
            // Área do cliente: exige sessão.
            element: <RequireAuth />,
            children: [
              { path: 'pedidos', ...lazyOrders },
              { path: 'pedidos/:id', ...lazyOrder },
              { path: 'meus-ingressos', ...lazyMyTickets },
              { path: 'ingressos/:id', ...lazyDigitalTicket, handle: minimalMobile },
              { path: 'conta', ...lazyAccount },
            ],
          },
          { path: 'organizadores', element: <OrganizersPage /> },
          ...placeholders.map(({ path, title, description }) => ({
            path,
            element: <ComingSoonPage title={title} description={description} />,
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },

  /* Jornada de compra: stepper, reserva com prazo e checkout */
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    HydrateFallback,
    children: [
      {
        element: <CheckoutLayout />,
        children: [
          { path: '/eventos/:slug/ingressos', ...lazyTicketSelection },
          { path: '/eventos/:slug/assentos', ...lazySeatSelection },
          { path: '/checkout/:reservationId', ...lazyCheckout('dados') },
          { path: '/checkout/:reservationId/pagamento', ...lazyCheckout('pagamento') },
        ],
      },
    ],
  },

  /* Painel do organizador (papel ORGANIZER; o backend valida de verdade) */
  {
    element: <RequireRole roles={['ORGANIZER', 'ADMIN']} />,
    errorElement: <RouteErrorPage />,
    HydrateFallback,
    children: [
      {
        path: '/org',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/org/dashboard" replace /> },
          { path: 'dashboard', ...orgRoutes.dashboard, handle: orgHandle('Dashboard') },
          { path: 'eventos', ...orgRoutes.events, handle: orgHandle('Eventos') },
          { path: 'eventos/novo', ...orgRoutes.wizard, handle: orgHandle('Criar evento') },
          { path: 'eventos/:id', ...orgRoutes.event, handle: orgHandle('Evento') },
          { path: 'eventos/:id/editar', ...orgRoutes.wizard, handle: orgHandle('Editar evento') },
          { path: 'pedidos', ...orgRoutes.orders, handle: orgHandle('Pedidos') },
          { path: 'participantes', ...orgRoutes.attendees, handle: orgHandle('Participantes') },
          { path: 'checkin', ...orgRoutes.checkinPicker, handle: orgHandle('Check-in') },
          { path: 'relatorios', ...orgRoutes.reports, handle: orgHandle('Relatórios') },
          { path: 'configuracoes', ...orgRoutes.settings, handle: orgHandle('Configurações') },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      // Scanner em tela cheia (sem sidebar), pensado para tablet e celular.
      { path: '/org/checkin/:eventId', ...orgRoutes.checkin },
    ],
  },

  /* Acesso (autenticação simulada) */
  { path: '/entrar', ...lazyAuth('LoginPage'), errorElement: <RouteErrorPage />, HydrateFallback },
  { path: '/cadastro', ...lazyAuth('RegisterPage'), errorElement: <RouteErrorPage />, HydrateFallback },
  { path: '/recuperar-senha', ...lazyAuth('ForgotPasswordPage'), errorElement: <RouteErrorPage />, HydrateFallback },
  { path: '/redefinir-senha', ...lazyAuth('ResetPasswordPage'), errorElement: <RouteErrorPage />, HydrateFallback },
]

export const router = createBrowserRouter(routes)
