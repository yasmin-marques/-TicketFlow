
# TicketFlow — Contratos da API

Documentação dos contratos de comunicação entre o frontend React e o backend Spring Boot do TicketFlow.

Este documento descreve os principais endpoints, formatos de dados, regras de negócio, mecanismos de segurança e comportamentos esperados da API.

## 1. Visão geral

A API fornece os serviços necessários para descoberta de eventos, autenticação, reservas, compra de ingressos, pagamentos, emissão de ingressos digitais e gerenciamento de eventos por organizadores.

### Tecnologias relacionadas

- **Frontend:** React, TypeScript, Vite, Axios e TanStack Query.
- **Backend:** Java 21 e Spring Boot.
- **Persistência:** PostgreSQL.
- **Cache e coordenação:** Redis.
- **Mensageria:** Apache Kafka.
- **Comunicação em tempo real:** Server-Sent Events (SSE).

### Endereço da API

No ambiente de desenvolvimento:

```text
http://localhost:8080/api
```

O frontend utiliza `VITE_API_URL` para definir a URL-base e `VITE_USE_MOCKS` para selecionar entre a API real e os serviços simulados.

```dotenv
VITE_API_URL=http://localhost:8080/api
VITE_USE_MOCKS=false
```

Os exemplos de endpoints deste documento omitem o prefixo `/api`, salvo quando explicitamente indicado.

## 2. Convenções gerais

### Formato das requisições

- Requisições e respostas utilizam JSON, salvo endpoints específicos.
- Requisições protegidas utilizam `Authorization: Bearer <accessToken>`.
- Operações que exigem idempotência utilizam `Idempotency-Key`.
- O identificador de uma organização pode ser informado por `X-Organization-Id`, quando aplicável.

### Datas e valores monetários

- Datas e horários são representados em ISO 8601, com offset de fuso horário.
- Datas de filtros e lotes utilizam `YYYY-MM-DD`, conforme o endpoint.
- Valores monetários são apresentados em reais na API e armazenados em centavos no banco de dados.

### Formato de erro

Os erros seguem uma estrutura comum, que pode incluir informações adicionais conforme a operação.

```json
{
  "status": 409,
  "code": "SEAT_UNAVAILABLE",
  "message": "O assento selecionado não está mais disponível."
}
```

Erros de validação podem incluir um campo `errors` com detalhes dos campos inválidos.

### Principais códigos HTTP

| Código | Significado |
|---|---|
| `200` | Operação concluída. |
| `201` | Recurso criado. |
| `204` | Operação concluída sem conteúdo de resposta. |
| `400` | Requisição ou parâmetro inválido. |
| `401` | Ausência ou invalidade de autenticação. |
| `403` | Usuário autenticado sem permissão. |
| `404` | Recurso inexistente ou inacessível. |
| `409` | Conflito de estado ou concorrência. |
| `410` | Recurso ou reserva expirados. |
| `422` | Dados inválidos ou regra de negócio não atendida. |
| `429` | Limite de requisições excedido. |
| `500` | Erro interno. |
| `502` | Falha em integração externa, quando aplicável. |
| `503` | Serviço temporariamente indisponível. |

## 3. Autenticação e conta

