const fs = require('fs')
const env = fs.readFileSync('.env.local', 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

fetch(`${url}/rest/v1/business_config?select=mp_public_key&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
})
  .then(r => {
    console.log('Status:', r.status)
    return r.text()
  })
  .then(body => {
    if (body.includes('"code":"42703"') || body.includes('mp_public_key')) {
      console.log('Resposta:', body.slice(0, 200))
    }
    if (body.includes('"mp_public_key"') || body.startsWith('[')) {
      console.log('✅ Coluna mp_public_key EXISTE no banco')
    } else {
      console.log('❌ Coluna mp_public_key NÃO existe. Erro:', body.slice(0, 300))
    }
  })
  .catch(console.error)
