# Epic 3 — Ecossistema WhatsApp
### Leste Barbearia — Documento de Especificação Completo

**Versão:** 2.0 — 19 de abril de 2026  
**Status:** Planejado — aguardando implementação  
**Revisão v2.0:** Mensagens pré-preenchidas melhoradas · Página de Confirmação Interativa `/agendamento/[hash]` · Cobertura completa US/CA/RN (US-WA01 a US-WA08)

---

## 1. Visão e Princípios

O WhatsApp é o segundo canal de autoatendimento do app. Ele não é um canal paralelo — é o **mesmo sistema** acessado pelo celular do cliente via WhatsApp. Mesmos dados, mesma engine de agendamentos, mesmas regras de negócio.

### Princípios inegociáveis

| Princípio | Descrição |
|---|---|
| **Zero-cost** | Nunca usar Templates pagos da Meta. Só mensagens `text` e `interactive` dentro da janela gratuita de 24h. |
| **Single source of truth** | O bot **importa e chama** `calculateAvailableSlots` do frontend. Sem lógica duplicada. |
| **Total integração** | Agendamentos criados pelo bot entram na mesma tabela `appointments`. Nenhum sistema separado. |
| **Serverless-first** | Tudo via Next.js + Vercel. Proibido sugerir servidores paralelos, VPS, Docker, Evolution API, Baileys ou qualquer serviço com custo fixo de infra. |
| **Meta Cloud API oficial** | Única solução. Webhook via `POST` na rota existente do app. |

---

## 2. Arquitetura de Canais

```
CLIENTE
  │
  ├─ App Web (/agendar) ─────────────── Fluxo existente (não muda)
  │
  └─ WhatsApp (Meta Cloud API)
        │
        └─ Webhook POST /api/webhooks/whatsapp
              │
              ├─ GET: Verificação do hub Meta (existente e não muda)
              │
              └─ POST: BotController.handleMessage()
                    │
                    ├─ wa_sessions (Supabase) ─── estado da conversa
                    ├─ appointments (Supabase) ── mesma tabela do app
                    ├─ services (Supabase) ─────── mesmos serviços
                    ├─ business_config (Supabase) ─ mesmas configs
                    ├─ calculateAvailableSlots ── mesma engine
                    └─ createPaymentPreference ── mesma integração MP
```

### Estratégia Dual-Number

- **Número do Bot** (novo): configurado no campo `whatsapp_number` do `business_config`. Recebe todos os clientes. O bot responde nesse número.
- **Número pessoal do barbeiro (China)**: permanece no celular dele para atendimento humano. O bot envia o link `wa.me` para esse número quando o cliente pede "Falar com o China".

---

## 3. Custo Zero — Como Funciona

A Meta cobra por mensagem quando o bot **inicia** uma conversa (template). Dentro de uma janela de **24 horas** após o cliente enviar a última mensagem, o bot responde livremente sem custo.

```
DIAGRAMA DE CUSTO

Cliente envia "Oi"      ← Abre janela 24h gratuita
   Bot responde         ← GRATUITO (dentro da janela)
   Bot responde         ← GRATUITO
   Bot envia lembrete   ← GRATUITO (se dentro de 24h)
   ---24h sem resposta---
   Bot envia template   ← PAGO ❌ BLOQUEADO pelo kill-switch
```

**Kill-switch do cron (já implementado):** O cron de lembretes verifica `last_wa_interaction <= 24h` antes de enviar. Se fora da janela, aborta silenciosamente.

**Para agendamentos com mais de 24h de antecedência:** A estratégia de lembrete é o **Google/Apple Calendar**. O cliente adiciona o compromisso ao calendário dele com 1 clique na mensagem de confirmação do bot. O próprio calendário nativo do celular faz o lembrete — sem custo.

---

## 4. Tabela wa_sessions — Máquina de Estados

O webhook é **stateless** por natureza. A tabela `wa_sessions` persiste o estado da conversa entre requisições.

```sql
-- Arquivo: supabase/migrations/20260419200000_wa_sessions.sql
CREATE TABLE public.wa_sessions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number   TEXT NOT NULL UNIQUE,  -- "5511999990000" (com DDI)
  current_step   TEXT NOT NULL DEFAULT 'MAIN_MENU',
  temp_data      JSONB DEFAULT '{}'::jsonb,
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_wa_sessions_phone ON public.wa_sessions(phone_number);

ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;
-- Bloqueia acesso anon/auth — só service_role (adminClient) acessa
CREATE POLICY "deny_all" ON public.wa_sessions FOR ALL TO public USING (false);
```

**temp_data** — dados temporários entre etapas da conversa:
```json
{
  "service_id": "uuid",
  "service_name": "Corte + Barba",
  "price": 55.00,
  "duration_minutes": 60,
  "date": "2026-04-25",
  "time": "10:00",
  "appt_id_to_cancel": "uuid"
}
```

---

## 5. Regras de Negócio

