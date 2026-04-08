# Casos de uso

O Mercado Pago MCP Server garante que atividades comuns a desenvolvedores sejam otimizadas de maneira fácil e rápida. A seguir, conheça os principais casos de uso para implementar em sua integração.

> NOTE
>
> Os exemplos desta seção utilizam o Cursor como cliente MCP, mas você pode utilizar qualquer cliente MCP de sua preferência.

:::AccordionComponent{title="Consultar a documentação a partir de uma IDE" pill="1"}

A _tool_ `search-documentation` permite buscar informações diretamente na documentação oficial do Mercado Pago.

Ao usar o assistente e fazer uma solicitação em linguagem natural, é possível buscar informações na documentação e acessá-las conforme cada etapa do desenvolvimento. Por exemplo, descobrir quais meios de pagamento estão disponíveis em um determinado país.

```plain
Pesquise na documentação de Mercado Pago os meios de pagamento disponíveis
``` 

![search-payment-methods-pt.gif](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/4/28/1748435682178-searchdocpaymentmethodspt.gif)

:::
:::AccordionComponent{title="Gerar código para integrar um checkout do Mercado Pago" pill="2"} 

Além de consultar a documentação, a _tool_ `search-documentation` também permite que você gere código para seu projeto.

Você pode solicitar esta recomendação ao assistente pedindo para que ele revise a documentação do produto que deseja integrar e indique as etapas necessárias para realizar esta integração. O MCP Server fornece o contexto necessário, por meio de código e documentação, para que a IDE realize as modificações necessárias no seu projeto.

Para este caso de uso, vamos considerar uma loja que já esteja configurada e que precisa apenas integrar um checkout para começar a processar pagamentos. Neste contexto, um _prompt_ de orientação para integrar com o Checkout Pro poderia ser:

```plain
Implemente a integração de Checkout Pro. 
Consulte a documentação do MCP Server do Mercado Pago para qualquer detalhe de implementação ou incerteza.

Após revisar o código da aplicação existente, gere código produtivo da seguinte forma:

Frontend:
1- Substituir o botão de pagamento pela interface de checkout do Mercado Pago;
2- Integrar o formulário de pagamento;
3- Implementar fluxos de sucesso/falha do lado do cliente.

Backend:
1- Configurar as credenciais e integrar a SDK na versão mais recente;
2- Criar serviços de processamento de pagamentos;
3- Implementar o manuseio de webhooks com validações.

Requisitos:
- Utilizar as melhores práticas e validação de segurança do Mercado Pago;
- Gerenciamento de erros com códigos de estado;
- Casos de teste para fluxos críticos;
- Adicionar documentação no código;
- Verificar todos os passos contra a documentação do servidor MCP do Mercado Pago.

```

O resultado pode variar de acordo com a configuração do seu projeto, mas como regra geral, o MCP Server do Mercado Pago irá sugerir modificações de código no _frontend_ e _backend_ da sua integração para criar o checkout.

![example-prompt-cho-pro-en-gif](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/4/28/1748437544887-checkoutproprompten.gif)

