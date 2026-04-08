# Conectar-se ao MCP Server

A conexão ao Mercado Pago MCP Server é feita de forma remota através do cliente que melhor se adapte à sua integração. Confira a seguir o passo a passo de acordo com o tipo de cliente.

::::TabsComponent

:::TabComponent{title="Cursor"}
Para instalar nosso MCP no Cursor, você pode clicar no botão abaixo ou seguir os passos manualmente.

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=mcp-mercadopago-prod-oauth&config=eyJ1cmwiOiJodHRwczovL21jcC5tZXJjYWRvcGFnby5jb20vbWNwIn0%3D)

Abra o arquivo `.cursor/mcp.json` e adicione a configuração do servidor do Mercado Pago conforme mostrado abaixo.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server": {
  "url": "https://mcp.mercadopago.com/mcp"
  }
  }
}
```
Em seguida, acesse **Cursor Settings > Tools & MCPs** e habilite o Mercado Pago MCP Server clicando em **Connect**.

![Cursor Tools & MCP](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/11/5/1764949890252-cursormcp.png)

> WARNING
>
> Caso o Cursor não inicie a conexão ao clicar no botão mencionado, utilize o link **Needs authentication**, localizado abaixo do nome do MCP. 

Ao habilitar a conexão, você será redirecionado para o site do Mercado Pago para realizar a autenticação, onde deverá indicar de qual **país** está operando e, se estiver de acordo com as permissões concedidas, **autorizar a conexão**.

Após concluir esses passos, você retornará automaticamente ao Cursor e a conexão com o Mercado Pago MCP Server estará pronta.

![mcp-installation-pt-gif](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/4/27/1748367067297-mcpsuccessconfigcursor.png)

:::
:::TabComponent{title="VS Code"}

Abra o VS Code e pressione **Cmnd + Shift + P**, se você usa macOS, ou **Ctrl + Shift + P**, se você usa Windows. Isso irá posicioná-lo na barra de pesquisa, localizada na margem superior, para que você possa pesquisar nas suas configurações.

Digite **MCP: Add Server** e selecione essa opção. Serão solicitadas as seguintes informações:
 1. **Tipo de servidor:** selecione a opção **HTTP (HTTP or Server-Sent Events)**.
 2. **URL do servidor:** copie e cole a URL do Mercado Pago MCP Server.

 ```plain
 "https://mcp.mercadopago.com/mcp"
 ```
 3. **Nome** para identificar o MCP: atribua o de sua preferência.

Isso atualizará as informações contidas no arquivo `.vscode/mcp.json` e, após alguns segundos, abrirá uma janela pop-up solicitando autorização para ser redirecionado à URL do Mercado Pago para sua autenticação.

![VS Code redirect](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/11/5/1764949890455-vscoderedirect.png)

Se essa janela pop-up não aparecer automaticamente, você pode clicar em **Start** dentro do próprio arquivo `.vscode/mcp.json`.

Ali, você deverá indicar de qual **país** está operando e, se estiver de acordo com as permissões concedidas, **autorizar a conexão**.

Após concluir esses passos, você retornará automaticamente ao VS Code e a conexão com o Mercado Pago MCP Server estará pronta.
:::
:::TabComponent{title="Windsurf"}
Você pode instalar nosso MCP no Windsurf através da _MCP Store_ do editor, ou manualmente. Escolha a opção que melhor se adequa às suas necessidades.

### Instalação pela MCP Store

Siga os passos abaixo para instalar o Mercado Pago MCP Server pela _MCP Store_ do Windsurf Editor.

1. Acesse a **MCP Store** no menu superior direito do editor.
2. Na tela de busca, digite "MercadoPago" para encontrar nosso MCP Server.
4. Selecione o servidor e clique em **Install**.
5. No _pop-up_, insira o :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"} da conta com a qual deseja estabelecer a conexão.
6. Salve a configuração e aguarde o resultado.

![Instalação do MCP pela Windsurf Store](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/7/7/1754573349844-Windsurfmcpstore.gif)

Se o processo for bem-sucedido, você verá o Mercado Pago MCP Server marcado como **Enabled** e ele estará pronto para uso. Caso ainda não esteja habilitado, você pode clicar em **Refresh** para atualizar a configuração.

### Instalação manual

Se você deseja realizar a instalação manual do Mercado Pago MCP Server no Windsurf Editor, abra o arquivo `mcp_config.json` e adicione a configuração do servidor do Mercado Pago utilizando o codigo abaixo.

Preencha o campo `authorization` com seu :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"}.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server":{
  "serverUrl": "https://mcp.mercadopago.com/mcp",
  "headers": {
  "Authorization": "Bearer <ACCESS_TOKEN>"
  }
  }
  }
}
```

Ao concluir estes passos, o Mercado Pago MCP Server estará pronto para uso. Para verificar se a integração foi bem-sucedida, acesse as configurações do seu cliente e confirme que o MCP está configurado como disponível.

