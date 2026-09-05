// Executa antes do app ficar interativo (convenção do Next.js).
//
// Motivo: aparelhos antigos que ainda estão em uso pelos clientes da barbearia
// — iPhone 6s/7/7 Plus e SE (1ª geração) travam no iOS 15.8, último disponível
// para eles — não têm alguns métodos de JavaScript que o bundle usa. Sem isso o
// app quebra em tempo de execução no meio da tela de agendamento.
//
// A sintaxe moderna (ex.: blocos `static {}` de classe) é resolvida pelo campo
// "browserslist" do package.json, que faz o Next compilar para Safari 15.
// Este arquivo cobre apenas o que falta em tempo de execução.
//
// Todos os patches são detectados por feature: em navegador atual nada roda.

// Object.hasOwn — Safari 15.4+ / Chrome 93+ (usado pelo react-day-picker e cia.)
if (!Object.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: function hasOwn(target: object, key: PropertyKey) {
      if (target === null || target === undefined) {
        throw new TypeError('Cannot convert undefined or null to object')
      }
      return Object.prototype.hasOwnProperty.call(Object(target), key)
    },
    configurable: true,
    writable: true,
  })
}

// Array.prototype.at / String.prototype.at — Safari 15.4+ / Chrome 92+
function atPolyfill(this: { length: number; [index: number]: unknown }, index: number) {
  const len = this.length
  // eslint-disable-next-line no-bitwise
  let i = Math.trunc(index) || 0
  if (i < 0) i += len
  if (i < 0 || i >= len) return undefined
  return this[i]
}

if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value: atPolyfill,
    configurable: true,
    writable: true,
  })
}

if (!String.prototype.at) {
  Object.defineProperty(String.prototype, 'at', {
    value: atPolyfill,
    configurable: true,
    writable: true,
  })
}

// String.prototype.replaceAll — Safari 13.1+ / Chrome 85+ (rede de segurança)
if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    value: function replaceAll(this: string, search: string | RegExp, replacement: string) {
      if (search instanceof RegExp) return this.replace(search, replacement as string)
      return this.split(String(search)).join(String(replacement))
    },
    configurable: true,
    writable: true,
  })
}
