#!/usr/bin/env node
/**
 * Guarda de compatibilidade — roda depois do `next build`.
 *
 * Contexto: clientes reais da barbearia usam iPhone 6s/7/7 Plus e SE (1ª ger.),
 * que travaram no iOS 15.8. O Next.js 16 compila por padrão para Safari 16.4+ e
 * chegou a emitir blocos `static {}` de classe dentro do próprio runtime dele.
 * Safari 15 não entende essa sintaxe e aborta o parse do arquivo INTEIRO com
 * SyntaxError — o app fica morto, sem nenhuma mensagem de erro visível.
 *
 * O `browserslist` do package.json resolve isso. Este script existe para o caso
 * de alguém subir Next/React/Tailwind no futuro e a sintaxe voltar sem ninguém
 * perceber — o sintoma só aparece na mão de um cliente com celular antigo.
 *
 * FATAL  = quebra o parse. O arquivo inteiro morre. Falha o build.
 * AVISO  = quebra só na hora da chamada. Não falha o build, mas vale olhar.
 *
 * Para pular em uma emergência: SKIP_COMPAT_CHECK=1 npm run build
 */

const fs = require('fs')
const path = require('path')

if (process.env.SKIP_COMPAT_CHECK === '1') {
  console.log('[compat] pulado via SKIP_COMPAT_CHECK=1')
  process.exit(0)
}

const CHUNKS_DIR = path.join(__dirname, '..', '.next', 'static', 'chunks')

// Sintaxe que o Safari 15 não consegue nem ler. Um único caso mata o arquivo.
const FATAL = [
  {
    id: 'class static block',
    re: /\bstatic\s*\{/,
    desde: 'Safari 16.4 / Chrome 91',
    nota: 'foi exatamente isto que deixou o app inutilizável no iPhone 7',
  },
  {
    id: 'regex lookbehind (?<= ou (?<!)',
    re: /\(\?<[=!]/,
    desde: 'Safari 16.4 / Chrome 62',
    nota: 'SyntaxError na leitura do arquivo, mesmo que a regex nunca execute',
  },
  {
    id: 'regex com flag v',
    re: /\/[gimsuy]*v[gimsuy]*\s*[,;)\].]/,
    desde: 'Safari 17 / Chrome 112',
    nota: 'conjunto unicode; confira o contexto antes de agir',
    conferir: true, // padrão mais sujeito a falso positivo
  },
  {
    id: 'import attributes (with { type: ... })',
    re: /\bwith\s*\{\s*type\s*:/,
    desde: 'Safari 17.2 / Chrome 123',
    nota: '',
  },
]

// Métodos que só falham quando chamados. Os que já têm polyfill ficam de fora.
const AVISOS = [
  { id: 'Object.groupBy',            re: /\bObject\.groupBy\b/,               desde: 'Safari 17.4' },
  { id: 'Array.prototype.toSorted',  re: /\.toSorted\(/,                      desde: 'Safari 16' },
  { id: 'Array.prototype.toReversed',re: /\.toReversed\(/,                    desde: 'Safari 16' },
  { id: 'Array.prototype.findLast',  re: /\.findLast(Index)?\(/,              desde: 'Safari 15.4' },
  { id: 'structuredClone',           re: /\bstructuredClone\(/,               desde: 'Safari 15.4' },
  { id: 'Promise.withResolvers',     re: /\bPromise\.withResolvers\b/,        desde: 'Safari 17.4' },
  { id: 'Intl.Segmenter',            re: /\bIntl\.Segmenter\b/,               desde: 'Safari 14.1' },
]

function alvo() {
  try {
    const list = require('../package.json').browserslist
    return Array.isArray(list) ? list.join(', ') : String(list ?? '(não definido)')
  } catch {
    return '(não definido)'
  }
}

if (!fs.existsSync(CHUNKS_DIR)) {
  console.error('[compat] .next/static/chunks não existe — rode o build antes.')
  process.exit(1)
}

const arquivos = fs
  .readdirSync(CHUNKS_DIR, { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.js'))
  .map((f) => path.join(CHUNKS_DIR, f))

const achadosFatais = []
const achadosAviso = []

for (const arquivo of arquivos) {
  const código = fs.readFileSync(arquivo, 'utf8')
  const nome = path.basename(arquivo)

  for (const regra of FATAL) {
    const m = código.match(regra.re)
    if (m) {
      const i = m.index ?? 0
      achadosFatais.push({
        regra,
        nome,
        trecho: código.slice(Math.max(0, i - 70), i + 70).replace(/\s+/g, ' '),
      })
    }
  }
  for (const regra of AVISOS) {
    if (regra.re.test(código)) achadosAviso.push({ regra, nome })
  }
}

console.log(`\n[compat] alvo do browserslist: ${alvo()}`)
console.log(`[compat] ${arquivos.length} arquivos JS verificados\n`)

if (achadosAviso.length > 0) {
  console.log('AVISO — métodos que podem não existir em aparelho antigo:')
  const porRegra = new Map()
  for (const a of achadosAviso) {
    if (!porRegra.has(a.regra.id)) porRegra.set(a.regra.id, { desde: a.regra.desde, arquivos: [] })
    porRegra.get(a.regra.id).arquivos.push(a.nome)
  }
  for (const [id, info] of porRegra) {
    console.log(`  · ${id} (existe a partir do ${info.desde}) — ${info.arquivos.length} arquivo(s)`)
  }
  console.log('  Quebram só quando chamados. Se forem em caminho crítico, adicione')
  console.log('  um polyfill em src/instrumentation-client.ts.\n')
}

if (achadosFatais.length === 0) {
  console.log('OK — nenhuma sintaxe que impeça o Safari 15 de ler o bundle.\n')
  process.exit(0)
}

console.error('ERRO — sintaxe que o Safari 15 (iPhone 6s/7/7 Plus/SE) não consegue LER.')
console.error('O arquivo inteiro morre com SyntaxError e o app fica inutilizável nesses aparelhos.\n')

for (const { regra, nome, trecho } of achadosFatais) {
  console.error(`  ${regra.conferir ? '[conferir]' : '[fatal]'} ${regra.id} — a partir do ${regra.desde}`)
  console.error(`     arquivo: ${nome}`)
  console.error(`     trecho:  …${trecho}…`)
  if (regra.nota) console.error(`     nota:    ${regra.nota}`)
  console.error('')
}

console.error('O que fazer:')
console.error('  1. Confirme que o campo "browserslist" continua no package.json.')
console.error('  2. Se continua e mesmo assim apareceu, a origem é uma dependência nova:')
console.error('     descubra qual e adicione-a em transpilePackages no next.config.ts.')
console.error('  3. Se o trecho acima for claramente um falso positivo (o padrão dentro')
console.error('     de uma string, por exemplo), ajuste a regra neste arquivo.')
console.error('  4. Emergência: SKIP_COMPAT_CHECK=1 npm run build\n')

process.exit(1)
