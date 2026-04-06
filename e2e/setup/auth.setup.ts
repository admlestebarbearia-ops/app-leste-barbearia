import { test as setup, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE_URL = 'https://lestebarbearia.agenciajn.com.br'

// Garante que a pasta existe
const authDir = path.join(__dirname, '.auth')
if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

const usuarioFile = path.join(authDir, 'usuario.json')
const adminFile   = path.join(authDir, 'admin.json')

/**
 * SETUP DE AUTENTICAÇÃO — executado uma única vez.
 *
 * Este script abre um browser real e aguarda você fazer o login manual
 * com Google. Após o login ser detectado, salva os cookies/sessão em
 * arquivos JSON que os testes reutilizam automaticamente.
 *
 * Execução:
 *   npm run e2e:setup
 *
 * Você precisará fazer login DUAS vezes:
 *   1. Com a conta Google do usuário comum
 *   2. Com a conta Google do admin (a mesma que está em ADMIN_EMAIL)
 */

// ── Sessão do usuário comum ──────────────────────────────────────────────────
setup('salvar sessão do usuário', async ({ page }) => {
  await page.goto(BASE_URL)

  // Aguarda login já existente (caso rode novamente com sessão válida)
  const jaLogado = await page.locator('[data-testid="booking-form"]').isVisible().catch(() => false)
  if (jaLogado) {
    await page.context().storageState({ path: usuarioFile })
    return
  }

  console.log('\n========================================================')
  console.log('LOGIN 1/2 — USUÁRIO COMUM')
  console.log('Faça login com Google no browser que abriu.')
  console.log('Use uma conta Google qualquer (NÃO a conta de admin).')
  console.log('O script continua automaticamente após o login.')
  console.log('========================================================\n')

  // Clica em "Entrar com Google"
  await page.getByRole('button', { name: /entrar com google/i }).click()

  // Aguarda o callback do Supabase redirecionar para /agendar
  await page.waitForURL(`${BASE_URL}/agendar`, { timeout: 120_000 })
  await expect(page).toHaveURL(/agendar/)

  await page.context().storageState({ path: usuarioFile })
  console.log('✅ Sessão do usuário salva em e2e/.auth/usuario.json')
})

// ── Sessão do admin ──────────────────────────────────────────────────────────
setup('salvar sessão do admin', async ({ page }) => {
  await page.goto(BASE_URL)

  console.log('\n========================================================')
  console.log('LOGIN 2/2 — ADMIN')
  console.log('Faça login com a conta Google do administrador.')
  console.log('Deve redirecionar para /admin automaticamente.')
  console.log('========================================================\n')

  await page.getByRole('button', { name: /entrar com google/i }).click()

  // Admin é redirecionado para /admin
  await page.waitForURL(`${BASE_URL}/admin`, { timeout: 120_000 })
  await expect(page).toHaveURL(/admin/)

  await page.context().storageState({ path: adminFile })
  console.log('✅ Sessão do admin salva em e2e/.auth/admin.json')
})
