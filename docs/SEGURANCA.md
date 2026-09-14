# Auditoria de segurança — Barbearia Leste

> Feita em **13/09/2026** em resposta a um relatório de uma ferramenta
> automatizada (Drael.sh). Método: **medir cada afirmação** com requisição real,
> separando achado confirmado de alarme (FUD). Tudo aqui é testado, não suposto.

## Resumo executivo

O relatório automatizado estava **mais para alarme que para perícia**: metade
dos "achados críticos" era arquitetura normal de Supabase. Mas o teste real
encontrou **dois vazamentos de leitura reais que a ferramenta não achou**, e um
defeito no webhook. Nenhum caminho de **invasão/escrita** ("tomar o app") existe.

---

## 🔴 CONFIRMADO — corrigir

### 1. Token do Mercado Pago vazava por leitura anônima  — **CORRIGIDO (código) + migration pronta**
A chave anon pública lia `business_config.mp_access_token`, `mp_refresh_token`,
`mp_public_key` via `GET /rest/v1/business_config`. O access token dá controle
sobre a conta de pagamento da barbearia. **É o achado mais grave.**
- Causa: o fluxo de agendamento lia o token com o cliente **anônimo**, obrigando
  a RLS a expor a coluna.
- Correção: token lido só via `service_role` (`agendar/actions.ts`) +
  migration `20260913000000_lockdown_mp_secrets.sql` (REVOKE das colunas).
- **Ordem de deploy:** código primeiro, SQL depois.

### 2. Lista de clientes (nome + telefone) vazava por leitura anônima  — **PENDENTE**
`GET /rest/v1/appointments` devolvia `client_name` + `client_phone` de todos os
agendamentos para um anônimo. É a lista de contatos inteira. `client_email` já
vem null.
- Fix desenhado: rotear as leituras de "minhas reservas" do visitante por
  `service_role` (a posse já é garantida pelo cookie assinado) e então travar a
  RLS de SELECT em `appointments`. Mexe no fluxo de visitante em produção →
  fazer como mudança própria, testada, **não** no fim de sessão.

### 3. Assinatura do webhook do Mercado Pago é validada mas o resultado é IGNORADO  — **PENDENTE (baixo-médio)**
`webhook-route.ts` chama `validateMercadoPagoWebhookSignature(...)` e **descarta
o booleano** — a checagem HMAC é código morto.
- **Mitigado por:** o webhook re-consulta o status real do pagamento na API do MP
  (`fetchPaymentStatus`), então não dá para forjar um "aprovado". Exploração
  prática é baixa.
- Fix: capturar o resultado e rejeitar (401) quando inválido. **Risco de deploy:**
  se o `MERCADOPAGO_WEBHOOK_SECRET` no Vercel não bater com o painel do MP, o
  hard-reject quebra confirmação de pagamento real. Confirmar o segredo antes.

## 🟡 CORRIGIDO nesta rodada

### 4. Faltavam cabeçalhos de segurança  — **CORRIGIDO** (`next.config.ts`)
Adicionados: `frame-ancestors 'self'` (anti-clickjacking — o único ponto
estrutural certo do relatório), `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy`, HSTS com `includeSubDomains`.
- **`script-src` NÃO foi restringido** de propósito: quebraria o SDK do Mercado
  Pago e os 2 scripts inline (PWA + service worker). Uma CSP de script exige
  nonce e é mudança testada à parte. **Item em aberto.**

---

## ✅ VERIFICADO e OK — não são vulnerabilidades (o relatório errou)

| Alegação da ferramenta | Teste real |
|---|---|
| `service_role` provavelmente no bundle | **0 ocorrências** nos bundles; só a anon (pública por design) |
| RLS frouxa "entrega tudo" | `profiles`, `financial_transactions`, `payment_intents`, `audit_log`, `queue_entries` → **0 linhas** para anônimo |
| **Escrita/"tomar o app"** | anon **UPDATE/DELETE/INSERT bloqueados** por RLS (medido no registro real: 0 linhas afetadas) |
| Token de sessão em `localStorage` → XSS permanente | App usa `@supabase/ssr` = **cookies**, não localStorage |
| Sem CSP → "XSS é o caminho óbvio" | Únicos `dangerouslySetInnerHTML` são strings estáticas; **nenhum ponto de injeção** com dado de usuário |
| `/rest/v1/openapi.json` enumera schema | **401** — não enumerável |
| Storage: upload/deface anônimo | Upload anon **bloqueado (403)** |
| Source maps `.js.map` publicados | **0** no build |
| Crons abertos | `CRON_SECRET` exigido — **401 ao vivo** sem o segredo |