| ID | Regra |
|---|---|
| **RN30** | **Timeout de sessão:** Se `updated_at` > 15 minutos, reseta para `MAIN_MENU` na próxima interação. |
| **RN31** | **Fallback de input inválido:** Se o bot espera clique em botão/lista e o cliente digita texto livre, reenvia o fallback e a última mensagem com opções. |
| **RN32** | **Double-check de concorrência:** No momento do CHECKOUT, chama `calculateAvailableSlots` novamente. Se o slot foi ocupado, aborta o INSERT e notifica o cliente. |
| **RN33** | **Human Handoff (silenciamento):** Quando `current_step = 'HUMAN_HANDOFF'`, o bot não processa nenhuma mensagem. Desbloqueia somente com `#menu`. |
| **RN34** | **Kill-switch financeiro do cron:** Lembretes WA via cron só disparados se `last_wa_interaction <= 24h`. Fora da janela: silêncio. |
| **RN35** | **Tolerância sempre visível:** O aviso de tolerância de 10 minutos é enviado **sempre** na confirmação do bot, independente do toggle `show_tolerance_modal`. |
| **RN36** | **Cancelamento com validação:** O bot respeita `cancellation_window_minutes` do `business_config`. Se fora do prazo, informa e não cancela. |
| **RN37** | **Busca por agendamento:** O bot busca agendamentos pelo número do remetente nos campos `appointments.client_phone` E `profiles.phone` (usuários com conta). |
| **RN38** | **Calendar para >24h:** Todo agendamento confirmado (independente da data) recebe links de Google Calendar e Apple ICS na mensagem de confirmação. |
| **RN39** | **Hash como autenticação pública:** A página `/agendamento/[hash]` é acessível sem login. O `wa_hash` funciona como token de acesso único para o agendamento específico. Não expõe dados de outros clientes. |
| **RN40** | **Cancelamento via página pública:** O cancelamento em `/agendamento/[hash]` aplica `cancellation_window_minutes` idêntico ao app e ao bot. Sem bypass de prazo. Server action valida que `wa_hash` corresponde ao `id` do agendamento. |
| **RN41** | **Link do admin é ação manual:** O painel apenas pré-preenche a mensagem no WA do admin. Nenhuma mensagem é enviada automaticamente — o admin controla quando e se envia. |
| **RN42** | **`wa_hash` obrigatório no SELECT do admin:** Para que os botões #7, #8, #9 incluam o link, as queries de agendamentos no admin devem selecionar `wa_hash`. Se ausente (agendamentos antigos), o bloco do link é omitido graciosamente. |
| **RN43** | **Página independente de opt-in:** Qualquer cliente que receba o link `/agendamento/{hash}` pode acessar e cancelar — independente de ter ativado `wa_opt_in` no bot. |

---

## 6. Máquina de Estados — Fluxo Completo

### Estados e Transições

```
[Texto livre / timeout 15min]
        │
        ▼
   ┌─────────────────────────────────────────┐
   │  MAIN_MENU                              │
   │  "Olá! Sou o assistente da Leste        │
   │   Barbearia 💈 Como posso ajudar?"      │
   │                                         │
   │  [🗓️ Agendar]  [📋 Meus Agendamentos]  │
   │  [👤 Falar com o China]                 │
   └─────────────┬───────────┬───────────────┘
                 │           │           │
            Agendar     MeusAppts    Falar c/ China
                 │           │           │
                 ▼           ▼           ▼
        CHOOSE_SERVICE  MY_APPOINTMENTS  HUMAN_HANDOFF
                 │           │           (bot mudo)
                 ▼           │           (unlock: #menu)
        CHOOSE_DATE     CANCEL_CONFIRM
                 │
                 ▼
        CHOOSE_TIME
         (calculateAvailableSlots)
                 │
                 ▼
        CHOOSE_PAYMENT
         [🏢 No Local] [💳 PIX Online]
                 │
                 ▼
           CHECKOUT
         (RN32 double-check)
         ├─ Local: INSERT confirmado
         └─ Online: INSERT aguardando + link MP
                 │
                 ▼
        Confirmação + ⏰ Tolerância
        + 📅 Google Calendar
        + 🍎 Apple Calendar
```

### Mensagens exatas por estado

#### MAIN_MENU
> **Tipo:** `interactive/buttons`  
> **Corpo:** "Olá! Sou o assistente virtual da Leste Barbearia 💈 Como posso ajudar hoje?"  
> **Botões:** `[🗓️ Novo Agendamento]` · `[📋 Meus Agendamentos]` · `[👤 Falar com o China]`

#### CHOOSE_SERVICE
> **Tipo:** `interactive/list`  
> **Corpo:** "Legal! O que vamos fazer hoje? Selecione o serviço:"  
> **Lista:** dinâmica — busca `services` WHERE `active = true`, exibe nome + preço

#### CHOOSE_DATE
> **Tipo:** `interactive/list`  
> **Corpo:** "Excelente escolha! Para quando você deseja agendar?"  
> **Lista:** próximos dias de funcionamento (lê `business_config`: `schedule_*`, `calendar_max_days_ahead`)

#### CHOOSE_TIME
> **Tipo:** `interactive/list`  
> **Corpo:** "Ótimo! Temos estes horários disponíveis:"  
> **Lista:** resultado de `calculateAvailableSlots(date, serviceId)`  
> **Sem vagas:** "Poxa, agenda lotada neste dia! 😕 Escolha outra data:" → volta para CHOOSE_DATE

#### CHOOSE_PAYMENT
> **Tipo:** `interactive/buttons`  
> **Corpo:** "Seu horário está quase garantido! Como prefere pagar os R$ {price}?"  
> **Botões:** `[🏢 Pagar no Local]` · `[💳 Pagar Online (PIX)]`

#### CHECKOUT — Confirmação (Pagar no Local)
> **Tipo:** `text`  
> ✅ Tudo certo! Seu agendamento está confirmado:
> 
> 📅 **{data longa}** às **{hora}**  
> ✂️ **{nome do serviço}** — R$ {preço}  
> 💈 Barbearia Leste
> 
> ⏰ *Temos tolerância de 10 minutos. Após esse tempo, o horário poderá ser liberado.*
> 
> Adicione ao seu calendário para não esquecer:  
> 📅 [Google Calendar]({link_google})  
> 🍎 [Apple Calendar]({link_ics})  
> 
> Para cancelar, envie "Meus Agendamentos" a qualquer momento.

#### CHECKOUT — Confirmação (PIX Online)
> **Tipo:** `text`  
> ⏳ Quase lá! Acesse o link para pagar e garantir seu horário. **Sua vaga expira em {expiry_minutes} minutos:**
> 
> 🔗 {link_mercado_pago}
> 
> ⏰ *Temos tolerância de 10 minutos após o horário agendado.*
> 
> Após o pagamento confirmado, você receberá a confirmação e os links de calendário automaticamente.

#### MY_APPOINTMENTS
> **Tipo:** `interactive/list`  
> **Corpo:** "Aqui estão seus agendamentos ativos:"  
> **Lista:** busca `appointments` WHERE phone + status IN `['confirmado','aguardando_pagamento']` AND date >= hoje  
> **Sem agendamentos:** "Você não tem agendamentos ativos no momento. Quer agendar um novo? 🗓️"

