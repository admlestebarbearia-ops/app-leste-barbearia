# SDK Nativo

O SDK nativo do Mercado Pago simplifica e protege o processo de pagamento via cartão em aplicativos Android e iOS. Selecione a tecnologia utilizada e siga as etapas para configurar o ambiente de desenvolvimento e iniciar o fluxo de pagamento de forma segura.

:::::TabsComponent
::::TabComponent{title="iOS"}

Utilize o SDK nativo do Mercado Pago para integrar meios de pagamento em aplicativos iOS. Veja a seguir como realizar a instalação e a inicialização do SDK.

### Instalar SDK 

Confira abaixo o passo a passo para instalar o SDK no seu projeto Swift.

1. No Swift Package Manager, clique em **Arquivo > Adicionar pacotes**.
2. Cole a URL do repositório: `https://github.com/mercadopago/sdk-ios`.
3. Selecione a versão desejada do SDK.
4. Clique em **Adicionar pacote** para concluir a instalação.

### Adicionar dependências

Importe as dependências do SDK no seu projeto executando o seguinte código:

```
import CoreMethods
```

### Inicializar SDK

Após instalar o SDK e adicionar as dependências ao seu projeto, inicialize o SDK no início do ciclo de vida do aplicativo. Isso garante que todas as configurações essenciais estejam definidas antes de qualquer operação de pagamento.

> WARNING
>
> O SDK deve ser inicializado uma única vez no momento da abertura do aplicativo. Para garantir o funcionamento correto, realize uma chamada a `initialize()` antes de utilizar qualquer outra funcionalidade do SDK.

Para inicializar a biblioteca do Mercado Pago, é necessário utilizar suas :toolTipComponent[credenciais]{link="/developers/pt/docs/credentials" linkText="Credenciais" content="Chaves de acesso únicas que usamos para identificar uma integração na sua conta, estando vinculadas à sua aplicação. Para mais informações, acesse o link abaixo."}, chaves únicas que identificam sua integração e estão vinculadas à :toolTipComponent[aplicação]{link="/developers/pt/docs/application-details" linkText="Detalhes da aplicação" content="Entidade registrada no Mercado Pago que atua como um identificador para gerenciar suas integrações. Para mais informações, acesse o link abaixo."} criada, garantindo que você desenvolva seu projeto contando com as melhores medidas de segurança do Mercado Pago.

Nesta etapa, você deverá usar sua :toolTipComponent[_Public Key_ de produção]{content="Chave pública que é utilizada no _frontend_ para acessar informações. Você pode acessá-la através de *Suas integrações > Detalhes da aplicação > Produção > Credenciais de produção*."}, que pode ser acessada nos [detalhes da sua aplicação](/developers/pt/docs/checkout-api-payments/more-resources/application-details) em [Suas integrações](/developers/panel/app), sob o título **Produção > Credenciais de produção** no menu localizado à esquerda da tela.

![Como acessar as credenciais através das Suas Integrações](/images/snippets/credentials-prod-panel-pt-v1.jpg)

