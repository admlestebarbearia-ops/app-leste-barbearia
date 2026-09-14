# Verificação de marca do Google (OAuth) — Leste Barbearia

Documento de trabalho da FASE 2 da auditoria. Última atualização: **14/09/2026**.

Domínio de produção: `https://lestebarbearia.agenciajn.com.br`
Projeto Supabase (host do fluxo OAuth): `vvpiuprztpvqvlscjkow.supabase.co`

---

## 1. Que verificação é esta, exatamente

Existem **duas** verificações diferentes no Google, e confundi-las custa semanas:

| | Verificação de marca (*brand verification*) | Verificação de escopos sensíveis/restritos |
|---|---|---|
| Quando se aplica | App externo + publicado + mostra nome ou logo na tela de consentimento | App pede escopos *sensitive* ou *restricted* |
| O que exige | Home pública, política de privacidade, conformidade de marca | Tudo acima + vídeo demonstrativo, justificativa de uso, avaliação de segurança anual |
| Prazo típico | Automático em minutos; revisão manual 2–3 dias úteis | Semanas a meses |

**Este app cai apenas na primeira.** O login é
`supabase.auth.signInWithOAuth({ provider: 'google' })` em
[src/lib/auth-actions.ts](../src/lib/auth-actions.ts), **sem a opção `scopes`** —
ou seja, o padrão do Supabase: `openid email profile`, todos **não sensíveis**.

Consequência prática: não há vídeo a gravar nem avaliação de segurança a
contratar. O que reprovou foram itens do checklist de marca.

---

## 2. Requisitos atuais do Google (fonte primária, consultada em 14/09/2026)

