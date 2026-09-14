# Backlog — Suporte a serviços com preço "a partir de" / preço variável e impacto no pagamento online

**Levantado em:** 14/09/2026 · **Status:** analisado, **não implementado** · **Prioridade: alta**

> Registrado a pedido, para não depender de memória. Nada neste documento foi
> aplicado ao código. A análise abaixo foi feita lendo o fluxo real, não por
> suposição.

---

## 1. O problema

Alguns serviços da barbearia não têm preço fixo. "Luzes", por exemplo, custa
*a partir de* R$ 80 — o valor final depende do cabelo.

O cadastro de serviço aceita **um único número**:

```ts
// src/app/admin/actions.ts:382
export async function upsertService(data: {
  id?: string
  name: string
  price: number            // ← um número, e só
  duration_minutes: number
  icon_name?: string | null
  is_active?: boolean
})
```

Sem um campo para o *tipo* de preço, o barbeiro improvisou e escreveu a condição
no **nome** do serviço. Em produção existe hoje um serviço chamado
**"Corte é luzes aparti"**, R$ 80,00 — o nome carrega a regra de negócio, com
erro de grafia, e aparece assim para o cliente na hora de agendar.

Isso é sintoma. O problema real é o modelo de dados.

---

## 2. O que acontece hoje no fluxo de pagamento — passo a passo real

### 2.1 Seleção e criação do agendamento

`createAppointment` **relê o serviço no servidor** (não confia no cliente) e tira
um snapshot imutável:

```ts
// src/app/agendar/actions.ts:453  → leitura do serviço
// src/app/agendar/actions.ts:544-546 e 562-564  → gravação do snapshot
service_name_snapshot: serviceSnapshot.name,
service_price_snapshot: serviceSnapshot.price,
service_duration_minutes_snapshot: serviceSnapshot.duration_minutes,
```

### 2.2 Pagamento online

Quando `payment_mode = 'online_obrigatorio'`, o mesmo número vira o valor
cobrado, em três lugares:

```ts
// src/app/agendar/actions.ts:678   → preference do Mercado Pago
unitPrice: Number(serviceSnapshot.price),

// src/app/agendar/actions.ts:701   → payment_intents.amount
amount: Number(serviceSnapshot.price),

// src/lib/mercadopago/payment-route.ts:188 → transaction_amount do pagamento
transaction_amount: Number(appt.service_price_snapshot),
```

### 2.3 Conclusão e financeiro

```ts
// src/app/admin/actions.ts:1182
const amount = appt.service_price_snapshot ?? 0
```

Esse `amount` é o que entra em `financial_transactions` como receita do
atendimento (`src/app/admin/actions.ts:1209` e `1220`).

### 2.4 O ponto crítico

**`service_price_snapshot` nunca é atualizado.** Uma varredura no projeto inteiro
mostra que ele é escrito apenas na criação do agendamento
(`src/app/agendar/actions.ts:545` e `563`, `src/app/admin/actions.ts:2511`) e
daí em diante só é **lido**. `concludeAppointment` não recebe parâmetro de valor
e não oferece nenhum campo para corrigi-lo.

Ou seja: **o valor é decidido no momento do agendamento e nunca mais muda** —
nem quando o serviço, por natureza, só podia ser precificado depois de feito.

---

## 3. Existe risco real no Mercado Pago? **Sim, e está ativo.**

Configuração medida em produção em 14/09/2026 (lida do payload de `/agendar`):

| Chave | Valor |
|---|---|
| `payment_mode` | **`online_obrigatorio`** |
| `aceita_dinheiro` | `true` |
| `require_advance_payment_distant_bookings` | `true` |
| `distant_booking_threshold_days` | `7` |

Com isso:

1. Cliente escolhe "Corte é luzes aparti" (R$ 80).
2. O agendamento nasce com `service_price_snapshot = 80`.
3. A preference e o pagamento no Mercado Pago são criados com **R$ 80**.
4. O cliente paga R$ 80 e o agendamento vira `confirmado`.
5. Se o serviço na cadeira custar R$ 140, **não existe nenhum lugar no sistema
   para registrar os R$ 60 restantes.** O financeiro contabiliza R$ 80.

O que atenua hoje, e não resolve:

- `aceita_dinheiro = true` permite ao cliente escolher pagar na barbearia — mas
  é escolha dele, e o caminho online continua disponível e errado.
- Para datas a mais de 7 dias, `require_advance_payment_distant_bookings = true`
  **remove** a opção de pagar na barbearia. Nesse recorte o cliente é
  **obrigado** a pagar R$ 80 online por um serviço de preço indefinido.

Não é um risco de fraude: é um risco de **cobrança tecnicamente correta e
comercialmente errada**, com a diferença saindo do bolso da barbearia ou virando
conversa constrangedora no balcão.

