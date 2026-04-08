# Credenciais

As credenciais são chaves de acesso únicas com as quais identificamos uma integração em sua conta. Elas estão diretamente vinculadas à :toolTipComponent[aplicação]{link="/developers/pt/docs/your-integrations/application-details" linkText="Detalhes da aplicação" content="Entidade registrada no Mercado Pago que atua como um identificador para gerenciar suas integrações. Para mais informações, acesse o link abaixo."} que você criou para essa integração e permitirão que você desenvolva seu projeto contando com as melhores medidas de segurança do Mercado Pago.

## Tipos de credenciais 

As credenciais são divididas em dois tipos: **credenciais de teste** e **credenciais de produção**. A seguir, detalhamos cada uma delas.

:::::TabsComponent

::::TabComponent{title="Credenciais de teste"}
### Credenciais de teste

As credenciais de teste são um conjunto de chaves que são utilizadas tanto na etapa de desenvolvimento, para garantir configurações seguras, quanto na etapa de testes, para testar a integração.

Durante o processo de integração, utilize **credenciais de teste** para realizar todas as configurações e validações necessárias, garantindo que não sejam efetuados pagamentos reais em produção. Essas credenciais simulam as informações de uma conta produtiva, mas em um ambiente seguro de testes. Mantenha o uso das credenciais de teste durante toda a fase de desenvolvimento. Apenas substitua-as pelas credenciais produtivas quando o sistema estiver completamente validado e pronto para ser publicado.

