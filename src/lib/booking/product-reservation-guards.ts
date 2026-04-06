/**
 * Funções de validação pura extraídas das server actions de reserva de produtos.
 * São testáveis sem acesso ao banco de dados.
 */

export type ProductForReservation = {
  is_active: boolean
  reserve_enabled: boolean
  stock_quantity: number // -1 = ilimitado
}

export type ReservationForValidation = {
  client_id: string | null
  quantity: number
  status: string
}

/**
 * Valida se uma nova reserva standalone de produto pode ser criada.
 * @returns mensagem de erro ou null se válido
 */
export function validateReservarProduto(
  product: ProductForReservation,
  quantity: number,
  hasActiveReservation: boolean
): string | null {
  if (quantity < 1) return 'Quantidade inválida.'

  if (!product.is_active || !product.reserve_enabled) {
    return 'Produto indisponível.'
  }

  if (product.stock_quantity !== -1 && product.stock_quantity < quantity) {
    return 'Estoque insuficiente.'
  }

  if (hasActiveReservation) {
    return 'Você já tem uma reserva ativa para este produto.'
  }

  return null
}

/**
 * Valida se uma reserva pode ser cancelada pelo cliente.
 * @returns mensagem de erro ou null se válido
 */
export function validateCancelarReservaProduto(
  reservation: ReservationForValidation,
  userId: string
): string | null {
  if (reservation.client_id !== userId) {
    return 'Não autorizado.'
  }

  if (reservation.status !== 'reservado') {
    return 'Esta reserva não pode ser cancelada.'
  }

  return null
}

/**
 * Valida se a quantidade de uma reserva pode ser atualizada.
 * @param currentStock estoque atual do produto (-1 = ilimitado)
 * @returns mensagem de erro ou null se válido
 */
export function validateAtualizarQuantidadeReserva(
  reservation: ReservationForValidation,
  userId: string,
  currentStock: number,
  newQuantity: number
): string | null {
  if (newQuantity < 1) return 'Quantidade inválida.'

  if (reservation.client_id !== userId) {
    return 'Não autorizado.'
  }

  if (reservation.status !== 'reservado') {
    return 'Esta reserva não pode ser alterada.'
  }

  const diff = newQuantity - reservation.quantity
  if (diff > 0 && currentStock !== -1 && currentStock < diff) {
    return 'Estoque insuficiente para aumentar a quantidade.'
  }

  return null
}

/**
 * Valida os dados de um produto antes de salvar/editar no admin.
 * @returns mensagem de erro ou null se válido
 */
export function validateProductPayload(data: {
  name: string
  price: number
  stock_quantity: number
}): string | null {
  if (!data.name.trim()) {
    return 'O nome do produto é obrigatório.'
  }

  if (!Number.isFinite(data.price) || data.price < 0) {
    return 'O preço do produto deve ser zero ou maior.'
  }

  if (!Number.isInteger(data.stock_quantity) || (data.stock_quantity < -1)) {
    return 'Estoque inválido. Use -1 para ilimitado ou um número inteiro maior ou igual a zero.'
  }

  return null
}
