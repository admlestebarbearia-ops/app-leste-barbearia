Meu pedido foi: Evolução do app
Quero uma feature de recebimento de pagamentos quanto é complexo
implementar o mercado pago e liberar o agendamento somente após o pagamento?
Ter opção de ativar e desativar essa função via painel administrativo?
(Pagamentos adiantados (Opcional))

Quero um controle melhor dos horarios, 
O cliente tem a necessidade de evitar segundo ele bagunça no agendamento, evitar que um unico usuario faça varios agendamentos ocupando a agenda. Por exemplo: Cliente quer cortar todo sabado, ele não quer que seja possivel que um usuario faça esse tipo de reserva, preciso criar algo para que seja evitado isso. 
Porem de uma forma que não quebre a agenda e a forma que ela funciona.
Dar determinado controle para o administrador da agenda.

Quero poder via painel administrativo poder excluir usuários do sistema, 
Excluir não quer dizer que eu bani, eu só tirei sendo necessario novo cadastro do zero via google

Quero que no Painel administrativo tenha Ranking de clientes
Controle de clientes sumidos
Dado o numero de reservas feitas e concluidas com sucesso
Administrador apos serviço classifica nota do cliente.

* Sistema financeiro de ultima geração, sem complexidade, facil de interagir, registrar, editar, excluir, com as informações.
Buscar qual melhor modelo de sistema financeiro que se encaixa ao app e criar nosso plano de implementação.
Relatórios detalhados financeiro 
Quero que integrado ao sistema de agendamento e pagamentos concluidos e bem sucedidos tenha um controle financeiro
Painel Financeiro total
Gestão completa de clientes
Controle total de taxas de maquininha


O cliente sente a extrema necessidade de notificações de lembreta para o clientes dele, avisando o tempo que falta para iniciar o atendimento 1h e 30 minutos antes.

um sistema concorrente ofereceu para ele o seguinte:
Lembretes automáticos para clientes 1h antes no WhatsApp ILIMITADO
Lembretes automatico para clientes assinantes 1h antes no WhatsApp ILIMITADO

qual o melhor caminho que eu posso seguir para oferecer melhor?

O app deve ter pop-up ou mensagem de lembrete incentivando clientes a instalar o app. mesmo sendo PWA, 
Quero que seja um PWA leve, de extrema qualidade, rapido.

Eu vejo a necessidade que na tela de agendamentos, diminuir levemente o tamanho da logo da barbearia, mantendo efeitos e etc
ao clicar no serviço escolhido rolar automaticamente para o proximo nivel de seleção. 

evitar quebrar sistema que hoje já funciona, versão de atualização e evolução deve garantir que nada será quebrado no sistema que já funciona.

O planejamento deve sempre ter Regras de Negocio claros, Criterios de Aceites claros, e cobertura completa de todos os cenarios, todos.
layout mantem-se minimalista, leve, e facil de interagir e entender.

Sistema de notificação robusto para funcionar em multiplos sistemas com Som, vibração e notificações na tela. 

o concorrente oferece -  Você recebe notificações quando alguém agenda ou cancela com você
Você tem sistema totalmente intuitivo e fácil de usar
Vamos oferecer algo a nivel superios dentro dessas features.

O plano foi: 

Análise completa — o que penso sobre cada pedido
Mercado Pago — acesso à conta
Você não precisa das credenciais pessoais dele. O Mercado Pago tem um sistema de integração onde o lojista conecta a própria conta via OAuth (igual ao "Login com Google"). O fluxo é:

Você cadastra um app no portal de devs do MP com as configurações
O cliente (dono da barbearia) autoriza o app a cobrar em nome dele — um clique, sem expor senha
O dinheiro cai direto na conta MP dele, você nunca toca
Complexidade: Alta. É a feature mais trabalhosa da lista. Envolve:

