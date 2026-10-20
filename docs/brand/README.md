# TicketFlow — identidade visual e capas

## 1. Identidade atual

- **Marca:** quadrado vermelho (`#ec3013`) + wordmark `ticketflow` em minúsculas, Archivo 800, tracking negativo.
- **Paleta:** fundo `#f3f2f2`, texto `#201e1d`, accent `#ec3013`, accent-2 `#e15b47` e neutros quentes (`src/styles/tokens.css`).
- **Nesta etapa** a marca **não foi trocada**. O quadrado só ganhou cantos suaves (`rx 3.5`), para acompanhar o novo design system, no `LogoMark` e no `public/favicon.svg`.

## 2. Direção proposta

A marca combina **ingresso** (picote, canhoto, furos), **movimento/fluxo** (inclinação para a frente, rastros, traço contínuo) e **facilidade** (formas simples e arredondadas que funcionam em 16px). Os três conceitos mantêm o wordmark e a paleta. Muda só o símbolo.

| Conceito | Folha | Ideia | Pontos fortes | Riscos |
|---|---|---|---|---|
| **A · Ingresso em movimento** *(recomendado)* | [`concept-a.svg`](concept-a.svg) | O quadrado atual vira um ingresso inclinado, com picote e rastro de movimento | É continuidade direta da marca atual, fala "ingresso" sem precisar de texto e continua legível em 16px | Os rastros somem no favicon (o ingresso continua lá) |
| **B · Monograma contínuo** | [`concept-b.svg`](concept-b.svg) | Um traço só forma o "tf" | É o mais forte como ícone de app e funciona bem em monocromático | Não remete a ingresso, e monogramas são comuns |
| **C · Passagem** | [`concept-c.svg`](concept-c.svg) | Três faixas passando pela "catraca" | Comunica bem movimento e velocidade | Perde detalhe em 16px e parece genérico sem o wordmark |

Cada folha mostra o logo horizontal (fundo claro e escuro, com o selo "ORG" do painel), o ícone em 96/64/32/16 px, o ícone de app e as versões monocromáticas. Os arquivos `concept-*-mark.svg` trazem só o símbolo, num quadro de 64×64.

## 3. Como aplicar o conceito escolhido

Tudo passa por um único arquivo, `src/components/ui/Logo.tsx`:

1. Troque o conteúdo do `<svg>` de `LogoMark` pelo de `concept-X-mark.svg`, usando `viewBox="0 0 64 64"` e `currentColor` no lugar de `#ec3013`. Use a cor do fundo nos recortes.
2. Exporte o mesmo símbolo em `public/favicon.svg` (o símbolo já foi testado em 16px na folha do conceito).
3. Opcional: gere `apple-touch-icon.png` (180×180) a partir do "ícone de app" da folha e declare-o em `index.html`.

Os pontos de aplicação já usam esses componentes:

| Onde | Componente |
|---|---|
| Header público (desktop e mobile), checkout, rodapé | `<Logo />` |
| Painel do organizador (sidebar e drawer) | `<Logo badge="Org" />` · sidebar recolhida: `<LogoMark />` |
| Telas de acesso (fundo escuro) | `<Logo tone="inverse" />` |
| Favicon | `public/favicon.svg` |

## 4. Capas dos eventos

**Contrato:** o campo `coverUrl` (`string | null`) já existe em `EventSummary`, `EventDetail` e no `EventSales` da venda, e vem da coluna `events.cover_url`. Nada mudou na API nem no banco.

**Componente:** `src/components/domain/EventImage.tsx`

- Proporções padronizadas: `card` 4:3, `wide` 16:9, `square` e `fill` (o pai define a altura: hero e banner do detalhe).
- Skeleton enquanto a imagem carrega, depois fade-in. `object-fit: cover`, `loading="lazy"` e `decoding="async"`. Com `priority` (hero e capa do detalhe), a imagem carrega na hora com `fetchpriority="high"`.
- **Fallback** quando `coverUrl` é `null` ou a imagem falha (404, rede): gradiente e ícone da categoria, montados só com cores da paleta (`categoryVisuals.ts`).
- **Texto alternativo:** vazio nos cards, porque o título já está ao lado e o leitor de tela não deve repeti-lo. No hero e no detalhe é `Capa do evento <título>`, e o fallback recebe `role="img"` com o mesmo texto.
- Aceita `srcSet`/`sizes` para quando o backend ou a CDN passarem a servir variantes.

**Capas temporárias:** `public/images/events/<categoria>.svg` são composições abstratas locais (palco, circuito, campo, cortina, pratos, gráfico). Nos mocks, os destaques e um em cada três eventos usam essas capas, e os demais ficam sem capa para exercitar o fallback. Com a API real, `coverUrl` hoje vem `null`, então aparece o fallback.

**Especificação para as capas definitivas**

- Original em **1600×1000 (16:10)**, com o assunto principal na faixa central. Os cortes 4:3 (cards) e 16:9 (detalhe) aproveitam o centro.
- WebP ou AVIF de até ~250 KB, mais uma variante de 800 px para mobile (`srcSet`).
- Nada de texto essencial dentro da imagem: título e data já vêm sobrepostos pela interface.

**Geração assistida:** nesta sessão existe uma ferramenta de geração de imagens via conector Figma (`generate_image`). Fluxo sugerido: gere uma capa por evento a partir de um prompt com categoria, clima, paleta (vermelho `#ec3013`, grafite `#201e1d`) e proporção 16:10. Revise e aprove manualmente, envie ao storage/CDN e grave a URL em `cover_url`, pelo painel quando o upload existir ou pelo seeder em desenvolvimento. Nenhuma imagem gerada por IA foi incluída no repositório.
