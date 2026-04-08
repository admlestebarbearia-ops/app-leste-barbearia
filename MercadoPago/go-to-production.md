# Subir em produção

Depois que o processo de configuração e testes for concluído, sua integração estará pronta para receber pagamentos reais em produção.

A seguir, veja as recomendações necessárias para realizar essa transição de maneira eficaz e segura, garantindo que sua integração esteja preparada para receber transações reais.

:::AccordionComponent{title="Ativar credenciais de produção" pill="1"}
Depois de realizar os devidos [testes da sua integração](/developers/pt/docs/checkout-api-payments/integration-test), **lembre-se de substituir as :toolTipComponent[credenciais]{link="/developers/pt/docs/checkout-api-payments/resources/credentials" linkText="Credenciais" content="Chaves de acesso únicas com as quais identificamos uma integração na sua conta, vinculadas à sua aplicação. Para mais informações, acesse o link abaixo."} que você utilizou na etapa de desenvolvimento pelas de produção** para que possa começar a operar no ambiente produtivo da sua loja e começar a receber pagamentos reais. Para isso, siga os passos abaixo para saber como **ativá-las**.

1. Acesse [Suas integrações](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app) e selecione uma aplicação.
2. Em **Dados de integração**, vá para a seção **Credenciais**, localizada no lado direito da tela, e clique em **Produção**. Em seguida, clique em **Ativar credenciais**. Alternativamente, você poderá acessá-las também a partir da seção **Credenciais de produção** no menu lateral esquerdo.
3. No campo **Indústria**, selecione no menu suspenso a indústria ou setor ao qual pertence o negócio que você está integrando.
4. No campo **Site (obrigatório)**, complete com a URL do site do seu negócio.
5. Aceite a [Declaração de Privacidade](https://www.mercadopago.com.br/privacidade) e os [Termos e condições](/developers/pt/docs/resources/legal/terms-and-conditions). Complete o reCAPTCHA e clique em **Ativar credenciais de produção**.
:::

:::AccordionComponent{title="Usar credenciais de produção" pill="2"}
Para subir em produção, você deve **colocar as credenciais de produção da sua aplicação do Mercado Pago** na sua integração.

Para fazer isso, acesse [Suas integrações](/developers/panel/app), dirija-se à seção **Credenciais**, localizada à direita da tela, e clique em **Produção**. Alternativamente, você poderá acessá-las a partir de **Produção > Credenciais de produção**.

Lá você encontrará sua **Public Key** e **Access Token** produtivos, que deverá utilizar no lugar das credenciais da conta de teste.

![Como acessar as credenciais através de Suas Integrações](/images/snippets/credentials/application-data-production-credentials-pt-v1.png)

Para mais informações, consulte nossa documentação de [Credenciais](/developers/pt/docs/checkout-pro/additional-content/credentials).
:::

:::AccordionComponent{title="Implementar certificado SSL" pill="3"}
Para garantir uma integração segura que proteja os dados de cada transação, é imprescindível a implementação do certificado SSL (Secure Sockets Layer). Este certificado, associado ao uso do protocolo HTTPS na disponibilização dos meios de pagamento, assegura uma conexão criptografada entre o cliente e o servidor.

Adotar essas medidas não apenas reforça a segurança dos dados dos usuários, mas também assegura o cumprimento das normas e leis específicas de cada país relacionadas à proteção de dados e à segurança da informação. Além disso, contribui significativamente para proporcionar uma experiência de compra mais segura e confiável.

Embora o **uso do certificado SSL não seja obrigatório durante o período de testes**, sua implementação é obrigatória para a entrada em produção.

Para mais informações, consulte os [Termos e Condições do Mercado Pago](/developers/pt/docs/resources/legal/terms-and-conditions).
:::

:::AccordionComponent{title="Medir a qualidade da sua integração" pill="Opcional"}
Depois de concluir a configuração da sua integração, recomendamos que você realize uma **medição de qualidade**, que é um processo de certificação da sua integração, com o qual você poderá garantir que seu desenvolvimento atenda aos requisitos de qualidade necessários para assegurar uma melhor experiência, assim como uma maior taxa de aprovação de pagamentos.

Para saber mais, acesse a documentação [Como medir a qualidade da sua integração](/developers/pt/docs/checkout-pro/how-tos/integration-quality).
:::