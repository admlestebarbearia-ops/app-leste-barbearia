# Planejamento — SaaS de agendamento para barbearias

> Documento vivo. Registra o que foi **decidido**, o que foi **descartado** e o
> que continua **em aberto** nas sessões de planejamento.
> Cada decisão traz a data e o **porquê** — porque daqui a três meses o motivo
> vale mais que a decisão.
>
> **Fase atual: REFINAMENTO.** Isto NÃO é o plano final. São reuniões de
> refinamento — mudanças de ideia são bem-vindas agora, de propósito, para
> não termos que mudar no meio do desenvolvimento. O plano final só é escrito
> quando o dono disser "pode escrever o plano completo".

Última atualização: **06/09/2026**

---

## 1. De onde isso vem

O app da **Barbearia Leste** está em produção desde abril/2026: ~1.500
agendamentos, 165 clientes cadastrados, 1 barbeiro. Ele é a prova de conceito e
a fonte das dores reais — **não** o produto que será vendido.

**Decisão (05/09):** o SaaS é construído **do zero**, herdando tudo que a Leste
tem, porém mais profissional. A Leste continua rodando como está e **não** faz
parte da cobrança do SaaS.

---

## 2. Pesquisa de mercado (06/09/2026)

### Preços praticados

| Plataforma | Preço | Observação |
|---|---|---|
| Simples Agenda / Barber Agenda | R$ 39,90 | piso do mercado |
| **Agendei Fácil** | **R$ 37,90** (1 prof.) · **R$ 67,90** (ilimitado + WhatsApp) | concorrente direto da Leste |
| Agendaê | R$ 44,98 | |
| EiBarber | R$ 49 a 139 | |
| Trinks | R$ 76 (1-2 prof.) · R$ 110 (3-4) | usado pela Barbearia Corleone |
| AppBarber | ~R$ 89 | forte em rede multi-loja |

**Achado central:** o Agendei Fácil usa o **WhatsApp como gatilho de upgrade** —
R$ 37,90 sem, R$ 67,90 com. É exatamente a estrutura que o Nilson tinha
imaginado antes da pesquisa (R$ 49 depois R$ 80 com WhatsApp).

### Tamanho do concorrente — e por que o número não importa

A home do Agendei Fácil declara **"Centenas de estabelecimentos"** e "Milhares de
agendamentos por mês" (verificado no HTML: a palavra "Centenas" aparece 2x; a
string "3 mil" / "3000" **não existe** na home nem na página de cadastro —
06/09). O dono relatou ter visto "mais de 3 mil clientes" em algum lugar; a
conferir onde (app? Instagram?).

**A lição estratégica vale mais que o número:** claim de marketing é
**inverificável e inflável**. Qualquer um coloca "+3000 clientes" no próprio
site — nós inclusive. Portanto:
1. Não basear nenhuma decisão nesse número.
2. Nós também podemos exibir prova social (com honestidade — ex.: agendamentos
   reais processados, que é auditável no nosso banco).
3. Tentar "verificar" contando o banco do concorrente foi barrado, e com razão —
   não se sonda infraestrutura de terceiro. Fica a regra.

**Conclusão que importa:** um negócio de agendamento para barbearia de bairro é
sustentável em escala pequena. A barra é alcançável.

### Achado técnico: o concorrente usa a MESMA stack que nós

Inspecionando as requisições de rede do Agendei Fácil (06/09): eles rodam
**Supabase + PostgREST** (`/rest/v1/...`) e **Netlify Functions** para o Mercado
Pago (`/.netlify/functions/mercadopago-reconcile-pending-appointments`). Tabelas
observadas: `establishments`, `service_categories`, `service_subcategories`,
`subscriptions`, `establishment_reviews`, `establishment_products`,
`appointments` (com `status=pending_payment`, `payment_transaction_id`).

**O que isso nos diz:**
- Nossa escolha de stack (Next + Supabase + Mercado Pago) é a mesma de um
  concorrente que já fatura. Não estamos em caminho exótico.