Checkout Pro (redirecionamento para MP) ou Checkout Bricks (iframe embutido)
Webhook para receber confirmação de pagamento e liberar o agendamento
Lógica de expiração (cliente não pagou em X minutos → slot liberado)
Estorno automático se admin cancelar
Toggle no painel para ativar/desativar por serviço ou globalmente
Recomendo Checkout Pro (redireciona para o site do MP) — mais simples, menos código, zero problemas com PCI compliance.

Controle de agenda — evitar "reservas em série"
Complexidade: Baixa-média. É uma regra de negócio, não uma integração externa. O que eu implementaria:

Campo max_future_appointments em business_config (ex: 2 = máximo 2 agendamentos futuros simultâneos)
Campo max_appointments_per_week (ex: 1 = só pode ter 1 por semana)
Ambos controláveis pelo admin e verificados no servidor antes de confirmar
Isso não quebra nada — é só adicionar uma validação extra no createAppointment. O admin pode deixar os dois campos em branco para não ter limite, ou definir valores específicos.

Deletar usuário
Complexidade: Baixa. Supabase Auth tem admin.deleteUser(userId). Porém, atenção: você escolheu "deletar tudo, histórico some".

Minha recomendação é diferente: deletar a conta mas anonimizar o histórico (trocar client_id por null, manter client_name e client_phone). Assim o financeiro e a agenda histórica não ficam com buracos. Se o cliente insistir em deletar tudo, faço como ele pediu — mas alertarei no painel sobre a consequência.

Ranking + Clientes sumidos + Avaliação pelo admin
Complexidade: Baixa-média. Três coisas distintas:

Ranking: query pura — contar agendamentos com status = 'confirmado' por client_id, ordenar. Sem nova tabela.
Clientes sumidos: calcular MAX(date) dos agendamentos por cliente, mostrar quem não vem há X dias. Sem nova tabela.
Nota do admin: precisa de nova tabela client_ratings (id, client_id, appointment_id, score 1-5, note text). O admin avalia após o atendimento na tela da agenda.
São 3 features de leitura/display — a mais trabalhosa é a nota, pelo modal de avaliação.

Sistema Financeiro Completo
Complexidade: Alta — é a segunda mais complexa depois do MP. O modelo que mais se encaixa para uma barbearia é um Caixa por dia (igual ao que restaurantes e salões usam), não um ERP:

Receitas automáticas: geradas quando agendamento vai para status = 'concluído' (hoje não existe esse status — precisaria adicionar)
Receitas manuais: admin registra dinheiro que entrou (ex: pagamento na maquininha)
Despesas manuais: aluguel, produto, luz
Maquininha: admin informa taxa (ex: 1,99%) e o sistema calcula o líquido automaticamente
DRE mensal: soma receitas − despesas + impostos estimados
Painel financeiro: faturamento do dia/semana/mês, ticket médio, serviço mais lucrativo
Precisaria de uma nova tabela financial_entries e um novo status = 'concluído' em appointments (além de confirmado/cancelado/faltou).

Notificações de lembrete (1h e 30min antes)
Esta é a mais complexa de todas tecnicamente, e aqui está minha análise honesta:

Solução	Qualidade	Custo	Complexidade
Push notification (Service Worker)	Excelente em Android/PC	R$ 0	Média
Push notification no iOS	Só com app instalado (PWA)	R$ 0	Média
WhatsApp via Z-API/Evolution API	Perfeito, qualquer dispositivo	~R$ 50–150/mês	Alta
WhatsApp oficial (Meta Business API)	Igual ao concorrente	~R$ 0,25/msg	Alta + aprovação Meta
Como bater o concorrente com custo zero: Push notification agendada via Service Worker + banco. Criaríamos um cron job (Vercel Cron, gratuito) que roda a cada 15 minutos, busca agendamentos que começam em 1h ou 30min, e dispara push via Web Push API (protocolo aberto, sem custo). Chega na tela de bloqueio igual ao WhatsApp. A diferença é que o cliente precisa ter o app instalado (PWA).

Para bater o concorrente com WhatsApp real, o caminho é Z-API ou Evolution API (self-hosted). O que muda: mensagem chega mesmo sem o app instalado.

