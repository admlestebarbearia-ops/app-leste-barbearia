# Sistema de Agendamento para Barbearias e Salões de Beleza

Plataforma web **mobile-first** completa para gerenciamento de agendamentos em barbearias e salões de beleza. Construído com foco em automação total, experiência fluida para o cliente e proteção robusta contra trotes e bots.

---

## Visão Geral

O sistema elimina o agendamento manual via WhatsApp ou telefone, oferecendo ao cliente uma interface de autoatendimento disponível 24 horas. Para o profissional ou gestor, entrega um painel administrativo completo com gestão de agenda, serviços, equipe, loja de produtos e configurações do negócio — tudo em um único lugar.

---

## Funcionalidades para o Cliente

### Agendamento Online
- Interface **single-page** sem redirecionamentos: escolha serviço → barbeiro → data → horário → confirme
- Calendário inteligente que exibe apenas dias com atendimento disponível
- Horários calculados em tempo real respeitando duração de cada serviço e agenda já ocupada
- Confirmação instantânea com número do agendamento
- Página "Minhas Reservas" para acompanhar e cancelar agendamentos ativos

### Autenticação
- Login via **Google OAuth** (sem necessidade de cadastro manual)
- Sessão persistente — não precisa logar novamente a cada visita

### Cancelamento Autoatendimento
- Cliente pode cancelar diretamente pela plataforma dentro da janela configurada pelo estabelecimento
- Após o prazo, o cancelamento é bloqueado automaticamente

### Loja de Produtos
- Catálogo de produtos com imagem, descrição, preço e informações de tamanho
- Sistema de **reserva de produtos** com controle de quantidade: o cliente reserva o produto para retirar ao chegar
- Possibilidade de aumentar ou diminuir a quantidade da reserva
- Cancelamento de reserva com devolução automática ao estoque
- Suporte a estoque ilimitado para produtos de demanda contínua

### PWA (Progressive Web App)
- Pode ser instalado na tela inicial do celular como um aplicativo nativo
- Ícone personalizado e tela de carregamento configurável

---

## Funcionalidades para o Administrador

### Painel Principal
- Visualização da **agenda do dia** com todos os agendamentos listados
- Cards com nome do cliente, serviço, horário e valor
- Ações rápidas por agendamento: Confirmar, Cancelar, Marcar como "Não Compareceu", Concluir

### Configuração do Negócio (Onboarding Wizard)
- Assistente passo a passo na primeira configuração do estabelecimento:
  1. Dados gerais (nome, endereço, descrição, telefone)
  2. Fotos do estabelecimento e logo
  3. Horários de funcionamento por dia da semana (com intervalo de almoço)
  4. Cadastro dos serviços oferecidos
  5. Cadastro da equipe (barbeiros/profissionais)

### Horários de Funcionamento
- Configuração independente para cada dia da semana
- Suporte a **intervalo de almoço** por dia
- Intervalo entre slots configurável (ex.: grade de 30 em 30 minutos)

### Agendas Especiais
- Cadastro de **feriados e datas especiais** que fecham ou alteram o horário do dia
- Data especial pode definir horário personalizado (abertura/fechamento/almoço)
- O calendário do cliente automaticamente bloqueia ou ajusta os dias afetados

### Pausa Temporária
- Ativar/Desativar a **pausa de novos agendamentos** em tempo real
- Ideal para dias em que o profissional precisa suspender a agenda sem remover todos os horários

### Gestão de Serviços
- Cadastro de serviços com: nome, preço, duração em minutos e status (ativo/inativo)
- Serviços inativos não aparecem para novos agendamentos
- Duração do serviço usada diretamente no cálculo dos horários disponíveis

### Gestão de Equipe
- Cadastro de barbeiros/profissionais com nome e foto
- Controle de status ativo/inativo por profissional
- Agendamentos vinculados ao profissional correto

### Gestão de Produtos (Admin)
- Cadastro de produtos com: nome, preço, estoque, imagem, descrição completa e info de tamanho
- Ativação/desativação de produto e do módulo de reserva por produto
- Visualização de reservas ativas por produto com opção de concluir (marcar retirada) ou excluir

### Galeria de Fotos
- Upload de fotos do estabelecimento e equipe
- Imagens exibidas na página pública do negócio
- Compressão automática em WebP para melhor performance

### Segurança e Bloqueio
- **Bloqueio de dispositivo**: impede que um cliente específico faça novos agendamentos
- O bloqueio pode ser aplicado por ID de sessão, número de telefone ou ambos
- Filtro evita que clientes bloqueados apareçam na listagem de disponibilidade

