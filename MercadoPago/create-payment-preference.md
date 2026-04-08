> SERVER_SIDE
>
> h1
>
> Criar e configurar uma preferência de pagamento

Uma **preferência de pagamento** é um objeto que reúne informações sobre o produto ou serviço pelo qual você deseja cobrar. No ecossistema do Mercado Pago, esse objeto é denominado `preference`. Ao criar uma preferência de pagamento, é possível definir atributos essenciais, como preço, quantidade e métodos de pagamento, além de configurar outros aspectos do fluxo de pagamento.

Durante esta etapa, você também irá adicionar os **meios de pagamento** que deseja oferecer com o Checkout Pro, que por padrão inclui todos os meios de pagamento disponíveis no Mercado Pago.

Para configurar uma preferência de pagamento, utilize o método correspondente à `preference` no SDK de backend. É necessário **criar uma nova preferência de pagamento para cada pedido ou fluxo de pagamento** que você deseja iniciar.

Abaixo, você encontrará exemplos práticos de como implementar essa funcionalidade em seu backend utilizando o SDK, disponível em várias linguagens de programação. Certifique-se de preencher os atributos com informações precisas para detalhar cada transação e garantir um processo de pagamento eficiente.

> NOTE
>
> Esses atributos permitem ajustar parcelas, excluir determinados meios de pagamento, modificar a data de vencimento de um pagamento, entre outras opções. Para personalizar sua preferência de pagamento, acesse as documentações da seção de **Configurações adicionais**. 

[[[
```php
<?php
$client = new PreferenceClient();
$preference = $client->create([
  "items"=> array(
  array(
  "title" => "Meu produto",
  "quantity" => 1,
  "unit_price" => 2000
  )
  )
]);

echo $preference
?>
```
```node
const preference = new Preference(client);

preference.create({
  body: {
  items: [
  {
  title: 'Meu produto',
  quantity: 1,
  unit_price: 2000
  }
  ],
  }
})
.then(console.log)
.catch(console.log);
```
```java
PreferenceItemRequest itemRequest =
  PreferenceItemRequest.builder()
  .id("1234")
  .title("Games")
  .description("PS5")
  .pictureUrl("http://picture.com/PS5")
  .categoryId("games")
  .quantity(2)
  .currencyId("BRL")
  .unitPrice(new BigDecimal("4000"))
  .build();
  List<PreferenceItemRequest> items = new ArrayList<>();
  items.add(itemRequest);
PreferenceRequest preferenceRequest = PreferenceRequest.builder()
.items(items).build();
PreferenceClient client = new PreferenceClient();
Preference preference = client.create(preferenceRequest);
```
```ruby
# Cria um objeto de preferência
preference_data = {
  items: [
  {
  title: 'Meu produto',
  unit_price: 75.56,
  quantity: 1
  }
  ]
}
preference_response = sdk.preference.create(preference_data)
preference = preference_response[:response]

# Este valor substituirá a string "<%= @preference_id %>" no seu HTML
@preference_id = preference['id']
```
```csharp
// Cria o objeto de request da preference
var request = new PreferenceRequest
{
  Items = new List<PreferenceItemRequest>
  {
  new PreferenceItemRequest
  {
  Title = "Meu produto",
  Quantity = 1,
  CurrencyId = "ARS",
  UnitPrice = 75.56m,
  },
  },
};

// Cria a preferência usando o client
var client = new PreferenceClient();
Preference preference = await client.CreateAsync(request);
```
```python
# Cria um item na preferência
preference_data = {
  "items": [
  {
  "title": "Meu produto",
  "quantity": 1,
  "unit_price": 75.76,
  }
  ]
}

preference_response = sdk.preference().create(preference_data)
preference = preference_response["response"]
```
```go
import (
  "github.com/mercadopago/sdk-go/pkg/preference"
)

client := preference.NewClient(cfg)

request := preference.Request{
	Items: []preference.ItemRequest{
		{
			Title: "Meu produto",
			Quantity: 1,
			UnitPrice: 75.76,
		},
	},
}

resource, err := client.Create(context.Background(), request)
if err != nil {
	fmt.Println(err)
	return
}

fmt.Println(resource)
```
]]]

## Obter o identificador da preferência

O identificador da preferência é um código único que representa uma transação específica para uma solicitação de pagamento. Para obtê-lo, você deve executar sua aplicação.

Na resposta, o **identificador da preferência** estará localizado na **propriedade ID**. Guarde esse valor com atenção, pois ele será **necessário na próxima etapa para integrar o pagamento** ao seu site ou aplicativo móvel.

Veja abaixo um exemplo de como o atributo ID, contendo o identificador de preferência, é exibido em uma resposta:

```
"id": "787997534-6dad21a1-6145-4f0d-ac21-66bf7a5e7a58"
```

### Escolher o tipo de integração

Após obter o ID da preferência, você deve prosseguir para a configuração do frontend. Para isso, escolha o tipo de integração que melhor atenda às suas necessidades, seja para um **site** ou um **aplicativo móvel**.

Selecione o tipo de integração que deseja realizar e siga os passos detalhados para completar a integração do Checkout Pro.
Selecione a opção de integração desejada e siga as instruções detalhadas para completar a integração do Checkout Pro.

---
future_product_avaible: 
 - card_avaible: true
 - card_icon: Laptop
 - card_title: Continuar a integração para sites
 - card_description: Oferece cobranças com redirecionamento para o Mercado Pago no seu site ou loja online.
 - card_button: /developers/pt/docs/checkout-pro/configure-back-urls
 - card_buttonDescription: Integração web
 - card_pillText: DISPONÍVEL
 - card_linkAvailable: false
 - card_linkProof:
 - card_linkProofDescription:
 - card_avaible: true
 - card_icon: Smartphone
 - card_title: Continuar a integração para aplicações móveis
 - card_description: Oferece cobranças com redirecionamento para o Mercado Pago no seu aplicativo para dispositivos móveis.
 - card_button: /developers/pt/docs/checkout-pro/mobile-integration
 - card_buttonDescription: Integração mobile
 - card_pillText: DISPONÍVEL
 - card_linkAvailable: false
 - card_linkProof:
 - card_linkProofDescription:
---