## 🔵 BAIXA severidade (aceitável / monitorar)
- Bucket `logo` é listável por anônimo — mas só contém logos, nada sensível.
- Deployment ID exposto (`?dpl=`) — padrão da Vercel; deployments antigos ficam
  atrás da mesma RLS. Mitigar com Vercel Deployment Protection se desejado.

---

## Para o SaaS (multi-tenant) — regra herdada desta auditoria
**RLS por `establishment_id` em TODA tabela, e nenhuma coluna secreta legível por
`anon`/`authenticated`.** O vazamento do token aqui foi por um único ponto lendo
segredo com o cliente anônimo — no multi-tenant, um erro desses expõe a carteira
inteira. Segredos (tokens de pagamento) só via `service_role`, sempre.

---
---

# REVISÃO INDEPENDENTE — Opus 5 (13/09/2026)

Segunda auditoria, feita como **revisor independente** da anterior (Opus 4.8),
com autorização explícita do dono. Método: não presumir nada do relatório
anterior; re-testar tudo e seguir os fluxos completos
(browser → Server Action → Supabase → RLS → retorno).

## Veredito sobre a auditoria anterior

Ela estava **correta no que afirmou**, mas **incompleta**. Confirmei todos os
falsos positivos que ela derrubou e todos os achados que ela fez. Porém ela
**parou cedo demais**: classificou o vazamento de `appointments` como
"pendente" sem medir o alcance nem descobrir a causa, e **não encontrou um IDOR
independente** nas telas de resultado.

## 🔴 CONFIRMADO e CORRIGIDO nesta revisão

### 1. IDOR em `appointments` — 695 registros com nome e telefone
**Causa raiz (que faltava no relatório anterior):** a policy permitia ler linhas
com `client_id IS NULL`. Como **todo visitante tem `client_id` nulo**, cada
visitante enxergava as reservas de todos os outros.
**Medição:** anon via **695 de 1581** linhas — exatamente o conjunto
`client_id IS NULL`, e **0** das 886 de usuários logados.
**Exploração:** trivial. `GET /rest/v1/appointments` com a anon key pública.
**Dados afetados:** `client_name` + `client_phone` de 695 agendamentos.
**Correção:** todas as leituras legítimas migradas para `service_role` **com o
ownershipFilter na query** + migration `20260913010000` com policy
**RESTRICTIVE** (combina com AND, não exige remover as policies existentes).

### 2. IDOR nas telas de resultado — **achado novo, não estava no relatório anterior**
`/agendar/sucesso?id=` e `/agendar/pagamento/*` liam o agendamento **só pelo id
da URL**, com `select('*')` e **zero verificação de posse**. Quem tivesse o UUID
(link compartilhado, histórico, referrer) via nome, telefone e e-mail.
**Severidade:** média — UUID não é enumerável, mas não havia autorização alguma.
**Correção:** novo `src/lib/auth/appointment-access.ts` → `getOwnedAppointment()`
exige posse (client_id = auth.uid() **ou** id ∈ IDs assinados por HMAC).
**Validado em produção:** `GET /agendar/sucesso?id=<uuid real>` sem cookie →
não renderiza a tela e **não vaza nome nem telefone**.

### 3. Webhook do Mercado Pago — assinatura validada e resultado descartado
`webhook-route.ts` chamava o validador HMAC e **ignorava o booleano**.
**Mitigação que existia:** o fluxo re-consulta o pagamento real na API do MP
antes de mudar estado — por isso média, não crítica.
**Revisão da implementação antes de mexer:** manifesto conforme a spec do MP
(`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`), HMAC-SHA256,
`timingSafeEqual`, `data.id` normalizado. **Estava correta; só faltava usar.**
**Correção:** rejeita com **401** (não 200 — o MP reenvia em não-2xx, então
problema transitório não perde notificação legítima). 3 testes novos provam
que assinatura inválida → 401 **e zero efeito colateral** no banco.

