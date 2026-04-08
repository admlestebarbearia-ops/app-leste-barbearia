> CLIENT_SIDE
>
> h1
>
> Adicionar o SDK ao frontend e inicializar o checkout

Uma vez configurado o backend, é necessário configurar o frontend para completar a experiência de pagamento do lado do cliente. Para isso, utilize o SDK MercadoPago.js, que permite capturar pagamentos diretamente no frontend de maneira segura.

Nesta seção, você aprenderá como incluir e inicializar corretamente o SDK, e como renderizar o botão de pagamento do Mercado Pago.

> Caso prefira, você pode baixar o SDK MercadoPago.js em nossas [bibliotecas oficiais](/developers/pt/docs/sdks-library/client-side/mp-js-v2).

:::::TabsComponent

::::TabComponent{title="Incluir o SDK com HTML/js"}
## Incluir o SDK com HTML/js

Para incluir o SDK MercadoPago.js na sua página HTML a partir de um **CDN (Content Delivery Network)**, adicione a tag `<script>` antes da tag `</body>` no seu arquivo HTML principal, conforme mostrado no exemplo abaixo:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Minha Integração com Checkout Pro</title>
</head>
<body>

  <!-- Conteúdo da sua página -->

  <script src="https://sdk.mercadopago.com/js/v2"></script>

  <script>
  // Seu código JavaScript irá aqui
  </script>

</body>
</html>
```

## Inicializar o checkout a partir da preferência de pagamento

Após incluir o SDK no seu frontend, é necessário inicializá-lo e, em seguida, iniciar o checkout.

Para continuar, utilize sua credencial :toolTipComponent[Public Key de teste]{content="Chave pública de testes e que é utilizada no _frontend_ para acessar informações e criptografar dados, seja na fase de desenvolvimento ou na fase de testes. Você pode acessá-la através de **Suas integrações > Dados da integração > Testes > Credenciais de teste**."}.

> NOTE
>
> Se estiver desenvolvendo para outra pessoa, você poderá acessar as credenciais das aplicações que não administra. Para mais informações, consulte a seção [Compartilhar credenciais](/developers/pt/docs/checkout-pro/resources/credentials#bookmark_compartilhar_credenciais).

Você também precisará utilizar o identificador da preferência de pagamento que obteve como resposta em [Criar e configurar uma preferência de pagamento](/developers/pt/docs/checkout-pro/create-payment-preference).

Para inicializar o SDK via CDN, insira o código a seguir dentro da tag `<script>`. Substitua `YOUR_PUBLIC_KEY` pela `public_key` de produção da sua aplicação e `YOUR_PREFERENCE_ID` pelo **identificador da preferência de pagamento**.

```Javascript
<script src="https://sdk.mercadopago.com/js/v2"></script>
<script>
  // Configure sua chave pública do Mercado Pago
  const publicKey = "YOUR_PUBLIC_KEY";
  // Configure o ID de preferência que você deve receber do seu backend
  const preferenceId = "YOUR_PREFERENCE_ID";

  // Inicializa o SDK do Mercado Pago
  const mp = new MercadoPago(publicKey);

  // Cria o botão de pagamento
  const bricksBuilder = mp.bricks();
  const renderWalletBrick = async (bricksBuilder) => {
  await bricksBuilder.create("wallet", "walletBrick_container", {
  initialization: {
  preferenceId: "<PREFERENCE_ID>",
  }
});
  };

  renderWalletBrick(bricksBuilder);
</script>
```

> CLIENT_SIDE
>
> h2
>
> Criar um container HTML para o botão de pagamento

Por fim, adicione um _container_ ao código HTML para definir a localização onde o botão de pagamento do Mercado Pago será exibido. Para criar esse _container_, insira o seguinte elemento no HTML da página onde o componente será renderizado:

```html
<!-- Container para o botão de pagamento -->
<div id="walletBrick_container"></div>
```

## Renderizar o botão de pagamento

O SDK do Mercado Pago é responsável por renderizar automaticamente o botão de pagamento dentro do elemento definido, permitindo que o comprador seja redirecionado para um formulário de compra no ambiente do Mercado Pago. Veja um exemplo na imagem abaixo:

![Button](/images/cow/wallet-render-pt-v1.png)
::::

::::TabComponent{title="Instalar o SDK utilizando React"}
## Instalar o SDK utilizando React

Para integrar o SDK MercadoPago.js ao frontend do seu projeto React, siga os passos abaixo, certifique-se de que o **Node.js** e o **npm** estão instalados no sistema. Caso não estejam, faça o download através do [site oficial do Node.js](http://Node.js).

No seu terminal, execute o seguinte comando para criar uma nova aplicação React:

```
npx create-react-app my-mercadopago-app
```

Isso criará um novo diretório chamado `my-mercadopago-app` com uma estrutura básica de aplicação React.

### Instalar SDK MercadoPago.js

Instale a biblioteca SDK MercadoPago.js no diretório `my-mercadopago-app`. Você pode fazer isso executando o seguinte comando:

```
npm install @mercadopago/sdk-react
```

## Criar um componente para o botão de pagamento

Abra o arquivo `src/App.js` da sua aplicação React e atualize o conteúdo para integrar o componente `wallet` do Mercado Pago, que é o responsável por mostrar o botão de pagamento do Mercado Pago.

Para continuar, utilize sua credencial :toolTipComponent[Public Key de teste]{content="Chave pública de testes e que é utilizada no _frontend_ para acessar informações e criptografar dados, seja na fase de desenvolvimento ou na fase de testes. Você pode acessá-la através de **Suas integrações > Dados da integração > Testes > Credenciais de teste**."}.

> NOTE
>
> Se estiver desenvolvendo para outra pessoa, você poderá acessar as credenciais das aplicações que não administra. Para mais informações, consulte a seção [Compartilhar credenciais](/developers/pt/docs/checkout-pro/resources/credentials#bookmark_compartilhar_credenciais).

Você também precisará utilizar o identificador da preferência de pagamento que foi obtido como resposta em [Criar e configurar uma preferência de pagamento](/developers/pt/docs/checkout-pro/create-payment-preference).

A seguir, substitua o valor `YOUR_PUBLIC_KEY` pela sua chave e `YOUR_PREFERENCE_ID` pelo **identificador da preferência de pagamento** no arquivo `src/App.js`. Veja o exemplo abaixo.

```JavaScript
import React from 'react';
import { initMercadoPago, Wallet } from '@mercadopago/sdk-react';

// Inicialize o Mercado Pago com seu Public Key
initMercadoPago('YOUR_PUBLIC_KEY');

const App = () => {
  return (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
  <h1>Botão de Pagamento</h1>
  <p>Clique no botão para realizar o pagamento.</p>
  {/* Renderize o botão de pagamento */}
  <div style={{ width: '300px' }}>
  <Wallet initialization={{ preferenceId: 'YOUR_PREFERENCE_ID' }} />
  </div>
  </div>
  );
};

export default App;
```

## Renderizar o botão de pagamento

Ao executar a aplicação, o SDK do Mercado Pago irá renderizar o botão de pagamento, permitindo que o comprador seja redirecionado para o ambiente de compra, como mostrado na imagem abaixo:

![Button](/images/cow/wallet-render-pt-v1.png)
::::

:::::

<br>

Uma vez que você tenha finalizado a configuração no frontend, configure as [Notificações](/developers/pt/docs/checkout-pro/payment-notifications) para que seu servidor receba atualizações em tempo real sobre os eventos ocorridos na sua integração.