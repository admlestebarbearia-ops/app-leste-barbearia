# Troubleshooting

Ao trabalhar com o MCP Server do Mercado Pago, você pode encontrar problemas que interrompem seu fluxo de trabalho. Este guia vai ajudar você a identificar, diagnosticar e resolver erros comuns rapidamente, garantindo uma experiência mais fluida.

Se você está enfrentando problemas para se conectar ao MCP, siga estas etapas:

:::AccordionComponent{title="Verifique a conexão de rede"}
Certifique-se de que seu dispositivo está conectado à internet e que não há bloqueios impedindo o acesso ao endpoint do MCP Server (`https://mcp.mercadopago.com/mcp`).
:::

:::AccordionComponent{title="Verificar as credenciais"}
Para acessar o MCP Server, você precisa de uma credencial válida. Chame uma de nossas APIs públicas para verificar sua credencial, por exemplo a:TagComponent{tag="API" text="/v1/payment_methods" href="/developers/pt/reference/online-payments/checkout-pro/payment-methods/get"}.

Veja como funciona na prática:

```bash
curl -X GET "https://api.mercadopago.com/v1/payment_methods" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

O resultado esperado é:

```json
[
  {
  "id": "visa",
  "name": "Visa",
  "payment_type_id": "credit_card",
  "status": "active",
  "secure_thumbnail": "https://www.mercadopago.com/org-img/MP3/API/logos/visa.gif",
  "thumbnail": "http://img.mlstatic.com/org-img/MP3/API/logos/visa.gif",
  "deferred_capture": "supported",
  "settings": {
  "card_number": {
  "length": 16,
  "validation": "standard"
  },
  "security_code": {
  "mode": "mandatory",
  "length": 3,
  "card_location": "back"
  }
  },
  "additional_info_needed": [
  {}
  ],
  "min_allowed_amount": 0.5,
  "max_allowed_amount": 60000,
  "accreditation_time": 2880,
  "financial_institutions": {},
  "processing_modes": "aggregator"
  }
]
```

Se receber uma resposta diferente, suas credenciais podem não ser válidas. Caso tenha de obter uma nova chave, siga nossa [documentação de credenciais](/developers/pt/docs/credentials).
:::

:::AccordionComponent{title="Verificar a versão do Node.js"}
Para a maioria dos clientes MCP, como Cursor, Claude e Windsurf, é necessário usar a versão Node.js 20 ou acima. Para verificar qual sua versão atual do Node.js, execute:

```bash
node -v
```

O resultado irá exibir a versão padrão do Node.js e o esperado é que seja a versão 20 ou superior. Caso utilize NVM (Node Version Manager), execute os seguintes comandos para verificar as versões instaladas e, se necessário, instalar uma nova:

```bash
# Listar versões instaladas do Node.js
nvm list

# Instalar Node.js 20
nvm install 20

