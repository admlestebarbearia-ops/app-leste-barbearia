Como rodar os testes E2E

1. Escolha o ambiente

Por padrão, o Playwright usa a produção:

PLAYWRIGHT_BASE_URL=https://lestebarbearia.agenciajn.com.br

Para rodar com segurança cenários de pagamento, prefira staging ou local:

PLAYWRIGHT_BASE_URL=http://localhost:3000

2. Setup de autenticação

Rode uma vez por ambiente, ou sempre que a sessão expirar:

npm run e2e:setup

O setup abre dois logins sequenciais:

Primeiro: faça login com Google como usuário comum e aguarde redirecionar para /agendar.
Segundo: faça login com a conta admin e aguarde redirecionar para /admin.

As sessões ficam em e2e/.auth/ e não devem ser commitadas.

3. Rodar os testes

Todos os perfis principais:

npm run e2e

Perfis isolados:

npm run e2e:publico
npm run e2e:usuario
npm run e2e:admin

Suíte de pagamentos:

npm run e2e:payments

Importante: a suíte de pagamentos fica bloqueada por padrão quando PLAYWRIGHT_BASE_URL aponta para produção real. Para liberar conscientemente em produção, use:

ALLOW_PROD_PAYMENT_E2E=true

4. Relatório HTML

npm run e2e:report

Cobertura por perfil

Público: favicon, og:image, site.webmanifest, páginas estáticas e proteção de rotas.
Usuário: fluxo de agendamento, reservas, cancelamento e loja.
Admin: serviços, produtos, upload, agenda especial e pausa.
Pagamentos: criação de reserva pendente, retorno para reservas, retomada do checkout e cancelamento seguro da reserva pendente.
