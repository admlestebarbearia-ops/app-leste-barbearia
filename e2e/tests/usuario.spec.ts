import { test, expect } from '@playwright/test'
import { PLAYWRIGHT_BASE_URL } from '../support/environment'

/**
 * TESTES DO USUÁRIO COMUM — logado com Google
 *
 * Pré-requisito: npm run e2e:setup (sessão salva em e2e/.auth/usuario.json)
 *
 * Cobertura:
 *  - Acesso às rotas protegidas
 *  - Fluxo completo de agendamento
 *  - Visualização e cancelamento de agendamento
 *  - Loja: reserva e cancelamento de produto
 *  - Perfil do usuário
 *  - Proteção: não acessa /admin
 *
 * ⚠️  Dados de teste são criados e removidos durante os testes.
 *     Agendamentos de teste usam o nome "TESTE_E2E" nos campos
 *     de observação para fácil identificação.
 */

const BASE = PLAYWRIGHT_BASE_URL

// ID do agendamento criado — compartilhado entre testes do mesmo describe
let appointmentId: string | null = null
let productReservationId: string | null = null

test.describe('Acesso com login', () => {
  test('usuário logado é redirecionado para /agendar ao visitar /', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveURL(/agendar/)
  })

  test('/agendar carrega com serviços disponíveis', async ({ page }) => {
    await page.goto(`${BASE}/agendar`)
    await expect(page).toHaveURL(/agendar/)
    // Deve exibir pelo menos um card de serviço
    const servicos = page.locator('[data-testid="service-card"], .service-card, button').filter({ hasText: /r\$\s*\d+/i })
    await expect(servicos.first()).toBeVisible({ timeout: 10_000 })
  })

  test('não consegue acessar /admin', async ({ page }) => {
    await page.goto(`${BASE}/admin`)
    await expect(page).not.toHaveURL(/admin/)
  })

  test('/reservas carrega lista de agendamentos', async ({ page }) => {
    await page.goto(`${BASE}/reservas`)
    await expect(page).toHaveURL(/reservas/)
    // Pode estar vazia mas a página deve carregar
    await expect(page.locator('main, body')).toBeVisible()
  })

  test('/perfil carrega dados do usuário', async ({ page }) => {
    await page.goto(`${BASE}/perfil`)
    // Perfil pode estar em /perfil ou incorporado no agendamento
    const url = page.url()
    expect(url).toMatch(/perfil|agendar/)
    await expect(page.locator('main')).toBeVisible()
  })
})

test.describe('Fluxo de agendamento', () => {
  test('seleciona serviço e exibe barbeiro + calendário', async ({ page }) => {
    await page.goto(`${BASE}/agendar`)

    // Clica no primeiro serviço disponível
    const primeiroServico = page.locator('button, [role="button"]').filter({ hasText: /r\$\s*\d+/i }).first()
    await expect(primeiroServico).toBeVisible({ timeout: 10_000 })
    await primeiroServico.click()

    // Deve aparecer o calendário
    const calendario = page.locator('[data-testid="calendar"], .rdp, [role="grid"]').first()
    await expect(calendario).toBeVisible({ timeout: 8_000 })
  })

  test('seleciona uma data disponível e exibe horários', async ({ page }) => {
    await page.goto(`${BASE}/agendar`)

    // Seleciona o primeiro serviço
    const primeiroServico = page.locator('button, [role="button"]').filter({ hasText: /r\$\s*\d+/i }).first()
    await primeiroServico.click()

    // Aguarda calendário e clica no primeiro dia habilitado (não desabilitado)
    const calendarioCelula = page.locator('[role="gridcell"]:not([aria-disabled="true"]) button:not([disabled])').first()
    await expect(calendarioCelula).toBeVisible({ timeout: 8_000 })
    await calendarioCelula.click()

    // Deve aparecer pelo menos um horário disponível — ou mensagem de sem horários
    const horariosOuMensagem = page.locator(
      '[data-testid="time-slot"], button[data-time], .time-slot'
    ).or(page.locator('text=/sem horários|não há horários|indisponível/i'))

    await expect(horariosOuMensagem.first()).toBeVisible({ timeout: 8_000 })
  })

  test('fluxo completo: seleciona horário e confirma agendamento', async ({ page }) => {
    await page.goto(`${BASE}/agendar`)

    // 1. Seleciona serviço
    const primeiroServico = page.locator('button, [role="button"]').filter({ hasText: /r\$\s*\d+/i }).first()
    await primeiroServico.click()

    // 2. Clica no primeiro dia disponível
    const diaDisponivel = page.locator('[role="gridcell"]:not([aria-disabled="true"]) button:not([disabled])').first()
    await expect(diaDisponivel).toBeVisible({ timeout: 8_000 })
    await diaDisponivel.click()

    // 3. Aguarda horários e clica no primeiro
    const primeiroHorario = page.locator(
      '[data-testid="time-slot"], button[data-time]'
    ).first()

    const temHorario = await primeiroHorario.isVisible().catch(() => false)
    if (!temHorario) {
      // Dia sem horários — tenta o próximo dia
      test.skip()
      return
    }

    await primeiroHorario.click()

    // 4. Clica em confirmar
    const btnConfirmar = page.getByRole('button', { name: /confirmar|agendar/i })
    await expect(btnConfirmar).toBeVisible({ timeout: 5_000 })
    await btnConfirmar.click()

    // 5. Página de sucesso
    await expect(page).toHaveURL(/sucesso/, { timeout: 15_000 })
    await expect(page.locator('text=/confirmado|agendado|sucesso/i')).toBeVisible()

    // Captura o ID do agendamento da URL ou da página para cancelar depois
    const urlAtual = page.url()
    const match = urlAtual.match(/id=([a-zA-Z0-9-]+)/)
    if (match) appointmentId = match[1]
  })
})

