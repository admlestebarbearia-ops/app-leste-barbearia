import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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
    return NextResponse.redirect(new URL('/auth', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  // Valida state CSRF
  const cookieStore = await cookies()
  const savedState = cookieStore.get('mp_oauth_state')?.value
  cookieStore.delete('mp_oauth_state')

  if (!state || !savedState || state !== savedState) {
    console.warn('[MP OAuth] State CSRF inválido')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=state', request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/admin?mp=error&reason=no_code', request.url))
  }

  const appId = process.env.MERCADOPAGO_APP_ID
  const appSecret = process.env.MERCADOPAGO_APP_SECRET
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/mercadopago/callback`

  if (!appId || !appSecret) {
    console.error('[MP OAuth] Variáveis de ambiente não configuradas')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=config', request.url))
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
    return NextResponse.redirect(new URL('/admin?mp=error&reason=token', request.url))
  }

  const tokenData = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
    scope: string
    public_key: string
  }

  // Persiste os tokens no banco
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('business_config')
    .update({
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token,
    })
    .eq('id', 1)

  if (error) {
    console.error('[MP OAuth] Erro ao salvar token no banco:', error)
    return NextResponse.redirect(new URL('/admin?mp=error&reason=db', request.url))
  }

  revalidatePath('/admin')
  return NextResponse.redirect(new URL('/admin?mp=connected', request.url))
}
