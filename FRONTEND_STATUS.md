# TicketFlow — Status do frontend

Estado em **16/10/2026**: as três partes do frontend estão implementadas e funcionam de ponta a ponta com um backend simulado
(`src/mocks`). Este documento lista o que está pronto, os fluxos disponíveis, o que o backend Spring Boot precisa expor,
as limitações atuais e o que falta antes de produção. Contratos detalhados: [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md).

## 1. Telas concluídas

### Parte 1 — Descoberta (público)
| Tela | Rota |
|---|---|
| Home (hero com carrossel, destaques, próximos de você, categorias) | `/` |
| Explorar com busca, filtros, ordenação, paginação, drawer mobile | `/eventos` |
| Categorias e categoria pré-filtrada | `/categorias`, `/categorias/:slug` |
| Detalhe do evento (programação, local, política, painel de compra, relacionados) | `/eventos/:slug` |
| 404 · 500 · estados de loading/vazio/erro | `*`, `RouteErrorPage` |

### Parte 2 — Compra e área do cliente
| Tela | Rota |
|---|---|
| Login · cadastro · recuperar/redefinir senha | `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` |
| Tipos, lotes e quantidades | `/eventos/:slug/ingressos` |
| Mapa de assentos com reserva temporária e contador | `/eventos/:slug/assentos` |
| Checkout: dados do comprador e pagamento (Pix, cartão, boleto) | `/checkout/:reservaId`, `/checkout/:reservaId/pagamento` |
| Confirmação / detalhe do pedido · histórico | `/pedidos/:id`, `/pedidos` |
| Meus ingressos · ingresso digital com QR | `/meus-ingressos`, `/ingressos/:id` |
| Conta: perfil, cartões, notificações | `/conta` |
| Estados: reserva expirada, assento indisponível (409), pagamento recusado/pendente | modais e alertas no fluxo |

### Parte 3 — Painel do organizador (papel `ORGANIZER`)
| Tela | Rota |
|---|---|
| Layout: sidebar numerada recolhível, topbar com busca ⌘K, avisos e menu da organização, drawer no mobile | `/org/**` |
| Dashboard: KPIs com variação, vendas por período, por tipo, acumulado vs. meta, receita por evento, eventos ativos | `/org/dashboard` |
| Eventos: abas por status com contagem, filtro, menu de ações (publicar, despublicar, cancelar, excluir) | `/org/eventos` |
| Criar/editar evento em 5 etapas (informações, local, ingressos, assentos, publicação) com rascunho e pré-visualização | `/org/eventos/novo`, `/org/eventos/:id/editar` |
| Detalhe administrativo: Resumo · Ingressos (lotes) · Assentos (editor de mapa) · Participantes | `/org/eventos/:id` |
| Pedidos: busca, filtros, período, exportar CSV, detalhe e reembolso | `/org/pedidos` |
| Participantes: busca, filtro, check-in manual e desfazer | `/org/participantes` |
| Check-in: seleção de evento e scanner em tela cheia (câmera + código manual; válido · já utilizado · inválido) | `/org/checkin`, `/org/checkin/:eventoId` |
| Relatórios: KPIs, receita diária, funil, vendas por lote, ocupação por setor; exportar CSV/PDF | `/org/relatorios` |
| Configurações: organização, equipe, conta de repasse, webhooks | `/org/configuracoes` |
| Para organizadores (porta de entrada) · acesso negado (403) | `/organizadores` |

## 2. Fluxos disponíveis (testados de ponta a ponta)

1. **Comprar com assento:** evento → ingressos → mapa (reserva de 10 min) → dados → pagamento → confirmação → meus ingressos → QR.
2. **Falhas e bordas:** conflito 409 com sugestão, aviso aos 02:00 e modal de expiração, cartão recusado (dados preservados), Pix pendente → aprovado, cancelamento com reembolso, transferência de ingresso.
3. **Publicar um evento:** criar rascunho → configurar lotes e mapa → publicar → o evento aparece em Explorar.
4. **Operar o evento:** acompanhar vendas, ajustar lotes, reembolsar pedido, consultar participantes.
5. **Portaria:** ler/digitar código → resultado em tela cheia por 3 s → reinício automático. Um ingresso **comprado no fluxo do comprador** é validado na portaria e passa a "Utilizado" em *Meus ingressos*.

Todos os fluxos foram exercitados por roteiros automatizados no Edge (desktop 1360 px e mobile 390 px) sem erros de console, e todas as rotas foram abertas uma a uma.

## 3. Endpoints que o backend precisa implementar

Resumo (detalhes de corpo/resposta em `docs/API-CONTRACTS.md`):

