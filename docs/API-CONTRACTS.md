# Contratos provisórios da API (frontend ⇄ backend Spring Boot)

Estes são os contratos que o frontend **já consome** hoje, atendidos por um servidor simulado em `src/mocks`.
Os tipos TypeScript equivalentes estão em `src/types/` e as chamadas em `src/services/api/`.
Para trocar os mocks pela API real: `VITE_USE_MOCKS=false` e `VITE_API_URL=https://…`.

> **Aviso.** O servidor mock **não** garante concorrência, segurança nem processamento de pagamento.
> Venda duplicada, locks de assento, antifraude, cobrança e emissão de ingressos são responsabilidade
> exclusiva do backend. Nenhum gateway de pagamento real é chamado.

## 1. Convenções

| Tema | Regra |
|---|---|
| Base | `VITE_API_URL` (padrão `/api`), JSON, `Accept: application/json` |
| Dinheiro | número em reais (ex.: `120.5`). Migrar para centavos inteiros é recomendável no backend |
| Datas | ISO 8601 com offset (`2026-10-24T20:00:00-03:00`) |
| Autenticação | `Authorization: Bearer <accessToken>` em rotas protegidas |
| Erros | `{ "status": 409, "code": "SEAT_UNAVAILABLE", "message": "…", …extras }` |
| Idempotência | cabeçalho `Idempotency-Key: <uuid>` em `POST /reservations`, `PUT …/seats` e `POST /orders` |
| 401 | `code: TOKEN_EXPIRED` (o cliente tenta `POST /auth/refresh` uma vez) ou `UNAUTHENTICATED` |

### Idempotência
A mesma chave, com o mesmo usuário/método/caminho, deve devolver **a mesma resposta** (inclusive erros 4xx) sem repetir o efeito.
O cliente gera uma chave por intenção: a chave só muda depois de uma falha definitiva (402/409/422); em falha de rede a chamada é repetida com a **mesma** chave.

## 2. Autenticação (hoje simulada, futuramente JWT)

A simulação está isolada em `features/auth/sessionStore.ts` (armazenamento) e `mocks/routes/auth.ts` (tokens fictícios
`mock.<userId>.<exp>`). **Não é JWT**: a senha fica em texto puro no `localStorage` do navegador. O resto do app só usa
`useAuth()` e o `authBridge` (`services/api/authBridge.ts`), então a troca é localizada.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/login` | `{ email, password }` | `200 Session` · `401 INVALID_CREDENTIALS` |
| `POST /auth/register` | `{ name, email, password }` | `201 Session` · `409 EMAIL_TAKEN` · `422` |
| `POST /auth/refresh` | `{ refreshToken }` | `200 Session` · `401 INVALID_REFRESH_TOKEN` |
| `POST /auth/logout` | — | `200` |
| `POST /auth/forgot-password` | `{ email }` | `200 { accepted: true }` — **sempre igual**, exista o e-mail ou não. (O mock acrescenta `resetToken` para abrir o link sem e-mail.) |
| `POST /auth/reset-password` | `{ token, password }` | `200` · `400 INVALID_TOKEN` · `422` |

`Session = { user: {id,name,email}, accessToken, refreshToken, accessExpiresAt }`.
Com JWT real: refresh token em cookie `HttpOnly; Secure; SameSite`, access token curto em memória.

## 3. Venda: lotes, assentos e reserva

| Método e rota | Descrição |
|---|---|
| `GET /events/{slug}/sales` | `EventSales`: tipos de ingresso, lotes (`open`/`sold-out`/`upcoming`), `serviceFeePct`, `maxPerOrder` e `seatMap` (setores, filas, assentos acessíveis). Para tipos com assento, `lot.remaining` reflete a disponibilidade atual |
| `GET /events/{eventId}/seats` | `SeatAvailability { seats: { "B03": "sold" \| "reserved" } }`. Assentos **da reserva do próprio usuário não aparecem** (para ele são "selecionados") |
| `GET /events/{eventId}/seats/stream` | **SSE** — ver §3.1 |
| `POST /events/{eventId}/ticket-types/{typeId}/waitlist` | "Avise-me" de um lote esgotado (auth) |
| `POST /reservations` | Cria a reserva (auth + `Idempotency-Key`) |
| `GET /reservations/{id}` | Reserva do usuário. `status: active \| expired \| released \| completed` |
| `PUT /reservations/{id}/items/{ticketTypeId}/seats` | **Substitui** os assentos de um item: `{ seatIds: ["B03","B04"] }` (idempotente) |
| `DELETE /reservations/{id}` | Libera a reserva (usuário saiu do fluxo) |

### `POST /reservations`
```jsonc
// request
{ "eventId": "evt_001",
  "items": [ { "ticketTypeId": "premium", "quantity": 2, "seatIds": ["B03"] },   // seatIds parcial é válido (≤ quantity)
             { "ticketTypeId": "pista",   "quantity": 1 } ] }
