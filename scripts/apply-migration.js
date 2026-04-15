/**
 * Aplica a migration mp_public_key usando a API de administração do Supabase.
 * Usage: node scripts/apply-migration.js
 */
const fs = require('fs')
const env = fs.readFileSync('.env.local', 'utf8')
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

// Extrai o project ref da URL
const ref = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

if (!ref || !serviceKey) {
  console.error('❌ Não foi possível extrair ref ou service key do .env.local')
  process.exit(1)
}

// Usa a Management API do Supabase para executar SQL
const sql = 'ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS mp_public_key TEXT;'

fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})
  .then(r => {
    console.log('Status da Management API:', r.status)
    return r.text()
  })
  .then(body => {
    console.log('Resposta:', body)
  })
  .catch(console.error)
