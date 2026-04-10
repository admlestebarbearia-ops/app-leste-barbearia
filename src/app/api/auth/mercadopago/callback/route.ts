import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // Verifica que o usuário autenticado é admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // Valida state CSRF — lê do cookie da requisição entrante
  const savedState = request.cookies.get('mp_oauth_state')?.value

  if (!state || !savedState || state !== savedState) {
    console.warn('[MP OAuth] State CSRF inválido', { receivedState: state, savedState })
    const response = NextResponse.redirect(new URL('/admin?mp=error&reason=state', request.url))
    // Limpa o cookie de state da resposta
    response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  }

  if (!code) {
    const response = NextResponse.redirect(new URL('/admin?mp=error&reason=no_code', request.url))
    response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  }

  const appId = process.env.MERCADOPAGO_APP_ID
  const appSecret = process.env.MERCADOPAGO_APP_SECRET
  const redirectUri = new URL('/api/auth/mercadopago/callback', request.url).toString()

  if (!appId || !appSecret) {
    console.error('[MP OAuth] Variáveis de ambiente não configuradas')
    const response = NextResponse.redirect(new URL('/admin?mp=error&reason=config', request.url))
    response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  }

  // Troca o authorization code pelo access token
  const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text()
    console.error('[MP OAuth] Erro ao trocar token:', errText)
    const response = NextResponse.redirect(new URL('/admin?mp=error&reason=token', request.url))
    response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  }

  const tokenData = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
    public_key?: string
    error?: string
    message?: string
  }

  // Valida que o token veio na resposta (MP pode retornar 200 com campo "error")
  if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
    console.error('[MP OAuth] access_token ausente na resposta:', JSON.stringify(tokenData))
    const response = NextResponse.redirect(new URL('/admin?mp=error&reason=token_missing', request.url))
    response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  }

  // Persiste os tokens no banco
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('business_config')
    .update({
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token ?? null,
    })
    .eq('id', 1)

  if (error) {
    console.error('[MP OAuth] Erro ao salvar token no banco:', error)
    const response = NextResponse.redirect(new URL('/admin?mp=error&reason=db', request.url))
    response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
    return response
  }

  revalidatePath('/admin')

  // Limpa o cookie de state e redireciona para o painel com sinal de sucesso
  const response = NextResponse.redirect(new URL('/admin?mp=connected', request.url))
  response.cookies.set('mp_oauth_state', '', { maxAge: 0, path: '/' })
  return response
}