// 201 Reservation
{ "id": "res_…", "eventId": "evt_001", "status": "active",
  "createdAt": "…", "expiresAt": "2026-10-16T09:42:00-03:00",   // fonte ÚNICA do contador regressivo
  "items": [ { "ticketTypeId": "premium", "name": "Premium", "kind": "seated", "quantity": 2,
               "unitPrice": 120, "unitFee": 12, "seatIds": ["B03"] }, … ],
  "subtotal": 240, "fee": 24, "total": 264 }
```
* O prazo (`expiresAt`) começa na criação e **não** é renovado por `PUT …/seats`. No frontend a reserva é criada na 1ª escolha de assento (ou ao continuar, se só houver ingressos sem assento).
* Criar uma reserva libera qualquer outra reserva ativa do mesmo usuário.
* O contador é sempre `expiresAt − agora`; nunca um contador local.

### Erros de reserva
| Status | `code` | Quando |
|---|---|---|
| `409` | `SEAT_UNAVAILABLE` | Perdeu a disputa. Corpo: `{ message, seatIds: ["C05"], suggestions: ["C06","C04"] }` — o cliente reverte, marca os assentos como reservados e oferece a sugestão |
| `409` | `INSUFFICIENT_STOCK` / `LOT_CLOSED` | Estoque de ingresso sem assento insuficiente / lote fechado |
| `410` | `RESERVATION_EXPIRED` | Reserva vencida (o cliente mostra o modal "Sua reserva expirou") |
| `422` | `LIMIT_EXCEEDED` / `VALIDATION_ERROR` | Acima de `maxPerOrder`, assento fora do setor, etc. |

### 3.1 SSE de disponibilidade
`GET /events/{eventId}/seats/stream` (`Content-Type: text/event-stream`):
```
event: seat.updated
data: {"seatId":"B03","status":"reserved"}      // status: available | reserved | sold
```
O cliente aplica cada mensagem no cache do TanStack Query (`setQueryData`) — sem polling.
`EventSource` não envia `Authorization`: usar cookie de sessão ou token de curta duração na query.
`services/realtime/seatStream.ts` abre o EventSource real; com mocks, `mocks/seats.ts` emite atualizações simuladas.

## 4. Pedidos e pagamento

| Método e rota | Descrição |
|---|---|
| `POST /orders` | Cria o pedido a partir da reserva (auth + `Idempotency-Key`) |
| `GET /orders` / `GET /orders/{id}` | Histórico / detalhe (com `tickets[]`) |
| `POST /orders/{id}/cancel` | Cancela e reembolsa |

```jsonc
// POST /orders
{ "reservationId": "res_…",
  "buyer": { "name": "…", "email": "…", "phone": "(11) 98877-6655", "cpf": "123.456.789-09", "birthDate": "14/03/1994" },
  "holders": [ { "slot": "B03", "name": "Camila Duarte" } ],            // slot = assento, ou "<ticketTypeId>#<n>"
  "payment": { "method": "card",                                        // card | pix | boleto
               "card": { "number": "…", "holderName": "…", "expiry": "MM/AA", "cvv": "…", "installments": 1 } } }
