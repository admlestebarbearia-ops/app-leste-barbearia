import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { onlyDigits, formatPhone, getPhoneError, isValidPhone } from './phone'

describe('telefone', () => {
  test('mantém só dígitos e corta em 11', () => {
    assert.equal(onlyDigits('(11) 98393-4628'), '11983934628')
    assert.equal(onlyDigits('11 9 8393 4628 99999'), '11983934628')
    assert.equal(onlyDigits('abc'), '')
  })

  test('formata enquanto digita', () => {
    assert.equal(formatPhone('11'), '11')
    assert.equal(formatPhone('119'), '(11) 9')
    assert.equal(formatPhone('11983934628'), '(11) 98393-4628')
  })

  // Era isto que faltava no painel: o barbeiro digitava quantos dígitos quisesse.
  test('recusa telefone incompleto ou longo demais', () => {
    assert.ok(getPhoneError('1198393462'))
    assert.ok(getPhoneError(''))
    assert.equal(getPhoneError('(11) 98393-4628'), null)
  })

  test('recusa DDD inválido', () => {
    assert.ok(getPhoneError('01983934628'))
    assert.ok(getPhoneError('09983934628'))
  })

  test('exige o 9 do celular', () => {
    assert.ok(getPhoneError('11383934628'))
    assert.equal(getPhoneError('11983934628'), null)
  })

  test('isValidPhone concorda com getPhoneError', () => {
    assert.equal(isValidPhone('11983934628'), true)
    assert.equal(isValidPhone('123'), false)
  })
})
