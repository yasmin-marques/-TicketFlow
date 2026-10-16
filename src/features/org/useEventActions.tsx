import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { orgService } from '@/services/api/org.service'
import { ApiError } from '@/services/api/http'
import { orgKeys } from './hooks'

type Action = 'cancel' | 'delete' | 'unpublish' | 'publish'
interface Target {
  id: string
  title: string
}

/**
 * Ações de ciclo de vida do evento (publicar, voltar a rascunho, cancelar,
 * excluir) com confirmação e feedback. Devolve `ask(action, target)` e o
 * modal a ser renderizado pela página.
 */
export function useEventActions(onDone?: (action: Action, target: Target) => void) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [pending, setPending] = useState<{ action: Action; target: Target } | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: orgKeys.all })

  const run = async (action: Action, target: Target) => {
    try {
      if (action === 'cancel') await orgService.cancelEvent(target.id)
      if (action === 'delete') await orgService.deleteEvent(target.id)
      if (action === 'unpublish') await orgService.unpublishEvent(target.id)
      if (action === 'publish') await orgService.publishEvent(target.id)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PUBLISH_BLOCKED') {
        const errors = (err.details.errors as string[] | undefined) ?? []
        throw new ApiError(`Ainda não dá para publicar: ${errors.join('; ')}.`, err.status)
      }
      throw err
    }
    await refresh()
    toast.show({
      message: { cancel: 'Evento cancelado e pedidos reembolsados', delete: 'Rascunho excluído', unpublish: 'Evento voltou para rascunho', publish: 'Evento publicado' }[action],
    })
    onDone?.(action, target)
  }

  const copy: Record<Action, { title: string; confirm: string; body: (t: Target) => ReactNode }> = {
    cancel: {
      title: 'Cancelar este evento?',
      confirm: 'Cancelar evento',
      body: (t) => `“${t.title}” sai do ar e todos os pedidos pagos serão reembolsados. Esta ação não pode ser desfeita.`,
    },
    delete: { title: 'Excluir este rascunho?', confirm: 'Excluir', body: (t) => `“${t.title}” e seus lotes serão apagados.` },
    unpublish: { title: 'Voltar para rascunho?', confirm: 'Despublicar', body: (t) => `“${t.title}” deixa de aparecer em Explorar. Só é possível enquanto não houver vendas.` },
    publish: { title: 'Publicar este evento?', confirm: 'Publicar', body: (t) => `“${t.title}” passa a aparecer em Explorar e a vender ingressos.` },
  }

  const modal = (
    <ConfirmModal
      open={!!pending}
      title={pending ? copy[pending.action].title : ''}
      confirmLabel={pending ? copy[pending.action].confirm : ''}
      onConfirm={() => run(pending!.action, pending!.target)}
      onClose={() => setPending(null)}
    >
      {pending && copy[pending.action].body(pending.target)}
    </ConfirmModal>
  )

  return { ask: (action: Action, target: Target) => setPending({ action, target }), modal }
}
