# Barbearia Leste

Aplicação web da Barbearia Leste construída com Next.js, Supabase e integração de pagamentos com Mercado Pago.

## Stack principal

- Next.js 16 com App Router
- React 19
- TypeScript
- Supabase para autenticação e persistência
- Mercado Pago Checkout Bricks para pagamento online
- Playwright para E2E

## Comandos principais

### Desenvolvimento

```bash
npm run dev
```

### Build de produção

```bash
npm run build
npm run start
```

### Testes unitários

```bash
npm test
```

### Testes E2E

```bash
npm run e2e
npm run e2e:publico
npm run e2e:usuario
npm run e2e:admin
npm run e2e:payments
```

O fluxo detalhado dos E2E está em Como rodar os testes E2E.md.

## Observações importantes

- A suíte de pagamentos fica bloqueada por padrão quando o Playwright aponta para produção real.
- Para validar pagamentos com segurança, use PLAYWRIGHT_BASE_URL em ambiente local ou staging.
- O setup de autenticação E2E depende de sessões salvas em e2e/.auth/.
- O webhook do Mercado Pago é a fonte oficial de confirmação de pagamentos.

## Estado atual da entrega

- Histórico de reservas do cliente corrigido, incluindo concluídas, canceladas e antigas.
- Fluxo de pagamento do Mercado Pago endurecido no backend.
- Rotas de pagamento e webhook extraídas para lógica testável com cobertura automatizada.
- Build de produção e suíte unitária validados.