Se você quiser ver mais detalhes deste exemplo prático, acesse nosso [artigo no Medium](https://medium.com/mercadolibre-tech/agentic-ides-and-model-context-protocol-applied-to-mercado-pago-fa47429894a9) sobre o caso de sucesso para integrar o Checkout Pro em 30 minutos.

:::
:::AccordionComponent{title="Configurar e testar notificações" pill="3"} 

É possible combinar _tools_ para configurar as notificações Webhooks do Mercado Pago e testar seu funcionamento correto antes de subir em produção.

No seguinte exemplo, combinamos o uso das _tools_ `search_documentation`, `save_webhook` e `simulate_webhook` para realizar uma configuração completa, desde a implementação de um receptor até a simulação de um envio, para confirmar assim o funcionamento de todo o fluxo.

```plain
Estou desenvolvendo uma integração com o Mercado Pago e preciso configurar e testar notificações webhooks de pagamentos.

Siga as seguintes instruções para alcançar meu objetivo:

1. Consulte a documentação oficial do Mercado Pago para identificar os requisitos técnicos e de segurança que um receptor de notificações webhooks deve cumprir.
2. Com base nessas informações, gere um exemplo de implementação funcional para receber e processar notificações adaptado ao meu projeto.
3. Configure as notificações webhook do Mercado Pago para pagamentos, apontando para a URL de teste <webhook.site>.
4. Simule um evento de pagamento para validar que o receptor os processe corretamente.
```
![exemplo-prompt-webhooks](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/8/18/1758225641647-testnotisptezgif.comoptimize.gif)
:::
:::AccordionComponent{title="Otimizar e medir a qualidade da sua integração" pill="4"}

O Mercado Pago MCP Server pode ajudá-lo na implementação de melhorias em sua integração para adequá-la aos padrões de qualidade e segurança necessários na operação com o Mercado Pago.

Combine as _tools_ `quality_checklist` e `quality_evaluation` para garantir um desenvolvimento de acordo com esses padrões e boas práticas, e depois medir a qualidade da sua integração com um pagamento real, uma vez que tenha subido em produção.

Para isso, utilize uma sequência de _prompts_ similar ao exemplo a seguir.

```plain
Preciso garantir que o código implementado na minha integração tenha máxima qualidade, eficiência, rápida manutenção e alta taxa de aprovação. Para isso, faça uma análise exaustiva da sua qualidade, onde identificará áreas de melhoria e implementará soluções concretas que otimizem o desempenho e aderência aos padrões do Mercado Pago.

Siga as seguintes instruções para implementar essas melhorias:

1. Revise o código-fonte, entenda sua estrutura e identifique onde se encontra a integração com o Mercado Pago.
2. Consulte a documentação do Mercado Pago e faça uma lista de boas práticas e requisitos de qualidade para melhorar minha integração levando em conta os padrões do Mercado Pago.
3. Implemente as melhorias que são requeridas ou que serão avaliadas pelo Mercado Pago.
4. Gere um resumo das mudanças aplicadas e inclua, ao final, sugestões de boas práticas que podem ser incluídas na integração.
5. Indique-me como realizar um pagamento produtivo para poder verificar que essas mudanças são efetivas.
```
![exemplo-prompt-calidade-integração](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/8/18/1758227887134-testqualitypromptptezgif.comoptimize.gif)

Após realizar esse pagamento produtivo, você poderá solicitar ao agente que uma medição de qualidade utilizando o novo identificador do pagamento.

```plain
Realize a medição de qualidade da minha integração com o Mercado Pago tomando como referência o payment_id <seupaymentid>.
```
:::
:::AccordionComponent{title="Gerar passo a passo para testes de integração e criar usuários de teste" pill="5"}

As _tools_ do Mercado Pago MCP Server irão ajudá-lo a obter um guia completo para realizar corretamente os testes da sua integração em um único lugar, auxiliando-o também na criação dos usuários de teste.

Neste exemplo, as _tools_ `search_documentation` e `create_test_user` são combinadas para ter tudo o necessário para um fluxo completo de testes de integração de QR Code sem sair do ambiente de desenvolvimento.

```plain
**Contexto:**

Você está integrando o fluxo de QR Code modelo dinâmico utilizando a API de Orders do Mercado Pago e precisa testar esta integração com uma simulação de ponta a ponta, respeitando as condições reais de teste.

**Papel do modelo:**

Atue como um gerador de documentação técnica e código que segue estritamente a documentação oficial do Mercado Pago.

**Tarefa específica:**

Gere uma resposta estruturada e detalhada que inclua:

1. **Controle de testes de integração:**
Utilize exclusivamente a documentação oficial do Mercado Pago para detalhar os requisitos necessários para testar o fluxo de QR Code modelo dinâmico com API Orders. Indique claramente que tipo de credenciais devem ser utilizadas (test vs. production) em cada etapa.

2. **Criação de usuários de teste:**
Crie usuários de teste:
* Um vendedor do Brasil com credenciais, identificado como `testes orders`.
* Um comprador identificado como `comprador orders`.

3. **Simulação passo a passo do pagamento:**
Forneça instruções concisas para simular o fluxo completo desde a criação da order até a finalização do pagamento, utilizando somente a documentação oficial.
* Detalhe cada ação-chave.
* Explique a ordem lógica das operações e sua justificativa.

**Restrição:**

Não gere nem assuma dados fora da documentação oficial. Se faltar informação específica, indique claramente e sugira alternativas verificáveis ou recursos oficiais.

**Resultado esperado:**

Um guia com seções bem diferenciadas, código ou JSON de exemplo se aplicável, e explicações técnicas precisas, pronto para ser utilizado como base de testes em um ambiente de integração.
```

![Exemplo teste Código QR](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/11/9/1765290627546-testqrfinalptezgif.comoptimize.gif)

:::