# Desinstalar uma versão específica (substitua XX pelo número da versão)
nvm uninstall XX
```
:::

:::AccordionComponent{title="Verificar a instalação do NPX"}
NPX é uma ferramenta executora de pacotes incluída no NPM (Node Package Manager) e que é usada para se conectar ao MCP Server do Mercado Pago.

### Verificar instalação do NPX

Para verificar se o NPX já está instalado, execute:

```bash
npx --version
```

Se aparecer um número de versão, significa que o pacote está instalado. No caso de receber um erro "command not found", instale ou atualize o NPM, o que inclui também o NPX.

### Instalar ou atualizar NPX

O pacote de NPX está incluído no NPM versão 5.2.0 e superior. Execute o comando a seguir para instalar ou atualizar ambos os pacotes (NPM e NPX):

```bash
npm install -g npm
```

Após a atualização, verifique a instalação:

```bash
npx --version
```

Se os problemas persistirem, certifique-se de que suas instalações do Node.js e NPM estão atualizadas. Em seguida, verifique sua versão do NPM com o comando:

```bash
npm -v
```

Para mais informações, consulte a [documentação do NPX](https://www.npmjs.com/package/npx).
:::

:::::AccordionComponent{title="Verificar a versão do seu cliente"}
Para se conectar com sucesso ao nosso MCP Server, é importante ter a versão mais recente disponível do cliente que você está utilizando.

Para verificar isso e, se necessário, realizar uma atualização, siga o passo a passo de acordo com o seu cliente de preferência.

::::TabsComponent
:::TabComponent{title="Cursor"}

Para saber qual é a versão mais recente disponível do Cursor, consulte o [_Changelog_](https://cursor.com/changelog). Em seguida, verifique a sua versão do aplicativo de acordo com o seu sistema operacional.

### macOS

Você pode verificar a versão do Cursor que está utilizando acessando **Cursor > About Cursor**.

Se não corresponder à versão indicada no _Changelog_, você pode forçar a atualização acessando novamente o menu superior e clicando em **Cursor > Check for updates**. Isso irá guiá-lo no passo a passo necessário.

### Windows

Você pode verificar a versão do Cursor que está utilizando acessando o menu **Help > About Cursor**.

Se não corresponder à versão indicada no _Changelog_, você pode forçar a atualização acessando novamente o menu superior e clicando em **Help > Check for updates**. Isso irá guiá-lo no passo a passo necessário.

:::
:::TabComponent{title="Windsurf"}

Para saber qual é a versão mais recente disponível do Windsurf, consulte o [_Changelog_](https://windsurf.com/changelog). Em seguida, verifique a sua versão do aplicativo de acordo com o seu sistema operacional.

### macOS

Você pode verificar a versão do Windsurf que está utilizando acessando **Windsurf > About Windsurf**.

Se não corresponder à versão indicada no _Changelog_, você pode forçar a atualização acessando novamente o menu superior e clicando em **Windsurf > Check for updates**. Isso irá guiá-lo no passo a passo necessário.

### Windows

Você pode verificar a versão do Windsurf que está utilizando acessando o menu **Help > About Windsurf**.

Se não corresponder à versão indicada no _Changelog_, você pode forçar a atualização acessando novamente o menu superior e clicando em **Help > Check for updates**. Isso irá guiá-lo no passo a passo necessário.

:::
:::TabComponent{title="Outros clientes"}

Para verificar se há atualizações disponíveis em outros clientes, como **Claude Desktop** ou **ChatGPT**, procure pela opção **Check for updates** no menu superior do aplicativo.

Se houver uma atualização disponível, o aplicativo irá notificá-lo e permitirá a instalação.

Caso tenha algum problema ao atualizar dessa forma, você também pode acessar o site oficial do cliente, fazer download da versão mais atualizada do aplicativo e substituí-la no seu sistema.
:::
::::
:::::

:::AccordionComponent{title="Testar a conexão via terminal"}
Se os problemas para se conectar persistirem, tente realizar a conexão ao MCP Server através do terminal com o comando:

```bash
npx -y mcp-remote@latest https://mcp.mercadopago.com/mcp --header 'Authorization:Bearer <ACCESS_TOKEN>'
```

A resposta deve ser como o exemplo a seguir:

```text
[22599] Using automatically selected callback port: 22476
[22599] Using custom headers: {"Authorization":"Bearer <ACCESS_TOKEN>"}
[22599] [22599] Connecting to remote server: https://mcp.mercadopago.com/mcp
[22599] Using transport strategy: http-first
[22599] Connected to remote server using StreamableHTTPClientTransport
[22599] Local STDIO server running
[22599] Proxy established successfully between local STDIO and remote StreamableHTTPClientTransport
[22599] Press Ctrl+C to exit
```

Os erros comuns nesta etapa são:

| Erro | Descrição |
|-|-|
| ```ReferenceError: TransformStream is not defined```| Significa que você está usando uma versão desatualizada do Node.js. Desinstale todas as versões exceto uma (versão 20 ou superior). |
| ```command not found: npx``` | Significa que o NPX não está instalado no seu sistema. Siga as instruções na seção **Verificação da instalação do NPX** para resolver este problema. | 

:::
:::::AccordionComponent{title="Testar a conexão via header de autenticação"}

Se você tiver problemas para conectar nosso MCP Server no Cursor ou VS Code, tente alterar o modo de autenticação. Para isso, siga os passos indicados para o cliente que você está utilizando.

::::TabsComponent
:::TabComponent{title="Cursor"}

Para instalar nosso MCP no Cursor via _header_ de autenticação, você pode clicar no botão abaixo ou seguir os passos manualmente.

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=mercadopago-mcp-server&config=eyJ1cmwiOiJodHRwczovL21jcC5tZXJjYWRvcGFnby5jb20vbWNwIiwiaGVhZGVycyI6eyJBdXRob3JpemF0aW9uIjoiQmVhcmVyIDxBQ0NFU1NfVE9LRU4%252BIn19)

Abra o arquivo .cursor/mcp.json e adicione a configuração do servidor do Mercado Pago. Consulte a [documentação do Cursor](https://docs.cursor.com/context/model-context-protocol) para mais informações.

Preencha o campo `<authorization>` com seu :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"}.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server-prod": {
  "url": "https://mcp.mercadopago.com/mcp",
  "headers": {
  "Authorization": "Bearer <ACCESS_TOKEN>"
  }
  }
  }
}
```

Ao concluir estes passos, o Mercado Pago MCP Server deverá estar pronto para uso. Para verificar se a integração foi bem-sucedida, acesse as configurações do seu cliente e confirme que o MCP está marcado como disponível.
:::
:::TabComponent{title="VS Code"}

1. Abra o VS Code e pressione **Cmnd + Shift + P**, se você utiliza macOS, ou **Ctrl + Shift + P**, se você utiliza Windows. Isso irá posicioná-lo na barra de pesquisa, localizada na margem superior, para que você possa pesquisar nas suas configurações.
2. Digite **MCP: Open User Configuration**. O arquivo `mcp.json` será aberto automaticamente, onde você deverá adicionar a configuração do Mercado Pago MCP Server conforme mostrado abaixo, preenchendo o campo <authorization> com seu :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"}.

```json
{
  "servers": {
  "mcp-mercadopago": { 
  "command": "npx",
  "args": [
  "-y",
  "mcp-remote@latest",
  "https://mcp.mercadopago.com/mcp",
  "--header",
  "Authorization: Bearer <ACCESS_TOKEN>"
  ],
  }
  }
}
```

3. Salve a configuração e acesse **Extensions > MCP Servers - Installed**, onde você poderá visualizá-lo.
4. Clique em suas **Configurações** e depois em **Start Server**. O processo de conexão será iniciado e você poderá acompanhar pelo console.

Ao finalizar, o Mercado Pago MCP Server estará pronto para uso. Se houver algum erro no processo, ele será indicado e você poderá fazer os ajustes necessários.

:::
:::TabComponent{title="Claude Code"}

Se você enfrentar problemas com autenticação OAuth no Claude Code, poderá se conectar usando seu :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"} manualmente. Use o seguinte comando:

```bash
claude mcp add \
  --transport http \
  mercadopago \
  https://mcp.mercadopago.com/mcp \
  --header "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Em seguida, verifique a conexão executando:

```bash
/mcp
```

Com este método de autenticação via credenciais, nenhuma janela de autenticação OAuth será aberta. O MCP estará disponível imediatamente após a verificação.

:::
::::
:::::