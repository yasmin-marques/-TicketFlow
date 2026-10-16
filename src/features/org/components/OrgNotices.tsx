import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDateShort } from '@/lib/format'
import { orgService } from '@/services/api/org.service'
import { orgKeys, useOrgNotices } from '../hooks'

/** Lista de avisos (sino "Avisos" da topbar). */
export function OrgNotices({ onNavigate }: { onNavigate: () => void }) {
  const { data, isPending, error } = useOrgNotices()
  const queryClient = useQueryClient()
  const markRead = useMutation({
    mutationFn: orgService.markNoticesRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.notices() }),
  })
  const unread = data?.some((n) => !n.read)

  return (
    <div>
      <div className="flex items-baseline justify-between border-b-2 border-text px-4 py-3">
        <h2 className="m-0 text-[13px] tracking-[0.08em] uppercase">Avisos</h2>
        {unread && (
          <button type="button" className="text-xs font-semibold text-accent-700 underline" onClick={() => markRead.mutate()}>
            Marcar como lidos
          </button>
        )}
      </div>
      {error ? (
        <p className="p-4 text-sm text-accent-700">✕ Não foi possível carregar os avisos.</p>
      ) : isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.length === 0 ? (
        <p className="text-muted p-4 text-sm">Nenhum aviso por enquanto.</p>
      ) : (
        <ul className="m-0 max-h-96 list-none overflow-y-auto p-0">
          {data.map((n) => {
            const body = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">
                    {!n.read && <span aria-hidden className="mr-1.5 inline-block size-[7px] bg-accent" />}
                    {n.title}
                  </b>
                  <span className="text-muted tabular text-[11px]">{formatDateShort(n.at)}</span>
                </div>
                <p className="text-muted m-0 text-[13px]">{n.body}</p>
              </>
            )
            return (
              <li key={n.id} className="border-b border-neutral-300 last:border-b-0">
                {n.href ? (
                  <Link to={n.href} onClick={onNavigate} className="block px-4 py-3 text-text no-underline hover:bg-text/4">
                    {body}
                  </Link>
                ) : (
                  <div className="px-4 py-3">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