PWA leve + prompt de instalação + UX
Complexidade: Baixa. Já temos PWA funcionando. Faltam:

Banner de prompt mais visível (toasts periódicos convidando a instalar)
Logo 20% menor (de 172px → ~140px)
Scroll automático para próxima etapa ao selecionar serviço/barbeiro
Essas são as quick wins — entregam impacto visual rápido.

Proposta de ordem de implementação
Dado tudo isso, recomendo 4 fases priorizadas por impacto/complexidade:

Fase 1 — Quick wins (baixa complexidade, alto impacto visual)
Scroll automático · logo menor · prompt PWA melhorado · deletar usuário · controle de limite de agenda

Fase 2 — Engagement (média complexidade)
Ranking de clientes · clientes sumidos · avaliação pelo admin · notificações de lembrete via Push (cron job)

Fase 3 — Financeiro
Status "concluído" em agendamentos · painel financeiro · receitas automáticas e manuais · controle de maquininha · DRE

Fase 4 — Pagamento antecipado (Mercado Pago)
Checkout Pro integrado · webhook · expiração de slot · toggle no painel

Quer que eu crie o plano detalhado de alguma fase específica agora, ou o plano completo das 4 fases?

e mais pedido: inclui dados gerais sobre a api do mercado pago, ainda não entendi como eu crio a integração, mas mesmo que seja complexo vamos integrar,
fazer os testes devidos apos integrado

Os pagamentos que ele quer receber, credito / debito e pix

Podemos incluir opção que o adminitrador possa ativar via painel adm, pagar na barbearia pessoalmente ou só aceitar agendamentos com pagamentos com sucesso, ele configura isso via painel

Vamos usar o que for menos complexo com cobertura total e total integração ao app web

Acredito que a regra de agendamento deva ser
O cliente pode agendar X numeros de serviços no mesmo dia (configuravel via painel adm)
Dado que um usuario tenha agendamento ativo, não pode agendar para outros dias, somente apos agendamento cancelado ou concluido

Barbeiro pode decidir até quantos dias agenda fica aberta no calendario

Por exemplo agendamentos futuros aberto para até 2 a 30 dias, ou aberto para mais de 30 dias ou até data X.
trabalhar bem as regras e CA para evitar conflitos e confusões
Mas seria de fato ideal se o Barbeiro puder configurar de forma livre se ele quer deixar agenda 100% livre e aberta para agendamentos futuros, ou aberta somente para determinado tempo. Deu para entender, não sei se expliquei bem

Sobre excluir, incluir alert de aviso que historico vai sumir (não deletar usuarios com dados financeiros, ou seja, usuarios que tenham historico de serviços, permitir exclusão somente de usuarios sem serviços concluidos) Fica melhor assim, não?

Podemos manter notificações via Push notification (Service Worker)	Excelente em Android/PC	R$ 0	Média
Push notification no iOS	Só com app instalado (PWA)	R$ 0	Média
desde que com atraso quase zero, notificar de fato na tela e com som de notificação e vibração, 
seria interessante implementar notificação repetida caso usuario não abra ou interaja.
Notificar o barbeiro de novos agendamentos ou reservas de produtos e cancelamentos é primordial.

Obs: Eu inclui documentos do Mercado pago, incluindo MCP para facilitar integração e tornar o processo em si mais inteligente e agil

E o plano: 

Plan: Evolução v2 — Sistema Barbearia
TL;DR: 4 fases priorizadas por complexidade crescente. A Fase 1 e 2 não tocam no fluxo de agendamento existente — só adicionam regras/validações ao redor. Fase 3 estende o banco. Fase 4 (MP) é a única que altera o fluxo principal do cliente.

Fase 1 — Quick Wins (impacto visual imediato, baixo risco)
1. Logo menor

BookingForm.tsx linha ~453 — alterar width={172} height={172} para width={140} height={140}
2. Scroll automático ao selecionar serviço

