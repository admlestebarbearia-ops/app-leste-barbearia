# Excluir meios de pagamento

Por padrão, todos os meios de pagamento estão disponíveis no Checkout Pro. Essa configuração pode ser personalizada por meio da preferência de pagamento, permitindo remover opções indesejadas.

> WARNING
>
> O meio de pagamento **Dinheiro em conta** não pode ser excluído.

A tabela a seguir lista os atributos disponíveis nas preferências de pagamento e a aplicação de cada um deles para configurar de acordo com as necessidades do negócio.

| Atributo de preferência | Descrição | Valores possíveis |
| --- | --- | --- |
| `payment_methods` | Classe que descreve os atributos e métodos dos meios de pagamento do Checkout Pro. | - |
| `excluded_payment_types` | Permite excluir tipos de meios de pagamento indesejados, como pagamentos offline, cartões de crédito ou débito, entre outros. É possível obter uma lista detalhada com todos os tipos de pagamento disponíveis para integração enviando um **GET** com seu :toolTipComponent[Access Token]{content="Chave privada da aplicação criada no Mercado Pago e utilizada no _backend_. Você pode acessá-la através de *Suas integrações > Dados da integração > Testes > Credenciais de teste* ou *Produção > Credenciais de produção*."} ao endpoint :TagComponent{tag="API" text="/v1/payment_methods" href="/developers/pt/reference/online-payments/checkout-pro/payment-methods/get"}. | `ticket` |
| `excluded_payment_methods` | Permite excluir bandeiras específicas de cartões de crédito e débito, como Visa, Mastercard, American Express, entre outras. É possível obter uma lista detalhada com todos os meios de pagamento disponíveis para integração enviando um **GET** com seu :toolTipComponent[Access Token]{content="Chave privada da aplicação criada no Mercado Pago e utilizada no _backend_. Você pode acessá-la através de *Suas integrações > Dados da integração > Testes > Credenciais de teste* ou *Produção > Credenciais de produção*."} ao endpoint :TagComponent{tag="API" text="/v1/payment_methods" href="/developers/pt/reference/online-payments/checkout-pro/payment-methods/get"}. | `master` |
| `installments` | Define o número máximo de parcelas que podem ser oferecidas ao comprador. | `10` |

Com estas informações, utilize um dos SDKs disponíveis para configurar os meios de pagamento que deseja eliminar.

[[[
```curl
"payment_methods": {
  "excluded_payment_methods": [
  {
  "id": "master"
  }
  ],
  "excluded_payment_types": [
  {
  "id": "ticket"
  }
  ]
}
```
```php
<?php
$preference = new MercadoPago\Preference();
// ...
$preference->payment_methods = array(
  "excluded_payment_methods" => array(
  array("id" => "master")
  ),
  "excluded_payment_types" => array(
  array("id" => "ticket")
  ),
  "installments" => 12
);
// ...
?>
```
```node
const preference = new Preference(client);
	preference.create({
		body: {
			// ...
			payment_methods: {
  excluded_payment_methods: [
					{
						id: "master"
					}
				],
				excluded_payment_types: [
					{
						id: "ticket"
					}
				],
				installments: 12
			}
		}
	})
// ...
```
```java
PreferenceClient client = new PreferenceClient();
//...
List<PreferencePaymentMethodRequest> excludedPaymentMethods = new ArrayList<>();
excludedPaymentMethods.add(PreferencePaymentMethodRequest.builder().id("master").build());
excludedPaymentMethods.add(PreferencePaymentMethodRequest.builder().id("amex").build());

List<PreferencePaymentTypeRequest> excludedPaymentTypes = new ArrayList<>();
excludedPaymentTypes.add(PreferencePaymentTypeRequest.builder().id("ticket").build());

PreferencePaymentMethodsRequest paymentMethods =
  PreferencePaymentMethodsRequest.builder()
  .excludedPaymentMethods(excludedPaymentMethods)
  .excludedPaymentTypes(excludedPaymentTypes)
  .installments(12)
  .build();

PreferenceRequest request = PreferenceRequest.builder().paymentMethods(paymentMethods).build();

client.create(request);
//...
```
```ruby
#...
preference_data = {
  # ...
  payment_methods: {
  excluded_payment_methods: [
  { id: 'master' }
  ],
  excluded_payment_types: [
  { id: 'ticket' }
  ],
  installments: 12
  }
  # ...
}
#...
```
```csharp
var paymentMethods = new PreferencePaymentMethodsRequest
{
  ExcludedPaymentMethods = new List<PreferencePaymentMethodRequest>
  {
  new PreferencePaymentMethodRequest
  {
  Id = "master",
  },
  },
  ExcludedPaymentTypes = new List<PreferencePaymentTypeRequest>
  {
  new PreferencePaymentTypeRequest
  {
  Id = "ticket",
  },
  },
  Installments = 12,
};

var request = new PreferenceRequest
{
  // ...
  PaymentMethods = paymentMethods,
};
```
```python
#...
preference_data = {
  "excluded_payment_methods": [
  { "id": "master" }
  ],
  "excluded_payment_types": [
  { "id": "ticket" }
  ],
  "installments": 12
}
#...
```
]]]