```
> No backend real o cartão **não** deve trafegar pelo servidor da aplicação: usar o token do gateway
> (`payment.card = { token }`). O mock recebe o número apenas para a simulação e guarda só os 4 últimos dígitos.

| Resultado | Significado |
|---|---|
| `201 Order` com `status: "paid"` | Pagamento aprovado; `tickets[]` preenchido |
| `201 Order` com `status: "pending"` | Pix (`pix: {code, expiresAt}`) ou boleto (`boleto: {line, dueAt}`); ingressos só após a confirmação (webhook) |
| `402 PAYMENT_DECLINED` | Recusado. Nada é cobrado e **a reserva continua ativa** |
| `410 RESERVATION_EXPIRED` · `409 ALREADY_COMPLETED` · `422` | Reserva vencida / já virou pedido / dados inválidos |

`Order.status`: `paid · pending · refunded · expired`. `Order.refundable` indica se o cancelamento com reembolso ainda é
permitido (regra mockada: até 7 dias após a compra **e** mais de 48 h antes do evento → `422 REFUND_NOT_ALLOWED` fora disso).
Enquanto `pending`, o cliente consulta `GET /orders/{id}` a cada 5 s.

**Somente mock** (não existe em produção): `POST /dev/orders/{id}/simulate-payment` confirma um pedido pendente.

## 5. Ingressos

| Método e rota | Descrição |
|---|---|
| `GET /tickets` | Ingressos do usuário (`status: valid \| used \| cancelled`) |
| `GET /tickets/{id}` | Um ingresso, com `qrPayload` |
| `POST /tickets/{id}/transfer` | `{ email }` — remove o ingresso da conta (transferência simulada) |

`qrPayload` é o conteúdo do QR Code. No mock é `TF1.<ticketId>.<código>` **sem assinatura**; o backend deve emitir um
conteúdo **assinado** (HMAC/JWT) e o check-in (Parte 3) validar a assinatura e o estado (válido/usado).

## 6. Conta

| Método e rota | Descrição |
|---|---|
| `GET /me` · `PATCH /me` | Perfil (`name, phone, cpf, birthDate, notifications{orderUpdates,eventReminders,marketing}`); e-mail somente leitura |
| `GET /me/cards` · `POST /me/cards` · `DELETE /me/cards/{id}` | Cartões salvos: apenas `brand`, `last4`, `holderName`, `expiry` |

## 7. Catálogo (Parte 1)

`GET /events` (filtros `q, city, from, to, categories, minPrice, maxPrice, when, seatMapOnly, sort, page, pageSize`),
`GET /events/featured`, `GET /events/upcoming`, `GET /events/suggest`, `GET /events/{slug}`, `GET /events/{slug}/related`,
`GET /categories`.

## 8. Limitações dos mocks (o que **não** representam)

* **Sem concorrência real.** Tudo roda no navegador, em uma aba; duas abas/usuários diferentes *não* disputam assentos de verdade.
  A "outra pessoa" é uma simulação (`mocks/seats.ts`): periodicamente reserva um assento livre e depois o vende ou libera.
* **Persistência local.** O "banco" fica em `localStorage` (`tf:mock-db:v1`); limpar os dados do site volta ao estado inicial.
  Reservas/pedidos não são compartilhados entre navegadores.
* **Sem garantia de segurança.** Senhas em texto puro, tokens fictícios, sem rate-limit, sem verificação de e-mail.
* **Pagamento fictício.** Cartão final `0002` (ex.: `4000 0000 0000 0002`) é recusado, `4242 4242 4242 4242` é aprovado;
  Pix e boleto geram pedido pendente. Nenhum dado é enviado a terceiros.
* **Mapa de assentos único.** Todos os eventos com mapa usam a mesma planta (filas A–H × 16, corredor após o 8º); a ocupação
  inicial é determinística por evento.
* **Transferência, calendário e "salvar ingresso"** são locais: o ingresso salvo é um SVG gerado no navegador; não há carteira digital.
* **Modos de simulação** (`?mock=` na URL, persistem na aba até `?mock=off`): `erro`, `lento`, `vazio`, `conflito` (a 1ª escolha de assento perde a disputa) e `expira` (reservas duram 45 s).