Também há um efeito colateral no relatório: a receita prevista e a realizada
(`AdminDashboard.tsx:2592-2593`) usam `service_price_snapshot`, então o
faturamento fica subestimado para todo serviço de preço variável.

---

## 4. Modelagem proposta

Derivada do que já existe — snapshot imutável no agendamento, `payment_intents`
separado, `financial_transactions` como livro-razão.

### 4.1 Schema

```sql
-- services
ALTER TABLE public.services
  ADD COLUMN price_type text NOT NULL DEFAULT 'fixed'
    CHECK (price_type IN ('fixed', 'from', 'quote'));

-- appointments: o valor final, preenchido na conclusão
ALTER TABLE public.appointments
  ADD COLUMN final_price numeric NULL,
  ADD COLUMN service_price_type_snapshot text NULL;
```

Semântica:

| `price_type` | Significado | Exibição pública |
|---|---|---|
| `fixed` | preço fechado (comportamento atual) | `R$ 30,00` |
| `from` | mínimo garantido, final definido no atendimento | `A partir de R$ 80,00` |
| `quote` | sem valor prévio | `Sob consulta` |

`service_price_snapshot` continua sendo o valor **de referência** no momento do
agendamento (não muda). `final_price` é o valor **efetivamente cobrado**,
preenchido na conclusão. O financeiro passa a usar
`COALESCE(final_price, service_price_snapshot)`.

### 4.2 Comportamento no pagamento online — as opções e as consequências

Esta é a decisão que **não deve ser tomada sem você**. As três alternativas
coerentes com a arquitetura atual:

**(A) Bloquear pagamento antecipado para `from` e `quote`** — o serviço de preço
variável sempre cai no fluxo "pagar na barbearia", mesmo com
`payment_mode = 'online_obrigatorio'`.
*Consequência:* nunca cobra a menos; é a opção mais simples e a única que não
exige mexer em valores no Mercado Pago. Custo: perde a garantia de comparecimento
que o pagamento antecipado dá, justamente nos serviços mais caros. Precisa de
exceção explícita na regra dos 7 dias (`require_advance_payment_distant_bookings`),
senão o serviço fica impossível de agendar para datas distantes.

**(B) Cobrar o valor mínimo como sinal** — o cliente paga R$ 80 online, marcados
como **sinal**, e o restante é acertado na barbearia.
*Consequência:* mantém a garantia de comparecimento. Exige: rótulo explícito no
checkout ("sinal de R$ 80 — o valor final será acertado no atendimento"), um
campo de valor final na tela de conclusão, e uma segunda `financial_transaction`
para a diferença. É a opção mais completa e a mais trabalhosa. Também é a que
mais precisa de texto claro para não virar reclamação.

**(C) `quote` não agenda online** — serviços sob consulta viram botão de
WhatsApp em vez de agendamento.
*Consequência:* resolve o caso extremo sem tocar no fluxo de pagamento, mas tira
esses serviços da agenda. Faz sentido combinado com (A) ou (B), não sozinho.

**Recomendação:** `from` → **(B)** com rótulo de sinal; `quote` → **(C)**.
Se o objetivo for entregar rápido e sem risco financeiro, `from` → **(A)** já
elimina o problema de cobrança a menor, e (B) entra depois.

### 4.3 Superfícies a alterar

| Onde | O quê |
|---|---|
| `src/app/admin/actions.ts:382` `upsertService` | aceitar e validar `price_type` |
| `AdminDashboard` (form de serviços, ~linha 4091) | seletor "Tipo de preço" |
| `BookingForm.tsx:1277` | exibir "A partir de R$ X" / "Sob consulta" |
| `src/app/agendar/actions.ts:~500` | decidir `isOnlinePayment` também por `price_type` |
| `src/app/agendar/actions.ts:678,701` | rotular como sinal (opção B) |
| `concludeAppointment` (`admin/actions.ts:1139`) | receber `finalPrice` e usar `COALESCE` |
| `AdminDashboard.tsx:2592-2593` | receita usar `final_price ?? snapshot` |
| Migration | as duas `ALTER TABLE` acima + backfill `price_type='fixed'` |

### 4.4 Higiene de dados

Depois de implementado: renomear **"Corte é luzes aparti"** → nome correto
(`Luzes`, ou `Corte + Luzes`) com `price_type = 'from'` e `price = 80`.
Agendamentos antigos não são afetados — o snapshot preserva o que foi combinado
na época.

---

## 5. Por que não foi implementado agora

1. Mexe em **comportamento financeiro em produção**, com Mercado Pago ativo em
   `online_obrigatorio`. Não é mudança para entrar junto com uma landing page.
2. Exige uma **decisão de negócio** (opção A, B ou C) que é sua, não minha.
3. Exige migration com backfill e teste do fluxo de pagamento ponta a ponta.

Merece sprint própria.