## ✅ CONFIRMEI os falsos positivos do relatório anterior

Re-testados e mantidos: `service_role` fora dos bundles · sessão em **cookies**
(`@supabase/ssr`), não `localStorage` · sem source maps · sem ponto de XSS
(únicos `dangerouslySetInnerHTML` são strings estáticas) · escrita anônima
bloqueada · schema não enumerável (401) · upload anônimo no storage bloqueado.

## ✅ Superfícies que a auditoria anterior NÃO cobriu — todas limpas

| Verificação | Resultado |
|---|---|
| **Autorização vertical**: 60 Server Actions em `admin/actions.ts` | **60/60** com `requireAdmin()` — zero escalada |
| Demais 11 tabelas (products, push_subscriptions, profiles, ratings, reservations…) | anon vê **0** em todas as sensíveis; públicas por design só têm catálogo/horários |
| `NEXT_PUBLIC_*` | 5 variáveis, **todas genuinamente públicas** |
| Secrets privados em Client Components | **nenhum** — todos server-side |
| `/api/ops/notification-audit` | `CRON_SECRET` exigido — **401 ao vivo** |
| Webhook WhatsApp | `META_VERIFY_TOKEN` + 403 |
| Open redirect | nenhum `redirect()` com destino do usuário |
| SSRF | nenhum `fetch()` com URL de entrada do usuário |

## Arquivos alterados · testes · build

- `src/app/agendar/actions.ts` · `src/lib/auth/appointment-access.ts` (novo) ·
  `src/app/agendar/sucesso/page.tsx` · `src/app/agendar/pagamento/{sucesso,falha,pendente}/page.tsx` ·
  `src/app/reservas/page.tsx` · `src/lib/mercadopago/webhook-route.ts` (+ testes)
- Migrations: `20260913000000_lockdown_mp_secrets.sql`, `20260913010000_appointments_rls_lockdown.sql`
- **194 testes passando** (3 novos de regressão do webhook) · typecheck limpo ·
  build de produção OK · headers verificados ao vivo · 5 rotas respondendo 200

## ⚠️ PENDENTE — ação do dono (as duas migrations)

O código **já está no ar** e funciona com a RLS atual (usa `service_role`).
Rodar agora, nesta ordem, no SQL Editor:
1. `20260913000000_lockdown_mp_secrets.sql`
2. `20260913010000_appointments_rls_lockdown.sql`

Verificação esperada depois: `GET /rest/v1/appointments` com a anon key → **0
linhas** (hoje ainda retorna 695), e "Minhas Reservas" + painel continuam
funcionando.

## Riscos remanescentes (aceitos, documentados)

- **CSP sem `script-src`.** Endurecer exige nonce por request e testar o SDK do
  Mercado Pago. Não foi feito no escuro, de propósito. Item futuro.
- **Cookies de sessão legíveis por JS** (característica do `@supabase/ssr`).
  Só vira risco se surgir um XSS — hoje não há sink com dado de usuário.
- **Bucket `logo` listável** — só contém logos.
- **Deployment ID exposto** — padrão Vercel; deployments antigos ficam atrás da
  mesma RLS. Mitigar com Vercel Deployment Protection se desejado.

## Parecer sobre continuar em produção

**Sim — com a ressalva de rodar as duas migrations.**

Com o código já publicado, os dois IDORs estão fechados na fronteira correta
(servidor) e o webhook rejeita assinatura inválida. **Enquanto as migrations não
rodarem, o vazamento de leitura de `appointments` continua aberto pela API
direta** — o app não expõe mais, mas o PostgREST sim. Não é motivo para tirar do
ar; é motivo para rodar o SQL hoje.

Não afirmo que o sistema é "seguro" em absoluto — afirmo que os caminhos que
testei estão fechados e que não encontrei via de escrita, escalada de privilégio
ou tomada de conta.