### Endpoints de autenticação

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/auth/register` | Cadastro de usuário. |
| `POST` | `/auth/login` | Autenticação. |
| `POST` | `/auth/refresh` | Renovação da sessão. |
| `POST` | `/auth/logout` | Encerramento da sessão. |
| `POST` | `/auth/forgot-password` | Solicitação de recuperação de senha. |
| `POST` | `/auth/reset-password` | Redefinição de senha. |

### Sessão

A resposta de autenticação contém os dados do usuário, o token de acesso e o horário de expiração.

```json
{
  "user": {
    "id": "uuid",
    "name": "Nome do usuário",
    "email": "usuario@exemplo.com",
    "role": "USER"
  },
  "accessToken": "...",
  "accessExpiresAt": "2026-10-20T15:00:00-03:00"
}
```

O exemplo é ilustrativo. Os valores são preenchidos pelo servidor.

O refresh token é enviado por cookie `HttpOnly`, não pelo corpo da resposta. O frontend deve utilizar `withCredentials` nas requisições que dependem desse cookie.

O token de acesso tem duração limitada. Quando expira, o cliente tenta renovar a sessão e repetir a requisição original uma vez.

### Papéis de usuário

- `USER`: comprador.
- `ORGANIZER`: usuário com acesso à área de organização.
- `ADMIN`: administrador.

A autorização efetiva é responsabilidade do backend. Ocultar uma página no frontend não substitui a validação de permissões na API.

### Conta do comprador

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/me` | Consulta o perfil. |
| `PATCH` | `/me` | Atualiza os dados pessoais e preferências. |
| `GET` | `/me/cards` | Consulta cartões salvos. |
| `POST` | `/me/cards` | Solicita o cadastro de cartão. |
| `DELETE` | `/me/cards/{id}` | Solicita a remoção de cartão. |

**Limitação:** o cofre de cartões não está integrado. A consulta retorna uma lista vazia e o cadastro responde com `503 CARD_VAULT_UNAVAILABLE`. A remoção não está disponível na implementação atual.

## 4. Catálogo e descoberta de eventos

### Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/events` | Lista eventos com filtros e paginação. |
| `GET` | `/events/featured` | Eventos em destaque. |
| `GET` | `/events/upcoming` | Próximos eventos. |
| `GET` | `/events/suggest` | Sugestões de busca. |
| `GET` | `/events/{slug}` | Detalhes de um evento. |
| `GET` | `/events/{slug}/related` | Eventos relacionados. |
| `GET` | `/categories` | Lista de categorias. |

A listagem pode receber parâmetros como:

`q`, `city`, `from`, `to`, `categories`, `minPrice`, `maxPrice`, `when`, `seatMapOnly`, `sort`, `page` e `pageSize`.

### Regras de catálogo

- Apenas eventos publicados e ainda não encerrados ficam disponíveis publicamente.
- Eventos em rascunho ou encerrados não aparecem no catálogo.
- Eventos esgotados podem continuar visíveis, identificados pelo estado correspondente.
- A paginação utiliza páginas iniciadas em `1`, com tamanho padrão de `12` e máximo de `100`.
- Os preços dos filtros são informados em reais.
- Datas e horários seguem o fuso e os formatos definidos pelo contrato.
- O campo `coverUrl` permanece nulo na implementação atual, pois o upload definitivo de imagens não está integrado.

## 5. Lotes, assentos e disponibilidade

### Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/events/{slug}/sales` | Consulta lotes, preços, estoque e mapa de assentos. |
| `GET` | `/events/{eventId}/seats` | Consulta disponibilidade dos assentos. |
| `GET` | `/events/{eventId}/seats/stream` | Recebe atualizações em tempo real. |
| `POST` | `/events/{eventId}/ticket-types/{typeId}/waitlist` | Inscrição na lista de espera. |

### Estados de disponibilidade

Os lotes podem estar abertos, esgotados ou aguardando abertura. A disponibilidade considera unidades vendidas e reservadas.

Os assentos utilizam estados como:

- `available`: disponível.
- `reserved`: reservado.
- `sold`: vendido ou indisponível para seleção.

Os assentos da reserva ativa do próprio comprador não são apresentados como ocupados para ele.

### Atualizações em tempo real

O endpoint de SSE transmite eventos de disponibilidade, como:

```text
event: seat.updated
data: {"seatId":"B03","status":"reserved"}
```

O frontend deve atualizar o cache de disponibilidade a partir desses eventos. O estado persistido no banco, consultado pela API, continua sendo a fonte de verdade.

O stream aceita `access_token` na query para identificar o usuário e evitar que ele receba suas próprias atualizações. Tokens inválidos ou expirados podem resultar em `401`.

## 6. Reservas

### Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/reservations` | Cria uma reserva. |
| `GET` | `/reservations/{id}` | Consulta uma reserva. |
| `PUT` | `/reservations/{id}/items/{ticketTypeId}/seats` | Substitui os assentos selecionados. |
| `DELETE` | `/reservations/{id}` | Libera a reserva. |

