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
**Backend real implementado (Parte 1):** ver §10 — o refresh token vai **só no cookie** e `Session.refreshToken` deixa de existir.

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

## 9. Painel do organizador (Parte 3)

Todas as rotas `/org/**` exigem `Authorization` de um usuário com papel `ORGANIZER` (ou `ADMIN`); sem o papel a API responde
`403 FORBIDDEN`. `AuthUser.role` (`USER | ORGANIZER | ADMIN`) vem na `Session`. O frontend só **esconde** as telas
(`RequireRole`); **a autorização é do backend**. Tipos: `src/types/organizer.ts` · cliente: `src/services/api/org.service.ts`.

| Método e rota | Descrição |
|---|---|
| `GET /org/dashboard?range=7\|30\|90&eventId=` | KPIs (receita, vendidos, ocupação, check-ins) com variação vs. período anterior, vendas por dia, por tipo, acumulado vs. meta, receita por evento, eventos ativos |
| `GET /org/reports?eventId&from&to` | KPIs do evento, receita diária, funil, vendas por lote, ocupação por setor (funil/conversão vêm de analytics) |
| `GET /org/events?status&q` | Lista + `counts` por status (`draft · published · ended · cancelled`) |
| `GET /org/events/slug-available?slug&exceptId` | `{ slug, available }` (checa também o catálogo público) |
| `POST /org/events` | Cria **rascunho** (campos parciais) → `201 OrgEvent` |
| `GET/PATCH /org/events/{id}` | Detalhe com derivados (`capacity, sold, revenue, checkedIn`) / edição (`409` se encerrado/cancelado ou slug com vendas) |
| `POST /org/events/{id}/publish` | `422 PUBLISH_BLOCKED { errors: [] }` se faltar nome, descrição ≥ 80, local, datas, lote ou mapa |
| `POST /org/events/{id}/unpublish` · `/cancel` · `DELETE /org/events/{id}` | Voltar a rascunho (só sem vendas) · cancelar (reembolsa os pedidos pagos) · excluir rascunho sem vendas |
| `PUT /org/events/{id}/seat-map` | Salva o mapa inteiro (`OrgSeatMap \| null`); `409 SEAT_SOLD` ao bloquear assento já vendido |
| `GET/POST /org/events/{id}/lots` · `PATCH/DELETE /org/lots/{id}` | Lotes. `422` se `quantity < vendidos`; `409` ao remover lote com vendas. Mudar preço só vale para novas compras |
| `GET /org/orders?q&eventId&method&status&from&to&page&pageSize` | Pedidos paginados (`pageSize` ≤ 500 serve à exportação CSV) |
| `POST /org/orders/{id}/refund` | `409` se não estiver pago ou houver ingresso já utilizado |
| `GET /org/attendees?eventId&q&status&page` | Participantes + `checkedIn`/`sold` |
| `POST/DELETE /org/attendees/{ticketId}/checkin` | Check-in manual / desfazer |
| `GET /org/events/{id}/checkin` | `CheckinStats`: contadores, leituras/min, portões, últimas leituras |
| `POST /org/events/{id}/checkin` `{ code, gate }` | **Sempre `200`** com `CheckinResult.result = valid \| used \| invalid` (`409 EVENT_NOT_ACTIVE` se o evento não está publicado) |
| `GET/PATCH /org/settings` · `POST/DELETE /org/members` · `POST/PATCH/DELETE /org/webhooks` | Organização, equipe, conta de repasse e webhooks |
| `GET /org/notifications` · `POST /org/notifications/read` · `GET /org/search?q=` | Avisos e busca global (⌘K) |

### Check-in
O frontend só lê o código (câmera via `BarcodeDetector` ou digitação) e **exibe o veredito do servidor**. Não há validação
criptográfica no cliente: o backend deve verificar a assinatura do `qrPayload` (Parte 2), o evento, o estado (válido/usado/cancelado)
e **registrar a entrada de forma atômica** (duas leituras simultâneas do mesmo ingresso → apenas uma `valid`).
Aceita-se `TF-XXXX-XXXX` ou o conteúdo do QR (`TF1.<ticketId>.<código>`).

### Limitações do mock do organizador
* A base (12 eventos, ~1.700 pedidos e milhares de ingressos) é **gerada de forma determinística** a cada carga (`mocks/org/seed.ts`); só as
  alterações do organizador persistem (overlay em `localStorage`, chave `tf:mock-org:v1`).
