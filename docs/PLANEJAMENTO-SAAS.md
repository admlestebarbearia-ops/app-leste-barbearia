# Planejamento — SaaS de agendamento para barbearias

> Documento vivo. Registra o que foi **decidido**, o que foi **descartado** e o
> que continua **em aberto** nas sessões de planejamento.
> Cada decisão traz a data e o **porquê** — porque daqui a três meses o motivo
> vale mais que a decisão.

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

### Tamanho do concorrente

O site do Agendei Fácil declara **"centenas de estabelecimentos"** e "milhares de
agendamentos por mês". A ~R$ 50 médio, isso dá ~R$ 15 mil/mês. Não é verificável
publicamente. Sinal indireto: a URL pública `/booking/4353` sugere identificadores
sequenciais na casa dos 4 mil **emitidos** — compatível com centenas ativos
depois do churn.

**Conclusão:** a barra é alcançável. O líder do bairro é um negócio pequeno.

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

## 8. Qualidade e manutenção

Exigências do dono, que é QA e quer usar o projeto como validação profissional:

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
- [ ] Vale a pena estudar engenharia de dados? (pergunta de 06/09)
- [ ] Redesenho da tela de checkout — o incômodo é **aparência**, não função