- O modelo de dados deles confirma o nosso inventário: eles têm `subscriptions`
  (clube de assinatura), `establishment_products` (estoque), reviews. Valida as
  prioridades da seção 3.
- **Alerta de segurança que herdamos como lição:** o PostgREST deles expõe
  `/rest/v1/` publicamente. Se o RLS não estiver rígido, dá para ler dados de
  outros estabelecimentos. No nosso multi-tenant, RLS por `establishment_id` é
  inegociável desde o dia 1 (o dono já havia exigido "segurança nível NASA" para
  isolar tenants). Ver seção 9.

### Como a Barbearia Corleone opera

Não tem app próprio: assina a **Trinks**. O app da loja
(`com.trinks.BarbeariaCorleone`) é publicado pela **TRINKS SERVICOS DE INTERNET
LTDA**, com a marca do cliente. 5,0 estrelas, 723 avaliações — mas uma avaliação
reclama: "Cadastro terrível… UX horrível".

Isso prova que a regra 4.2.6 da Apple (app de modelo para vários clientes) é
navegável na prática, publicando sob a conta da plataforma.

---

## 3. Produto — inventário mínimo

Tudo que a Leste já tem entra. O que a pesquisa mostrou que **falta**:

### Prioridade alta
- [ ] **Painel do OPERADOR (nós, donos do SaaS).** Distinto do painel do
      barbeiro. É de onde NÓS gerenciamos o negócio: quais barbearias estão
      ativas/inadimplentes, receita total (MRR), quem está em teste, quem
      cancelou e por quê, criar/suspender uma barbearia, ver a saúde do sistema.
      Sem isto não há como operar nem cobrar. **Nunca foi citado até 06/09 —
      lacuna do próprio planejamento.**
- [ ] **Clube de assinatura.** Cliente paga valor fixo mensal no cartão e tem
      direito a X serviços. **Todos** os concorrentes têm. Transforma renda
      imprevisível em faturamento garantido no dia 1º. É o argumento de venda
      mais forte: um assinante de R$ 100 já paga a mensalidade do barbeiro.
- [ ] **Tema por estabelecimento** (cores + logo, 2 cliques). O preto da Leste
      não serve para salão feminino. Concorrentes têm layout único — este é
      diferencial real.
- [ ] **PWA por barbearia**: manifesto dinâmico, cada loja instala com o
      **próprio nome e logo**. Custo zero. A Trinks cobra isso como adicional
      só para contas grandes.
- [ ] **Múltiplas unidades.** Separa "sistema de barbeiro solo" de "sistema de
      rede". Rede paga mais e cancela menos. Modelar no banco desde o dia 1.
- [ ] **Comissão automática por profissional.** Barbearia com 3+ cadeiras faz
      isso na mão toda semana.

### Prioridade média
- [ ] Estoque de produtos
- [ ] Avaliações e ranking de clientes
- [ ] "Clientes sumidos" (quem não volta há X dias) — o Agendei Fácil tem
- [ ] Fila de espera — **NÃO é exclusividade nossa**, o concorrente tem no plano
      de R$ 37,90

### Descartado
- **Vitrine/marketplace** (estilo Booksy): só funciona com massa crítica. Com 50
  barbearias não vale; com 1000 vira fosso competitivo. Anotar para depois.

---

## 4. Preço

**Decisão preliminar (06/09):** dois planos, com WhatsApp como gatilho de
upgrade — espelhando o que o mercado já validou.

- Plano base: faixa de **R$ 49 a 59**
- Plano com WhatsApp: faixa de **R$ 79 a 89**

**Não ir para R$ 37.** Guerra de preço é perdida pelo menor, e margem é o que
paga suporte. **Não ir acima de R$ 99** sem marca — o mercado ancora em R$ 40-90.

### Matemática de aquisição

```
Mensalidade R$ 60 x 18 meses de permanência = R$ 1.080 por cliente
Teto saudável de custo por venda (1/3)      = R$ 360
```

