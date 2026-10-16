# TicketFlow

Plataforma full stack para gerenciamento e venda de ingressos, com reserva de assentos em tempo real, controle de concorrência, pagamentos e processamento assíncrono de eventos.

## Frontend

React + TypeScript (estrito) + Vite + React Router + Tailwind CSS v4 + TanStack Query + Axios + Lucide.
Formulários com react-hook-form + zod; QR Code real gerado localmente (`qrcode`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
```

### Estado do desenvolvimento
| Parte | Escopo | Situação |
|---|---|---|
| 1 | Fundação + descoberta de eventos (Home, Explorar, Categorias, Evento) | ✅ |
| 2 | Jornada de compra + área do cliente (login, ingressos, assentos, reserva, checkout, pedidos, ingresso digital, conta) | ✅ |
| 3 | Painel do organizador, check-in, relatórios | pendente |

### Rotas
| Rota | Tela |
|---|---|
| `/`, `/eventos`, `/eventos/:slug`, `/categorias`, `/categorias/:slug` | Descoberta (Parte 1) |
| `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` | Acesso (autenticação **simulada**) |
| `/eventos/:slug/ingressos` · `/eventos/:slug/assentos` | Tipos/lotes/quantidades · mapa de assentos com reserva |
| `/checkout/:reservaId` · `/checkout/:reservaId/pagamento` | Dados do comprador · pagamento (simulado) |
| `/pedidos`, `/pedidos/:id` | Histórico e confirmação/detalhe do pedido |
| `/meus-ingressos`, `/ingressos/:id` | Ingressos (Próximos · Utilizados · Cancelados) e ingresso digital com QR |
| `/conta` | Perfil · Pagamentos · Notificações |

### Dados simulados
As chamadas passam por `src/services/api` (axios). Com `VITE_USE_MOCKS=true` (padrão) um adapter em `src/mocks` implementa
a API; com `VITE_USE_MOCKS=false` e `VITE_API_URL` o app fala com o backend Spring Boot (veja `.env.example`).

* **Contratos e limitações:** [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md).
* **Conta de demonstração:** `camila@exemplo.com` / `ticketflow123` (já tem pedidos e ingressos).
* **Cartões de teste:** `4242 4242 4242 4242` aprova · `4000 0000 0000 0002` recusa · Pix/boleto ficam pendentes.
* **Modos de simulação** — acrescente à URL (persiste na aba até `?mock=off`):
  `?mock=erro` · `?mock=lento` · `?mock=vazio` · `?mock=conflito` (409 na 1ª escolha de assento) · `?mock=expira` (reserva de 45 s).

> A simulação **não** garante concorrência nem processa pagamento real: venda duplicada, locks e cobrança são
> responsabilidade do backend.