### Configurações de Domínio
- Configuração do domínio/URL público do sistema

---

## Segurança

### Camadas Anti-Trote
| N° | Barreira | Implementação |
|---|---|---|
| 1 | Identidade | Login obrigatório com Google OAuth — elimina anonimato total |
| 2 | Anti-Bot | Supabase Auth com verificação de provedor confiável |
| 3 | Bloqueio Manual | Admin pode bloquear clientes específicos por device fingerprint ou telefone |
| 4 | Janela de Cancelamento | Cancelamentos fora do prazo são bloqueados automaticamente pelo servidor |

### Segurança de Dados
- **Row Level Security (RLS)** no banco de dados: cada usuário só acessa seus próprios dados
- Rotas administrativas protegidas por verificação server-side de e-mail autorizado
- Sem exposição de variáveis sensíveis no cliente
- Validações de negócio executadas exclusivamente no servidor (Server Actions)
- Proteção contra modificação de reservas de outros usuários

---

## Arquitetura Técnica

### Stack
| Camada | Tecnologia |
|---|---|
| Frontend & Roteamento | Next.js 15 (App Router) + TypeScript |
| Estilização | Tailwind CSS + shadcn/ui |
| Backend & Banco de Dados | Supabase (PostgreSQL + Auth + Storage) |
| Hospedagem | Vercel |

### Estrutura do Banco de Dados
| Tabela | Propósito |
|---|---|
| `barbers` | Profissionais do estabelecimento |
| `services` | Catálogo de serviços com duração e preço |
| `appointments` | Agendamentos com status e histórico |
| `business_config` | Configurações gerais do negócio |
| `working_hours` | Horários de funcionamento por dia da semana |
| `special_schedules` | Feriados e datas especiais |
| `blocked_devices` | Dispositivos/clientes bloqueados |
| `products` | Catálogo de produtos da loja |
| `product_reservations` | Reservas de produtos vinculadas a usuários |

### Padrões de Desenvolvimento
- **Server Actions** para todas as mutações — sem API routes desnecessárias
- **Pure functions** testáveis para toda a lógica de negócio crítica
- **103 testes automatizados** cobrindo todos os requisitos do sistema
- Snapshots de agenda para consistência em períodos de alta concorrência
- Upload de imagens com otimização automática (compressão WebP)

---

## Módulo de Testes

O sistema conta com uma suíte de **103 testes automatizados** cobrindo todos os requisitos de negócio:

| Módulo | Testes | Cobertura |
|---|---|---|
| Agendamento | 11 | Datas, serviços, guards de criação |
| Disponibilidade | 8 | Cálculo de slots, sobreposições, almoço, agenda especial |
| Cancelamento | 7 | Janela por deadline, status, casos extremos |
| Validação Admin | 17 | Horários, intervalos, serviços, schedules |
| Produtos | 19 | Reservas, estoque, cancelamento, admin |
| Bloqueio | 4 | Construção de filtros de dispositivos bloqueados |
| Sincronização | 5 | Cache de disponibilidade e chaves de invalidação |
| Fluxo Integrado | 4 | Cenários reais combinando múltiplos módulos |

Para executar os testes:
```bash
npm test
```

---

## Configuração e Deploy

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com) (plano gratuito suportado)
- Conta na [Vercel](https://vercel.com) para hospedagem

### Variáveis de Ambiente
```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
ADMIN_EMAIL=seu@email.com
```

### Banco de Dados
Execute o schema SQL disponível em `database/schema.sql` no SQL Editor do Supabase para criar todas as tabelas, índices e policies de RLS.

### Deploy
```bash
# Desenvolvimento local
npm run dev

# Build para produção
npm run build

# Deploy via Vercel CLI
vercel --prod
```

---

## Roadmap (Possíveis Expansões)

- [ ] Notificações por WhatsApp / SMS para lembretes de agendamento
- [ ] Página pública de perfil do estabelecimento com URL customizada
- [ ] Relatórios financeiros (faturamento por serviço, barbeiro, período)
- [ ] Sistema de fidelidade / pontuação para clientes frequentes
- [ ] Suporte a múltiplos estabelecimentos por conta (franquias)
- [ ] Integração com sistemas de pagamento online (Stripe / Mercado Pago)
- [ ] App mobile nativo (React Native) com push notifications

---

*Sistema desenvolvido com Next.js, Supabase e Tailwind CSS. Mobile-first, hospedagem gratuita via Vercel + Supabase Free Tier.*