---

## 5. Como chegar ao cliente

### Aprendizado que custou caro

O Nilson cobrou barato da Leste **esperando indicações**. Passaram meses e
**nunca veio nenhuma**. A lição: **desconto adiantado não gera indicação, gera
cliente barato.** Indicação precisa ser pedida, com prazo e recompensa clara.

### Descartado

- **Rodapé "quero isso na minha barbearia"** como canal de aquisição. O
  concorrente faz, mas barbeiro não é cliente de barbearia — ele corta no
  colega. Vale como lembrança de marca, não como canal.

### O que fazer, em ordem

1. **Descobrir a mensagem de graça, antes de gastar.** Falar com 10 barbeiros
   perguntando só "o que mais te irrita no dia a dia?". Se 7 disserem falta e
   WhatsApp, a propaganda está escrita pelos próprios clientes.
2. **Instagram** — é onde o barbeiro vive. Postar tela do sistema resolvendo uma
   dor, não o rosto do fundador.
3. **Perguntar ao barbeiro da Leste o que o colega reclama** do serviço
   concorrente que ele assina. Reclamação de concorrente é a melhor propaganda.
4. **Só então R$ 150/mês em Meta Ads**, como acelerador de mensagem já testada.
5. **Indicação com contrato explícito:** ~20% por 12 meses, depois zera.
   Vitalícia come a margem para sempre; única não motiva indicar quem fica.

### A fórmula de texto que o concorrente validou

Não vender funcionalidade — **vender a dor, com cena concreta**:

> "WhatsApp inundado de perguntas — qual horário tem?, às 23h, no seu dia de folga"
> "Falta sem aviso — cadeira vazia, profissional esperando, dinheiro perdido"

**Dores que servem** (validadas por quem já vende): falta sem aviso · WhatsApp
lotado fora de hora · constrangimento de cobrar depois do atendimento · não
saber quanto cada profissional rendeu · agenda no papel.

**Dores que NÃO servem** (são da Leste, não do mercado): agendamento duplicado
por bug nosso · concluir atendimentos atrasados (mania do barbeiro da Leste).

---

## 6. WhatsApp — a decisão de custo

| Caminho | Custo | Risco |
|---|---|---|
| **API oficial Meta / Wati** | por conversa: ~R$ 30-90 **por barbearia/mês** | nenhum |
| **Evolution API em VPS** (HostGator R$ 21,69/mês, 150 números) | **~R$ 0,14 por barbearia/mês** | não oficial, número pode ser banido |

A oficial **custa mais que a mensalidade** — cada cliente daria prejuízo. E o
Agendei Fácil oferece lembretes ilimitados a R$ 67,90 com "WhatsApp SEU
conectado": é matematicamente impossível ser API oficial.

**Recomendação:** Evolution em VPS. O número é **da barbearia**, então um
banimento atinge um cliente, não o sistema inteiro. Risco distribuído, não
centralizado.

**Em aberto:** HostGator vs Hostinger vs VPS própria.

---

## 7. Infraestrutura e contas a criar

- [ ] **Nome do negócio** — ainda não existe
- [ ] Domínio
- [ ] Repositório GitHub novo
- [ ] Conta Vercel (plano gratuito no início)
- [ ] Projeto Supabase novo
- [ ] VPS para o Evolution API
- [ ] Mercado Pago — **assinatura recorrente** (preapproval) para o clube
- [ ] Perfis: Instagram, LinkedIn, TikTok, Facebook, YouTube
- [ ] Site da Agência JN (o rodapé da Leste cita a agência, que não tem site)

---

## 8. Qualidade e manutenção — e o objetivo de APRENDIZADO

**Reframe importante (06/09):** o dono é QA (formado, mas parado, sem prática
recente e com conteúdo enferrujado). O objetivo dele com esta esteira **não é só
ter CI/CD no produto — é APRENDER de verdade** a lógica e a teoria por trás, para
poder explicar numa entrevista.

