# Configurar a aparência do botão de pagamento

O botão de pagamento do Mercado Pago é composto pelo conteúdo textual do banner e pela proposta de valor. É possível personalizar sua aparência para adaptá-lo ao design do site.

A seguir, conheça as diferentes opções de personalização disponíveis.

## Alterar a aparência do botão

É possível modificar a cor de fundo, da proposta de valor e das imagens internas do botão de pagamento. Se uma propriedade não for especificada, será exibido o design padrão.

No exemplo abaixo, você encontrará o objeto `customization`, onde deverá completar as configurações opcionais do tipo `string`. Para mais detalhes sobre cada parâmetro, consulte a tabela a seguir.

[[[
```javascript
const settings = {
  ...,
  customization: {
  theme:'dark',
  valueProp: 'practicality',
  customStyle: {
  valuePropColor: 'black',
  buttonHeight: '48px',
  borderRadius: '10px',
  verticalPadding: '10px',
  horizontalPadding: '10px',
  }
  }
}

```
```react-jsx
const customization = {
  theme:'dark',
  valueProp: 'practicality',
  customStyle: {
  valuePropColor: 'black',
  buttonHeight: '48px',
  borderRadius: '10px',
  verticalPadding: '10px',
  horizontalPadding: '10px',
  }
};
```
]]]

| Elemento | Tipo | Descrição | Opções disponíveis |
| :---- | :---- | :---- | :---- |
| `theme` | String | Define o tema de personalização visual, determinando o estilo claro ou escuro. | `default` ou `black`. Por padrão, é `default`. |
| `valueProp` | String | Especifica um valor ou característica representada no contexto do estilo, que pode ser interpretativo. | 'practicality' |
| `customStyle` | Objeto | Contém configurações específicas de estilo personalizável, como cores, dimensões e espaçamentos. | |
| `valuePropColor` | String | Indica a cor associada ao valor de `valueProp`, usada para o estilo de apresentação. | Se o tema for `default`, `valuePropColor` pode ser `blue` ou `white`. Se o tema for `dark`, `valuePropColor` pode ser `black`. Para o tema `default`, por padrão é `blue`, enquanto que para o tema `dark`, por padrão é `black`. |
| `buttonHeight` | String | Define a altura do botão ou outro elemento, determinando seu tamanho vertical. | Mínimo: 48px. Máximo: N/A. Por padrão, é 48px. |
| `borderRadius` | String | Define o raio das bordas, determinando quão curvadas são as esquinas dos elementos estilizados. | Mínimo: N/A. Máximo: N/A. Por padrão, é 6px. |
| `verticalPadding` | String | Especifica o espaço (_padding_) vertical (superior e inferior) dentro de um elemento. | Mínimo: 8px. Máximo: N/A. Por padrão, é 8px. |
| `horizontalPadding` | String | Especifica o espaço (_padding_) horizontal (esquerdo e direito) dentro de um elemento. | Mínimo: 0px. Máximo: N/A. Por padrão, é 0x. |

## Alterar a proposta de valor do botão

É possível modificar a proposta de valor exibida abaixo do botão, personalizando a mensagem que melhor se adequa às necessidades da loja. Para isso, altere o valor do parâmetro `valueProp`.

![wallet-actioncomplement](cow/wallet-actioncomplement-pt-v1.png)

No exemplo abaixo, o objeto `customization` inclui o parâmetro `valueProp` para personalizar a proposta de valor. Se não for especificado, será exibido por padrão o texto `security_safety`.

Consulte a tabela para todas as opções disponíveis de proposta de valor.

[[[
```javascript
const settings = {
  ...,
  customization: {
  theme: 'default',
  customStyle: {
  valueProp: 'practicality',
  }
  }
}
```

```react-jsx
const customization = {
  theme: 'default',
  customStyle: {
  valueProp: 'practicality',
  }
};
```
]]]

| Opção | Proposta de valor | Observação |
| --- | --- | --- |
| `practicality` | **Use cartões salvos ou dinheiro na conta** | - |
| `convenience_all` | **Meses com cartão** ou **Meses sem Cartão do Mercado Pago** | - |
| `security_details` | **Todos os seus dados protegidos** | - |
| `security_safety` | **Pague de forma segura** | Padrão |
| `convenience_credits` | **Até 12 Meses sem Cartão** | Requer que a preferência tenha `purpose: 'onboarding_credits'`. |
| `payment_methods_logos` | Logotipos dos métodos de pagamento disponíveis | Exibe os logotipos dos métodos configurados na preferência de pagamento. Se houver apenas um método válido, será exibido o texto "**Com dinheiro disponível**". |

### Ocultar a proposta de valor

É possível ocultar o texto da proposta de valor definindo o parâmetro _boolean_ `hideValueProp` como `true`. Por padrão, esse valor é `false`, então uma proposta de valor sempre será exibida.

[[[
```javascript
const settings = {
  ...,
  customization: {
	 theme: 'default',
  customStyle: {
  hideValueProp: true,
  }
  }
}
```
```react-jsx
const settings = {
  ...,
  customization: {
	 theme: 'default',
  customStyle: {
  hideValueProp: true,
  }
  }
}
```
]]]

## Callbacks auxiliares

Os callbacks auxiliares são funções executadas automaticamente em momentos específicos do fluxo de pagamento, oferecendo maior transparência e controle. Veja como integrá-los e consulte a tabela para detalhes.

[[[
```Javascript
mp.bricks().create("wallet", "wallet_container", {
  initialization: {
  preferenceId: "<PREFERENCE_ID>",
  redirectMode: "self",
  },
  callbacks: {
  onReady: () => {},
  onSubmit: () => {},
  onError: (error) => console.error(error),
  },
});
```
```react-jsx
<Wallet
  initialization={{ preferenceId: '<PREFERENCE_ID>', redirectMode: 'self' }}
  onReady={() => {}}
  onError={() => {}}
  onSubmit={() => {}}
/>
```
]]]

| Callback | Descrição | Quando usar |
| --- |--- | --- | 
| `onReady` | Executado quando o botão está completamente carregado | Utilizando para ocultar indicadores de carregamento do seu site. |
| `onSubmit` | Executado quando o usuário clica no botão | Utilizado para indicar que o fluxo será completado em outra aba, por exemplo (modo redirect). |