#### CANCEL_CONFIRM
> **Tipo:** `interactive/buttons`  
> **Corpo:** "Tem certeza que quer cancelar o agendamento de **{data}** às **{hora}** ({serviço})?"  
> **Botões:** `[✅ Sim, cancelar]` · `[❌ Não, manter]`  
> **Fora do prazo:** "Infelizmente o prazo para cancelamento já passou ({janela}h antes). Para cancelar, entre em contato diretamente com o barbeiro: [Falar com o China](wa.me/55{numero_china})"

#### HUMAN_HANDOFF
> **Tipo:** `text`  
> "Vou te passar direto pro WhatsApp pessoal do China! 👇  
> 🔗 https://wa.me/5511969321101
> 
> *Para voltar ao menu do bot, envie: #menu*"

#### Fallback (RN31)
> **Tipo:** `text`  
> "Desculpe, não entendi. Por favor, clique em uma das opções acima ☝️"  
> *(reenvia a última mensagem com botões/lista)*

#### Erro interno
> **Tipo:** `text`  
> "Ops! Ocorreu um erro interno. Tente enviar 'Oi' novamente em alguns minutos. 🔧"

#### Vaga roubada (RN32)
> **Tipo:** `text`  
> "Poxa, alguém acabou de reservar esse horário! 😕 Vamos escolher outro?"  
> *(reenvia CHOOSE_TIME)*

---

## 7. Entry Points — Como o Bot Identifica o Contexto

Quando o cliente envia uma mensagem, o webhook identifica o contexto pelo conteúdo do texto:

| Texto recebido | Ação |
|---|---|
| Qualquer texto livre + sessão nova / timeout | Exibe MAIN_MENU |
| Começa com "Acabei de agendar!" ou contém `ID_xxxxxxxx` | Fluxo de opt-in: marca `wa_opt_in=true` + `last_wa_interaction` + busca agendamento e envia confirmação |
| `#menu` | Desbloqueio de HUMAN_HANDOFF, exibe MAIN_MENU |
| `button_reply.id` ou `list_reply.id` | Processado por BotController conforme `current_step` |

---

## 8. Integração Google Calendar e Apple Calendar

### Por que Calendar em vez de Template WA

Agendamentos com data superior a 24h do momento do agendamento não podem receber lembrete WA sem custo (janela fechada). A solução zero-cost é o próprio calendário do cliente fazer o lembrete.

### Google Calendar — Link direto

```
https://calendar.google.com/calendar/render
  ?action=TEMPLATE
  &text=Corte+Barbearia+Leste
  &dates=20260425T130000Z/20260425T140000Z
  &details=Serviço:+Corte+%2B+Barba+%7C+Valor:+R$+55
  &location=Barbearia+Leste
```

Construído em `src/lib/whatsapp/calendar-links.ts` → `buildGoogleCalendarUrl()`.  
Sem autenticação. Abre direto o Google Calendar pré-preenchido.

### Apple Calendar — Arquivo .ics

```
GET /api/calendar/{appointment_id}
Content-Type: text/calendar
Content-Disposition: attachment; filename="barbearia-leste.ics"
```

Arquivo ICS padrão RFC 5545. Ao clicar, o iOS exibe "Adicionar ao Calendário" nativamente. Também funciona em Outlook, Google Calendar e qualquer app compatível com `.ics`.

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Leste Barbearia//Bot//PT
BEGIN:VEVENT
UID:{appointment_id}@lestebarbearia
DTSTART:20260425T130000Z
DTEND:20260425T140000Z
SUMMARY:✂️ Corte + Barba — Barbearia Leste
DESCRIPTION:Serviço: Corte + Barba\nBarbeiro: China\nValor: R$ 55,00\nTemos tolerância de 10 minutos.
LOCATION:Barbearia Leste
END:VEVENT
END:VCALENDAR
```

---

## 9. Padronização dos Botões WA no App

### Grupo A — Cliente → Bot (número do bot)

| # | Local | Arquivo | Texto pré-preenchido |
|---|---|---|---|
| 1 | Botão flutuante em `/agendar` | `BookingForm.tsx` | `Olá! Gostaria de agendar um horário na Barbearia Leste. Pode me ajudar? 🗓️` |
| 2 | Menu lateral em `/agendar` | `BookingForm.tsx` | `Olá! Gostaria de agendar um horário na Barbearia Leste. Pode me ajudar? 🗓️` |
| 3 | Opt-in WA em `/agendar/sucesso` | `sucesso/page.tsx` | `Olá! Acabei de agendar um horário e quero receber lembretes. ID_{waHash}` *(já correto — não alterar)* |
| 3b | Opt-in tardio em `/reservas` (agendamentos futuros) | `ReservasClient.tsx` | `Olá! Quero ativar lembretes para meu agendamento de {serviceName} no dia {dd/mm}. ID_{waHash}` |
| 4 | Página `/agendar/pagamento/pendente` | `pendente/page.tsx` | `Olá! Fiz um agendamento de {serviceName} para {date} às {time}, mas o pagamento ainda está pendente. Pode me ajudar?` |
| 5 | Página `/agendar/pagamento/falha` | `falha/page.tsx` | `Olá! Houve um problema no pagamento do meu agendamento de {serviceName} para {date} às {time}. Pode me ajudar?` |
| 6 | `/reservas` — alerta de cancelado pelo admin | `ReservasClient.tsx` | `Olá! Vi que meu agendamento foi cancelado pela barbearia. Gostaria de remarcar um novo horário! 🗓️` |

> **#3 — não alterar:** O botão opt-in em `/sucesso` já está implementado corretamente com `ID_{waHash}`. O webhook depende exatamente desse padrão para associar o opt-in ao agendamento.
>
> **#4 e #5 — dados disponíveis server-side:** As páginas já carregam `appt.date`, `appt.start_time` e `service.name`. Usar essas variáveis no template do texto pré-preenchido para mensagens contextualizadas.

---

### Grupo B — Admin → Cliente (abre wa.me do número do cliente)

> **Objetivo:** Quando o admin clica em WhatsApp em qualquer tela do painel, o cliente recebe uma mensagem estruturada com os detalhes do agendamento **e o link da Página de Confirmação Interativa** (`/agendamento/{wa_hash}`). Isso permite ao cliente cancelar, pagar ou reagendar **sem login e sem precisar usar o bot**.

| # | Local | Arquivo | Texto pré-preenchido |
|---|---|---|---|
| 7 | Card de agendamento (lista do dia/semana) | `AdminDashboard.tsx` | Mensagem detalhada com link *(ver abaixo)* |
| 8 | Modal de detalhes do agendamento | `AdminDashboard.tsx` | Mensagem detalhada com link *(ver abaixo)* |
| 9 | Grade interativa / popover | `DailyAdminGrid.tsx` | Mensagem detalhada com link *(ver abaixo)* |
| 10 | Aba Clientes — contato genérico | `AdminDashboard.tsx` | `Olá, {clientName}! Aqui é da Barbearia Leste ✂️ Como posso ajudar?` |

**Mensagem padrão dos botões #7, #8, #9:**

```
Olá, {clientName}! Aqui é da Barbearia Leste ✂️

