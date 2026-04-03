📄 DOCUMENTO DE PLANEJAMENTO DO PROJETO: LESTE BARBEARIA
1. Visão Geral do Produto

Objetivo: Aplicativo web (Mobile-First) para agendamento da Leste Barbearia. Foco em total automação, interface fluida de página única e alta proteção contra trotes ou bots.

Abordagem de Desenvolvimento: Low-code, orquestrado via VS Code + GitHub Copilot.

Hospedagem e Custos: Infraestrutura 100% gratuita.

2. Stack Tecnológica e Arquitetura

Frontend & Rotas: Next.js (React) com App Router.

UI/UX e Estilização: Tailwind CSS + componentes shadcn/ui (Garante um Dark Mode premium, carregamento rápido e design moderno sem esforço manual).

Backend & Banco de Dados: Supabase (PostgreSQL + Autenticação nativa).

Hospedagem: Vercel (Deploy automático e otimizado).

3. Camadas de Segurança (Anti-Trote)

Barreira 1 (Identidade): Login obrigatório com Google via Supabase Auth (elimina anonimato).

Barreira 2 (Anti-Bot): Cloudflare Turnstile invisível na ação de confirmação.

Barreira 3 (Anti-Spam): Rate Limiting via Middleware do Next.js (bloqueia mais de 3 agendamentos por dia vindos do mesmo IP).

Barreira 4 (Controle do Dono): Botão de "Bloquear Cliente" no painel admin para casos de no-show (não comparecimento).

4. Estrutura do Banco de Dados (Escalável)
O banco já será modelado prevendo o crescimento da Leste Barbearia (adição de novos barbeiros no futuro).

users: Tabela gerenciada pelo Supabase Auth.

barbers: Profissionais (ID, Nome, Status ativo/inativo).

services: Catálogo (ID, Nome, Preço, Duração em minutos).

appointments: Agendamentos (ID, Cliente_ID, Barbeiro_ID, Serviço_ID, Data, Hora_Inicio, Status [confirmado, cancelado, faltou]).

🤖 OS PROMPTS DE COMANDO (Para o GitHub Copilot)
Copie e cole cada fase separadamente no Copilot, testando o resultado antes de passar para a próxima.

Fase 1: Setup e Autenticação

"Atue como um Engenheiro de Software Sênior. Crie o setup inicial de um projeto Next.js (App Router) com TypeScript, Tailwind CSS e shadcn/ui. O tema padrão deve ser Dark Mode. Integre o Supabase e configure a autenticação para 'Login com Google'. A regra de negócio é: a tela principal de agendamento só pode ser acessada por usuários logados; caso contrário, exiba um botão centralizado de login."

Fase 2: Banco de Dados e Segurança

"Crie o schema SQL no Supabase para um sistema de barbearia. Preciso das tabelas: barbers, services e appointments. Configure as Row Level Security (RLS) policies: clientes só podem ler serviços/barbeiros e inserir agendamentos no próprio nome. Crie também um Middleware no Next.js para limitar a rota de criação de agendamentos a no máximo 3 requisições por IP ao dia (Rate Limiting)."

Fase 3: Interface do Cliente (O Agendador da Leste Barbearia)

"Desenvolva a tela de agendamento do cliente em uma única página (Single Page flow) sem formato de chat.
Passo 1: Exibir os serviços em formato de cards selecionáveis.
Passo 2: Exibir um calendário mensal (use react-day-picker).
Passo 3: Ao clicar em um dia, calcular e exibir em 'pílulas' os horários disponíveis cruzando a duração do serviço selecionado com os horários já ocupados no banco de dados.
Ao final da tela, um botão fixo de 'Confirmar Agendamento' que salva no banco com status 'confirmado'."

Fase 4: Painel Administrativo

"Crie a rota protegida /admin exclusiva para o dono. Desenvolva um Dashboard limpo listando os agendamentos do dia atual. Cada card de agendamento deve mostrar o nome do cliente, serviço, valor e horário. Adicione dois botões de ação rápida para o barbeiro: 'Cancelar Agendamento' e 'Cliente Não Compareceu'."

📐 ESQUEMA VISUAL DO WIREFRAME (Página Única)
Assim será a estrutura visual projetada para a tela do celular do cliente da Leste Barbearia:

Plaintext
📱 TELA DO CELULAR (DARK MODE) 📱
====================================
|                                  |
|      [ LOGO LESTE BARBEARIA ]    |
|    __________________________    |
|   |   (G) Entrar com Google  |   |
|    ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾    |
|                                  |
|  1. O que vamos fazer hoje?      |
|                                  |
|  +----------------+  +---------+ |
|  | ✂️ Cabelo       |  | 🧔 Barba | |
|  |   R$ 30,00     |  | R$ 25,00| |
|  |   30 min       |  | 20 min  | |
|  +----------------+  +---------+ |
|                                  |
|  2. Escolha o melhor momento:    |
|                                  |
|   [ < ]     Abril 2026    [ > ]  |
|   D   S   T   Q   Q   S   S      |
|   1  [2]  3   4   5   6   7      |
|   8   9  10  11  12  13  14      |
|                                  |
|  Horários Livres (02/04):        |
|  [ 09:00 ] [ 09:30 ] [ 10:00 ]   |
|  [ 10:30 ] [ 11:00 ] [ 13:00 ]   |
|                                  |
|                                  |
| ================================ |
|  Resumo: Cabelo - 02/04 às 09:30 |
|  Profissional: Leste Barbearia   |
|                                  |
|  [   CONFIRMAR AGENDAMENTO   ]   |
====================================