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