Adicionar useRef para as seções de barbeiro, calendário e horários
Ao clicar em um serviço → barberRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
Mesmo padrão ao selecionar barbeiro → rola para calendário
Não altera nenhuma lógica existente, só adiciona efeito visual
3. PWA install banner mais ativo

Exibir um toast convidando a instalar 5 segundos após a página carregar (se !isInstalled && (installPrompt || isIOS))
Aparece no máximo 1 vez por sessão (via sessionStorage)
4. Deletar usuário no painel (Aba Segurança)

Nova server action deleteUser(userId) em admin/actions.ts
Antes de deletar: checar se existe algum appointment com status = 'confirmado' ou que tenha service_price_snapshot IS NOT NULL e date <= today
Se tem histórico → retorna erro com mensagem "Usuário com histórico de serviços não pode ser excluído"
Se não tem → supabase.auth.admin.deleteUser(userId) (cascade apaga profiles via FK)
Modal de confirmação no AdminDashboard com aviso em vermelho
Regras de negócio — Fase 1:

CA: Logo exibida com 140×140px, mantendo animate-logo-glow
CA: Ao selecionar serviço, tela rola suavemente para seção de barbeiro
CA: Toast de instalação aparece 1× por sessão, só se não instalado
CA: Admin não consegue deletar usuário com agendamentos históricos
CA: Admin consegue deletar usuário sem histórico; usuário some do sistema e precisa fazer novo cadastro
Fase 2 — Controle de Agenda + Notificações de Lembrete
5. Regras de agenda configuráveis — 3 campos novos em business_config:

Campo	Tipo	Padrão	Descrição
max_appointments_per_day	INTEGER	3	Máx. agendamentos no mesmo dia por cliente
block_multi_day_booking	BOOLEAN	false	Se true: cliente com agendamento futuro ativo não pode reservar outro dia
calendar_max_days_ahead	INTEGER	null	Agenda aberta até N dias a partir de hoje (null = livre)
calendar_open_until_date	DATE	null	Agenda aberta até data fixa (prevalece sobre max_days_ahead se ambos preenchidos)
Migration SQL nova. Validação em createAppointment no servidor — sem alterar o algoritmo de slots existente. Admin configura na Aba Preferências (novos inputs abaixo da janela de cancelamento).

Regras de Negócio — Fase 2 (agenda):

CA: Se max_appointments_per_day = 2, cliente que já tem 2 agendamentos confirmados no dia X não consegue agendar um terceiro naquele dia
CA: Se block_multi_day_booking = true e cliente tem agendamento confirmado no dia X, tentativa de agendar dia Y (Y ≠ X) retorna erro "Você já possui um agendamento ativo. Cancele-o para agendar em outro dia."
CA: Se block_multi_day_booking = true, cliente pode agendar múltiplos serviços no mesmo dia do agendamento ativo (até o limite de max_appointments_per_day)
CA: Se calendar_max_days_ahead = 7, datas além de hoje+7 aparecem desabilitadas no DayPicker
CA: Se calendar_open_until_date preenchida, datas após aquela data aparecem desabilitadas
CA: Se ambos nulos, calendário totalmente livre (comportamento atual mantido)
CA: Mudança de configuração não cancela agendamentos já feitos
6. Notificações de lembrete (1h e 30min antes)

Arquitetura: Vercel Cron + Web Push API

Novos arquivos:

src/app/api/cron/reminders/route.ts — endpoint GET protegido por CRON_SECRET
src/app/api/push/subscribe/route.ts — salva subscription do cliente
Tabela push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
vercel.json com cron "*/15 * * * *" apontando para /api/cron/reminders
Fluxo:

Cliente usa o app → BookingForm registra push subscription (com permissão)
Cron roda a cada 15min → busca appointments status='confirmado' com date+start_time entre now+55min e now+65min (janela de 1h) e entre now+25min e now+35min (janela de 30min)
Para cada um, envia Web Push para o endpoint salvo
Service Worker recebe e exibe notificação na tela de bloqueio com som + vibração
Flag reminder_1h_sent e reminder_30min_sent em appointments para não reenviar
7. Admin notificado de cancelamentos