Seu agendamento:
📅 {dd/mm/yyyy} às {HH:mm}
✂️ {serviceName}

Veja os detalhes e suas opções:
🔗 https://lestebarbearia.agenciajn.com.br/agendamento/{wa_hash}
```

> - Se `wa_hash = null` (agendamento antigo, anterior à feature): omitir o bloco "Veja os detalhes" graciosamente — RN42.
> - Encodificar o texto final com `encodeURIComponent` ao montar a URL `wa.me`.
> - O botão #10 (Aba Clientes) **não tem contexto de agendamento** — usa mensagem genérica sem link.

**Função utilitária proposta — substituir `getWhatsAppHref` no admin:**

```typescript
// src/components/admin/AdminDashboard.tsx
function buildAdminWhatsAppHref(
  phone: string,
  clientName?: string | null,
  appt?: {
    date?: string | null
    start_time?: string | null
    services?: { name?: string | null } | null
    service_name_snapshot?: string | null
    wa_hash?: string | null
  } | null
): string {
  const cleanPhone = phone.replace(/\D/g, '')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lestebarbearia.agenciajn.com.br'

  if (!clientName || !appt?.date) {
    const text = clientName
      ? `Olá, ${clientName}! Aqui é da Barbearia Leste ✂️ Como posso ajudar?`
      : undefined
    return text
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/55${cleanPhone}`
  }

  const [year, month, day] = (appt.date ?? '').split('-')
  const formattedDate = `${day}/${month}/${year}`
  const formattedTime = appt.start_time?.slice(0, 5) ?? ''
  const serviceName = appt.service_name_snapshot ?? appt.services?.name ?? 'seu serviço'

  const linkBlock = appt.wa_hash
    ? `\n\nVeja os detalhes e suas opções:\n🔗 ${appUrl}/agendamento/${appt.wa_hash}`
    : ''

  const text =
    `Olá, ${clientName}! Aqui é da Barbearia Leste ✂️\n\n` +
    `Seu agendamento:\n📅 ${formattedDate} às ${formattedTime}\n✂️ ${serviceName}${linkBlock}`

  return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`
}
```

> **Atenção:** As queries de agendamentos no `AdminDashboard.tsx` e `DailyAdminGrid.tsx` precisam incluir `wa_hash` no `SELECT` para que o link seja gerado — RN42.

---

### Grupo C — Admin → Agência (fixos, não alterar)

| # | Local | Destino |
|---|---|---|
| 11 | Rodapé do painel admin | `wa.me/5511940825120?text=Olá, Agência JN! Gostaria de ativar um domínio próprio para minha barbearia.` |
| 12 | Modal de domínio | Mesmo acima |

---

## 9.1. Página de Confirmação Interativa — `/agendamento/[hash]`

### Visão Geral

Quando o admin envia WA ao cliente (botões #7, #8, #9), a mensagem inclui:

```
https://lestebarbearia.agenciajn.com.br/agendamento/{wa_hash}
```

Essa página é o **ponto de autoatendimento do cliente** — ele visualiza o agendamento e toma ações diretas (cancelar, pagar, reagendar) **sem precisar de login, sem usar o bot, e sem entrar em `/reservas`**.

### Por que não usar `/reservas`?

`/reservas` exige autenticação (Google OAuth). Clientes guest não possuem conta. A página `/agendamento/[hash]` é **pública, autenticada implicitamente pelo hash** — o `wa_hash` (8-char UUID fragment único por agendamento) oferece entropia suficiente para operações de baixo risco.

> **Segurança (RN39):** O cancelamento valida internamente que `wa_hash` corresponde ao `id` do agendamento antes de executar. Não é possível cancelar agendamentos de terceiros. Em produção, o rate limiting do Vercel + hash de 8 chars (4 bilhões de combinações) tornam força bruta inviável.

### Comportamento por Status

| Status do Agendamento | O que a página exibe |
|---|---|
| `confirmado` + **dentro** do prazo de cancelamento | Detalhes · badge **✅ Confirmado** · botão **"Cancelar Agendamento"** · botões Google Calendar + Apple Calendar |
| `confirmado` + **fora** do prazo de cancelamento | Detalhes · badge **✅ Confirmado** · aviso de prazo encerrado · botão **"Falar com o Barbeiro"** (wa.me/5511969321101) |
| `aguardando_pagamento` | Detalhes · badge **⏳ Aguardando Pagamento** · botão **"Pagar Agora"** — redireciona para `/reservas?notice=pending-payment&appt_id={id}` |
| `cancelado` | badge **❌ Cancelado** · botão **"Agendar Novo Horário"** (`/agendar`) · botão **"Falar com o Barbeiro"** |
| `concluido` | badge **✅ Concluído** · botão **"Agendar Novo Horário"** |
| Hash inválido ou inexistente | Página neutra: *"Agendamento não encontrado ou link expirado."* + botão **"Ir para o Início"** |

### Ação de Cancelamento (RN40)

1. Usuário clica em **"Cancelar Agendamento"**;
2. Modal de confirmação: *"Tem certeza que deseja cancelar {serviço} em {data} às {hora}?"*;
3. Server action valida: `wa_hash` bate com `id` do agendamento + `cancellation_window_minutes` do `business_config`;
4. Se aprovado: `UPDATE appointments SET status = 'cancelado' WHERE wa_hash = :hash AND id = :id`;
5. Página transiciona imediatamente para o estado `cancelado` com badges e CTAs adequados.
6. Se fora do prazo: modal exibe aviso + link direto para o China.

### Arquivos

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/app/agendamento/[hash]/page.tsx` | Server Component | Query por `wa_hash`; renderização condicional por status |
| `src/app/agendamento/[hash]/CancelButton.tsx` | Client Component | Botão + confirm dialog + chamada à server action |
| `src/app/agendamento/[hash]/actions.ts` | Server Action | `cancelAppointmentByHash(hash, apptId)` — valida hash + prazo + executa cancelamento |

### Query do Servidor

```typescript
// src/app/agendamento/[hash]/page.tsx
const { data: appt } = await supabase
  .from('appointments')
  .select(`
    id, status, date, start_time, wa_hash,
    client_name, client_phone,
    service_name_snapshot, service_price_snapshot,
    services:service_id ( name, price, duration_minutes )
  `)
  .eq('wa_hash', hash)
  .maybeSingle()

const { data: config } = await supabase
  .from('business_config')
  .select('logo_url, cancellation_window_minutes, barber_name, barber_nickname, display_name_preference')
  .single()

// Número pessoal do barbeiro para human handoff
const barberWhatsApp = process.env.BARBER_WHATSAPP_NUMBER // '5511969321101'
const appUrl = process.env.NEXT_PUBLIC_APP_URL
```

---

## 9.2. User Stories, Critérios de Aceitação e Regras de Negócio

### US-WA01 — Cliente agenda via bot

**Ator:** Cliente (com ou sem conta)  
**Gatilho:** Envia qualquer mensagem ao número do bot pela primeira vez ou após timeout de sessão  
**Fluxo:** MAIN_MENU → CHOOSE_SERVICE → CHOOSE_DATE → CHOOSE_TIME → CHOOSE_PAYMENT → CHECKOUT

| # | Critério de Aceitação |
|---|---|
| CA01 | Bot responde a qualquer primeira mensagem com MAIN_MENU (3 botões interativos) |
| CA02 | Lista de serviços exibe apenas `active = true`; cada item mostra nome e preço |
| CA03 | Lista de datas respeita dias de funcionamento e `calendar_max_days_ahead` do `business_config` |
| CA04 | Horários calculados por `calculateAvailableSlots` — mesma engine do app web |
| CA05 | Mensagem de confirmação contém: data, hora, serviço, valor, aviso de tolerância (RN35), link Google Calendar, link Apple Calendar |
| CA06 | Agendamento inserido na tabela `appointments` com os dados corretos |
| CA07 | Pagamento online: bot envia link MP na conversa; agendamento criado com `status = 'aguardando_pagamento'` |
| CA08 | Concorrência (RN32): se slot ocupado entre CHOOSE_TIME e CHECKOUT, bot informa e reexibe horários disponíveis |

**RNs:** RN30 · RN31 · RN32 · RN35 · RN38

---

### US-WA02 — Cliente cancela agendamento via bot

**Ator:** Cliente  
**Gatilho:** Seleciona "📋 Meus Agendamentos" → escolhe agendamento → confirma cancelamento

| # | Critério de Aceitação |
|---|---|
| CA01 | Bot busca agendamentos por `client_phone` E `profiles.phone` (RN37) |
| CA02 | Lista exibe apenas `status IN ('confirmado','aguardando_pagamento')` e `date >= hoje` |
| CA03 | Sem agendamentos ativos: mensagem informativa + CTA para novo agendamento |
| CA04 | Bot solicita confirmação antes de cancelar (modal de confirmação via interactive/buttons) |
| CA05 | Dentro do prazo: `status = 'cancelado'` no banco; bot confirma com mensagem |
| CA06 | Fora do prazo: mensagem de bloqueio + link direto para o China (wa.me/5511969321101) |
| CA07 | `aguardando_pagamento`: bot informa que a reserva expirará automaticamente ou orienta a cancelar em "Minhas Reservas" |

**RNs:** RN36 · RN37

---

### US-WA03 — Human Handoff (cliente pede para falar com o barbeiro)

**Ator:** Cliente  
**Gatilho:** Seleciona "👤 Falar com o China" no MAIN_MENU

| # | Critério de Aceitação |
|---|---|
| CA01 | Bot envia mensagem com link direto `wa.me/5511969321101` |
| CA02 | `current_step` muda para `HUMAN_HANDOFF` — bot silencia todas as mensagens subsequentes |
| CA03 | Único desbloqueio: cliente envia `#menu` → bot exibe MAIN_MENU |
| CA04 | Estado `HUMAN_HANDOFF` não é resetado por timeout de 15min (RN30 só se aplica a estados de fluxo, não a handoff) |

**RNs:** RN33

---

### US-WA04 — Cliente recebe lembrete WA no dia do agendamento

**Ator:** Sistema (cron `/api/cron/push-reminders`)  
**Gatilho:** Execução do cron no dia do agendamento

| # | Critério de Aceitação |
|---|---|
| CA01 | Lembrete só enviado se `wa_opt_in = true` |
| CA02 | Lembrete só enviado se `wa_reminder_sent = false` |
| CA03 | Kill-switch (RN34): `last_wa_interaction` dentro das últimas 24h — fora da janela, silêncio total |
| CA04 | Após envio bem-sucedido: `wa_reminder_sent = true` (não enviado duas vezes) |
| CA05 | Erro isolado: `try/catch` por agendamento — falha singular não interrompe os demais |
| CA06 | Mensagem personalizada: nome do cliente, hora, serviço e nome do barbeiro |

**RNs:** RN34

---

### US-WA05 — Opt-in de lembretes WA pelo cliente

**Ator:** Cliente  
**Gatilho A:** Clica em "🔔 Ativar Lembretes no WhatsApp" na página `/agendar/sucesso`  
**Gatilho B:** Clica em botão de opt-in tardio em `/reservas` (botão #3b)

| # | Critério de Aceitação |
|---|---|
| CA01 | Botão abre WA com texto pré-preenchido contendo `ID_{waHash}` |
| CA02 | Cliente envia a mensagem para o número do bot |
| CA03 | Webhook detecta padrão `/ID_[a-f0-9]{8}/i` → busca appointment por `wa_hash` |
| CA04 | Campos atualizados: `wa_opt_in = true`, `last_wa_interaction = now()`, `client_phone = {número do remetente}` |
| CA05 | Bot responde com resumo do agendamento + links Google Calendar + Apple Calendar |
| CA06 | Botão #3b visível em `/reservas` para cada agendamento futuro confirmado com `wa_opt_in = false` |

**RNs:** RN37 · RN38

---

### US-WA06 — Admin envia link de confirmação interativa ao cliente

**Ator:** Admin (China)  
**Gatilho:** Clica em botão WhatsApp no card de agendamento (#7), modal de detalhes (#8) ou grade interativa (#9)

| # | Critério de Aceitação |
|---|---|
| CA01 | WA abre pré-preenchido com nome do cliente, data/hora, serviço e link `/agendamento/{wa_hash}` |
| CA02 | `wa_hash = null` (agendamento antigo): mensagem enviada sem o bloco do link — graceful degradation (RN42) |
| CA03 | O link abre corretamente a Página de Confirmação Interativa (US-WA07) |
| CA04 | Mensagem enviada pelo número pessoal do China — não pelo bot — é ação manual do admin |
| CA05 | Funciona independente de `wa_opt_in` do cliente — é iniciativa do admin, não automação |
| CA06 | Botão #10 (Aba Clientes sem agendamento): usa mensagem genérica sem link de agendamento |

**RNs:** RN39 · RN41 · RN42

---

### US-WA07 — Cliente interage com a Página de Confirmação Interativa

**Ator:** Cliente (sem login necessário)  
**Gatilho:** Clica no link `/agendamento/{wa_hash}` recebido via WA

| # | Critério de Aceitação |
|---|---|
| CA01 | Página carrega sem autenticação; acesso controlado exclusivamente pelo `wa_hash` |
| CA02 | Hash inválido ou inexistente: página de erro amigável (não 500) |
| CA03 | Status `confirmado` + dentro do prazo: botão **"Cancelar Agendamento"** visível e clicável |
| CA04 | Status `confirmado` + fora do prazo: botão de cancelamento oculto; aviso de prazo + link China |
| CA05 | Status `aguardando_pagamento`: botão **"Pagar Agora"** redireciona para fluxo de pagamento correto |
| CA06 | Status `cancelado` e `concluido`: CTA "Agendar Novo Horário" visível; sem botão de cancelamento |
| CA07 | Ação de cancelamento exibe confirm dialog antes de executar |
| CA08 | Cancelamento bem-sucedido: página transiciona imediatamente para badge ❌ Cancelado + CTAs adequados |
| CA09 | Status `confirmado`: exibe links Google Calendar e Apple Calendar |

**RNs:** RN39 · RN40 · RN43

---

### US-WA08 — Cliente contata barbearia via botões avulsos (fora do bot)

**Ator:** Cliente  
**Gatilho:** Clica em botão WA nas páginas `/agendar`, `/reservas`, `/pagamento/pendente`, `/pagamento/falha`

| # | Critério de Aceitação |
|---|---|
| CA01 | Botões #1 e #2 (`/agendar`): WA abre com texto indicando intenção de agendar |
| CA02 | Botão #4 (`/pagamento/pendente`): mensagem inclui nome do serviço, data e hora do agendamento pendente (dados disponíveis server-side) |
| CA03 | Botão #5 (`/pagamento/falha`): mensagem inclui nome do serviço, data e hora do agendamento com problema |
| CA04 | Botão #6 (`/reservas` — cancelado): mensagem indica cancelamento pela barbearia e desejo de remarcar |
| CA05 | Todos os botões usam `whatsapp_number` de `business_config`; se não configurado, botão é ocultado |

**RNs:** RN35

---

## 10. Lembretes — Estratégia Completa

```
TIMELINE DE LEMBRETES POR AGENDAMENTO

[Agendamento criado]
    │
    ├─ Bot envia confirmação com 📅 Google Calendar + 🍎 Apple Calendar
    │   (Estratégia passiva: calendário nativo do cliente lembra)
    │
    ├─ Se cliente ativou opt-in WA (wa_opt_in=true):
    │
    │   ┌─────────────────────────────────────────────────┐
    │   │                                                 │
    │   │  DIA DO AGENDAMENTO (cron a cada 5 min)         │
    │   │                                                 │
    │   │  Se last_wa_interaction <= 24h (janela aberta): │
    │   │    ✅ Envia lembrete WA (custo ZERO)            │
    │   │    📝 Marca wa_reminder_sent=true               │
    │   │                                                 │
    │   │  Se last_wa_interaction > 24h (janela fechada): │
    │   │    ❌ Silêncio (kill-switch RN34)               │
    │   │    O calendário já está fazendo o lembrete       │
    │   │                                                 │
    │   └─────────────────────────────────────────────────┘
    │
    └─ Push Notification (PWA) — independente, sem janela
        1h30, 1h15, 1h, 45min, 30min, 15min antes
        (já implementado — não muda)
```

**Mensagem de lembrete WA (custo zero):**
> "Olá, *{clientName}*! 👋 Lembrando do seu agendamento hoje às *{hora}* — *{serviço}* com {barbeiro}. Se precisar cancelar, avise com antecedência. Barbearia Leste ✂️"

---

## 11. Opt-In — Como o Cliente Ativa Lembretes

```
FLUXO DE OPT-IN

1. Cliente conclui agendamento no app web
   │
2. Página /agendar/sucesso exibe:
   ├─ 📅 Adicionar ao Google Calendar  [botão]
   ├─ 🍎 Adicionar ao Apple Calendar   [botão]
   └─ 📲 Receba confirmação pelo WhatsApp [botão verde]
   │
3. Cliente clica em "Receba confirmação pelo WhatsApp"
   └─ Abre WhatsApp com texto:
      "Acabei de agendar! Quero receber a confirmação. ID_abc1ef23"
   │
4. Cliente envia a mensagem para o número do bot
   └─ Webhook recebe → detecta ID_abc1ef23 → busca appointment
      → marca wa_opt_in=true, last_wa_interaction=now()
      → bot envia a confirmação de agendamento + links de calendar
   │
5. Cron do dia do agendamento:
   └─ Se janela de 24h aberta → lembrete WA gratuito
```

**Na página `/reservas`:** Cada agendamento futuro confirmado exibe o botão "📲 Lembrete pelo WhatsApp" para ativar opt-in individualmente, caso o cliente não tenha ativado na confirmação.

---

## 12. Cancelamento via Bot

O cliente acessa "📋 Meus Agendamentos" no menu principal. O bot lista todos os agendamentos ativos (status `confirmado` ou `aguardando_pagamento`, data >= hoje) encontrados pelo número do remetente.

**Validação de prazo:** Antes de cancelar, o bot consulta `cancellation_window_minutes` do `business_config`. Se o agendamento está dentro do prazo proibido, bloqueia e direciona para o China.

**Integração total:** O cancelamento usa a mesma `server action` do app web — mesmo fluxo, mesma regra, mesmo registro no banco.

---

## 13. Especificação Técnica dos Arquivos

### Arquivos novos

| Arquivo | Propósito |
|---|---|
| `supabase/migrations/20260419200000_wa_sessions.sql` | Tabela `wa_sessions` com RLS |
| `src/lib/whatsapp/send-message.ts` | 3 helpers: `sendWhatsAppText`, `sendWhatsAppButtons`, `sendWhatsAppList` |
| `src/lib/whatsapp/calendar-links.ts` | `buildGoogleCalendarUrl` e `buildAppleIcsUrl` |
| `src/lib/whatsapp/bot-controller.ts` | Classe `BotController` — toda a máquina de estados |
| `src/app/api/calendar/[id]/route.ts` | Endpoint público que serve arquivo `.ics` |
| `src/app/agendamento/[hash]/page.tsx` | Página de Confirmação Interativa — Server Component público, query por `wa_hash` |
| `src/app/agendamento/[hash]/CancelButton.tsx` | Client Component — botão de cancelamento com confirm dialog |
| `src/app/agendamento/[hash]/actions.ts` | Server Action `cancelAppointmentByHash` — valida hash + prazo + executa |

### Arquivos modificados

| Arquivo | O que muda |
|---|---|
| `src/app/api/webhooks/whatsapp/route.ts` | POST: extrai tipo/phone/contactName; roteia para BotController |
| `src/app/agendar/sucesso/page.tsx` | Botões Google/Apple Calendar; texto do botão WA |
| `src/app/reservas/ReservasClient.tsx` | Botão WA em agendamentos futuros (opt-in tardio) |
| `src/components/booking/BookingForm.tsx` | Texto pré-preenchido nos botões WA #1 e #2 |
| `src/app/agendar/pagamento/pendente/page.tsx` | Texto pré-preenchido contextualizado no botão WA #4 |
| `src/app/agendar/pagamento/falha/page.tsx` | Texto pré-preenchido contextualizado no botão WA #5 |
| `src/components/admin/AdminDashboard.tsx` | Substituir `getWhatsAppHref` por `buildAdminWhatsAppHref`; adicionar `wa_hash` ao SELECT dos agendamentos |
| `src/components/admin/DailyAdminGrid.tsx` | Adicionar `wa_hash` ao SELECT; usar `buildAdminWhatsAppHref` |

### Variáveis de ambiente necessárias

```env
# Meta WhatsApp Cloud API
META_VERIFY_TOKEN=    # Token escolhido por você — use no painel Meta
META_ACCESS_TOKEN=    # Token de acesso — gerado no painel Meta
META_PHONE_ID=        # Phone Number ID — gerado no painel Meta

# Número pessoal do barbeiro para human handoff
BARBER_WHATSAPP_NUMBER=5511969321101
```

---

## 14. Setup Meta for Developers — Passo a Passo

### Pré-requisito
- Conta pessoal no Facebook
- Conta do WhatsApp Business no número que será o Bot (número exclusivo da barbearia)

### Passo 1 — Criar o App
1. Acesse [developers.facebook.com](https://developers.facebook.com) e logue com o Facebook
2. **My Apps → Create App**
3. Tipo: **Business** → Next
4. Nome: `Leste Barbearia Bot` → e-mail de contato → **Create App**
5. Na tela de produtos, clique em **Set Up** na seção **WhatsApp**

### Passo 2 — WhatsApp API Setup
6. No menu lateral: **WhatsApp → API Setup**
7. A Meta provisiona automaticamente um número de teste gratuito (+1 555 XXXX) — use para development
8. Para produção: **Add Phone Number** → verificação por SMS/chamada com o número real da barbearia

### Passo 3 — Pegar META_PHONE_ID
9. Na seção **API Setup**, o **Phone number ID** aparece abaixo do número selecionado
10. Copie esse valor → variável `META_PHONE_ID` no Vercel

### Passo 4 — Gerar META_ACCESS_TOKEN
11. Ainda em **API Setup**: clique em **Generate Access Token** (token temporário de 24h para testes)
12. Para produção: crie um System User em **Business Settings** com permissão `whatsapp_business_messaging` → gere token permanente
13. Copie o token → variável `META_ACCESS_TOKEN` no Vercel

### Passo 5 — Configurar Webhook
14. No menu: **WhatsApp → Configuration → Webhook**
15. Clique em **Edit**
16. **Callback URL:** `https://lestebarbearia.agenciajn.com.br/api/webhooks/whatsapp`
17. **Verify Token:** crie uma string aleatória (ex: `leste_bot_2026_secure`) → salve como `META_VERIFY_TOKEN` no Vercel antes de confirmar
18. Clique em **Verify and Save**
19. Em **Webhook Fields**: ative `messages`

### Passo 6 — Adicionar Número de Teste (desenvolvimento)
20. Em **API Setup**: seção **To** → **Manage phone number list** → adicione o número do seu celular para receber mensagens de teste

### Passo 7 — Verificar no Vercel
21. Acesse o projeto no Vercel → **Settings → Environment Variables**
22. Adicione as 4 variáveis: `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_ID`, `BARBER_WHATSAPP_NUMBER`
23. Faça redeploy ou aguarde o próximo deploy automático

### Passo 8 — Testar
24. Envie "Oi" para o número do bot no WhatsApp
25. O bot deve responder com o MAIN_MENU (3 botões)
26. Se não responder: verifique nos logs do Vercel (`vercel logs`) se o webhook está recebendo a requisição

---

## 15. Checklist de Validação Pós-Implementação

### Database
- [ ] Migration `20260419200000_wa_sessions.sql` executada no Supabase SQL Editor
- [ ] Tabela `wa_sessions` visível no Supabase Table Editor
- [ ] RLS ativo: acesso via anon/auth bloqueado; service_role funciona

### Código
- [ ] `npx tsc --noEmit` → zero erros TypeScript
- [ ] Webhook GET responde corretamente à verificação da Meta
- [ ] Webhook POST recebe payload e retorna 200 em todos os cenários

### Fluxo do Bot — Testes Funcionais
- [ ] "Oi" → exibe MAIN_MENU com 3 botões
- [ ] Agendar → serviço → data → hora → confirmar pagamento local → agendamento criado em `appointments`
- [ ] Agendamento online → link MP recebido corretamente
- [ ] Mensagem de confirmação contém link Google Calendar + Apple Calendar
- [ ] "Meus Agendamentos" → lista agendamentos ativos
- [ ] Cancelamento dentro do prazo → agendamento cancelado no banco
- [ ] Cancelamento fora do prazo → mensagem de bloqueio + link China
- [ ] "Falar com o China" → bot envia link + silencia
- [ ] `#menu` → desbloqueia bot e exibe MAIN_MENU
- [ ] Timeout 15min → sessão resetada para MAIN_MENU
- [ ] RN32: dupla requisição simultânea → segundo agendamento bloqueado

### Calendário
- [ ] `GET /api/calendar/{id}` → retorna arquivo `.ics` válido
- [ ] `.ics` abre corretamente no iOS (Safari → "Adicionar ao Calendário")
- [ ] Link Google Calendar abre pré-preenchido no Chrome/Safari
- [ ] Datas e horários corretos (fuso BRT)

### 12 Botões
- [ ] Botões #1/#2 em `/agendar` abrem WA com texto de intenção de agendamento
- [ ] Botão #3 em `/agendar/sucesso` contém `ID_xxxxxxxx` do agendamento
- [ ] Botões #4/#5 em páginas de pagamento com nome do serviço, data e hora pré-preenchidos
- [ ] Botão #6 em `/reservas` (cancelado) com texto indicando cancelamento e desejo de remarcar
- [ ] Botões #7/#8/#9 no admin contêm nome do cliente, data/hora, serviço e link `/agendamento/{wa_hash}`
- [ ] Botão #10 (Aba Clientes) abre WA com mensagem genérica (sem link de agendamento)
- [ ] Botões #11/#12 apontam para a Agência JN (não alterar)
- [ ] `wa_hash` presente no SELECT das queries de agendamento no admin (RN42)

### Página de Confirmação Interativa `/agendamento/[hash]`
- [ ] Arquivo `src/app/agendamento/[hash]/page.tsx` criado
- [ ] Hash inválido: retorna página amigável (não 500)
- [ ] Status `confirmado` + dentro do prazo: botão "Cancelar" visível
- [ ] Status `confirmado` + fora do prazo: botão "Cancelar" oculto; link China visível
- [ ] Status `aguardando_pagamento`: botão "Pagar Agora" redireciona corretamente
- [ ] Status `cancelado`: CTAs de re-agendamento visíveis
- [ ] Ação de cancelamento: confirm dialog exibido antes de executar
- [ ] Cancelamento executa server action `cancelAppointmentByHash` — valida hash + prazo
- [ ] Página transiciona para estado `cancelado` após ação bem-sucedida
- [ ] Links Google Calendar e Apple Calendar visíveis para status `confirmado`
- [ ] Página acessível sem login (pública)

### Cron de Lembretes (já implementado)
- [ ] Kill-switch 24h funcionando — agendamento sem interação há >24h não recebe WA
- [ ] `wa_reminder_sent=true` após envio bem-sucedido
- [ ] Agendamento do dia com opt-in ativo recebe lembrete WA
- [ ] Lembrete não enviado duas vezes (flag `wa_reminder_sent`)

---

## 16. Fora de Escopo (Decisão Consciente)

| Item | Justificativa |
|---|---|
| Notificação push ao admin quando bot cria agendamento | Possível expansão futura; baixa prioridade |
| Multi-idioma no bot | Público 100% BR |
| Rate limiting no bot por número | Meta já bloqueia abuso; baixa prioridade |
| Bot para atendimento de dúvidas abertas (LLM) | Fora da proposta zero-cost; requer IA generativa paga |
| Verificação do número na Meta para produção | Ação manual — fora do código |

---

*Documento gerado em 19/04/2026. Versão 2.0 — revisado com mensagens pré-preenchidas melhoradas, Página de Confirmação Interativa (/agendamento/[hash]) e cobertura completa US-WA01 a US-WA08 com CA e RN.*