**Página inicial do app** — [App Homepage](https://support.google.com/cloud/answer/13807376) · [Verification requirements](https://support.google.com/cloud/answer/13464321):

- Precisa estar **visível sem exigir login** ("publicly accessible, and not just
  accessible to your site's logged-in users").
- Precisa **descrever a funcionalidade do app**.
- Precisa **explicar com transparência por que o app pede dados do usuário**.
- Precisa **linkar a política de privacidade**, a mesma configurada na tela de
  consentimento.
- Precisa estar **hospedada em domínio verificado como seu** no Search Console.
- **Não pode ser link encurtado** nem redirecionar para outro domínio.
- Não pode ser página do Google Play, Facebook, Instagram etc.

> **Nenhum desses requisitos diz que a home precisa ser a raiz do domínio.** O
> campo do Console chama-se "Página inicial do aplicativo" e aceita qualquer URL
> estática do domínio verificado. Por isso `/app` é uma arquitetura válida: a
> rota `/` continua sendo a entrada do aplicativo e `/app` é a URL declarada.

**Diretrizes de marca** — [Branding guidelines](https://developers.google.com/identity/branding-guidelines) · [App identity & branding](https://support.google.com/cloud/answer/13804963):

- O nome do app na tela de consentimento precisa **bater com o nome exibido na
  home**. É o motivo de reprovação mais reportado:
  *"The app name shown on your OAuth consent screen does not match the app name on your homepage."*
- O logo não pode imitar outra marca **nem usar nome, ícone ou logo do Google**.
- Botão de login: texto "Entrar com Google" (tradução permitida), "G" oficial
  colorido, fundo **somente** claro `#FFFFFF`, escuro `#131314` ou neutro
  `#F2F2F2`.

**Conformidade de política** — [Policy compliance](https://developers.google.com/identity/verification/authentication-policy-compliance):

- Domínios de home, privacidade, termos **e redirect URI** com posse comprovada
  no Google Search Console.
- Redirect URIs e origens JavaScript em HTTPS.
- Pedir o mínimo de escopos necessário.

---

## 3. Por que o Google disse que a home estava "protegida por login"

Não foi falso positivo. A rota `/` é, literalmente, a tela de entrada do app:
logo, um rótulo de 10 px, uma tagline e um card cujo elemento dominante é o
botão do Google. O link "Agendar sem Login" só aparece quando
`business_config.require_google_login === false` — ou seja, o barbeiro pode
transformar a página em muro de login mexendo numa chave do painel.

Nenhuma frase explicava o que o app faz, para quem, nem por que pede dados. Os
dois motivos do Google ("está protegida por uma página de login" e "não explica
a finalidade do app") descrevem exatamente essa página.

**A solução adotada não foi mudar `/`.** Foi criar uma landing pública de
verdade em `/app` e declarar essa URL como "Página inicial do aplicativo".

---

## 4. O que foi feito no código

### 4.1 Nova rota `/app` — landing pública

[src/app/app/page.tsx](../src/app/app/page.tsx). Peça de marca com layout
próprio, não uma versão maior da tela de login:

- **Hero dividido**: no desktop, texto à esquerda e a foto do salão ocupando
  uma coluna inteira (a foto é retrato — full-bleed a esmagaria); no mobile, a
  foto vira fundo com scrim. Tipografia de display **Oswald** condensada,
  contraste entre peso 600 e 300.
- **Assinatura gráfica**: o poste de barbeiro (vermelho/off-white/azul, tirado
  do próprio logo) — régua fina nos rótulos, faixa entre as seções, e um
  **cilindro estilizado com listras girando, vidro e brilho percorrendo** no
  hero (xl) e no CTA final. Tudo em CSS, por `transform`.
- **Especialidades**: "Cabelo · Barba · Tratamentos" — texto **institucional
  escrito no código**, sem preços. No mobile é um trilho horizontal com
  `scroll-snap` (cartões); a partir de 640px vira grade de 3 colunas separadas
  por hairline.
- **O aplicativo**: quatro capacidades numeradas + um **mock do app desenhado em
  CSS**, usando os tokens visuais do app de verdade (`#161616` de fundo, `#222`
  nos cartões, azul `#0b4196` no selecionado) para ler como "este é o
  aplicativo". Os chips de horário têm hover no desktop e press no mobile —
  **demonstrativos, não funcionais**: o bloco inteiro é `aria-hidden`, então
  nenhum leitor de tela anuncia um botão que não existe.
- **Conta Google**: bloco de duas colunas — "O que recebemos" × "O que não
  acessamos" — e o botão isolado da landing (ver 4.4). Não compete com o CTA.
- **Visite a Leste**: endereço, WhatsApp, Instagram e um bloco "Atendimento com
  hora marcada". **Sem tabela de horários** — a agenda da casa muda o tempo
  todo, e publicar `Seg 10:30–19:00` seria informação que envelhece sozinha. O
  bloco manda consultar a disponibilidade real no app, o que é verdadeiro em
  qualquer dia.
- **CTA final** sobre a foto + rodapé com privacidade, termos e agendar.

Hierarquia de conversão: o CTA comercial é sempre **"Agendar agora"** (pílula
off-white sólida, h-12); o Google aparece uma única vez, em h-10, dentro do
bloco que o explica.

**Movimento** ([landing.module.css](../src/app/app/landing.module.css)): uma
curva e duas durações para a página inteira; só `transform`/`opacity`; entrada
por scroll com `animation-timeline: view()` — **sem JavaScript**, para nunca
servir a página em `opacity: 0` a um rastreador sem JS.
`prefers-reduced-motion: reduce` desliga tudo.

O parallax de ponteiro no hero foi **removido**: no mobile não existe ponteiro e
no desktop o movimento brigava com a leitura. Sobrou a respiração autônoma da
foto (32s, amplitude de 2%). Com isso a landing não carrega **nenhum JavaScript
próprio** além do botão do Google.

### 4.2 A rota `/` não foi tocada

`git diff src/app/page.tsx` → vazio. A experiência de entrada em produção segue
idêntica.

### 4.3 Nenhum dado operacional ou privado na landing

- Lê **4 campos** de `business_config` (`logo_url`, `address`,
  `whatsapp_number`, `instagram_url`). Nada mais — nem `working_hours`.
- **Não lê `services`. Não exibe preço nenhum.** Os nomes cadastrados no painel
  são operacionais ("Corte e progressiva", "Corte é luzes aparti") e não servem
  como peça de marketing — por isso o conteúdo de serviço é texto fixo no código.
- Não toca em `appointments`, `profiles`, `payment_intents`, `audit_log` nem em
  segredos.
- Varredura do HTML servido em `/app`: `APP_USR`, `mp_access_token`,
  `mp_refresh_token`, `mp_webhook_secret`, `service_role`, `client_phone`,
  `client_email`, `R$`, `Luzes`, `progressiva` → **0 ocorrências**.
- `curl -L /app` sem cookies: **HTTP 200, 0 redirects**.

Nenhuma correção de segurança da auditoria foi revertida. RLS, GRANTs e o painel
administrativo seguem exatamente como estavam.

### 4.4 Botão "Entrar com Google" — componente isolado da landing

A `/app` usa [src/app/app/GoogleButton.tsx](../src/app/app/GoogleButton.tsx),
**criado só para ela**. O `LoginButton` compartilhado com a rota `/` **não foi
tocado** (`git diff` vazio) — decisão do dono do projeto: zero alteração visual
na tela que está em produção nesta sprint.

O botão da landing segue a especificação oficial do tema escuro, conferida em
14/09/2026: fill `#131314`, stroke `#8E918F` 1px, texto `#E3E3E3`, medium 14/20,
padding 12px / 10px / 12px, "G" oficial colorido sem alteração de cor ou
tamanho, texto "Entrar com Google" (tradução é permitida e recomendada). A
documentação não especifica raio de canto nem proíbe estados de hover — por isso
o raio e a elevação de 2px são permitidos.

Hierarquia: o CTA comercial é "Agendar agora" (pílula off-white, h-12, 4
ocorrências na página); o botão do Google é h-10, dentro do bloco que explica a
conta. Não competem.

> ⚠️ **Pendência conhecida, não corrigida por decisão do dono.** Na rota `/`, o
> `LoginButton` usa `variant="outline"`, que com `forcedTheme="dark"` resolve
> para `dark:bg-input/30` — fundo **translúcido**. Como o botão fica sobre a
> foto desfocada, o "G" colorido oficial aparece sobre fundo fotográfico
> arbitrário, o que as diretrizes proíbem. Se o Google reprovar novamente em
> "Diretrizes de marca" depois de o nome do app estar correto, **este é o
> próximo suspeito**.

### 4.5 Termos de Uso — correção de fato, não estética

O item 2 dos [Termos](../src/app/termos/page.tsx) afirmava que *"para agendar, é
necessário autenticar-se com uma conta Google"* — **falso**: o app permite
agendamento como convidado, e a landing diz que o login é opcional. O Google
confere se home, termos e privacidade representam o app com fidelidade; deixar
os três discordando entre si é risco gratuito. Texto reescrito para descrever os
dois fluxos.

**A Política de Privacidade não foi tocada** — ela já passou na avaliação.

> Observação factual: as rotas reais são `/privacidade` e `/termos`. Não existe
> prefixo `/br` no projeto (`src/app/br` não existe e o build não gera essa rota).

### 4.6 `sitemap.xml` deixou de dar 404

`public/robots.txt` anunciava `https://lestebarbearia.agenciajn.com.br/sitemap.xml`
desde sempre, mas o arquivo nunca existiu — a URL respondia 404. Criado
[src/app/sitemap.ts](../src/app/sitemap.ts) com `/app`, `/`, `/privacidade` e
`/termos`.

### 4.7 O que deliberadamente NÃO foi mexido

- Nada no Google Cloud Console. Nenhum Client ID, secret, redirect URI, origem
  ou domínio autorizado.
- Nada na configuração de Auth do Supabase.
- A rota `/`, o proxy, a RLS, os GRANTs, o painel admin.
- A Política de Privacidade.

---

## 5. O que só você pode fazer (passo a passo no Console)

A marca está **"em análise"**. Nenhum passo abaixo reinicia a análise por si só;
editar os campos de branding, sim, costuma exigir novo envio. Por isso: **faça o
deploy primeiro**, confira, e só então edite o que for necessário.

### Passo 1 — Deploy

Publicar estas mudanças. O Google busca a página **em produção**; enquanto
`/app` não existir no ar, não adianta apontar o campo para ela.

### Passo 2 — Conferir em janela anônima

- `https://lestebarbearia.agenciajn.com.br/app` → abre inteira, sem login
- `https://lestebarbearia.agenciajn.com.br/privacidade` → abre
- `https://lestebarbearia.agenciajn.com.br/termos` → abre
- `https://lestebarbearia.agenciajn.com.br/sitemap.xml` → responde 200

### Passo 3 — Search Console

1. <https://search.google.com/search-console>
2. Propriedade do tipo **Domínio**: `agenciajn.com.br` (cobre o subdomínio).
3. Verificar por **registro TXT no DNS**.
4. Com **a mesma conta Google** que é owner/editor do projeto no Google Cloud.

> A Política de Privacidade já apareceu **aprovada**, o que sugere que a posse do
> domínio já está reconhecida. Confirme mesmo assim.

### Passo 4 — Campos de branding

**Google Cloud Console → APIs e Serviços → Tela de permissão OAuth → Branding**:

| Campo | Valor |
|---|---|
| **Nome do app** | `Leste Barbearia` |
| **Página inicial do aplicativo** | `https://lestebarbearia.agenciajn.com.br/app` |
| Política de Privacidade | `https://lestebarbearia.agenciajn.com.br/privacidade` |
| Termos de Serviço | `https://lestebarbearia.agenciajn.com.br/termos` |
| E-mail de suporte | um e-mail que você realmente lê |
| Logo | o logo da Leste (sem elementos do Google) |

O **nome do app precisa ser idêntico** ao que a landing exibe. A `/app` mostra
`LESTE BARBEARIA` no `<h1>`, no rodapé e no `<title>`. Se o Console estiver com
"Barbearia Leste", "barbearia-leste", "agenciajn" ou o nome do projeto Supabase,
**isso sozinho reprova em "Diretrizes de marca"**.

Sem barra sobrando, sem encurtador, sem `www` (o site não responde em `www`).

### Passo 5 — Domínios autorizados

Precisa constar `agenciajn.com.br`. **Não remova nada que já esteja lá.**

⚠️ **Ponto de atenção — `supabase.co`.** O fluxo OAuth passa pelo Supabase: o
redirect URI do client é
`https://vvpiuprztpvqvlscjkow.supabase.co/auth/v1/callback`. A política diz que
**todos** os domínios, inclusive os de redirect URI, devem ter posse comprovada
no Search Console — e `supabase.co` é da Supabase, não sua.

Hoje o checklist **não** está reclamando disso. **Não mexa.** Se em uma próxima
rodada aparecer erro citando domínio não verificado ou `supabase.co`, a solução
conhecida é o **Custom Domain do Supabase** (add-on pago, ~US$ 10/mês): o Auth
passa a responder em `auth.agenciajn.com.br`, o redirect URI vira
`https://auth.agenciajn.com.br/auth/v1/callback`, e o domínio passa a ser seu e
verificável. Ganho extra: a tela de consentimento deixa de mostrar o host
`vvpiuprztpvqvlscjkow.supabase.co` para o cliente.

### Passo 6 — Reenviar

Salvar e clicar em **Enviar para verificação**. Acompanhar o e-mail do contato
de suporte. Automático leva minutos; revisão manual, 2–3 dias úteis.

---

## 6. Risco residual de nova reprovação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Nome do app no Console ≠ `Leste Barbearia` | **Alta** — é o motivo nº 1 reportado, e não temos como ver o valor atual | Passo 4 |
| `agenciajn.com.br` não verificado, ou verificado por outra conta Google | Média | Passo 3 |
| Revisor considerar que a home deveria ser a raiz do domínio | Baixa | A documentação fala em URL da página inicial, não em raiz; e a `/app` é uma página de marca real, não um artifício |
| Logo do app no Console com elemento do Google | Baixa | Passo 4 |
| `supabase.co` no redirect URI | Baixa hoje | Custom Domain, só se o Google reclamar |
| Fonte do botão não ser Google Sans | Muito baixa | Trocar a família só no botão |

---

## 7. Checklist de reenvio

- [ ] Deploy em produção concluído
- [ ] `/app` abre em janela anônima com todo o conteúdo, sem redirect
- [ ] `/privacidade` e `/termos` abrem sem login
- [ ] `/sitemap.xml` responde 200
- [ ] `agenciajn.com.br` verificado no Search Console, pela conta owner do projeto GCP
- [ ] Nome do app no Console = `Leste Barbearia`
- [ ] "Página inicial do aplicativo" = `https://lestebarbearia.agenciajn.com.br/app`
- [ ] Logo sem elementos do Google
- [ ] Enviado para verificação