Canal Supabase realtime em AdminDashboard já ouve appointments — adicionar event: 'UPDATE' e checar se status mudou para 'cancelado'
Toast "❌ Agendamento cancelado — [nome] [data]" + notificação SW + som + vibração
Regras de negócio — Fase 2 (notificações):

CA: Lembrete de 1h enviado entre 55–65min antes do horário
CA: Lembrete de 30min enviado entre 25–35min antes
CA: Se agendamento cancelado após lembrete enviado, nenhum novo lembrete é enviado
CA: Admin recebe push de cancelamento imediatamente via realtime
CA: Clientes sem subscription de push não recebem (não há erro, só silêncio)
CA: Push subscription renovada automaticamente se expirar
Fase 3 — Gestão de Clientes + Sistema Financeiro
8. Status "concluído" em appointments

Adicionar 'concluido' no CHECK constraint de status
Botão "Concluir" na lista de agendamentos do admin (aparece só para agendamentos confirmados do dia atual)
Ao concluir → cria financial_entry automaticamente
9. Rating do admin por agendamento

Nova tabela client_ratings (id, appointment_id UNIQUE, client_id, score 1–5, note TEXT, created_at)
Modal de avaliação abre ao clicar "Concluir" — admin dá nota e comentário opcionais
Exibido no perfil do cliente na Aba Segurança/Clientes
10. Aba Clientes (nova aba no admin)

Ranking: query COUNT(appointments.id) WHERE status='concluido' por client_id, ordenado DESC. Exibe top clientes com nome, qtd de serviços, total gasto, nota média
Clientes sumidos: clientes com último agendamento há mais de X dias (configurável, padrão 30). Botão de contato via WhatsApp
Avaliação média calculada de client_ratings
11. Sistema Financeiro

Nova tabela financial_entries (id, type 'receita'|'despesa', source 'agendamento'|'produto'|'maquininha'|'manual', amount NUMERIC, description TEXT, payment_method TEXT, card_rate_pct NUMERIC, net_amount NUMERIC gerado, reference_id UUID nullable, date DATE, created_by UUID, created_at)
net_amount = amount × (1 - card_rate_pct/100) calculado no servidor ao inserir
Nova Aba Financeiro no Admin com:
Visão diária (caixa do dia): total bruto, total líquido, lista de entradas
Visão mensal: DRE simplificado (receitas − despesas = resultado)
Filtros: semana / mês / intervalo customizado
Formulário: adicionar despesa manual (aluguel, produto, etc.)
Configuração de taxa padrão da maquininha (salvo em business_config.default_card_rate_pct)
Receitas automáticas criadas ao concluir agendamento e ao marcar reserva de produto como "retirado"
Regras de negócio — Fase 3:

CA: Somente agendamentos do dia atual podem ser marcados como "concluído"
CA: Ao concluir, financial_entry criada automaticamente com source='agendamento'
CA: Despesas manuais podem ser editadas e excluídas pelo admin
CA: Receitas automáticas não podem ser excluídas diretamente (apenas via estorno manual)
CA: DRE mostra: total receitas, total despesas, resultado, taxa média de maquininha
CA: Cliente com apenas agendamentos cancelados/faltou e sem rating = pode ser excluído
Fase 4 — Pagamento Antecipado (Mercado Pago Checkout Pro)
Configuração inicial (1 vez):

O cliente (dono da barbearia) abre o Painel do Desenvolvedor do MP, cria um app e copia o Access Token de produção
No painel admin, nova seção "Integrações" → campo para colar o MP_ACCESS_TOKEN
Salvo em business_config.mp_access_token e também em variável de ambiente do Vercel (mais seguro)
Novos campos em business_config:

