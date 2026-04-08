# Configurar URLs de retorno

A URL de retorno é o endereço para o qual o usuário é redirecionado após completar o pagamento, seja ele bem-sucedido, falho ou pendente. Esta URL deve ser uma página web controlável, como um servidor com domínio nomeado (DNS).

Esse processo é configurado através do atributo `back_urls` no backend, na preferência de pagamento associada à sua integração. Com este atributo, você pode definir para qual site o comprador será redirecionado, seja automaticamente ou através do botão "Voltar ao site", de acordo com o estado do pagamento.

Você pode configurar até três URLs de retorno diferentes, correspondendo aos cenários de pagamento **pendente**, **sucesso** ou **erro**.

> NOTE
>
> Em integrações _mobile_, recomendamos que as URLs de retorno sejam _deep links_. Para saber mais, acesse a [documentação Integração para aplicações móveis](/developers/pt/docs/checkout-pro/mobile-integration).

## Definir URLs de retorno

No seu código backend, configure a URL para a qual deseja que o Mercado Pago redirecione o usuário após a conclusão do processo de pagamento.

> NEUTRAL_MESSAGE
>
> Se preferir, você também pode configurar as URLs de retorno enviando um POST para a API [Criar preferência](/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post) com o atributo `back_urls`, especificando as URLs para as quais o comprador deve ser redirecionado após finalizar o pagamento.

A seguir, compartilhamos exemplos de como incluir o atributo `back_urls` de acordo com a linguagem de programação que você está utilizando, além do detalhamento de cada um dos possíveis parâmetros.

[[[
```php
<?php
$preference = new MercadoPago\Preference();
//...
$preference->back_urls = array(
  "success" => "https://www.seu-site/success",
  "failure" => "https://www.seu-site/failure",
  "pending" => "https://www.seu-site/pending"
);
$preference->auto_return = "approved";
// ...
?>
```
```node
const preference = new Preference(client);
  preference.create({
  body: {
  // ...
  back_urls: {
  success: "https://www.seu-site/success",
  failure: "https://www.seu-site/failure",
  pending: "https://www.seu-site/pending"
  },
  auto_return: "approved",
  }
  })
  // ...
```
```java
PreferenceBackUrlsRequest backUrls =
// ...
  PreferenceBackUrlsRequest.builder()
  .success("https://www.seu-site/success")
  .pending("https://www.seu-site/pending")
  .failure("https://www.seu-site/failure")
  .build();

PreferenceRequest request = PreferenceRequest.builder().backUrls(backUrls).build();
// ...
```
```ruby
# ...
preference_data = {
  # ...
  back_urls: {
  success: 'https://www.seu-site/success',
  failure: 'https://www.seu-site/failure',
  pending: 'https://www.seu-site/pendings'
  },
  auto_return: 'approved'
  # ...
}
# ...
```
```csharp
var request = new PreferenceRequest
{
  // ...
  BackUrls = new PreferenceBackUrlsRequest
  {
  Success = "https://www.seu-site/success",
  Failure = "https://www.seu-site/failure",
  Pending = "https://www.seu-site/pendings",
  },
  AutoReturn = "approved",
};
```
```python
preference_data = {
  "back_urls": {
  "success": "https://www.seu-site/success",
  "failure": "https://www.seu-site/failure",
  "pending": "https://www.seu-site/pendings"
  },
  "auto_return": "approved"
}
```
]]]

| Atributo | Descrição |
|--------------|-----|
| `auto_return`| Os compradores são redirecionados automaticamente ao site quando o pagamento é aprovado. O valor padrão é `approved`. **O tempo de redirecionamento será de até 40 segundos e não poderá ser personalizado**. Por padrão, também será exibido um botão de "Voltar ao site".|
| `back_urls` | URL de retorno ao site. Os cenários possíveis são: <br>`success`: URL de retorno quando o pagamento é aprovado.<br>`pending`: URL de retorno quando o pagamento está pendente.<br>`failure`: URL de retorno quando o pagamento é rejeitado. |

## Resposta das URLs de retorno

As `back_urls` fornecem vários parâmetros úteis por meio de uma solicitação GET. A seguir, apresentamos um exemplo de resposta, acompanhado de uma explicação detalhada dos parâmetros incluídos nela.

```curl
GET /test?collection_id=106400160592&collection_status=rejected&payment_id=106400160592&status=rejected&external_reference=qweqweqwe&payment_type=credit_card&merchant_order_id=29900492508&preference_id=724484980-ecb2c41d-ee0e-4cf4-9950-8ef2f07d3d82&site_id=MLC&processing_mode=aggregator&merchant_account_id=null HTTP/1.1
Host: yourwebsite.com
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7
Accept-Encoding: gzip, deflate, br, zstd
Accept-Language: es-419,es;q=0.9
Connection: keep-alive
Referer: https://www.mercadopago.com/checkout/v1/payment/redirect/505f641c-cf04-4407-a7ad-8ca471419ee5/congrats/rejected/?preference-id=724484980-ecb2c41d-ee0e-4cf4-9950-8ef2f07d3d82&router-request-id=0edb64e3-d853-447a-bb95-4f810cbed7f7&p=f2e3a023dd16ac953e65c4ace82bb3ab
Sec-Ch-Ua: "Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"
Sec-Ch-Ua-Mobile: ?0
Sec-Ch-Ua-Platform: "macOS"
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: cross-site
Sec-Fetch-User: ?1
Upgrade-Insecure-Requests: 1
```

| Parâmetro | Descrição |
|-----------------------|------------------------------------------------------------------------------------------------|
| `payment_id` | ID (identificador) do pagamento do Mercado Pago. |
| `status` | Status do pagamento. Por exemplo: `approved` para um pagamento aprovado ou `pending` para um pagamento pendente. |
| `external_reference` | Referência para sincronização com seu sistema de pagamentos. |
| `merchant_order_id` | Identificador (ID) único da ordem de pagamento criada no Mercado Pago. |

### Resposta para meios de pagamento offline

Os meios de pagamento offline permitem que o comprador selecione um método que exija a utilização de um ponto de pagamento físico para concluir a transação. Nesse fluxo, o Mercado Pago gera um comprovante que o comprador deve apresentar no estabelecimento para realizar o pagamento. Após essa etapa, o comprador será redirecionado para a URL definida no atributo `back_urls` como `pending`.

Nesse momento, o pagamento estará em estado pendente, já que o comprador ainda precisa efetuar o pagamento presencialmente no estabelecimento indicado.

> Para pagamentos com o estado `pending`, sugerimos redirecionar o comprador para o seu site e fornecer orientações claras sobre como concluir o pagamento.

Assim que o pagamento for realizado no ponto físico com o comprovante gerado, o Mercado Pago será notificado, e o estado do pagamento será atualizado. Recomendamos que você [configure as notificações de pagamento](/developers/pt/docs/checkout-pro/payment-notifications) para que seu servidor receba essas atualizações e atualize o estado do pedido na sua base de dados.