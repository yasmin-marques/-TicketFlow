import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { NotFoundPage } from './NotFoundPage'
import { ServerErrorPage } from './ServerErrorPage'

/** `errorElement` do router: exceções de renderização viram a página 500. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return <ServerErrorPage error={error} />
}
