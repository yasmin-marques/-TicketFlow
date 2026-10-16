import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { PublicLayout, type RouteHandle } from '@/layouts/PublicLayout'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { ComingSoonPage } from '@/pages/ComingSoonPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { ExplorePage } from '@/pages/ExplorePage'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RouteErrorPage } from '@/pages/RouteErrorPage'

/** Rotas de partes futuras: existem para a navegação não quebrar. */
const upcoming: Array<{ path: string; title: string; description?: string }> = [
  { path: 'eventos/:slug/ingressos', title: 'Seleção de ingressos', description: 'A escolha de tipo, lote e quantidade chega junto com o checkout.' },
  { path: 'meus-ingressos', title: 'Meus ingressos' },
  { path: 'conta', title: 'Minha conta' },
  { path: 'entrar', title: 'Entrar' },
  { path: 'cadastro', title: 'Criar conta' },
  { path: 'organizadores', title: 'Para organizadores' },
  { path: 'ajuda', title: 'Ajuda' },
  { path: 'termos', title: 'Termos de uso' },
  { path: 'privacidade', title: 'Privacidade' },
]

const eventHandle: RouteHandle = { mobileChrome: 'none' }

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      {
        // Rota sem path só para que erros de página renderizem dentro do layout.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'eventos', element: <ExplorePage /> },
          { path: 'eventos/:slug', element: <EventDetailPage />, handle: eventHandle },
          { path: 'categorias', element: <CategoriesPage /> },
          { path: 'categorias/:slug', element: <ExplorePage /> },
          ...upcoming.map(({ path, title, description }) => ({
            path,
            element: <ComingSoonPage title={title} description={description} />,
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
