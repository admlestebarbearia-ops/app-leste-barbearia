# Como melhorar a aprovação de pagamentos

> RED_MESSAGE
>
> Esta documentação é destinada a integradores. Se você é um comprador e seu pagamento foi recusado ao usar o Mercado Pago, consulte [este artigo](https://www.mercadopago.com.br/ajuda/25671) em nosso Centro de Ajuda para obter orientação sobre como proceder.

Para **evitar que um pagamento legítimo seja recusado** por não atender as validações de segurança, é necessário incluir o máximo de informações possíveis na hora de realizar a operação e também que seu checkout esteja com uma interface otimizada.

Veja abaixo nossas **recomendações para melhorar sua aprovação**.

:::::AccordionComponent{title="Obter e enviar o Device ID"}
O **Device ID** é uma informação importante para garantir uma melhor segurança e, consequentemente, uma melhor taxa de aprovação de pagamentos. Ele representa um **identificador único para cada dispositivo do comprador** no momento da compra.

Caso um comprador frequente faça uma compra a partir de um dispositivo diferente do habitual, isso pode representar um comportamento atípico. Embora possa não ser necessariamente fraude, o ID do dispositivo nos ajuda a refinar a avaliação e nos impede de rejeitar pagamentos legítimos.

::::TabsComponent

:::TabComponent{title="Device ID em aplicações web"}
Para usar o Device ID na web e evitar possíveis compras fraudulentas, siga os passos abaixo:

> WARNING
>
> Caso já esteja utilizando o [SDK JS do Mercado Pago](/developers/pt/docs/sdks-library/client-side/mp-js-v2), **não** será necessário adicionar o código de segurança porque o Device ID será obtido por padrão. Neste caso, siga diretamente para a etapa de [utilização do Device ID](/developers/pt/docs/checkout-pro/how-tos/improve-payment-approval/recommendations#editor_4#bookmark_3._utilize_o_device_id).

### 1. Adicione o script de segurança do Mercado Pago

Para implementar a geração do device ID em seu site, adicione o seguinte código na sua página de checkout:

```html
<script src="https://www.mercadopago.com/v2/security.js" view="checkout"></script>
```

### 2. Obtenha o Device ID

Uma vez que você tenha adicionado o código de segurança do Mercado Pago em seu site, uma variável global de _Javascript_ é criada automaticamente com o nome `MP_DEVICE_SESSION_ID`, cujo valor é o Device ID.

Se você preferir atribuí-lo a outra variável, indique o nome adicionando o atributo `output` ao _script_ de segurança, como no exemplo abaixo.

```html
  <script src="https://www.mercadopago.com/v2/security.js" view="checkout" output="deviceId"></script>
```

Você também pode **criar sua própria variável**. Para isso, adicione uma tag `html` no seu site com o identificador `id="deviceID"`, como no exemplo abaixo.

```html
  <input type="hidden" id="deviceId">
```

### 3. Utilize o Device ID

Uma vez que você tenha o valor de Device ID, é preciso que você **o envie aos nossos servidores** ao criar um pagamento. Deve adicionar este `header` à sua requisição e substituir `device_id` pelo nome da variável onde guardou seu valor de Device ID.

```html
X-meli-session-id: device_id
```

:::
:::TabComponent{title="Device ID em aplicações móveis"}
Se você possui uma aplicação móvel nativa, poderá capturar a informação do dispositivo com nosso SDK e enviar no momento de criar o _token_. Para isso, siga as etapas abaixo.

### 1. Adicione a dependência

De acordo com o sistema operacional em que está configurada a aplicação móvel, adicione a dependência abaixo.

[[[
```ios
===
Insira o código abaixo no arquivo **Podfile**.
===
use_frameworks!
pod 'MercadoPagoDevicesSDK'
```
```android
===
Insira o repositório e a dependência abaixo no arquivo **build.gradle**.
===
repositories {
  maven {
  url "https://artifacts.mercadolibre.com/repository/android-releases"
  }
}
dependencies {
  implementation 'com.mercadolibre.android.device:sdk:4.0.1'
}
```
]]]

### 2. Inicialize o módulo

Após adicionar a dependência, inicialize o módulo com uma das linguagens abaixo.

[[[
```swift
===
Recomendamos a inicialização do **AppDelegate** no envento **didFinishLaunchingWithOptions**.
===
import MercadoPagoDevicesSDK
...
func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
  ... 
  MercadoPagoDevicesSDK.shared.execute()
  ...
}
```
```objective-c
===
Recomendamos a inicialização do **AppDelegate** no envento **didFinishLaunchingWithOptions**.
===
@import 'MercadoPagoDevicesSDK';
...
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  ...
  [[MercadoPagoDevicesSDK shared] execute];
  ...
}
```
```java
===
Recomendamos a inicialização na classe **MainApplication**.
===
import com.mercadolibre.android.device.sdk.DeviceSDK;
DeviceSDK.getInstance().execute(this);
```
]]]

### 3. Capture a informação

Execute alguma das funções abaixo para obter a informação no formato que precisar.

[[[
```swift
MercadoPagoDevicesSDK.shared.getInfo() // Devolve um objeto Device que é Codificável
MercadoPagoDevicesSDK.shared.getInfoAsJson() // Devolve um objeto em JSON
MercadoPagoDevicesSDK.shared.getInfoAsJsonString() // Devolve o JSON em formato de String
MercadoPagoDevicesSDK.shared.getInfoAsDictionary() // Devolve um objeto Dictionary<String,Any>
```
```objective-c
[[[MercadoPagoDevicesSDK] shared] getInfoAsJson] // Devolve um objeto em JSON
[[[MercadoPagoDevicesSDK] shared] getInfoAsJsonString] // Devolve o JSON em formato de String
[[[MercadoPagoDevicesSDK] shared] getInfoAsDictionary] // Deolve um objeto Dictionary<String,Any>
```
```java
Device device = DeviceSDK.getInstance().getInfo() // Devolve um objeto Device, que é serializável
Map deviceMap = DeviceSDK.getInstance().getInfoAsMap() // Devolve um Map<String, Object>
String jsonString = DeviceSDK.getInstance().getInfoAsJsonString() // Devolve uma String no formato JSON
```
]]]

### 4. Envie a informação

Por último, envie a informação obtida no campo `device` ao criar o `card_token`.

```
{
  ...
  "device": {
  "fingerprint": {
  "os": "iOS",
  "system_version": "8.3",
  "ram": 18446744071562067968,
  "disk_space": 498876809216,
  "model": "MacBookPro9,2",
  "free_disk_space": 328918237184,
  "vendor_ids": [
  {
  "name": "vendor_id",
  "value": "C2508642-79CF-44E4-A205-284A4F4DE04C"
  },
  {
  "name": "uuid",
  "value": "AB28738B-8DC2-4EC2-B514-3ACF330482B6"
  }
  ],
  "vendor_specific_attributes": {
  "feature_flash": false,
  "can_make_phone_calls": false,
  "can_send_sms": false,
  "video_camera_available": true,
  "cpu_count": 4,
  "simulator": true,
  "device_languaje": "en",
  "device_idiom": "Phone",
  "platform": "x86_64",
  "device_name": "iPhone Simulator",
  "device_family": 4,
  "retina_display_capable": true,
  "feature_camera": false,
  "device_model": "iPhone Simulator",
  "feature_front_camera": false
  },
  "resolution": "375x667"
  }
  }
}
```

:::
::::

:::::

:::::AccordionComponent{title="Detalhar todas as informações sobre o pagamento"}
Para otimizar a validação de segurança dos pagamentos e melhorar as aprovações, é importante fazer **o envio do máximo de dados sobre o comprador e o produto**.

Se atente a todos os atributos disponíveis para serem enviados ao :TagComponent{tag="API" text="criar preferências" href="/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post"}, prestando atenção especialmente nas informações adicionais (`additional_info`), como nos **dados do comprador**, nos **detalhes sobre o produto** e nas **informações de envio**.

Para melhorar a eficiência do nosso motor de fraude, recomendamos enviar os **dados de indústria** que correspondam ao segmento do seu negócio. Você pode encontrar mais detalhes sobre cada setor e os dados que recomendamos incluir em cada um deles na documentação de [Dados de indústria](/developers/pt/docs/checkout-pro/additional-settings/industry-data).
:::::

:::::AccordionComponent{title="Melhorar a qualidade da sua integração"}
Antes de colocar sua integração em ambiente de produção, é necessário **verificar sua qualidade**, seja de forma manual ou automática. Isso garantirá que a integração atenda aos padrões de qualidade e segurança do Mercado Pago e fornecerá ações para melhorar a taxa de aprovação.

Para medir a qualidade, é necessário realizar um processo de certificação da sua integração. Consulte a documentação de [Como medir a qualidade da integração](/developers/pt/docs/checkout-pro/how-tos/integration-quality).
:::::

:::::AccordionComponent{title="Aumentar a segurança da sua loja"}
Garantir que sua loja online cumpra com os principais protocolos de segurança para transações online é necessário não apenas para melhorar as taxas de aprovação de pagamentos, mas também para aumentar a confiança do consumidor.

Consulte algumas configurações recomendadas para reforçar essa confiança e proteger as informações sensíveis de seus clientes durante o processo de pagamento:
* **Certificado SSL:** O Secure Sockets Layer garante a criptografia das informações pessoais e financeiras durante as transações, assegurando que todos os dados trocados entre o servidor e o cliente estejam protegidos e evita vazamentos.
* **HTTPS:** O HyperText Transfer Protocol Secure é um indicador de segurança para todos os seus clientes e garante que toda a comunicação com a API do Mercado Pago seja realizada de forma segura.
* **Carteira do Mercado Pago:** Ativar o pagamento por meio da carteira do Mercado Pago traz uma série de benefícios para a experiência do usuário e para a gestão do risco. Como apenas usuários logados podem utilizar essa opção, temos acesso a informações mais detalhadas sobre o pagador e o contexto da transação, o que possibilita uma análise antifraude ainda mais eficiente graças ao maior número de variáveis disponíveis. Além disso, pagamentos realizados com saldo em conta apresentam taxas de aprovação significativamente superiores, uma vez que são operações internas ao ecossistema Mercado Pago e não estão sujeitas a contestações.
:::::

:::::AccordionComponent{title="Melhorar a experiência do usuário"}
Em caso de pagamento recusado, notificar o usuário sobre o motivo e destacar as alternativas disponíveis é fundamental. No Checkout Pro, a experiência é ainda mais facilitada, pois o sistema oferece tentativas adicionais de pagamento, permitindo que o cliente escolha outra forma de concluir a compra. Essa abordagem não só contribui para resolver o inconveniente, como também demonstra atenção e proximidade no atendimento ao cliente.
:::::

:::::AccordionComponent{title="Oferecer suporte aos seus clientes"}
Fornecer ao cliente uma loja otimizada contribuirá para o sucesso das operações. Para isso, é importante garantir que sua equipe tenha um profundo entendimento do sistema e suas configurações. Este conhecimento permitirá a rápida resolução de problemas e um melhor atendimento às diferentes necessidades dos clientes.
Isso inclui **fornecer canais de suporte acessíveis e eficientes** para ajudar os usuários que enfrentem dificuldades durante o processo de pagamento. Isso pode ser feito através de chat ao vivo, e-mail ou telefone.
:::::

:::::AccordionComponent{title="Implemente um mecanismo de verificação de identidade"}
Recomenda-se implementar mecanismos avançados de segurança para proteger as transações online. A autenticação 3DS 2.0, por exemplo, adiciona uma camada extra de proteção ao permitir que o próprio usuário valide sua identidade no momento do pagamento, reduzindo significativamente o risco de fraudes. 
Para mais detalhes sobre como integrar ou ativar o 3DS 2.0 em Checkout Pro, entre em contato com o time comercial.
:::::