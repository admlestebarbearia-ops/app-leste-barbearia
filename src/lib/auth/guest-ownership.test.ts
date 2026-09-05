import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// signingKey() le process.env a cada chamada, entao basta definir antes dos testes.
process.env.GUEST_COOKIE_SECRET = 'segredo-de-teste-nao-usado-em-producao'

import {
  serializeGuestIds, parseGuestIds, appendGuestId, buildOwnershipFilter,
} from './guest-ownership'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('posse de agendamento por aparelho', () => {
  test('ida e volta preserva os IDs', async () => {
    assert.deepEqual(await parseGuestIds(await serializeGuestIds([A, B])), [A, B])
  })

  // O CERNE DA CORREÇÃO: sem isto, editar o cookie no navegador daria posse
  // de qualquer agendamento — que é a falha que estamos fechando.
  test('cookie adulterado é rejeitado por inteiro', async () => {
    const bom = await serializeGuestIds([A])
    const adulterado = bom.replace(A, B)
    assert.deepEqual(await parseGuestIds(adulterado), [])
  })

  test('cookie sem assinatura é rejeitado', async () => {
    assert.deepEqual(await parseGuestIds(`${A},${B}`), [])
  })

  test('assinatura trocada é rejeitada', async () => {
    const [payload] = (await serializeGuestIds([A])).split('.')
    assert.deepEqual(await parseGuestIds(`${payload}.${'0'.repeat(64)}`), [])
  })

  test('lixo e vazio não derrubam nada', async () => {
    for (const v of ['', null, undefined, '.', 'abc', 'a.b.c']) {
      assert.deepEqual(await parseGuestIds(v as string), [])
    }
  })

  test('só aceita UUID — bloqueia injeção no filtro', async () => {
    const veneno = 'id.neq.00000000-0000-0000-0000-000000000000'
    assert.deepEqual(await parseGuestIds(await serializeGuestIds([veneno, A])), [A])
    assert.equal(buildOwnershipFilter(null, [veneno]), null)
  })

  test('appendGuestId acumula sem duplicar', async () => {
    let c = ''
    c = await appendGuestId(c, A)
    c = await appendGuestId(c, B)
    c = await appendGuestId(c, A)
    assert.deepEqual(await parseGuestIds(c), [B, A])
  })

  test('guarda no máximo 40 e mantém os mais recentes', async () => {
    const muitos = Array.from({ length: 45 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`)
    const lidos = await parseGuestIds(await serializeGuestIds(muitos))
    assert.equal(lidos.length, 40)
    assert.equal(lidos[lidos.length - 1], muitos[44])
  })
})

describe('filtro de posse', () => {
  test('logado usa client_id', async () => {
    assert.equal(buildOwnershipFilter('user-1', []), 'client_id.eq.user-1')
  })

  test('visitante usa a lista de IDs do aparelho', async () => {
    assert.equal(buildOwnershipFilter(null, [A, B]), `id.in.(${A},${B})`)
  })

  test('logado com agendamentos de visitante soma os dois', async () => {
    assert.equal(buildOwnershipFilter('u', [A]), `client_id.eq.u,id.in.(${A})`)
  })

  // Se devolvesse string vazia, o .or() do PostgREST não filtraria nada e a
  // agenda inteira da barbearia vazaria para qualquer visitante.
  test('sem prova nenhuma devolve null, nunca filtro vazio', async () => {
    assert.equal(buildOwnershipFilter(null, []), null)
  })

  test('telefone NAO confere mais posse', async () => {
    const f = buildOwnershipFilter(null, [A]) ?? ''
    assert.ok(!f.includes('client_phone'))
  })
})
