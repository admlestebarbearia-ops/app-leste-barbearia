import { test, expect } from '@playwright/test'
import { ALLOW_PROD_PAYMENT_E2E, PLAYWRIGHT_BASE_URL, isProductionLikeBaseUrl } from '../support/environment'

const BASE = PLAYWRIGHT_BASE_URL

test.describe.configure({ mode: 'serial' })

test.describe('Fluxo de pagamento pendente', () => {
  test.beforeEach(() => {
    test.skip(
      isProductionLikeBaseUrl(BASE) && !ALLOW_PROD_PAYMENT_E2E,
      'E2E de pagamento fica bloqueado por padrão em produção real. Use PLAYWRIGHT_BASE_URL seguro ou ALLOW_PROD_PAYMENT_E2E=true.'
    )
  })

  test('cria agendamento pendente, reabre checkout e cancela a reserva pendente', async ({ page }) => {
    await page.goto(`${BASE}/agendar`)

    const primeiroServico = page.locator('button, [role="button"]').filter({ hasText: /r\$\s*\d+/i }).first()
    await expect(primeiroServico).toBeVisible({ timeout: 10_000 })
    await primeiroServico.click()

    const diaDisponivel = page.locator('[role="gridcell"]:not([aria-disabled="true"]) button:not([disabled])').first()
    await expect(diaDisponivel).toBeVisible({ timeout: 8_000 })
    await diaDisponivel.click()

    const primeiroHorario = page.locator('[data-testid="time-slot"], button[data-time]').first()
    const temHorario = await primeiroHorario.isVisible().catch(() => false)
    test.skip(!temHorario, 'Nenhum horário disponível para o cenário de pagamento.')
    await primeiroHorario.click()

    const btnAvancar = page.getByRole('button', { name: /avançar|avancar/i })
    await expect(btnAvancar).toBeVisible({ timeout: 8_000 })
    await btnAvancar.click()

    const tituloPagamento = page.locator('text=/forma de pagamento/i').first()
    const temEtapaPagamento = await tituloPagamento.isVisible({ timeout: 8_000 }).catch(() => false)
    test.skip(!temEtapaPagamento, 'Ambiente sem pagamento online obrigatório configurado.')

    await page.getByRole('button', { name: /pix/i }).click()

    const btnIrPagamento = page.getByRole('button', { name: /ir para pagamento/i })
    await expect(btnIrPagamento).toBeVisible({ timeout: 5_000 })
    await btnIrPagamento.click()

    await expect(page.locator('text=/pagamento seguro via mercado pago/i')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=/resumo/i').first()).toBeVisible()

    await page.getByRole('button', { name: /voltar/i }).click()

    await expect(page).toHaveURL(/reservas\?notice=pending-payment&appt_id=/, { timeout: 15_000 })
    await expect(page.locator('text=/pagamento pendente/i').first()).toBeVisible()

    const reservasUrl = new URL(page.url())
    const appointmentId = reservasUrl.searchParams.get('appt_id')
    expect(appointmentId).toBeTruthy()

    const btnConcluirPagamento = page.locator(`a[href="/agendar/pagamento/retomar?appt_id=${appointmentId}"]`).first()
    await expect(btnConcluirPagamento).toBeVisible({ timeout: 8_000 })
    await btnConcluirPagamento.click()

    await expect(page).toHaveURL(new RegExp(`/agendar/pagamento/retomar\\?appt_id=${appointmentId}`), { timeout: 15_000 })
    await expect(page.locator('text=/retomar pagamento/i')).toBeVisible()

    await page.getByRole('link', { name: /voltar/i }).click()
    await expect(page).toHaveURL(/reservas\?notice=pending-payment&appt_id=/, { timeout: 15_000 })

    const btnCancelar = page
      .locator(`a[href="/agendar/pagamento/retomar?appt_id=${appointmentId}"]`)
      .locator('xpath=following-sibling::button[normalize-space()="Cancelar"]')
    await expect(btnCancelar).toBeVisible({ timeout: 8_000 })
    await btnCancelar.click()

    await expect(page.locator(`a[href="/agendar/pagamento/retomar?appt_id=${appointmentId}"]`)).toHaveCount(0, { timeout: 10_000 })
  })
})