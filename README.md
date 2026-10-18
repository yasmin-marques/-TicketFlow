# TicketFlow

Plataforma de criação, gerenciamento, venda e reserva de ingressos para eventos, com reserva de assentos em tempo real,
controle de concorrência, pagamentos e processamento assíncrono. Este repositório contém o **frontend** completo (três partes)
e o **backend** completo em [`backend/`](backend/README.md) (Java 21 + Spring Boot + PostgreSQL + Redis + Kafka). Por padrão o
frontend usa uma API simulada local; com `VITE_USE_MOCKS=false` ele fala com o backend real.

> Status detalhado, endpoints pendentes e checklist de produção: [`FRONTEND_STATUS.md`](FRONTEND_STATUS.md) ·
> contratos de API: [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md).

## Visão geral

| Ambiente | O que faz |
|---|---|
| **Público** | Descoberta de eventos: home, busca com filtros, categorias, detalhe do evento |
| **Comprador** | Cadastro/login, escolha de ingressos e lotes, mapa de assentos com reserva de 10 min, checkout (Pix, cartão, boleto), pedidos, ingresso digital com QR, conta |
| **Organizador** | Dashboard, criação/edição de eventos em 5 etapas, lotes, editor de mapa de assentos, pedidos e reembolsos, participantes, check-in por QR (tablet/celular), relatórios, configurações |

Design: sistema "Modernist" do protótipo — Archivo, accent `#EC3013`, fundo claro, bordas retas (raio 0), réguas de 2px, grades visíveis.

## Tecnologias

React 19 · TypeScript (estrito) · Vite · React Router 7 · Tailwind CSS 4 · TanStack Query 5 · Axios · Lucide ·
react-hook-form + zod (formulários) · `qrcode` (QR real, gerado no navegador). Gráficos em SVG/CSS próprios.