---

# ADENDO — segunda rodada de validação (13/09/2026)

## ✅ `appointments` — RLS validada no banco

Teste do dono (`SET LOCAL ROLE anon; SELECT count(*) FROM appointments`) →
**0 linhas**. Confirmado também por REST: `content-range: */0`.

**Combinação de policies analisada e aprovada.** Existem duas PERMISSIVE
(incluindo uma com `client_id IS NULL`, que era a origem do vazamento) e a nova
`appointments_restrict_select_owner` RESTRICTIVE. Como RESTRICTIVE combina por
**AND**, ela anula o efeito do `client_id IS NULL` das permissivas — o resultado
final é correto **sem** precisar remover as antigas.

> Observação: a policy permissiva `"Usuario ve agendamentos"` ainda contém
> `OR client_id IS NULL`. Hoje é inofensiva (a RESTRICTIVE prevalece), mas é uma
> armadilha: se alguém remover a RESTRICTIVE no futuro, o vazamento volta.
> **Recomendação:** limpar essa cláusula numa janela tranquila. Não fiz agora
> para não mexer em policy existente sem necessidade.

### Regressões funcionais — verificadas
Nenhum fluxo legítimo dependia de SELECT anônimo direto:

| Fluxo | Como acessa hoje |
|---|---|
| Disponibilidade de horários | `service_role` (`adminForSlots`) — só lê horário/status, **sem PII** |
| Criação de agendamento | `service_role` (`apptDb`) |
| Prevenção de double booking | índice único + trigger no **banco** (independe de RLS) |
| Limites diários / multi-dia | `service_role` — se ficasse no anon, fechar a RLS viraria **bypass do limite** |
| "Minhas Reservas" visitante | `service_role` + ownershipFilter (IDs assinados HMAC) |
| "Minhas Reservas" logado | idem, via `client_id` |
| Telas de sucesso/pagamento | `getOwnedAppointment()` — exige posse |
| Cancelamento | `service_role` + ownershipFilter |
| Painel do barbeiro/admin | `requireAdmin()` + `is_admin()` na policy |
| Crons e webhooks | `service_role` |

Produção: `/`, `/agendar`, `/reservas`, `/admin`, `/loja` → **HTTP 200, sem erro**.

## 🔴 CRÍTICO NOVO — tokens do MP no HTML **público** de `/agendar`

**O achado mais grave de toda a auditoria. Nenhuma rodada anterior encontrou.**

`/agendar/page.tsx` fazia `select('*')` em `business_config` e passava o objeto
como prop para `<BookingForm>`, que é **Client Component**. O Next serializa
props de Client Component no payload RSC → **`mp_access_token` e
`mp_refresh_token` saíam no HTML de toda visita**. Não exigia nem a anon key:
bastava ver o código-fonte da página.

- **Confirmado em produção antes:** ambos presentes no HTML.
- **Confirmado em produção depois:** ambos **ausentes**, página renderizando
  normal (54.462 bytes).
- **Correção:** `src/lib/supabase/public-config-columns.ts` com as **41 colunas
  públicas derivadas do schema real** (não inventadas), usada em `/agendar` e
  `/admin`. O painel admin passou a receber um booleano `mpConnected` derivado
  no servidor em vez do token. 4 testes de regressão quebram se um segredo
  entrar na lista.

## ⚠️ Por que o primeiro REVOKE de colunas não funcionou

Diagnóstico do dono: `has_column_privilege` → **TRUE** para os 3 segredos.

**Causa:** no PostgreSQL, `GRANT SELECT` na **tabela** implica SELECT em todas as
colunas, e um `REVOKE SELECT (coluna)` **não subtrai** de um grant de tabela. O
REVOKE anterior foi, na prática, um **no-op**.

**Solução correta (privilégio mínimo):** remover o SELECT de tabela de
`anon`/`authenticated` e conceder SELECT **apenas nas 41 colunas públicas**.
Só pôde ser aplicada depois da correção de código acima — antes, `select('*')`
teria passado a falhar.
