// ────────────────────────────────────────────────────────────────────────────
// Telefone brasileiro (celular com DDD) — um lugar só.
//
// Antes cada tela tratava do seu jeito: o formulario publico validava 11
// digitos, e o modal do painel aceitava qualquer coisa digitada. Isso
// produzia telefone invalido no cadastro e quebrava o botao de WhatsApp.
// ────────────────────────────────────────────────────────────────────────────

/** Só os dígitos, no máximo 11. */
export function onlyDigits(raw: string): string {
  return (raw ?? '').replace(/\D/g, '').slice(0, 11)
}

/** Formata enquanto digita: (11) 91234-5678 */
export function formatPhone(raw: string): string {
  const n = onlyDigits(raw)
  if (n.length <= 2) return n
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
}

/**
 * Regra: 11 dígitos, DDD válido (11 a 99) e o nono dígito precisa ser 9 —
 * todo celular brasileiro começa com 9 depois do DDD.
 * Devolve a mensagem de erro, ou null quando está válido.
 */
export function getPhoneError(raw: string): string | null {
  const n = onlyDigits(raw)
  if (n.length === 0) return 'Informe o telefone com DDD.'
  if (n.length !== 11) return 'Telefone incompleto. Use DDD + 9 dígitos: (11) 99999-9999.'
  const ddd = parseInt(n.slice(0, 2), 10)
  if (Number.isNaN(ddd) || ddd < 11 || ddd > 99) return 'DDD inválido.'
  if (n[2] !== '9') return 'Celular deve começar com 9 depois do DDD.'
  return null
}

export function isValidPhone(raw: string): boolean {
  return getPhoneError(raw) === null
}