* Receita = soma do **subtotal** dos pedidos pagos (sem a taxa de serviço). Funil/conversão/reservas expiradas são **estimativas** simuladas.
* Eventos criados e publicados no painel aparecem no catálogo público, mas sempre **sem mapa de assentos** (a jornada do comprador usa uma planta única).
* Ingressos comprados na jornada do comprador para um evento com o mesmo *slug* podem ser validados na portaria e passam a "Utilizado".
* O envio da imagem de capa é simulado (só o nome do arquivo é guardado) e os webhooks não disparam chamadas.
* Check-in não tem janela de horário; qualquer evento publicado aceita leituras.

## 10. Backend real — Parte 1 (fundação, autenticação, catálogo público)

Implementado em `backend/` (ver `backend/README.md`). Este capítulo registra **onde o backend real difere dos mocks** e o que
o frontend precisa ajustar. Rotas e formatos não mencionados aqui seguem as seções acima sem mudanças. O prefixo é `/api`
(`VITE_API_URL=http://localhost:8080/api`).

### 10.1 Autenticação

| Rota | Comportamento real |
|---|---|
| `POST /auth/register` | `201 Session` + cookie `tf_refresh`. `409 EMAIL_TAKEN` (e-mail comparado sem diferenciar maiúsculas) · `422 VALIDATION_ERROR` com `errors: { campo: mensagem }`. Cria sempre o papel `USER` |
| `POST /auth/login` | `200 Session` + cookie. `401 INVALID_CREDENTIALS` idêntico para e-mail inexistente e senha errada · `429 TOO_MANY_ATTEMPTS` após 5 falhas em 15 min |
| `POST /auth/refresh` | **Corpo opcional** (`{}` basta): o refresh token é lido do cookie. Rotaciona o token (novo cookie). `401 INVALID_REFRESH_TOKEN` limpa o cookie |
| `POST /auth/logout` | `200`; revoga a sessão no servidor e limpa o cookie |
| `POST /auth/forgot-password` | `200 { accepted: true }` **sempre**; **nunca** devolve `resetToken` (o link vai por e-mail — hoje só no log DEBUG) |
| `POST /auth/reset-password` | `200` · `400 INVALID_TOKEN` (inexistente, expirado ou já usado) · `422`. Encerra todas as sessões do usuário |
| `GET /me` | Perfil. `PATCH /me` e `/me/cards` **ainda não existem** no backend |

`Session = { user: { id, name, email, role }, accessToken, accessExpiresAt }` — **sem `refreshToken`**.
O access token dura 15 min; a resposta de 401 distingue `TOKEN_EXPIRED` (renovar) de `UNAUTHENTICATED`. `403 FORBIDDEN` = papel insuficiente.
Regra de senha (igual à do frontend): ≥ 8 caracteres com letra e número (máx. 72 bytes).

### 10.2 Ajustes necessários no frontend (não aplicados — o frontend segue funcionando com mocks)

Inconsistência: o tipo `Session` (`src/types/auth.ts`) exige `refreshToken` e `AuthProvider` o lê do `localStorage` para chamar
`authService.refresh(...)`. Com cookie `HttpOnly` o JavaScript nunca vê o token. Proposta, mínima e localizada:

1. `services/api/http.ts`: criar o axios com `withCredentials: true` (somente quando `!USE_MOCKS`), senão o navegador não
   envia nem grava o cookie em requisições entre origens (`localhost:5173` → `localhost:8080` é *same-site*, então `SameSite=Lax` funciona).
2. `types/auth.ts`: tornar `refreshToken` opcional (ou removê-lo) e **não** persistir token algum no `localStorage`; manter só
   `user` e o access token em memória.
3. `services/api/auth.service.ts` / `AuthProvider.tsx`: `refresh()` sem argumento → `http.post('/auth/refresh', {})`. Ao abrir o
   app, tentar `refresh()` uma vez para restaurar a sessão a partir do cookie.
4. Em produção, servir frontend e API sob o mesmo domínio (ou subdomínios do mesmo site) e `TF_COOKIE_SECURE=true`. Para outro
   *site*, seria preciso `SameSite=None; Secure` (`tf.security.refresh.cookie.same-site`) e proteção CSRF extra.

Alternativa sem alterar o frontend: `tf.security.refresh.expose-in-body=true` devolve o `refreshToken` no corpo (como nos mocks),
ao custo de deixá-lo acessível ao JavaScript. Não recomendado em produção.

### 10.3 Catálogo

