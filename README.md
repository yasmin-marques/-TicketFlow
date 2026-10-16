# TicketFlow

Plataforma full stack para gerenciamento e venda de ingressos, com reserva de assentos em tempo real, controle de concorrência, pagamentos e processamento assíncrono de eventos.

## Frontend (Parte 1 — descoberta de eventos)

React + TypeScript + Vite + React Router + Tailwind CSS v4 + TanStack Query + Axios + Lucide.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
```

### Dados mockados
As chamadas passam por `src/services/api` (axios). Com `VITE_USE_MOCKS=true` (padrão) um adapter em `src/mocks` responde às rotas; para usar o backend Spring Boot defina `VITE_USE_MOCKS=false` e `VITE_API_URL` (veja `.env.example`).

Simulação de falhas: acrescente `?mock=erro`, `?mock=lento` ou `?mock=vazio` a qualquer URL (persiste na aba até `?mock=off`).

### Rotas
`/`, `/eventos` (filtros na querystring), `/eventos/:slug`, `/categorias`, `/categorias/:slug`. Rotas das próximas partes mostram uma página "Em construção".