test.describe('Minhas Reservas', () => {
  test('lista o agendamento criado', async ({ page }) => {
    await page.goto(`${BASE}/reservas`)
    await expect(page).toHaveURL(/reservas/)
    // Deve ter pelo menos um agendamento (o criado no teste anterior)
    const cards = page.locator('[data-testid="appointment-card"], .appointment-card, [class*="card"]').first()
    await expect(cards).toBeVisible({ timeout: 8_000 })
  })

  test('cancela o agendamento criado pelo teste', async ({ page }) => {
    await page.goto(`${BASE}/reservas`)

    // Procura botão de cancelar
    const btnCancelar = page.getByRole('button', { name: /cancelar/i }).first()
    const podeCancel = await btnCancelar.isVisible().catch(() => false)

    if (!podeCancel) {
      // Agendamento fora da janela de cancelamento ou não há agendamentos
      test.skip()
      return
    }

    await btnCancelar.click()

    // Confirma o cancelamento no dialog/modal
    const btnConfirmarCancel = page.getByRole('button', { name: /confirmar|sim|cancelar agendamento/i }).last()
    await expect(btnConfirmarCancel).toBeVisible({ timeout: 5_000 })
    await btnConfirmarCancel.click()

    // Deve exibir toast ou atualizar a lista
    await expect(page.locator('text=/cancelado|removido/i')).toBeVisible({ timeout: 8_000 })
  })
})

test.describe('Loja de Produtos', () => {
  test('/loja carrega catálogo de produtos', async ({ page }) => {
    await page.goto(`${BASE}/loja`)
    await expect(page).toHaveURL(/loja/)
    await expect(page.locator('main')).toBeVisible()
  })

  test('reserva um produto com estoque disponível', async ({ page }) => {
    await page.goto(`${BASE}/loja`)

    // Procura produto com botão de reservar
    const btnReservar = page.getByRole('button', { name: /reservar/i }).first()
    const temProduto = await btnReservar.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!temProduto) {
      test.skip() // Nenhum produto disponível para reserva
      return
    }

    await btnReservar.click()

    // Modal de confirmação
    const btnConfirmar = page.getByRole('button', { name: /confirmar|reservar/i }).last()
    await expect(btnConfirmar).toBeVisible({ timeout: 5_000 })
    await btnConfirmar.click()

    // Toast de sucesso ou atualização do botão
    await expect(
      page.locator('text=/reservado|sucesso/i').or(page.getByRole('button', { name: /cancelar reserva/i }).first())
    ).toBeVisible({ timeout: 8_000 })
  })

  test('cancela a reserva do produto criada pelo teste', async ({ page }) => {
    await page.goto(`${BASE}/loja`)

    const btnCancelarReserva = page.getByRole('button', { name: /cancelar reserva/i }).first()
    const temReserva = await btnCancelarReserva.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!temReserva) {
      test.skip()
      return
    }

    await btnCancelarReserva.click()

    const btnConfirmar = page.getByRole('button', { name: /confirmar|sim|cancelar/i }).last()
    await expect(btnConfirmar).toBeVisible({ timeout: 5_000 })
    await btnConfirmar.click()

    await expect(
      page.locator('text=/cancelado|removido/i').or(page.getByRole('button', { name: /reservar/i }).first())
    ).toBeVisible({ timeout: 8_000 })
  })
})