* **Visibilidade:** só eventos `PUBLISHED` e ainda não encerrados (`endsAt ?? startsAt >= agora`). Rascunhos e eventos passados dão `404` no detalhe e não aparecem em listas, sugestões, destaques, relacionados nem na contagem de categorias. Eventos esgotados permanecem, com `badges: ["soldOut"]`.
* **Dinheiro:** `minPrice` em **reais** (`120.5`; `0` = gratuito; `null` = sem lotes). `minPrice`/`maxPrice` da consulta também são em reais. Internamente é tudo em centavos.
* **Datas:** `startsAt`/`endsAt` em ISO 8601 com o offset de São Paulo (`-03:00`); `from`/`to` são `YYYY-MM-DD` no mesmo fuso.
* **`city`** no formato do frontend `"São Paulo, SP"` (o estado é opcional).
* **`distanceKm`:** calculado em relação a uma origem fixa (centro de SP) ou a `lat`/`lng` (novos parâmetros opcionais, sempre juntos); `null` se o local não tem coordenadas. `sort=distancia` usa a mesma origem.
* **`badges`:** `soldOut` ou `lastTickets` (restam ≤ 10 % da capacidade, mínimo de 20).
* **`GET /events/{slug}`:** `lot` = lote à venda de menor preço (`{ name, remaining }`); omitido se nenhum estiver aberto. Campos opcionais ausentes são omitidos do JSON.
* **Erros de parâmetro:** `sort`, `when`, datas, preços inválidos ou faixas invertidas → `400 INVALID_PARAMETER`. `pageSize` é limitado a 100 (padrão 12). `page` é 1-based.
* `coverUrl` é sempre `null` por enquanto (sem upload de imagens).

### 10.4 Ainda não implementado no backend

Cartões salvos (`/me/cards`), `PATCH /me` e todo o painel `/org/**` (já protegido por papel, mas sem controllers: responde `404`
a quem tem o papel e `403` a quem não tem). Venda, reservas, pedidos e ingressos estão na §11.

## 11. Backend real — Parte 2 (reservas, concorrência, pedidos, pagamentos, ingressos, tempo real)

Implementado em `backend/` (detalhes de arquitetura em `backend/README.md`). Formatos de `EventSales`, `Reservation`, `Order` e
`Ticket` seguem `src/types/purchase.ts`; abaixo estão **as regras reais** e **onde diferem dos mocks**.

### 11.1 Identificadores e valores
* `eventId` = UUID do evento (o `id` de `EventSummary`); `ticketTypeId` = **código** do tipo (`pista`, `premium`…); reservas, pedidos
  e ingressos têm UUID como `id`. Pedidos têm também `code` legível (`TF-48214`) e ingressos `code` (`TF-7K2M-9QX4`).
* Dinheiro em **reais** na API (centavos no banco). `unitFee = round(preço × serviceFeePct / 100)` por unidade; `total = subtotal + fee`.
* Datas ISO 8601 com offset (`-03:00`), em milissegundos.

### 11.2 Venda e disponibilidade (públicas)
| Rota | Comportamento |
|---|---|
| `GET /events/{slug}/sales` | `EventSales`. `lot.status`: `open` (primeiro lote com janela aberta e estoque **livre**), `sold-out` (+ `nextLotNote` "2º lote abre em 20/10" se há próximo lote) ou `upcoming` (+ `opensAt`). `lot.remaining` desconta o que está **reservado** por outros. `maxPerOrder` = 6 |
| `GET /events/{eventId}/seats` | `{ eventId, seats: { "B03": "sold" \| "reserved" }, updatedAt }`. Autenticação **opcional**: com token, os assentos da reserva ativa do próprio usuário não aparecem. Um hold vencido já aparece como livre |
| `GET /events/{eventId}/seats/stream` | SSE — §11.3 |
| `POST /events/{eventId}/ticket-types/{typeId}/waitlist` | (auth) `200 { ok: true }`, idempotente. Quando o estoque volta, o usuário é notificado **uma vez** (Kafka) |

