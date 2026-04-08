# Realizar compras de teste

Depois de configurar seu ambiente de testes, você poderá realizar compras de teste para validar a integração com o Checkout Pro e verificar se os meios de pagamento configurados funcionam corretamente. A seguir, mostraremos como realizar diferentes verificações em sua integração.

> RED_MESSAGE
>
> Realize as compras de teste em uma **janela anônima** do seu navegador para evitar erros por duplicidade de credenciais no processo.

## Testar uma compra com cartão

Para testar uma compra com cartão de crédito ou débito, siga o passo a passo:

1. Acesse [Mercado Pago Developers](/developers/pt/docs) e faça login como o **usuário de teste comprador** criado previamente. Use o nome de usuário e senha associados à conta de teste. Para mais informações, consulte a seção [Obter uma conta de teste comprador](/developers/pt/docs/checkout-pro/integration-test).

> NOTE
>
> Se for solicitado um código por e-mail ao fazer login, insira o **código de 6 dígitos** associado à conta de teste que pode encontrar em **[Suas integrações](/developers/panel/app) > *Sua aplicação* > Contas de teste**.

2. Inicie o Checkout utilizando a preferência de pagamento configurada anteriormente. As instruções detalhadas sobre como proceder estão disponíveis na documentação [Adicionar o SDK ao frontend e inicializar o checkout](/developers/pt/docs/checkout-pro/web-integration/add-frontend-sdk).
3. **Em uma janela anônima do navegador**, acesse a loja onde você integrou o Checkout Pro, selecione um produto ou serviço e, na instância de pagamento, clique no botão de compra do Mercado Pago.
4. Por fim, realize uma compra de teste com os **cartões de teste** fornecidos abaixo. Para simular diferentes resultados de compra, utilize nomes variados para os titulares dos cartões de teste.

### Cartões de teste
O Mercado Pago fornece **cartões de teste** que permitirão que você teste pagamentos sem usar um cartão real.

Seus dados, como número, código de segurança e data de validade, podem ser combinados com os **dados relativos ao titular do cartão**, que permitirão que você teste diferentes cenários de pagamento. Ou seja, **você pode usar as informações de qualquer cartão de teste e testar resultados de pagamento diferentes a partir dos dados do titular**.

A seguir, você pode ver os **dados dos cartões de débito e crédito de teste**. Selecione aquele que você quer usar para testar sua integração.

| Tipo de cartão | Bandeira | Número | Código de segurança | Data de vencimento |
| :--- | :---: | :---: | :---: | :---: |
| Cartão de crédito | Mastercard | 5031 4332 1540 6351 | 123 | 11/30 |
| Cartão de crédito | Visa | 4235 6477 2802 5682 | 123 | 11/30 |
| Cartão de crédito | American Express | 3753 651535 56885 | 1234 | 11/30 |
| Cartão de débito | Elo | 5067 7667 8388 8311 | 123 | 11/30 |

Em seguida, escolha qual cenário de pagamento testar e preencha os campos do **titular do cartão** (Nome e sobrenome, Tipo e número de documento) conforme indicado na tabela abaixo.

| Status de pagamento | Nome e sobrenome do titular | Documento de identidade |
| --- | --- | --- |
| Pagamento aprovado | `APRO` | (CPF) 12345678909 |
| Recusado por erro geral | `OTHE` | (CPF) 12345678909 |
| Pagamento pendente | `CONT` | - |
| Recusado com validação para autorizar | `CALL` | - |
| Recusado por quantia insuficiente | `FUND` | - |
| Recusado por código de segurança inválido | `SECU` | - |
| Recusado por problema com a data de vencimento | `EXPI` | - |
| Recusado por erro no formulário | `FORM` | - |
| Rejeitado por falta de card_number | `CARD` | - |
| Rejeitado por parcelas inválidas | `INST` | - |
| Rejeitado por pagamento duplicado | `DUPL` | - |
| Rejeitado por cartão desabilitado | `LOCK` | - |
| Rejeitado por tipo de cartão não permitido | `CTNA` | - |
| Rejeitado devido a tentativas excedidas de pin do cartão | `ATTE` | - |
| Rejeitado por estar na lista negra | `BLAC` | - |
| Não suportado | `UNSU` | - |
| Usado para aplicar regra de valores | `TEST` | - |

Assim que você tiver preenchido todos os campos corretamente, clique no botão para processar o pagamento e aguarde o resultado. Se o teste foi bem-sucedido, a tela de sucesso da compra de teste será exibida.

Certifique-se de que está recebendo as notificações relacionadas à transação de teste, caso já tenha configurado as [notificações](/developers/pt/docs/checkout-pro/payment-notifications).

## Testar uma compra com um meio de pagamento offline

Confirme se sua integração está processando corretamente os meios de pagamento offline, como Pix ou Boleto. Lembre-se de que um teste bem-sucedido será aquele em que o estado do pagamento permanece como "pendente", já que as compras realizadas com meios de pagamento offline só são concluídas quando o cliente efetua o pagamento por outros canais.

Para realizar um teste, siga o passo a passo abaixo.

1. Acesse [Mercado Pago Developers](/developers/pt/docs) e faça login como o **usuário de teste comprador** criado previamente. Use o nome de usuário e senha associados à conta de teste. Para mais informações, consulte a seção [Obter uma conta de teste comprador](/developers/pt/docs/checkout-pro/integration-test).

> NOTE
>
> Se for solicitado um código por e-mail ao iniciar sessão, insira os **últimos 6 dígitos do User ID da conta de teste**, que você pode encontrar em **[Suas integrações](/developers/panel/app) > *Sua aplicação* > Contas de teste**.

2. Inicie o Checkout utilizando a preferência de pagamento configurada anteriormente. As instruções detalhadas sobre como proceder estão disponíveis na documentação [Adicionar o SDK ao frontend e inicializar o checkout](/developers/pt/docs/checkout-pro/web-integration/add-frontend-sdk).
3. **Em uma janela anônima do navegador**, acesse a loja onde você integrou o Checkout Pro, selecione um produto ou serviço e, na instância de pagamento, clique no botão de compra do Mercado Pago.
4. Selecione um meio de pagamento offline e complete o pagamento.

Caso o teste seja bem-sucedido, uma tela será exibida orientando sobre como concluir o pagamento.