> NOTE
>
> Se estiver desenvolvendo para outra pessoa, ela deverá solicitar acesso às credenciais das aplicações que não administra. Para mais informações, consulte [Compartilhar credenciais](/developers/pt/docs/checkout-pro/resources/credentials#bookmark_compartilhar_credenciais).

Ao criar uma aplicação as credenciais de teste serão geradas automaticamente. Caso isso não aconteça, basta clicar em **Ativar credenciais** nos dados da integração em questão ou conforme indicamos a seguir.

1. Em [Suas integrações](/developers/panel/app), selecione sua aplicação. Em seguida, vá até a seção **Testes** e clique em **Credenciais de teste** no menu à esquerda da tela.
2. Aceite a [Declaração de Privacidade](https://www.mercadopago.com.br/privacidade) e os [Termos e condições](/developers/pt/docs/resources/legal/terms-and-conditions). Preencha o reCAPTCHA e clique em **Ativar credenciais**.

![ativar credenciais de teste](/images/snippets/credentials/activate-credentials-tests-PT-v1.png)

Após ativar suas credenciais de teste, você poderá utilizar o seus **Public Key e o Access Token** de teste.

### Public Key e Access Token

As credenciais **Public Key** e **Access Token** de teste são utilizadas da mesma forma que as credenciais produtivas, mas não permitirão realizar nenhuma transação real.

| Tipo | Descrição |
|---|---|
| Public Key | A chave pública da aplicação é geralmente utilizada no frontend. Permite, por exemplo, acessar informações sobre os meios de pagamento e criptografar os dados do cartão. |
| Access Token | Chave privada da aplicação que sempre deve ser utilizada no backend para gerar pagamentos. É essencial manter essa informação segura em seus servidores. |

::::
::::TabComponent{title="Credenciais de produção"}
### Credenciais de produção

As **credenciais de produção** são um conjunto de chaves que permitem receber pagamentos reais em lojas e em outras aplicações. Para obter as credenciais de produção, você deverá **ativá-las** preenchendo alguns dados sobre o seu negócio. Siga os passos abaixo:

1. Acesse [Suas integrações](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app) e selecione uma aplicação.
2. Vá até a seção **Produção** no menu lateral esquerdo e clique em **Credenciais de produção** no menu à esquerda da tela.
3. Aceite a [Declaração de Privacidade](https://www.mercadopago.com.br/privacidade) e os [Termos e condições](/developers/pt/docs/resources/legal/terms-and-conditions). Preencha o reCAPTCHA e clique em **Ativar credenciais**.

Ao acessar as credenciais de produção, serão exibidos os seguintes pares de credenciais: **Public Key e Access Token**, além de **Client ID e Client Secret**.

![Como acessar as credenciais através das Suas Integrações](/images/snippets/credentials-prod-panel-pt-v1.jpg)

### Public Key e Access Token

As credenciais **Public Key** e **Access Token** são utilizadas, não necessariamente juntas, nas integrações realizadas com as soluções de pagamento do Mercado Pago. Estão diretamente vinculadas à :toolTipComponent[aplicação]{link="/developers/pt/docs/your-integrations/application-details" linkText="Detalhes da aplicação" content="Entidade registrada no Mercado Pago que atua como um identificador para gerenciar suas integrações. Para mais informações, acesse o link abaixo."} que você criou, por isso cada par de credenciais é único para cada integração.

| Tipo | Descrição |
|---|---|
| Public Key | A chave pública da aplicação é geralmente utilizada no frontend. Permite, por exemplo, acessar informações sobre os meios de pagamento e criptografar os dados do cartão. |
| Access Token | Chave privada da aplicação que sempre deve ser utilizada no backend para gerar pagamentos. É essencial manter esta informação segura em seus servidores. |

Para obter mais informações sobre quais credenciais serão necessárias para a sua integração, consulte a [documentação](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/pt/docs) da solução que está sendo integrada.

### Client ID e Client Secret

As credenciais **Client ID** e **Client Secret** são utilizadas, principalmente, nas integrações que possuem [OAuth](/developers/pt/docs/security/oauth) como protocolo para obtenção de informação privada de contas do Mercado Pago. Em particular, são utilizadas durante o fluxo (_grant type_) de **Client Credentials**, que permite acessar um recurso em nome próprio e obter um Access Token sem interação do usuário.

Também podem ser requeridas em algumas integrações mais antigas com plataformas de e-commerce.

| Tipo | Descrição |
|---|---|
| Client ID | Identificador único que representa sua integração. |
| Client Secret | Chave privada utilizada em alguns complementos para gerar pagamentos. É extremamente importante manter esta informação segura em seus servidores e não permitir o acesso a nenhum usuário do sistema ou intruso. |

::::

:::::

## Compartilhar credenciais

Se você estiver desenvolvendo para outra pessoa ou estiver recebendo ajuda durante a integração ou configuração de suas lojas, poderá compartilhar as credenciais de forma segura com outra conta do Mercado Pago.

Você pode compartilhar as credenciais **até 10 vezes**. Se você atingir este limite, deverá eliminar permissões antigas, sem impacto nas integrações já configuradas.

Além disso, se por questões de segurança você não desejar mais compartilhar suas credenciais, você pode cancelar o acesso.

A seguir, mostramos como compartilhar credenciais.

1. No canto superior direito do [Mercado Pago Developers](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app), clique em **Entrar** e insira os dados solicitados com as informações correspondentes à sua conta do Mercado Pago. Em seguida, clique em **Suas integrações** localizado no canto superior direito.
2. Acesse a aplicação da integração para a qual você precisa compartilhar as credenciais.
3. Vá para a seção **Testes** ou **Produção**, dependendo do tipo de credencial que você deseja compartilhar. Lembre-se de que para acessar as credenciais de produção, você deverá ativá-las. Se não sabe como ativá-las, vá para [Ativar credenciais de produção](/developers/pt/docs/credentials#bookmark_ativar_credenciais_de_produção).
4. Uma vez que você selecionar as credenciais, vá até a seção **Compartilhe as credenciais com um desenvolvedor** e clique em **Compartilhar credenciais**.
5. Informe o endereço de e-mail da pessoa para quem você deseja conceder acesso. **Importante**: o endereço de e-mail deve, obrigatoriamente, estar vinculado a uma conta do Mercado Pago.

![Compartilhar credenciais em Suas Integrações](/images/snippets/share-credentials-panel-pt-v1.jpg)

## Renovar credenciais

Você pode renovar suas **credenciais de produção** por motivos de segurança ou qualquer outra razão relevante.

> WARNING
>
> Renovar credenciais já configuradas numa integração afetará o seu funcionamento. É necessário que **você substitua as credenciais antigas pelas novas** após o processo de renovação para continuar operando.

Para renovar um par de credenciais, siga os passos abaixo.

1. Acesse suas credenciais de produção através de [Suas integrações](https://www.mercadopago[FAKER][URL][DOMAIN]/developers/panel/app).
2. Selecione o par de credenciais que você deseja renovar, podendo ser **Public Key** e **Access Token** ou **Client ID** e **Client Secret**. Tenha em mente que ambas as credenciais do par que você escolher serão renovadas.
3. Clique nos três pontos localizados à direita da credencial que você deseja renovar e selecione **Renovar**. Clique em **Renovar agora** para confirmar a alteração.

![Como renovar suas credenciais](/images/snippets/renew-credentials-pt-v1.jpg)

Pronto, suas credenciais já foram renovadas.

## Recomendações de segurança

Ao integrar as soluções do Mercado Pago, você estará lidando com dados sensíveis que precisam ser protegidos de possíveis perdas ou vulnerabilidades, como suas credenciais de acesso ao Mercado Pago, as chaves utilizadas nas suas integrações e as informações dos seus clientes.

Mostraremos como você pode otimizar a segurança de suas integrações de forma simples e rápida.

### Envie o Access Token no header

Sempre que fizer chamadas à API, envie o **Access Token** no _header_ ao invés de enviá-lo como _query param_. Essa prática aumenta a segurança, evitando que o token seja exposto a terceiros fora da sua integração.

Por exemplo, para enviar uma requisição **GET** ao recurso `/users/me`, utilize o seguinte formato:

```curl
curl -H 'Authorization: Bearer {{YOUR_ACCESS_TOKEN}}' \
https://api.mercadolibre.com/users/me
```

### Use o OAuth para gerenciar credenciais de terceiros

OAuth é um protocolo de autorização que permite o acesso seguro de aplicações a contas de usuário em serviços HTTP, sem que esse usuário precise compartilhar suas credenciais diretamente. Funciona como um intermediário que facilita o acesso controlado aos dados do usuário por aplicações de terceiros.

Para mais informações, acesse a [documentação](/developers/pt/docs/security/oauth).