Consequência direta no meu papel:
- **Os 191 testes atuais foram gerados por IA.** O dono é honesto: não os
  escreveu, não pode reivindicá-los como experiência sem entender a lógica. Isso
  é intelectualmente correto e deve ser respeitado — nada de inflar currículo.
- **Portanto não basta eu construir. Preciso ENSINAR enquanto construímos.**
  Cada ferramenta nova (Playwright, GitHub Actions, etc.) entra com: o que é, por
  que existe, a teoria por trás, e como explicar numa entrevista. Ritmo de quem
  aprende, não de quem só entrega.
- **Não começar CI/CD agora** (decisão do dono): não há produto novo ainda. CI
  sem produto é vazio. A ordem é: primeiro o esqueleto do produto, depois a
  esteira — e a esteira construída como material de estudo, passo a passo.
- Caminho de aprendizado a montar (rascunho): teoria de testes (pirâmide:
  unitário → integração → e2e) → ler e ENTENDER os testes que já existem →
  reescrever alguns à mão → Playwright do zero com explicação → GitHub Actions →
  versionamento. Um assunto por vez, com o "porquê" antes do "como".

### Exigências de engenharia para o produto:

- [ ] **Esteira de testes automatizados** (a Leste já tem 191 testes em `node:test`)
- [ ] **CI/CD** — rodar build e testes a cada push, bloquear merge que quebra
- [ ] **Versionamento visível**: registrar qual versão está em produção, para
      saber a qual voltar quando algo quebrar
- [ ] **Toda mudança de banco em migration** — nunca clicar no painel
- [ ] **Comentários explicando o porquê**, não o quê (padrão já adotado na Leste)
- [ ] Processo por fases, controlado

### Dívida herdada da Leste, que NÃO pode se repetir

**9 tabelas centrais** (`appointments`, `barbers`, `business_config`, `profiles`,
`services`, `working_hours`, `special_schedules`, `blocked_devices`,
`financial_transactions`) foram criadas clicando no painel do Supabase e **não
existem em migration nenhuma**. Consequência: não dá para provisionar a
barbearia nº 2 a partir do repositório, e o repositório não reconstrói o banco.

**No SaaS: nenhuma tabela nasce fora de migration. Regra sem exceção.**

---

## 9. Lições que valem para o produto

- **iOS 15 é obrigatório.** iPhone 6s/7/7 Plus/SE1 travam nele e são comuns no
  público de periferia. Nenhum concorrente parece testar isso.
- **Não usar telefone como identidade.** Foi a falha de segurança de 05/09.
  Posse é do aparelho, com assinatura criptográfica.
- **Login opcional para agendar, obrigatório para o clube.** Cobrança recorrente
  exige cadastro; agendamento comum não pode ter atrito. A própria Trinks
  oferece agendar sem instalar app "porque converte melhor com clientela mais
  velha".
- **Trilha de auditoria desde o dia 1.** Quando for cliente pagante dizendo
  "sumiu um agendamento", tem que existir resposta.
- **Barbeiro leigo é a especificação, não a limitação.** O guia de mercado
  descreve o erro clássico do setor como "sistema amplo com sobra de atrito".

---

## 10. Em aberto

- [ ] Nome do negócio
- [ ] Preço final
- [ ] Provedor de VPS para o WhatsApp
- [ ] Ferramenta de CI/CD
- [ ] Vale a pena estudar engenharia de dados? (pergunta de 06/09 — resposta
      preliminar: não agora, foco na trilha de QA + produto; a própria trilha de
      auditoria já vira base de análise de dados depois)
- [ ] Redesenho da tela de checkout — o incômodo é **aparência**, não função
- [ ] Onde o dono viu "+3 mil clientes" do Agendei Fácil (home só diz "Centenas")
- [ ] Montar o caminho de estudo de QA em detalhe (ver seção 8)
- [ ] Verificar se este doc cobre TUDO discutido desde o início do projeto, não
      só a partir de 06/09 (pedido do dono)