> WARNING
>
> Se ao consultar as configurações do seu cliente IDE você não encontrar um MCP Server associado, verifique se o código foi inserido corretamente e clique no ícone de atualização. Consulte a [documentação do Windsurf](https://docs.codeium.com/windsurf/mcp) para mais informações.

:::
:::TabComponent{title="Claude Code"}

Para conectar-se ao Mercado Pago MCP Server a partir do Claude Code, utilize o seguinte comando no seu terminal:

```bash
claude mcp add \
  --transport http \
  mercadopago \
  https://mcp.mercadopago.com/mcp
```

Em seguida, verifique a conexão executando o comando abaixo.

```bash
/mcp
```

Você verá o MCP do Mercado Pago listado. Para autenticar-se, clique no link **needs authentication** que aparece abaixo do nome do MCP.

Ao clicar, uma janela pop-up será aberta e o redirecionará para Mercado Pago para realizar a autenticação. Nesse fluxo, você deverá indicar de qual **país** está operando e, se concordar com as permissões concedidas, **autorizar a conexão**.

Após concluir essas etapas, você retornará automaticamente ao Claude Code e a conexão ao Mercado Pago MCP Server estará pronta para usar.

:::
:::TabComponent{title="Outras IDEs"}

> WARNING
>
> Para configurar nosso MCP Server utilizando outras IDEs, é obrigatório ter instalado o pacote NPM versão 6 ou superior e NodeJS 20 ou superior.

Abra a IDE e procure pelo arquivo JSON referente a servidores MCP. Depois, preencha os campos de `authorization` com seu :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"}.

A seguir, pode ver um exemplo de como realizar essas configurações no **Cline**.

### Cline

Abra o arquivo `cline_mcp_settings.json` e adicione a configuração do servidor do Mercado Pago. Lembre-se de preencher o campo de `authorization` com seu :toolTipComponent[_Access Token_]{content ="Chave privada da aplicação criada no Mercado Pago e que é utilizada no backend. Você pode acessá-la através de *Suas integrações* > *Detalhes da aplicação* > *Testes* > *Credenciais de teste* ou *Produção* > *Credenciais de produção*." title="Access Token"}.

Caso precise mais informações, visite a [documentação do Cline Desktop](https://docs.cline.bot/enterprise-solutions/mcp-servers).

```Cline
{
  "mcpServers": {
  "mercadopago-mcp-server": {
  "command": "npx",
  "args": [
  "-y",
  "mcp-remote",
  "https://mcp.mercadopago.com/mcp",
  "--header",
  "Authorization:${AUTH_HEADER}"
  ],
  "env": {
  "AUTH_HEADER": "Bearer <ACCESS_TOKEN>"
  }
  }
  }
}
```

Ao concluir estes passos, o Mercado Pago MCP Server estará pronto para uso. Para verificar se a integração foi bem-sucedida, acesse as configurações do seu cliente IDE e confirme que o MCP está configurado como disponível.

> WARNING
>
> Se ao consultar as configurações do seu cliente IDE você não encontrar um MCP Server associado, verifique se o código foi inserido corretamente e clique no ícone de atualização.

:::
:::TabComponent{title="Outros clientes"}
No caso de clientes que não sejam uma IDE, a conexão é feita direto no painel de configuração. 

> WARNING
>
> Para configurar nosso MCP Server utilizando outros clientes, é obrigatório ter instalado o pacote NPM versão 6 ou superior e NodeJS 20 ou superior.

#### Claude Desktop
Abra o arquivo `claude_desktop_config.json` e adicione a configuração do servidor do Mercado Pago. Consulte a [documentação do Claude Desktop](https://modelcontextprotocol.io/quickstart/user) para mais informações.

```json
{
  "mcpServers": {
  "mercadopago-mcp-server": {
  "command": "npx",
  "args": [
  "-y",
  "mcp-remote",
  "https://mcp.mercadopago.com/mcp",
  "--header",
  "Authorization:${AUTH_HEADER}"
  ],
  "env": {
  "AUTH_HEADER": "Bearer <ACCESS_TOKEN>"
  }
  }
  }
}

```

#### OpenAI
Caso utilize a versão paga da OpenAI, é possível adicionar o Mercado Pago MCP Server entre as _tools_ disponíveis de seu _Playground_. Siga os passos abaixo.

1. Vá para seção _Playground_, localizada no canto superior direito da tela.
2. Na seção _Prompts_, selecione o ícone de adição (**+**) localizado ao lado de _Tools_.
3. Em seguida, clique em **MCP Server**. Um modal irá abrir com opções de MCPs para adicionar. Selecione o botão **+ Add new**.
4. Preencha os campos do formulário com as informações do MCP Server:

```json
URL: https://mcp.mercadopago.com/mcp
Label: Mercado Pago MCP Server
Authentication:
Access Token/Public Key: "Bearer <ACCESS_TOKEN>"
```
5. Feito isso, o servidor estará conectado. Na tela com informações do MCP, habilite a aprovação das chamadas de _Tools_ e selecione a _Tool_ que deseja utilizar, por exemplo `search-documentation`.
6. Ao final, clique em **Add**.
7. Realize uma chamada de teste pelo ChatGPT.

Veja o exemplo a seguir:

![OpenAI example](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/4/27/1748353483238-openaiplatformconnect.gif)

:::

::::

## Testar a conexão

Para testar a conexão ao MCP Server, é necessário realizar uma consulta ao assistente utilizando alguma das _tools_ disponíveis.

Por exemplo, se você deseja testar a _tool_ `search-documentation`, só precisa executar o _prompt_ indicando qual informação deseja buscar:

[[[
```plain
Busque na documentação do Mercado Pago como integrar o Checkout Pro.
```
]]]

![mcp-server](https://http2.mlstatic.com/storage/dx-devsite/docs-assets/custom-upload/2025/4/28/1748435336370-searchdocpromptpth.gif)