### Criação de reserva

A criação exige autenticação e o cabeçalho `Idempotency-Key`.

Exemplo de requisição:

```json
{
  "eventId": "uuid-do-evento",
  "items": [
    {
      "ticketTypeId": "premium",
      "quantity": 2,
      "seatIds": ["B03", "B04"]
    }
  ]
}
```

A resposta contém o identificador, os itens, os valores e os horários da reserva.

### Regras de negócio

- O prazo padrão da reserva é de 10 minutos.
- `expiresAt` é a referência para o contador regressivo.
- A atualização de assentos não renova o prazo.
- Criar uma nova reserva libera a reserva ativa anterior do mesmo usuário.
- A seleção de assentos e a retenção de estoque são tratadas atomicamente pelo backend.
- Reservas de outros usuários não devem revelar a existência do recurso.
- A mesma operação idempotente não pode produzir reservas duplicadas.

### Erros relevantes

| Código | Significado |
|---|---|
| `409 SEAT_UNAVAILABLE` | Assento perdido em uma disputa. |
| `409 INSUFFICIENT_STOCK` | Estoque insuficiente. |
| `409 LOT_CLOSED` | Lote indisponível para venda. |
| `410 RESERVATION_EXPIRED` | Reserva expirada. |
| `422 LIMIT_EXCEEDED` | Limite de ingressos excedido. |
| `422 VALIDATION_ERROR` | Dados inválidos. |
| `422 IDEMPOTENCY_KEY_REQUIRED` | Chave obrigatória ausente. |
| `409 REQUEST_IN_PROGRESS` | Operação idempotente ainda em processamento. |

## 7. Pedidos e pagamentos

### Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/orders` | Cria um pedido a partir de uma reserva. |
| `GET` | `/orders` | Lista os pedidos do comprador. |
| `GET` | `/orders/{id}` | Consulta um pedido. |
| `POST` | `/orders/{id}/cancel` | Solicita cancelamento ou reembolso. |

A criação do pedido exige autenticação e `Idempotency-Key`.

### Métodos de pagamento

- Cartão.
- Pix.
- Boleto.

O corpo da requisição inclui a reserva, os dados do comprador, os titulares dos ingressos e o método de pagamento.

Para cartão, a API real aceita um token de pagamento, e não o número do cartão ou CVV.

Exemplo:

```json
{
  "reservationId": "uuid-da-reserva",
  "buyer": {
    "name": "Nome do comprador",
    "email": "comprador@exemplo.com"
  },
  "holders": [],
  "payment": {
    "method": "card",
    "card": {
      "token": "tok_4242",
      "installments": 1
    }
  }
}
```

Os campos obrigatórios completos devem seguir os tipos e as validações implementados no backend.

### Estados do pedido

- `paid`: pagamento confirmado.
- `pending`: aguardando confirmação.
- `refunded`: reembolsado.
- `expired`: expirado.

Um pagamento recusado pode responder com `402 PAYMENT_DECLINED`, sem criar um pedido e sem encerrar a reserva ativa.

Pix e boleto permanecem pendentes até a confirmação. Os ingressos só são emitidos depois que o pagamento é confirmado.

### Pagamento sandbox

Nos perfis `dev` e `test`, existe um provedor de pagamento simulado, sem cobrança financeira real.

- O token `tok_4242` permite simular aprovação.
- O token `tok_0002` permite simular recusa.
- Outros tokens não são aprovados.

Em ambientes sem provedor configurado, a API responde com `503 PAYMENT_PROVIDER_UNAVAILABLE`, em vez de simular uma cobrança bem-sucedida.

### Cancelamento e reembolso

O cancelamento depende do estado do pedido, do prazo aplicável e da validade dos ingressos.

A API pode responder com `422 REFUND_NOT_ALLOWED` quando as condições não forem atendidas. O reembolso pelo painel do organizador segue regras próprias, descritas na seção correspondente.

