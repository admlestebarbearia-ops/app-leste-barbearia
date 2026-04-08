# Configurar ambiente de desenvolvimento

Para iniciar a integração das soluções de pagamento do Mercado Pago, é necessário preparar seu ambiente de desenvolvimento com uma série de configurações que permitirão acessar as funcionalidades do Mercado Pago a partir do backend.

A seguir, veja como instalar e configurar o SDK oficial do Mercado Pago:

> SERVER_SIDE
>
> h2
>
> Instalar o SDK do Mercado Pago

O **SDK de backend** é projetado para gerenciar as operações do lado do servidor, permitindo criar e gerenciar :toolTipComponent[preferências de pagamento]{content="Uma preferência de pagamento é um objeto que reúne informações sobre o produto ou serviço pelo qual você deseja cobrar. No ecossistema do Mercado Pago, esse objeto é denominado `preference`."}, processar transações e realizar outras operações críticas de forma segura.

> NOTE
> 
> Se preferir, você pode baixar os SDKs do Mercado Pago em nossas [bibliotecas oficiais](/developers/pt/docs/sdks-library/server-side).

Instale o SDK do Mercado Pago na linguagem que melhor se adapta à sua integração, utilizando um gerenciador de dependências, conforme demonstrado a seguir.

[[[
```php
===
Para instalar o SDK, execute o seguinte comando no seu terminal utilizando o [Composer](https://getcomposer.org/download):
===
php composer.phar require "mercadopago/dx-php"
```
```node
===
Para instalar o SDK, execute o seguinte comando no seu terminal utilizando [npm](https://www.npmjs.com/get-npm):
===
npm install mercadopago
```
```java
===
Para instalar o SDK em seu projeto [Maven](http://maven.apache.org/install.html), adicione a seguinte dependência ao seu arquivo <code>pom.xml</code> e execute <code>maven install</code> na linha de comando do seu terminal:
===
<dependency>
  <groupId>com.mercadopago</groupId>
  <artifactId>sdk-java</artifactId>
  <version>2.1.7</version>
</dependency>
```
```ruby
===
Para instalar o SDK, execute o seguinte comando no seu terminal utilizando [Gem](https://rubygems.org/gems/mercadopago-sdk):
===
gem install mercadopago-sdk
```
```csharp
===

Para instalar o SDK, execute o seguinte comando no seu terminal utilizando [NuGet](https://docs.microsoft.com/pt-br/nuget/reference/nuget-exe-cli-reference):

===
nuget install mercadopago-sdk
```
```python
===
Para instalar o SDK, execute o seguinte comando no seu terminal utilizando [Pip](https://pypi.org/project/mercadopago/):
===
pip3 install mercadopago
```
```go
go get -u github.com/mercadopago/sdk-go
```
]]]

> SERVER_SIDE
>
> h2
>
> Inicializar biblioteca do Mercado Pago

A seguir, crie um arquivo principal (_main_) no _backend_ do seu projeto com a linguagem de programação que você está utilizando. Insira o seguinte código, substituindo o valor `TEST_ACCESS_TOKEN` pelo :toolTipComponent[Access Token de teste]{content="Chave privada de testes da aplicação criada no Mercado Pago e que é utilizada no _backend_. Você pode acessá-la através de *Suas integrações > Dados da integração*, indo até a seção *Credenciales* (localizada à direita da tela) e clicando em *Teste*. Alternativamente, você pode acessá-la também a partir de *Suas integrações > Dados da integração > Testes > Credenciais de teste*."}.

[[[
```php
<?php
// SDK do Mercado Pago
use MercadoPago\MercadoPagoConfig;
// Adicione credenciais
MercadoPagoConfig::setAccessToken("TEST_ACCESS_TOKEN");
?>
```
```node
// SDK do Mercado Pago
import { MercadoPagoConfig, Preference } from 'mercadopago';
// Adicione credenciais
const client = new MercadoPagoConfig({ accessToken: 'YOUR_ACCESS_TOKEN' });
```
```java
// SDK do Mercado Pago
import com.mercadopago.MercadoPagoConfig;
// Adicione credenciais
MercadoPagoConfig.setAccessToken("TEST_ACCESS_TOKEN");
```
```ruby
# SDK do Mercado Pago
require 'mercadopago'
# Adicione credenciais
sdk = Mercadopago::SDK.new('TEST_ACCESS_TOKEN')
```
```csharp
// SDK do Mercado Pago
 using MercadoPago.Config;
 // Adicione credenciais
MercadoPagoConfig.AccessToken = "TEST_ACCESS_TOKEN";
```
```python
# SDK do Mercado Pago
import mercadopago
# Adicione credenciais
sdk = mercadopago.SDK("TEST_ACCESS_TOKEN")
```
```go
import (
	"github.com/mercadopago/sdk-go/pkg/config"
)

cfg, err := config.New("{{ACCESS_TOKEN}}")
if err != nil {
	fmt.Println(err)
}
```
]]]

Depois dessas configurações, seu ambiente de desenvolvimento já está pronto para avançar com a configuração de uma preferência de pagamento.