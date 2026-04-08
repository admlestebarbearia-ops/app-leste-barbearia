# Configurar notificações de contestações

As notificações Webhooks (também conhecido como retorno de chamada web) são um método simples que permite a uma aplicação ou sistema fornecer informações em tempo real sempre que um evento ocorre. É uma forma passiva de receber dados entre dois sistemas por meio de uma solicitação `HTTP POST`.

Uma vez configuradas, essas notificações serão enviadas sempre que uma contestação for criada ou seu status for modificado. A partir das informações recebidas, será possível gerenciar a contestação.
A seguir, apresentamos um passo a passo para realizar a configuração.

1. Acesse [Suas integrações](/developers/panel/app) e selecione a aplicação para a qual deseja ativar as notificações de contestações.

![Application](/images/cow/not1-select-app-pt-v1.png)

2. No menu à esquerda, selecione **Webhooks > Configurar notificações**.

![Webhooks](/images/cow/not2-webhooks-pt-v1.png) 

3. Configure a URL HTTPS produtiva que será utilizada para receber as notificações. 

![URL](/images/cow/not3-url-pt-v1.png) 

4. Em eventos recomendados, selecione o evento **Contestações** para receber notificações, que serão enviadas no formato `JSON` por meio de um `HTTPS POST` para a URL especificada anteriormente.

![Chargebacks](/images/cow/not4-url-pt-v1.png) 

5. Por último, clique em **Salvar configurações**. Isso gerará uma chave secreta exclusiva para a aplicação, que permitirá validar a autenticidade das notificações recebidas, garantindo que elas tenham sido enviadas pelo Mercado Pago. Para mais detalhes, consulte a [documentação de notificações de Webhooks](/developers/pt/docs/your-integrations/notifications/webhooks). 

**Exemplo de notificação**:

As notificações enviadas pelo Mercado Pago para o tópico de `chargebacks` serão semelhantes ao exemplo a seguir:

```
{
  "actions":[
  "changed_case_status",
  ],
  "api_version":"v1",
  "application_id":9007201037432480,
  "data":{
  "checkout":"PRO",
  "date_updated":"0001-01-01T00:00:00Z",
  "id":233000061680860000,
  "payment_id":81968653106,
  "product_id":"C00A2J8RF4DI8BCIMFU0",
  "site_id":"MLA",
  "transaction_intent_id":""
  },
  "date_created":"2024-07-03T19:34:28-04:00",
  "id":114411153595,
  "live_mode":true,
  "type":"topic_chargebacks_wh",
  "user_id":634060442,
  "version":1720035618
}
```

Essas notificações fornecem informações completas sobre o processo iniciado pelo cliente, sendo fundamentais para [gerenciar a contestação](/developers/pt/docs/checkout-pro/chargebacks/manage).