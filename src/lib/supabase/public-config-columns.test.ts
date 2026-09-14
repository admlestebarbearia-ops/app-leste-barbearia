import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { PUBLIC_CONFIG_COLUMN_LIST, PUBLIC_CONFIG_COLUMNS } from './public-config-columns'

// Regressão de segurança (13/09/2026): `select('*')` em business_config na
// página /agendar colocava mp_access_token e mp_refresh_token no HTML PÚBLICO,
// porque o config é passado como prop para <BookingForm> (Client Component) e o
// Next serializa props no payload RSC. Este teste é o guarda: se alguém
// adicionar um segredo à lista pública, ele quebra.
const SEGREDOS = ['mp_access_token', 'mp_refresh_token', 'mp_webhook_secret']

describe('colunas públicas de business_config', () => {
  test('NENHUM segredo do Mercado Pago está na lista pública', () => {
    for (const segredo of SEGREDOS) {
      assert.ok(
        !(PUBLIC_CONFIG_COLUMN_LIST as readonly string[]).includes(segredo),
        `"${segredo}" NAO pode ir para o navegador — remova da lista pública`
      )
    }
  })

  test('a string do select também não contém nenhum segredo', () => {
    for (const segredo of SEGREDOS) {
      assert.ok(
        !PUBLIC_CONFIG_COLUMNS.includes(segredo),
        `"${segredo}" apareceu na string passada ao .select()`
      )
    }
  })

  test('contém as colunas que as telas públicas realmente usam', () => {
    // Amostra do que o fluxo público quebraria sem: identidade da barbearia,
    // regras de agenda e a chave PÚBLICA do Mercado Pago (essa pode ir).
    const necessarias = [
      'barber_name', 'logo_url', 'payment_mode', 'aceita_dinheiro',
      'slot_interval_minutes', 'cancellation_window_minutes',
      'require_google_login', 'mp_public_key',
    ]
    for (const c of necessarias) {
      assert.ok(
        (PUBLIC_CONFIG_COLUMN_LIST as readonly string[]).includes(c),
        `"${c}" faltando — o fluxo público depende dela`
      )
    }
  })

  test('a lista não está vazia e vira uma string separada por vírgula', () => {
    assert.ok(PUBLIC_CONFIG_COLUMN_LIST.length > 20)
    assert.ok(PUBLIC_CONFIG_COLUMNS.includes(', '))
  })
})