## 8. Webhooks de pagamento

O endpoint público para recebimento de notificações de pagamento é:

`POST /webhooks/payments/{provider}`

As notificações utilizam assinatura HMAC-SHA256, com o segredo configurado no backend, timestamp e proteção contra repetição.

O servidor valida a assinatura antes de processar o evento. Eventos duplicados não devem repetir os efeitos financeiros ou a emissão de ingressos.

A confirmação de um pagamento após a expiração do pedido não deve emitir ingressos para uma compra encerrada.

A disponibilidade do webhook depende da configuração do provedor e dos segredos do ambiente.

## 9. Ingressos digitais

### Endpoints

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/tickets` | Lista os ingressos do comprador. |
| `GET` | `/tickets/{id}` | Consulta um ingresso. |
| `POST` | `/tickets/{id}/transfer` | Transfere um ingresso para outro destinatário. |

### QR Code

O ingresso contém um payload de QR Code assinado pelo backend.

A assinatura e a versão do QR são verificadas no servidor. Uma transferência invalida o código anterior.

A emissão acontece somente após a confirmação do pagamento.

Estados relevantes do ingresso:

- `valid`: válido.
- `used`: utilizado.
- `cancelled`: cancelado.

O frontend exibe o QR Code e os dados fornecidos pela API, mas não é responsável por garantir a autenticidade do ingresso.

## 10. Painel do organizador

As rotas administrativas exigem autenticação, vínculo com uma organização e autorização para a operação solicitada.

### Dashboard e relatórios

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/org/dashboard` | Indicadores e desempenho dos eventos. |
| `GET` | `/org/reports` | Relatórios de vendas, receita e ocupação. |
| `GET` | `/org/search` | Busca global no painel. |
| `GET` | `/org/notifications` | Consulta notificações. |
| `POST` | `/org/notifications/read` | Marca notificações como lidas. |

O dashboard oferece indicadores de receita, ingressos vendidos, ocupação, check-ins e desempenho por período.

Os relatórios apresentam vendas por lote, ocupação por setor e métricas de conversão. A conversão real considera reservas criadas e pedidos pagos, não visitas ao site.

### Eventos

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/org/events` | Lista eventos da organização. |
| `GET` | `/org/events/slug-available` | Verifica disponibilidade de slug. |
| `POST` | `/org/events` | Cria um rascunho. |
| `GET` | `/org/events/{id}` | Consulta os detalhes administrativos. |
| `PATCH` | `/org/events/{id}` | Atualiza um evento. |
| `POST` | `/org/events/{id}/publish` | Publica um evento. |
| `POST` | `/org/events/{id}/unpublish` | Retorna um evento a rascunho. |
| `POST` | `/org/events/{id}/cancel` | Cancela um evento. |
| `DELETE` | `/org/events/{id}` | Exclui um rascunho elegível. |
| `PUT` | `/org/events/{id}/seat-map` | Atualiza o mapa de assentos. |

A publicação exige informações válidas do evento, período de realização, local, lotes e, quando aplicável, um mapa de assentos consistente.

Eventos com vendas ou reservas possuem restrições adicionais para edição, despublicação e exclusão.

### Lotes

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/org/events/{id}/lots` | Lista os lotes. |
| `POST` | `/org/events/{id}/lots` | Cria um lote. |
| `PATCH` | `/org/lots/{id}` | Atualiza um lote. |
| `DELETE` | `/org/lots/{id}` | Exclui um lote elegível. |

O backend valida preços, quantidades, períodos de venda e consistência com os ingressos já vendidos ou reservados.

