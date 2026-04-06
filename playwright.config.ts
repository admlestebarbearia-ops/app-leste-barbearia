import { defineConfig, devices } from '@playwright/test'

/**
 * Configuração do Playwright para testes E2E contra o ambiente real de produção.
 *
 * FLUXO DE USO:
 * 1. Primeira vez: npm run e2e:setup   → abre browser, você faz login manualmente
 * 2. Testes:       npm run e2e          → roda todos os testes com sessão salva
 * 3. Ver relatório: npm run e2e:report
 */

const BASE_URL = 'https://lestebarbearia.agenciajn.com.br'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // produção real — serializar para não gerar dados duplicados
  retries: 1,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // ── Setup: faz login manualmente e salva as sessões ──────────────────────
    {
      name: 'setup',
      testMatch: '**/setup/auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // ── Usuário sem login ────────────────────────────────────────────────────
    {
      name: 'publico',
      testMatch: '**/tests/publico.spec.ts',
      use: { ...devices['Mobile Chrome'] },
    },

    // ── Usuário com login Google (sessão salva) ──────────────────────────────
    {
      name: 'usuario',
      testMatch: '**/tests/usuario.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Mobile Chrome'],
        storageState: 'e2e/.auth/usuario.json',
      },
    },

    // ── Usuário admin (sessão salva) ─────────────────────────────────────────
    {
      name: 'admin',
      testMatch: '**/tests/admin.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
    },
  ],
})
