# Criar aplicação

As **aplicações** são entidades registradas dentro do Mercado Pago que atuam como um identificador único para gerenciar a autenticação e a autorização de suas integrações. Ou seja, são o vínculo entre seu desenvolvimento e o Mercado Pago e constituem como a primeira etapa para realizar a integração.

Com elas, é possível acessar as :toolTipComponent[credenciais]{link="/developers/pt/docs/credentials" linkText="Credenciais" content="Chaves de acesso únicas que usamos para identificar uma integração na sua conta, estando vinculadas à sua aplicação. Para mais informações, acesse o link abaixo."} necessárias para interagir com nossas APIs ou serviços específicos, além de gerenciar e organizar sua integração. Por isso, será necessário criar uma aplicação para cada solução do Mercado Pago integrada.

Para criar uma **aplicação**, siga os passos abaixo.

1. No canto superior direito de Mercado Pago Developers, clique em **Entrar** e faça login em sua conta do Mercado Pago.
2. Com a sessão iniciada, no canto superior direito do Mercado Pago Developers, clique em **Criar aplicação** se a sua conta ainda não tiver nenhuma aplicação criada, ou acesse "Suas integrações" e selecione **Ver todas**. Nela, clique em **Criar aplicação**.
3. Uma vez dentro de **Suas integrações**, clique no botão **Criar aplicação**.

> NOTE
>
> Para proteger sua conta e garantir a conformidade das operações, durante a criação de uma aplicação será necessário que realize uma verificação de identidade, caso ainda não tenha sido feita, ou uma reautenticação, se já tiver concluído previamente o processo de verificação.

![create-application-1](/images/snippets/create-application-1-pt-v1.png)

4. Insira um **nome** para identificar sua aplicação. O limite é de até 50 caracteres alfanuméricos.
5. Selecione **Pagamentos online** como o tipo de pagamento que você deseja integrar, pois essa é a opção correspondente a lojas virtuais. Clique em **Continuar**.
6. Indique que você está integrando para uma loja desenvolvida por conta própria. Opcionalmente, você poderá preencher a URL da sua loja. Clique em **Continuar**.
7. Selecione a opção **Checkouts** e, em seguida, escolha **Checkout Pro** como a solução que você vai integrar.
8. Confirme as opções selecionadas. Caso você precise modificar alguma seleção, clique no botão **Editar**. Aceite a [Declaração de Privacidade](https://www.mercadopago.com.br/privacidade) e os [Termos e Condições](/developers/pt/docs/resources/legal/terms-and-conditions) e clique em **Confirmar**.

![Resumo de aplicação](/images/snippets/create-application/PT-new-app-pago-online-CHO-PRO-v1.png)

Em [Suas integrações](/developers/panel/app), é possível consultar a lista de todas as suas aplicações criadas e acessar os [Dados da integração](/developers/pt/docs/checkout-api-payments/resources/application-details) de cada uma delas.

> NOTE
>
> Caso necessário, é possível editar ou excluir uma aplicação. Neste último caso, tenha em mente que sua loja deixará de receber pagamentos por meio da integração com o Mercado Pago associada a essa aplicação. Para mais informações, acesse os [Dados da integração](/developers/pt/docs/checkout-pro/resources/application-details).

## Acessar credenciais de teste

Após criar a sua aplicação, também serão automaticamente criadas as :toolTipComponent[credenciais de teste]{link="/developers/pt/docs/checkout-pro/resources/credentials" linkText="Credenciais" content="Chaves de acesso únicas que usamos para identificar uma integração na sua conta, estando vinculadas à sua aplicação Para mais informações, acesse o link abaixo."}. Utilize as **credenciais de teste** para realizar todas as configurações e validações necessárias em um ambiente seguro de testes.

Ao acessar as credenciais de teste, serão exibidos os seguintes pares de credenciais: :toolTipComponent[Public Key]{content="Chave pública que é utilizada no _frontend_ para acessar informações e criptografar dados. Você pode acessá-la através de *Suas integrações > Dados da integração > Testes > Credenciais de teste*."} e o :toolTipComponent[Access Token]{content="Chave privada da aplicação criada no Mercado Pago e que é utilizada no _backend_. Você pode acessá-la através de *Suas integrações > Dados da integração > Testes > Credenciais de teste*."}.

![credenciais de teste](/images/snippets/credentials/application-data-test-credentials-pt-v1.png) 

> NOTE
>
> Se você estiver utilizando uma aplicação já existente, será necessário ativar as credenciais de teste. Para mais informações, acesse a documentação de [Credenciais](/developers/pt/docs/checkout-pro/additional-content/credentials).