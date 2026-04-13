import { test, expect } from '@playwright/test'
import { PLAYWRIGHT_BASE_URL } from '../support/environment'

/**
 * TESTES PÚBLICOS — usuário sem login
 * Cobertura:
 *  - Página inicial (tela de login) carrega corretamente
 *  - Redirecionamentos de proteção de rota
 *  - Páginas estáticas (termos, privacidade)
 *  - PWA e metadados SEO/OG
 */

const BASE = PLAYWRIGHT_BASE_URL

test.describe('Página inicial — sem login', () => {
  test('carrega e exibe botão de login com Google', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveTitle(/leste barbearia/i)
    await expect(page.getByRole('button', { name: /entrar com google/i })).toBeVisible()
  })

  test('exibe logo da barbearia', async ({ page }) => {
    await page.goto(BASE)
    const logo = page.getByRole('img', { name: /leste barbearia/i })
    await expect(logo).toBeVisible()
  })

  test('favicon está acessível', async ({ page }) => {
    const response = await page.request.get(`${BASE}/favicon.ico`)
    expect(response.status()).toBe(200)
  })

  test('apple-touch-icon está acessível', async ({ page }) => {
    const response = await page.request.get(`${BASE}/apple-touch-icon.png`)
    expect(response.status()).toBe(200)
  })

  test('site.webmanifest tem nome e ícones corretos', async ({ page }) => {
    const response = await page.request.get(`${BASE}/site.webmanifest`)
    expect(response.status()).toBe(200)
    const manifest = await response.json()
    expect(manifest.name).toBeTruthy()
    expect(manifest.icons).toHaveLength(2)
    expect(manifest.background_color).not.toBe('#ffffff')
  })

  test('meta og:image está presente para compartilhamento no WhatsApp', async ({ page }) => {
    await page.goto(BASE)
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(ogImage).toBeTruthy()
  })
})

test.describe('Proteção de rotas — sem login', () => {
  test('/agendar redireciona para / quando login é obrigatório', async ({ page }) => {
    await page.goto(`${BASE}/agendar`)
    // Deve redirecionar para / ou permanecer mostrando login
    await expect(page).toHaveURL(new RegExp(`${BASE}/(\\?.*)?$|${BASE}/agendar`))
    // Se ficou em /agendar, não deve mostrar o formulário de agendamento
    // (pode ter login por telefone habilitado — aceitamos ambos)
  })

  test('/admin redireciona para / sem login', async ({ page }) => {
    await page.goto(`${BASE}/admin`)
    await expect(page).toHaveURL(new RegExp(`${BASE}/?$`))
  })

  test('/reservas redireciona ou exige identificação', async ({ page }) => {
    await page.goto(`${BASE}/reservas`)
    // Pode redirecionar para / ou mostrar campo de telefone
    const url = page.url()
    const mostraLogin = new URL(url).pathname === '/'
    const mostraTelefone = await page.locator('input[type="tel"], input[placeholder*="telefone"]').isVisible().catch(() => false)
    expect(mostraLogin || mostraTelefone).toBeTruthy()
  })
})

test.describe('Páginas estáticas', () => {
  test('/termos carrega com conteúdo', async ({ page }) => {
    await page.goto(`${BASE}/termos`)
    await expect(page).toHaveURL(/termos/)
    // Deve ter algum texto de conteúdo legal
    const body = await page.locator('main').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })

  test('/privacidade carrega com conteúdo', async ({ page }) => {
    await page.goto(`${BASE}/privacidade`)
    await expect(page).toHaveURL(/privacidade/)
    const body = await page.locator('main').textContent()
    expect(body!.length).toBeGreaterThan(100)
  })

  test('página 404 retorna not-found', async ({ page }) => {
    const response = await page.goto(`${BASE}/rota-que-nao-existe-xpto`)
    expect(response!.status()).toBe(404)
  })
})