### Pedidos e participantes

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/org/orders` | Lista e filtra pedidos. |
| `GET` | `/org/orders/{id}` | Consulta um pedido. |
| `POST` | `/org/orders/{id}/refund` | Solicita reembolso. |
| `GET` | `/org/attendees` | Lista participantes. |
| `POST` | `/org/attendees/{ticketId}/checkin` | Registra check-in manual. |
| `DELETE` | `/org/attendees/{ticketId}/checkin` | Desfaz um check-in permitido. |
| `GET` | `/org/events/{id}/checkin` | Consulta estatísticas da portaria. |
| `POST` | `/org/events/{id}/checkin` | Valida um ingresso e registra a entrada. |

O check-in é validado pelo servidor e registrado atomicamente, impedindo que duas leituras simultâneas utilizem o mesmo ingresso com sucesso.

Resultados possíveis do scanner:

- `valid`: entrada registrada.
- `used`: ingresso já utilizado.
- `invalid`: ingresso inválido, cancelado ou incompatível com o evento.

### Configurações, equipe e webhooks

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/org/settings` | Consulta configurações da organização. |
| `PATCH` | `/org/settings` | Atualiza configurações autorizadas. |
| `POST` | `/org/members` | Adiciona um membro existente. |
| `DELETE` | `/org/members/{userId}` | Remove um membro. |
| `POST` | `/org/webhooks` | Cadastra um webhook. |
| `PATCH` | `/org/webhooks/{id}` | Atualiza um webhook. |
| `DELETE` | `/org/webhooks/{id}` | Remove um webhook. |

O acesso é definido pelo vínculo com a organização e pelas permissões do membro, como `OWNER`, `MANAGER` e `CHECKIN`.

Recursos pertencentes a outras organizações não devem ser expostos. Dependendo da operação, a API retorna `404` ou `403`.

**Limitação:** os webhooks cadastrados pelo organizador ainda não possuem entrega efetiva das notificações externas.

## 11. Idempotência e concorrência

Operações críticas de reserva e compra utilizam `Idempotency-Key` para impedir efeitos duplicados causados por repetição de requisições.

A chave deve ser reutilizada quando uma operação precisa ser repetida por falha de rede. Uma nova chave representa uma nova intenção de operação.

O backend mantém o controle das operações idempotentes e utiliza transações e mecanismos de concorrência para proteger o estoque, os assentos e a criação de pedidos.

Conflitos de concorrência podem resultar em `409`. O cliente deve interpretar o código retornado, atualizar os dados relevantes e orientar o usuário sem presumir que a operação foi concluída.

## 12. Segurança e operação

O backend inclui mecanismos de segurança para os principais fluxos:

- Autenticação com tokens de acesso e refresh token em cookie `HttpOnly`.
- Autorização por papel e vínculo com organização.
- Proteção contra repetição de operações idempotentes.
- Limitação de requisições por IP e proteção contra tentativas repetidas de login.
- Validação de dados de entrada.
- Proteção dos dados de pagamento.
- Assinatura de QR Codes e webhooks.
- Registro de auditoria de operações administrativas.
- Identificação de requisições por `X-Request-Id`.
- Configuração de CORS e cabeçalhos de segurança.

Os limites e comportamentos específicos podem variar conforme o perfil e as variáveis de ambiente.

## 13. Limitações conhecidas

As seguintes limitações devem ser consideradas ao evoluir a integração:

- O upload definitivo e o armazenamento de capas de eventos ainda não estão integrados.
- O cofre de cartões salvos não está disponível.
- Os webhooks do organizador são cadastrados, mas ainda não realizam entregas.
- O pagamento disponível para testes utiliza um provedor sandbox; não representa cobrança real.
- A leitura de QR Code pela câmera depende do suporte do navegador, podendo ser substituída por entrada manual.
- Algumas regras e dados de demonstração diferem do comportamento esperado em produção.

O modo de mocks do frontend é destinado ao desenvolvimento e não garante concorrência, segurança, persistência compartilhada ou processamento financeiro real.

## 14. Documentação relacionada

- [`README.md`](../README.md) — visão geral do projeto.
- [`backend/README.md`](../backend/README.md) — arquitetura, execução e configuração do backend.
- [`FRONTEND_STATUS.md`](../FRONTEND_STATUS.md) — funcionalidades e estado do frontend.

Para alterações nos contratos, mantenha os tipos TypeScript, os serviços do frontend e os endpoints do backend consistentes. Mudanças incompatíveis devem ser documentadas e validadas nos fluxos afetados.