> NOTE
>
> Se você estiver desenvolvendo para outra pessoa, poderá acessar as credenciais dos aplicativos que você não gerencia. Consulte [Compartilhar credenciais](/developers/pt/docs/checkout-api-payments/resources/credentials#bookmark_compartilhar_credenciais) para mais informações.

Copie a :toolTipComponent[_Public Key_]{content="Chave pública que é utilizada no _frontend_ para acessar informações. Você pode acessá-la através de *Suas integrações > Detalhes da aplicação > Produção > Credenciais de produção*."} e a inclua no código abaixo. O processo de inicialização varia conforme a tecnologia utilizada, seja UIKit ou SwiftUI.

[[[
```UIKit
import UIKit
import CoreMethods

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, 
  didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
  let configuration = MercadoPagoSDK.Configuration(
  publicKey: "YOUR-PUBLIC-KEY",
  country: // Insira o país da sua chave pública
  )
  MercadoPagoSDK.shared.initialize(configuration)
  
  return true
  }
}
```
```SwiftUI

import SwiftUI
import CoreMethods

@main
struct YourApp: App {
  init() {
  let configuration = MercadoPagoSDK.Configuration(
  publicKey: "<YOUR-PUBLIC-KEY>",
  country: "<Insira o país da sua chave pública>",
  locale: "pt-BR"
  )
  MercadoPagoSDK.shared.initialize(configuration)
  }
  
  var body: some Scene {
  WindowGroup {
  ContentView()
  }
  }
}
```
]]]

Os parâmetros de inicialização estão listados na tabela abaixo.

| Parâmetro | Tipo | Descrição | Obrigatoriedade |
| ------------ | ------- | ------------------------------------------------------------------------------------------- | -------------- |
| `public_key` | String | Chave pública que é utilizada no _frontend_ para acessar informações. Você pode acessá-la através de **Suas integrações > Detalhes da aplicação > Produção > Credenciais de produção**. | Obrigatório |
| `locale` | String | Identificador do _locale_ (idioma e país). Por padrão, utiliza-se o _locale_ do sistema. | Opcional |
| `country` | [Country](https://mercadopago.github.io/sdk-ios/0.1.0/documentation/coremethods/mercadopagosdk/country) | `Enum` que identifica o país em que os _Core Methods_ serão processados. Utilize o código do país correspondente à sua Public Key. Consulte a [documentação](https://mercadopago.github.io/sdk-ios/0.1.0/documentation/coremethods/mercadopagosdk/country/) para verificar o código referente ao seu país. | Obrigatório |
::::
::::TabComponent{title="Android"}

Utilize o SDK nativo do Mercado Pago para integrar meios de pagamento em aplicativos iOS. Veja a seguir como realizar a configuração do repositório e a inicialização do SDK.

### Configurar repositório

Adicione o repositório do Mercado Pago ao arquivo `settings.build.gradle` do seu projeto em Kotlin, conforme o exemplo abaixo:

```kotlin
pluginManagement {
  repositories {
  // Outras dependências...
  maven { url = uri("https://artifacts.mercadolibre.com/repository/android-releases") }
  }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
  // Outras dependências...
  maven {
  url = uri("https://artifacts.mercadolibre.com/repository/android-releases")
  }
  }
}
```

### Adicionar dependências

Inclua as dependências do SDK no arquivo `build.gradle` (ou `build.gradle.kts`) do módulo do seu aplicativo:

```kotlin
// Especifique o SDK BOM com uma definição de versão
implementation(platform("com.mercadopago.android.sdk:sdk-android-bom:<ultima versão do bom>"))
// Especifique as dependências da biblioteca SDK sem uma definição de versão
implementation("com.mercadopago.android.sdk:core-methods")
```

### Inicializar SDK

Após configurar o repositório e adicionar as dependências ao seu projeto, inicialize o SDK no início do ciclo de vida do aplicativo. Isso garante que todas as configurações essenciais estejam definidas antes de qualquer operação de pagamento.

> WARNING
>
> O SDK deve ser inicializado uma única vez no momento da abertura do aplicativo. Para garantir o funcionamento correto, realize uma chamada a `initialize()` antes de utilizar qualquer outra funcionalidade do SDK.

Para inicializar a biblioteca do Mercado Pago, é necessário utilizar suas :toolTipComponent[credenciais]{link="/developers/pt/docs/credentials" linkText="Credenciais" content="Chaves de acesso únicas que usamos para identificar uma integração na sua conta, estando vinculadas à sua aplicação. Para mais informações, acesse o link abaixo."}, chaves únicas que identificam sua integração e estão vinculadas à :toolTipComponent[aplicação]{link="/developers/pt/docs/application-details" linkText="Detalhes da aplicação" content="Entidade registrada no Mercado Pago que atua como um identificador para gerenciar suas integrações. Para mais informações, acesse o link abaixo."} criada, garantindo que você desenvolva seu projeto contando com as melhores medidas de segurança do Mercado Pago.

Nesta etapa, você deverá usar sua :toolTipComponent[_Public Key_ de produção]{content="Chave pública que é utilizada no _frontend_ para acessar informações. Você pode acessá-la através de *Suas integrações > Detalhes da aplicação > Produção > Credenciais de produção*."}, que pode ser acessada nos [detalhes da sua aplicação](/developers/pt/docs/checkout-api-payments/resources/application-details) em [Suas integrações](/developers/panel/app), sob o título **Produção > Credenciais de produção** no menu localizado à esquerda da tela.

![Como acessar as credenciais através das Suas Integrações](/images/snippets/credentials-prod-panel-pt-v1.jpg)

> NOTE
>
> Se você estiver desenvolvendo para outra pessoa, poderá acessar as credenciais dos aplicativos que você não gerencia. Consulte [Compartilhar credenciais](/developers/pt/docs/checkout-api-payments/resources/credentials#bookmark_compartilhar_credenciais) para mais informações.

Copie a :toolTipComponent[_Public Key_]{content="Chave pública que é utilizada no _frontend_ para acessar informações. Você pode acessá-la através de *Suas integrações > Detalhes da aplicação > Produção > Credenciais de produção*."} e a inclua no código abaixo. Após isso, inicialize o SDK na classe `Application`, conforme o exemplo:

```kotlin
import android.app.Application
import com.mercadopago.sdk.android.initializer.MercadoPagoSDK

class MainApplication : Application() {
  override fun onCreate() {
  super.onCreate()
  MercadoPagoSDK.initialize(
  context = this,
  publicKey = "YOUR-PUBLIC-KEY",
  countryCode = "CountryCode of this public key"
  )
  }
}
```

Os parâmetros de inicialização estão listados na tabela abaixo.

| Parâmetro | Tipo | Descrição | Obrigatoriedade |
| ------------ | ------- | ---------------------------------------------------------------------------------------------------------------- | -------------- |
| `context` | [Context](https://developer.android.com/reference/android/content/Context) | Contexto da sua aplicação. | Obrigatório |
| `publicKey` | String | Chave pública que é utilizada no _frontend_ para acessar informações. Você pode acessá-la através de **Suas integrações > Detalhes da aplicação > Produção > Credenciais de produção**. | Obrigatório |
| `countryCode`| [CountryCode](https://mercadopago.github.io/sdk-android/sdk-android/com.mercadopago.sdk.android.domain.model/-country-code/index.html?query=enum%20CountryCode%20:%20Enum%3CCountryCode%3E) | `Enum` que identifica o país em que os _Core Methods_ serão processados. Utilize o código do país correspondente à sua Public Key. Consulte a [documentação](https://mercadopago.github.io/sdk-ios/0.1.0/documentation/coremethods/mercadopagosdk/country/) para verificar o código referente ao seu país. | Obrigatório |

::::
:::::