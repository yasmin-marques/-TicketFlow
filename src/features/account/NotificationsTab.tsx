import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Toggle } from '@/components/ui/Toggle'
import { useToast } from '@/components/ui/Toast'
import { accountService } from '@/services/api/account.service'
import type { NotificationPrefs, UserProfile } from '@/types/auth'

const OPTIONS: ReadonlyArray<{ key: keyof NotificationPrefs; title: string; description: string }> = [
  { key: 'orderUpdates', title: 'Pedidos e pagamentos', description: 'Confirmação de compra, pagamento pendente e reembolsos.' },
  { key: 'eventReminders', title: 'Lembretes de eventos', description: 'Aviso um dia antes e na manhã do evento, com o seu ingresso.' },
  { key: 'marketing', title: 'Novidades e ofertas', description: 'Eventos perto de você e abertura de novos lotes.' },
]

/** Preferências de notificação: salvam na hora, com atualização otimista. */
export function NotificationsTab({ profile }: { profile: UserProfile }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const update = useMutation({
    mutationFn: (notifications: Partial<NotificationPrefs>) => accountService.update({ notifications: notifications as NotificationPrefs }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['me'] })
      const previous = queryClient.getQueryData<UserProfile>(['me'])
      queryClient.setQueryData<UserProfile>(['me'], (old) => (old ? { ...old, notifications: { ...old.notifications, ...patch } } : old))
      return { previous }
    },
    onError: (_e, _p, ctx) => {
      queryClient.setQueryData(['me'], ctx?.previous)
      toast.show({ message: 'Não foi possível salvar a preferência. Tente novamente.' })
    },
    onSuccess: () => toast.show({ message: 'Preferências salvas' }),
  })

  return (
    <ul className="m-0 list-none border-t border-divider p-0">
      {OPTIONS.map((o) => (
        <li key={o.key} className="flex items-start justify-between gap-4 border-b border-line py-4">
          <div>
            <div className="font-extrabold">{o.title}</div>
            <div className="text-muted text-sm">{o.description}</div>
          </div>
          <Toggle checked={profile.notifications[o.key]} onChange={(v) => update.mutate({ [o.key]: v })}>
            <span className="sr-only">{o.title}</span>
          </Toggle>
        </li>
      ))}
    </ul>
  )
}