Campo	Tipo	Descrição
mp_access_token	TEXT	Access Token do vendedor (criptografado)
payment_mode	TEXT	'presencial' ou 'online_obrigatorio'
payment_expiry_minutes	INTEGER	Minutos para expirar slot reservado (padrão 15)
Nova tabela payment_intents:


id UUID, appointment_id UUID, mp_preference_id TEXT,mp_payment_id TEXT nullable, status ('pending'|'approved'|'rejected'|'expired'),amount NUMERIC, expires_at TIMESTAMPTZ, created_at
Fluxo completo:

Cliente confirma agendamento → se payment_mode = 'online_obrigatorio':

Server action createAppointment cria appointment com status = 'aguardando_pagamento' (novo status)
Cria payment_intent com expires_at = now + payment_expiry_minutes
Chama API MP: POST /checkout/preferences com item = "Serviço: {nome}", unit_price = service_price, back_urls, notification_url = /api/webhooks/mercadopago
Retorna init_point (URL do MP) para o cliente
Cliente é redirecionado para o Checkout Pro do MP (crédito/débito/pix)
Webhook POST /api/webhooks/mercadopago:

Recebe {"action": "payment.updated", "data": {"id": "..."}}
Valida assinatura com x-signature header (segurança)
Consulta GET /v1/payments/{id} para confirmar status
Se approved → atualiza payment_intent.status = 'approved', appointment.status = 'confirmado'
Se rejected → status = 'rejected', slot liberado, cliente notificado
Cron de expiração (junto com o cron de lembretes):

Busca payment_intents WHERE status='pending' AND expires_at < now
Atualiza para 'expired', libera o slot (appointment deletado ou status 'cancelado')
Se payment_mode = 'presencial' → fluxo atual mantido 100%, sem mudança

Back URLs:

/agendar/pagamento/sucesso?payment_id={id} — exibe confirmação
/agendar/pagamento/falha — orienta tentar novamente
/agendar/pagamento/pendente — avisa que pagamento está sendo processado (PIX)
Regras de negócio — Fase 4:

CA: Se payment_mode = 'presencial', fluxo de agendamento idêntico ao atual
CA: Se payment_mode = 'online_obrigatorio', slot apenas confirmado após webhook de aprovação
CA: Slot ocupado por status = 'aguardando_pagamento' não aparece como disponível para outros clientes durante os payment_expiry_minutes
CA: Após payment_expiry_minutes sem pagamento, slot é liberado e cliente recebe notificação
CA: PIX pode ter status pending por até 30min — appointment fica aguardando_pagamento
CA: Admin pode alterar payment_mode a qualquer momento; afeta só novos agendamentos
CA: Crédito, débito e PIX habilitados por padrão no MP (sem exclusão de métodos)
CA: Estorno não é automático — admin acessa painel do MP para estornar manualmente (fora do escopo v2)
Arquivos principais afetados por fase:

Arquivo	Fase
BookingForm.tsx	1, 2, 4
AdminDashboard.tsx	1, 2, 3, 4
admin/actions.ts	1, 2, 3, 4
agendar/actions.ts	2, 4
database/schema.sql	2, 3, 4
supabase/migrations/ (novos arquivos)	2, 3, 4
src/app/api/cron/reminders/route.ts (novo)	2
src/app/api/push/subscribe/route.ts (novo)	2
src/app/api/webhooks/mercadopago/route.ts (novo)	4
src/app/agendar/pagamento/ (novas páginas)	4
vercel.json (novo)	2
Verificação por fase:

Build sem erros + logo 140px visível + scroll suave funcionando + delete usuário bloqueado com histórico
Cron disparando localmente + notificação chegando 1h antes em Android + admin notificado de cancelamentos
Botão concluir disponível + financial_entry criada automaticamente + DRE exibindo corretamente
Checkout Pro abrindo em ambiente de teste MP + webhook recebendo + agendamento confirmado após aprovação
Fora de escopo desta versão: estorno automático MP · WhatsApp API · Android/iOS app nativo · múltiplos barbeiros com agendas independentes por pagamento