## Instalação e execução

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build  → dist/
npm run preview    # serve o build
npm run typecheck
```

Requer Node 20+.

### Contas de demonstração (mock)
| Perfil | E-mail | Senha |
|---|---|---|
| Comprador | `camila@exemplo.com` | `ticketflow123` |
| Organizador | `organizador@pulse.com` | `ticketflow123` |

A tela de login tem botões que preenchem as credenciais. Cartões de teste: `4242 4242 4242 4242` aprova ·
`4000 0000 0000 0002` recusa · Pix/boleto ficam pendentes.

## Variáveis de ambiente

Copie `.env.example` para `.env`.

| Variável | Padrão | Descrição |
|---|---|---|
| `VITE_USE_MOCKS` | `true` | `true`: o axios é atendido por `src/mocks`. `false`: chamadas vão para a API real |
| `VITE_API_URL` | `/api` | URL base da API Spring Boot (usada com `VITE_USE_MOCKS=false`) |

## Estrutura de diretórios

```
src/
├─ app/            Providers (Query, Auth, Toast), router (rotas lazy), queryClient
├─ components/
│  ├─ ui/          Button, Chip, Tabs, Modal, Drawer, DataTable, Stepper, TextField, QuantityStepper…
│  ├─ domain/      EventCard, TicketCard, QrCode, StatusPanel, LoadError…
│  └─ charts/      BarChart, LineChart, HBarList, StackedBar, ProgressBar
├─ features/       Lógica por domínio: events, search, auth, purchase, reservation, seats,
│                  checkout, orders, tickets, account, org (dashboard/lotes/mapa/wizard/check-in)
├─ layouts/        PublicLayout, CheckoutLayout, AdminLayout (+ headers, tab bar, footer)
├─ pages/          Telas (public, auth/, purchase/, orders/, tickets/, account/, org/)
├─ services/
│  ├─ api/         axios (`http.ts`), um serviço por domínio, `ApiError`, ponte de autenticação
│  └─ realtime/    SSE de disponibilidade de assentos
├─ mocks/          "Backend" local: adapter do axios, rotas por domínio, banco persistente, seed do organizador
├─ hooks/ lib/ types/ styles/
docs/API-CONTRACTS.md · FRONTEND_STATUS.md
```

## Funcionalidades

Resumo; a lista completa de telas e rotas está em [`FRONTEND_STATUS.md`](FRONTEND_STATUS.md).

* **Descoberta:** filtros na querystring (compartilháveis), sugestões de busca, ordenação, paginação, favoritos locais.
* **Compra:** reserva com prazo vindo do servidor (`expiresAt`), seleção de assentos serializada com `Idempotency-Key`, conflito `409` com sugestão, atualização ao vivo (SSE), pagamento com estados processando/recusado/aprovado/pendente.
* **Cliente:** pedidos com cancelamento/reembolso, ingressos em abas, QR real, transferência, salvar ingresso (SVG), perfil e cartões.
* **Organizador:** criação em 5 etapas com validação e rascunho automático, lotes, editor de mapa (setores, fileiras, bloqueio, numeração), publicação que reflete no catálogo, check-in com resultado em tela cheia, relatórios e exportação CSV/PDF.

## Estratégia de mocks

Toda comunicação passa por **axios** (`src/services/api`). Com `VITE_USE_MOCKS=true`, `src/mocks/adapter.ts` implementa um
roteador que responde às mesmas rotas, cabeçalhos e códigos de status do contrato (`Authorization`, `Idempotency-Key`,
`409/402/410/403`). O banco do comprador persiste em `localStorage` (`tf:mock-db:v1`); a base do organizador é gerada de forma
determinística e só as alterações persistem (`tf:mock-org:v1`).

Modos de simulação — acrescente à URL (persiste na aba até `?mock=off`):
`?mock=erro` · `?mock=lento` · `?mock=vazio` · `?mock=conflito` (409 na 1ª escolha de assento) · `?mock=expira` (reserva de 45 s).

> Os mocks **não** garantem concorrência, segurança nem processam pagamento real. Venda duplicada, locks, autorização, emissão
> e validação de ingressos são responsabilidade do backend.

## Como integrar com o backend

> **Backend completo (Partes 1, 2 e 3) em [`backend/`](backend/README.md):** autenticação, catálogo, reservas com concorrência, pedidos,
> pagamentos (gateway abstraído; sandbox em dev), ingressos com QR assinado, SSE de assentos e o **painel do organizador** (eventos,
> lotes, mapa, pedidos, reembolsos, participantes, check-in atômico, dashboard, relatórios, equipe, webhooks), com isolamento por
> organização. Os ajustes de integração do frontend já foram aplicados (`docs/API-CONTRACTS.md` §12.9).

1. Suba a stack: `cp backend/.env.example .env` (preencha os segredos) e `docker compose up --build` na raiz.
2. Crie `.env.local` com `VITE_USE_MOCKS=false` e `VITE_API_URL=http://localhost:8080/api`; `npm run dev`.
3. Entre com as contas de demonstração do perfil dev (`organizador@ticketflow.dev`, `portaria@ticketflow.dev`,
   `comprador@ticketflow.dev`, senha `Demo12345`) — ver `backend/README.md`.
4. **Autenticação:** refresh token em cookie `HttpOnly` (o axios usa `withCredentials`); access token de 15 min renovado uma vez em `401`.
5. **Tempo real:** `GET /events/{id}/seats/stream` (SSE `seat.updated`, com `?access_token=`).
6. **Pagamento:** com a API real o cartão vira um token (`services/payment/cardTokenizer.ts`). Hoje é o token **sandbox** do backend
   (`tok_<final>`, só dev/test); em produção, substitua pelo SDK do gateway.
7. **Produção:** remova o import de `@/mocks/*` de `services/api/http.ts` (ou carregue-o com `import()` somente em dev) para tirar o
   código de mock do bundle. A rota `/api/dev/**` só existe nos perfis dev/test do backend.