| Domínio | Endpoints |
|---|---|
| Catálogo | `GET /events`, `/events/featured`, `/events/upcoming`, `/events/suggest`, `/events/{slug}`, `/events/{slug}/related`, `/categories` |
| Auth | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` |
| Venda | `GET /events/{slug}/sales`, `GET /events/{id}/seats`, **SSE** `GET /events/{id}/seats/stream`, `POST /events/{id}/ticket-types/{typeId}/waitlist` |
| Reserva | `POST /reservations`, `GET/DELETE /reservations/{id}`, `PUT /reservations/{id}/items/{typeId}/seats` (todas com `Idempotency-Key` nas escritas; `409`/`410`) |
| Pedidos | `POST /orders` (`201` pago/pendente · `402` recusado), `GET /orders`, `GET /orders/{id}`, `POST /orders/{id}/cancel`, webhook do gateway |
| Ingressos | `GET /tickets`, `GET /tickets/{id}`, `POST /tickets/{id}/transfer` |
| Conta | `GET/PATCH /me`, `GET/POST/DELETE /me/cards` |
| Organizador | `GET /org/dashboard`, `/org/reports`; CRUD de eventos, `publish/unpublish/cancel`, `PUT .../seat-map`; lotes; pedidos e `refund`; participantes e check-in; `POST /org/events/{id}/checkin`; configurações, membros, webhooks; avisos e busca |

Somente-mock (não implementar): `POST /dev/orders/{id}/simulate-payment`, `POST /dev/org/reset`.

### Status do backend (Partes 1, 2 e 3 — completo)

**Parte 3 (18/10/2026):** o painel do organizador inteiro existe no backend (`/api/org/**`, contratos em `docs/API-CONTRACTS.md` §12),
além de `PATCH /me`. Os três ajustes abaixo **foram aplicados** no frontend (lista em §12.9 do contrato), mais a tokenização sandbox
do cartão e o rótulo do funil em Relatórios. Com `VITE_USE_MOCKS=false` + `VITE_API_URL=http://localhost:8080/api` o app inteiro fala
com a API real; com mocks (padrão) nada mudou. Diferenças que o usuário percebe com a API real: cartões salvos indisponíveis
(`503`), funil de relatórios medido de reserva → compra (sem visitas), membros da equipe precisam já ter conta, webhooks só cadastrados
(sem entrega).

#### Histórico (Partes 1 e 2)

Já existem em `backend/` (ver `backend/README.md`): **Catálogo**, **Auth** (as seis rotas), `GET /me`, **Venda** (`/sales`, `/seats`, SSE, lista de
espera), **Reservas**, **Pedidos** (cartão tokenizado, Pix/boleto com webhook), **Ingressos** (QR assinado, transferência) e o simulador de pagamento
de dev. Para usá-los o frontend precisa de **três ajustes** (nada foi alterado ainda; os mocks continuam funcionando):
1. cookie de refresh: `withCredentials` e `Session` sem `refreshToken` (`docs/API-CONTRACTS.md` §10.2);
2. **cartão tokenizado**: enviar `payment.card = { token, installments }` em vez de número/CVV (o servidor recusa dados crus — §11.5);
3. SSE: `?access_token=` no `EventSource` (§11.3).
Cartões salvos, `PATCH /me` e o painel do organizador **seguem só nos mocks**.

## 4. Contratos provisórios (resumo)

* **Erros:** `{ status, code, message, …extras }`. Códigos usados: `SEAT_UNAVAILABLE`, `INSUFFICIENT_STOCK`, `LOT_CLOSED`, `RESERVATION_EXPIRED`, `LIMIT_EXCEEDED`, `PAYMENT_DECLINED`, `REFUND_NOT_ALLOWED`, `PUBLISH_BLOCKED`, `SEAT_SOLD`, `SLUG_TAKEN`, `EVENT_NOT_ACTIVE`, `FORBIDDEN`, `VALIDATION_ERROR`.
* **Reserva:** `expiresAt` do servidor é a única fonte do contador; seleção de assentos por substituição idempotente.
* **Check-in:** resposta `200` com `result: valid | used | invalid`; decisão e atomicidade no servidor.
* **Papéis:** `AuthUser.role = USER | ORGANIZER | ADMIN`; o frontend só esconde telas.
* **Dinheiro** em reais (número) — recomenda-se migrar para centavos inteiros. **Datas** ISO 8601 com offset.

### Refinamento visual e validação com a API real (20/10/2026)

* **Design system:** os raios agora são tokens por papel (`rounded-control`, `-chip`, `-card`, `-panel`), há superfícies (`surface`, `field`, `callout`), sombras discretas e microinterações. A paleta não mudou. Detalhes em `src/styles/tokens.css` e `index.css`.
* **Home:** carrossel automático de 5 s (`useCarousel`). Pausa no hover e no foco, para de vez quando a pessoa navega, aceita swipe e teclado, respeita `prefers-reduced-motion` e, com um destaque só, não mostra controles.
* **Capas:** `EventImage` tenta, nesta ordem, a `coverUrl` da API, a capa temporária local da categoria (`public/images/events/*.svg`) e o fallback desenhado. Ver `docs/brand/README.md`.
* **Marca:** a atual continua em uso. As três propostas estão em `docs/brand/preview.html`, aguardando escolha.
* **Validado contra o Spring Boot real** (`VITE_USE_MOCKS=false`, API em `:8080`, perfil `dev`), em 1360 px e 390 px:
  - Fluxos: Home e carrossel, capas, catálogo, detalhe, cadastro, login, ingressos, assentos (reserva via `POST /reservations`), dados, pagamento sandbox `4242` → pedido pago, pedidos, meus ingressos, todas as páginas do painel, abas do evento, check-in (válido → "já utilizado") e participantes.
  - Resultado: nenhuma resposta ≥ 400, nenhum erro de console e nenhuma rolagem horizontal.
  - Contrato: 25 endpoints conferidos campo a campo contra `src/types`, sem divergência. O único extra é `conversionBasis` em `/org/reports`, que já está documentado.
* **Corrigido:** o "Neon Horizon Festival" aparecia duplicado **só nos mocks**. Em `mocks/org/catalog.ts`, os eventos semeados eram reconhecidos pelo prefixo `oevt_n`, que também casa com `oevt_neon`. Agora a checagem usa `SEEDED_EVENT_IDS`. A API real não tinha duplicação (25 eventos, slugs únicos).
* **Contraste (WCAG AA):** `text-muted` subiu de 55% para 64% (era 3,7:1 e agora fica ≥ 4,6:1). O botão primário passou a usar `accent-600` com texto branco (de 3,8:1 para 4,7:1).

## 5. Limitações atuais

* **Mocks não garantem nada de verdade:** sem concorrência real, sem locks, sem segurança (senhas em texto puro, tokens `mock.*` que não são JWT), pagamento fictício. Ver `docs/API-CONTRACTS.md` §8 e §9.
* Sem upload real de imagens (capa do evento) e sem fotos definitivas: a API envia `coverUrl: null` e o frontend usa as capas temporárias por categoria.
* Planta de assentos única na jornada do comprador; mapas personalizados do painel não chegam ao comprador.
* Funil/conversão dos relatórios são estimados; não há tracking de visitas.
* Leitura de QR pela câmera depende de `BarcodeDetector` (Chrome/Edge/Android); nos demais navegadores usa-se o código digitado.
* Gráficos são SVG/CSS próprios (sem biblioteca): sem zoom, sem tooltip fixo.
* Sem internacionalização (apenas pt-BR) e sem tema escuro (o protótipo é claro).
* Não há testes automatizados no repositório (os roteiros de validação foram executados fora dele) nem ESLint configurado.

## 6. Pendências antes da produção

**Integração**
- [ ] Implementar a API Spring Boot conforme os contratos e apontar `VITE_USE_MOCKS=false` / `VITE_API_URL`.
- [ ] Autenticação JWT real: refresh token em cookie `HttpOnly`, access token em memória (`features/auth/sessionStore.ts` é o único ponto a trocar) e CSRF.
- [ ] Autorização por papel **em todas** as rotas `/org/**` e propriedade dos recursos (pedidos, ingressos, reservas).
- [ ] Gateway de pagamento real com tokenização (o cartão nunca passa pelo servidor da aplicação) e webhook para Pix/boleto.
- [ ] SSE real de disponibilidade (`EventSource` não envia `Authorization`: definir cookie de sessão ou token curto na query).
- [ ] Reserva com lock distribuído e transação no banco; idempotência persistente.
- [ ] QR assinado (HMAC/JWT) e check-in atômico; janela de horário do check-in.
- [ ] Upload de imagens (URL pré-assinada) e CDN; fotos reais nos cards.
- [ ] Remover o código de mock do bundle de produção (carregar `mocks/` só em desenvolvimento) e a rota `/dev/**`.

**Qualidade**
- [ ] Testes: unitários (validações, máscaras, cálculo de totais), de componente e E2E (Playwright) no CI.
- [ ] ESLint + Prettier e `tsc` no CI; auditoria de acessibilidade com leitor de tela e contraste (accent sobre fundo claro está no limite).
- [ ] Observabilidade (Sentry/OpenTelemetry), `ErrorBoundary` com envio de `ref` ao suporte, política de CSP.
- [ ] Revisar textos legais (termos, privacidade, política de reembolso) e páginas institucionais ("Ajuda", "Termos", "Privacidade" são placeholders).
- [ ] SEO/Open Graph nas páginas públicas (pré-renderização ou SSR) e `sitemap.xml`.