### 11.3 SSE (`seat.updated`)
`event: seat.updated` / `data: {"seatId":"B03","status":"reserved"}` (`available | reserved | sold`). Emitido **somente depois do commit**
(nunca anuncia algo que foi desfeito), por reserva, troca de assentos, liberação, expiração, venda e reembolso. Comentário `: hb` a cada 15 s;
conexões fecham após 30 min (o `EventSource` reconecta sozinho). Entre instâncias da API a entrega passa pelo Redis (pub/sub).
* **Autenticação:** `EventSource` não envia cabeçalhos. O stream é público (o mapa também é); se o cliente passar `?access_token=<JWT de acesso>`,
  o servidor **não reenvia a ele as mudanças causadas por ele mesmo**. Token inválido/expirado → `401`.
  **Ajuste no frontend:** `openSeatStream` deve acrescentar `?access_token=` (e reabrir o stream quando o token for renovado, porque o
  `EventSource` reconecta com a URL antiga). O cookie `tf_refresh` **não** é enviado ao stream (`Path=/api/auth`). Sem o token, o cliente
  recebe também o eco das próprias ações e deve ignorá-lo para os assentos da sua reserva.
* **Recuperação:** ao reconectar, o navegador envia `Last-Event-ID`; o servidor então reenvia o **estado de todos os assentos** (inclusive
  `available`), cobrindo mensagens perdidas. Mensagens são "melhor esforço": a fonte da verdade é `GET /seats` (PostgreSQL).

### 11.4 Reservas
* `POST /reservations` (**`Idempotency-Key` obrigatório**): `201 Reservation`; `expiresAt = criação + 10 min` (fonte única do contador, **nunca renovada**).
  Libera a reserva ativa anterior do usuário. `seatIds` parcial é válido (≤ `quantity`). Estoque sem assento e assentos são segurados **atomicamente**.
* `GET /reservations/{id}`: `status` = `active | expired | released | completed` (uma reserva vencida já responde `expired`).
* `PUT /reservations/{id}/items/{ticketTypeId}/seats` (`Idempotency-Key` opcional): **substitui** o conjunto; reenviar o mesmo é no-op.
  Tudo-ou-nada: se um assento foi perdido, nenhum muda. Tipo sem assento → `404`.
* `DELETE /reservations/{id}` → `200 { ok: true }` (repetível).
* Reservas de outras pessoas respondem **`404`** (não revelam existência).

| Status | `code` | Quando |
|---|---|---|
| `409` | `SEAT_UNAVAILABLE` | Perdeu a disputa. Corpo: `seatIds` (os perdidos) e `suggestions` (vizinhos livres, mesma fila/setor) |
| `409` | `INSUFFICIENT_STOCK` | Não há unidades livres agora (podem voltar: estão em outras reservas) |
| `409` | `LOT_CLOSED` | Lote esgotado, fora da janela ou ainda não aberto |
| `410` | `RESERVATION_EXPIRED` | Reserva vencida (a liberação do estoque é imediata) |
| `422` | `LIMIT_EXCEEDED` / `VALIDATION_ERROR` | Mais de `maxPerOrder`; assento inexistente ou fora do setor; repetido; mais assentos que ingressos |
| `422` | `IDEMPOTENCY_KEY_REQUIRED` / `IDEMPOTENCY_KEY_REUSED` | Sem o cabeçalho / mesma chave com outro método, caminho ou corpo |
| `409` | `REQUEST_IN_PROGRESS` | A mesma chave ainda está sendo processada (repita) |
| `409` | `CONCURRENT_UPDATE` / `CONFLICT` | Deadlock/versão/restrição do banco; a operação foi desfeita — **repita com a mesma chave** |

**Idempotência:** persistida por `(usuário, Idempotency-Key)`. A mesma chave devolve a **mesma resposta** (inclusive erros definitivos 4xx, como o
`402`), com o cabeçalho `Idempotent-Replayed: true`, sem repetir efeitos. Erros inesperados (5xx) liberam a chave para nova tentativa.

### 11.5 Pedidos e pagamento
`POST /orders` (**`Idempotency-Key` obrigatório**) aceita o corpo do §4, **com uma mudança de segurança**:

```jsonc
"payment": { "method": "card", "card": { "token": "tok_4242", "installments": 1 } }   // card | pix | boleto
```
* **O servidor NUNCA recebe número de cartão nem CVV.** O corpo com `card.number`/`card.cvv` é recusado com `422 CARD_DATA_NOT_ALLOWED` **antes de
  qualquer registro** (nem o hash da idempotência é gravado). O navegador deve trocar os dados do cartão por um `token` direto com o gateway
  (SDK do gateway) e enviar só o token. `last4`/bandeira vêm do gateway. **Ajuste no frontend:** `PaymentStep` envia hoje `card.number/cvv/expiry`.
