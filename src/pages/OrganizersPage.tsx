import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const FEATURES = [
  ['Mapa de assentos', 'Monte setores, fileiras e bloqueios e venda lugares marcados.'],
  ['Lotes automáticos', 'Quando um lote esgota ou a janela encerra, o próximo abre sozinho.'],
  ['Check-in na porta', 'Leitura de QR Code no tablet ou no celular, com resultado em 3 segundos.'],
  ['Relatórios', 'Receita, ocupação, conversão e vendas por lote em um só lugar.'],
]

/** /organizadores — porta de entrada para quem cria eventos. */
export function OrganizersPage() {
  useDocumentTitle('Para organizadores')
  const { user } = useAuth()
  const isOrganizer = user?.role === 'ORGANIZER' || user?.role === 'ADMIN'
  return (
    <Container className="py-10 lg:py-14">
      <div className="kicker text-[11px] tracking-[0.1em] text-accent-700">Para organizadores</div>
      <h1 className="mt-2 mb-4 max-w-[900px] text-[44px] leading-[0.95] tracking-[-0.04em] lg:text-[84px]">Venda ingressos sem corrida por assento.</h1>
      <p className="max-w-[560px] text-lg">Crie o evento, configure os lotes, acompanhe as vendas e valide a entrada — tudo no mesmo painel.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {isOrganizer ? (
          <Button to="/org/dashboard" size="lg">Abrir painel →</Button>
        ) : (
          <Button to="/entrar?next=%2Forg%2Fdashboard" size="lg">Entrar como organizador →</Button>
        )}
        <Button to="/eventos" variant="secondary" size="lg">Ver eventos</Button>
      </div>
      <ul className="m-0 mt-12 grid list-none gap-px border-2 border-text bg-text p-0 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([t, d]) => (
          <li key={t} className="bg-bg p-5">
            <h2 className="mb-1 text-xl">{t}</h2>
            <p className="text-muted m-0 text-sm">{d}</p>
          </li>
        ))}
      </ul>
    </Container>
  )
}