* **Provedor sandbox (perfis `dev`/`test`, claramente identificado, não cobra nada):** `tok_<4 dígitos>` aprova; `tok_0002` recusa; qualquer outro valor recusa.
  Fora de dev/test, sem gateway implementado, pagamentos respondem `503 PAYMENT_PROVIDER_UNAVAILABLE` (nunca finge cobrar).

| Resultado | Significado |
|---|---|
| `201` `status: "paid"` | Cartão aprovado; `tickets[]` já emitidos |
| `201` `status: "pending"` | Pix (`pix:{code,expiresAt}`, 30 min) ou boleto (`boleto:{line,dueAt}`, 3 dias). Estoque e assentos **continuam segurados**; ingressos só após a confirmação |
| `402 PAYMENT_DECLINED` | Nada é cobrado e **a reserva continua ativa** (tente outro cartão na mesma reserva, com nova chave) |
| `409 ALREADY_COMPLETED` | A reserva já virou pedido (checkouts concorrentes: só um vence) |
| `410 RESERVATION_EXPIRED` | Reserva vencida |
| `422 SEATS_INCOMPLETE` / `VALIDATION_ERROR` | Faltam assentos; dados do comprador inválidos (`errors: { cpf: … }`); método inválido |

`GET /orders`, `GET /orders/{id}` (só do dono; senão `404`). `status`: `paid | pending | refunded | expired` (pendente com prazo vencido já aparece `expired`).
`refundable` = pago **e** ≤ 7 dias da compra **e** > 48 h do evento **e** todos os ingressos ainda válidos e do comprador.
`POST /orders/{id}/cancel`: pendente → `expired` (libera estoque); pago → reembolso no gateway, ingressos `cancelled`, assentos/estoque devolvidos;
fora da regra → `422 REFUND_NOT_ALLOWED`; já encerrado → `409 INVALID_STATE`.

### 11.6 Webhooks de pagamento (Pix/boleto)
`POST /api/webhooks/payments/{provider}` (público; autenticado pela **assinatura**). Cabeçalho `X-TF-Signature: t=<unix>,v1=<hex>` com
`v1 = HMAC-SHA256(TF_WEBHOOK_SECRET, "<t>.<corpo cru>")`; tolerância de 5 min; comparação em tempo constante. Corpo (sandbox):
`{ "id": "evt_…", "type": "payment.confirmed" | "payment.failed", "providerRef": "…" }`. Resposta `200 { received, duplicate }`; assinatura inválida → `401`.
Proteção contra repetição: `event_id` único por provedor (reenvio = `duplicate:true`, sem efeito), timestamp assinado e o próprio estado do pedido
(confirmar um pedido já pago não faz nada). Confirmação **após o prazo** não emite ingressos: o pedido segue `expired` e o pagamento é estornado.
Só dev/test: `POST /api/dev/orders/{id}/simulate-payment` (equivale ao webhook para o dono do pedido; é o `simulatePayment` do frontend).

### 11.7 Ingressos
* `GET /tickets`, `GET /tickets/{id}` (do dono; senão `404`). `qrPayload = TF1.<ticketId>.<versão>.<assinatura>`, onde a assinatura é HMAC-SHA256
  (`TF_QR_SECRET`) — o check-in (Parte 3) valida a assinatura **e** compara a `versão` e o estado com o banco.
* `POST /tickets/{id}/transfer { email }` → `{ ok, recipient }`. Só o dono, ingresso `valid`, evento ainda não iniciado, e-mail de outra pessoa.
  A **versão do QR sobe** (o QR anterior deixa de valer) e o ingresso sai da conta de origem na mesma transação. Se o destinatário não tem conta, o
  ingresso fica reservado ao e-mail e aparece em "Meus ingressos" quando ele se cadastrar com esse e-mail (**o cadastro ainda não verifica e-mail**).
* Emissão: um ingresso por posição do pedido, **somente** após o pagamento confirmado (`UNIQUE(order_id, slot)` impede duplicação).

### 11.8 Eventos de negócio (Kafka) e consistência
Cada mudança relevante grava um evento na tabela `outbox_events` **na mesma transação** (`order.paid`, `ticket.issued`, `order.pending`, `order.expired`,
`order.refunded`, `ticket.transferred`, `stock.released`, `payment.late-refunded`). Um relay publica no tópico `ticketflow.domain-events`
(entrega ao-menos-uma-vez; chave = agregado) e os consumidores deduplicam por `(consumer, event_id)`. O Kafka **não** substitui as transações do banco:
vendas, reservas e idempotência são decididas apenas no PostgreSQL.

