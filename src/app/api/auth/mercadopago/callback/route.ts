import { createHmac, timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Callback do OAuth Mercado Pago.
 * Valida o estado HMAC-assinado (sem cookies) e troca o code pelo access_token.
 * Esta rota NAO passa pelo middleware (excluida no matcher) para evitar
 * interferencia com cookies de sessao durante redirects cross-site do MP.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const appSecret = process.env.MERCADOPAGO_APP_SECRET

  // ─── 1. Valida o estado HMAC assinado ─────────────────────────────────────
  if (!state || !appSecret) {
    console.warn('[MP OAuth] state ausente ou APP_SECRET nao configurado')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=state', request.url))
  }

  const dotIdx = state.lastIndexOf('.')
  if (dotIdx === -1) {
    console.warn('[MP OAuth] state mal formatado (sem ponto separador)')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=state', request.url))
  }

  const payload = state.slice(0, dotIdx)
  const receivedSig = state.slice(dotIdx + 1)

  // Recomputa a assinatura esperada e compara em tempo constante (anti timing-attack)
  const expectedSig = createHmac('sha256', appSecret).update(payload).digest('base64url')
  let sigOk = false
  try {
    sigOk = timingSafeEqual(
      Buffer.from(receivedSig, 'utf-8'),
      Buffer.from(expectedSig, 'utf-8'),
    )
  } catch {
    sigOk = false
  }

  if (!sigOk) {
    console.warn('[MP OAuth] Assinatura HMAC invalida')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=state', request.url))
  }

  // Decodifica e valida expiração (10 minutos)
  let stateData: { uid?: string; ts?: number; n?: string } = {}
  try {
    stateData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'))
  } catch {
    console.warn('[MP OAuth] Falha ao decodificar payload do state')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=state', request.url))
  }

  if (!stateData.ts || Date.now() - stateData.ts > 600_000) {
    console.warn('[MP OAuth] State expirado:', stateData.ts)
    return NextResponse.redirect(new URL('/admin?mp=error&reason=expired', request.url))
  }

  // ─── 2. Verifica autenticação do admin ────────────────────────────────────
  // A sessão deve estar presente porque esta rota é acessada logo após o admin
  // ter iniciado o fluxo (o MP redireciona de volta).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fallback: se a sessão foi perdida no redirect, valida apenas pela assinatura
  // (o uid no state foi assinado por nós quando o admin estava logado)
  if (user && user.id !== stateData.uid) {
    console.warn('[MP OAuth] UID do state nao bate com usuario logado', { stateUid: stateData.uid, userId: user.id })
    return NextResponse.redirect(new URL('/admin?mp=error&reason=user', request.url))
  }

  if (!user) {
    // Session pode ter sido perdida no redirect do MP — verifica se o uid no state
    // pertence a um admin via adminClient (mais confiavel que a sessao do browser)
    if (!stateData.uid) {
      return NextResponse.redirect(new URL('/admin?mp=error&reason=auth', request.url))
    }
    const adminCheck = createAdminClient()
    const { data: profile } = await adminCheck
      .from('profiles')
      .select('is_admin')
      .eq('id', stateData.uid)
      .single()
    if (!profile?.is_admin) {
      console.warn('[MP OAuth] UID do state nao e admin')
      return NextResponse.redirect(new URL('/admin?mp=error&reason=auth', request.url))
    }
  } else {
    // Verifica que o usuario logado e admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (!profile?.is_admin) {
      return NextResponse.redirect(new URL('/admin?mp=error&reason=auth', request.url))
    }
  }

  // ─── 3. Valida o code ─────────────────────────────────────────────────────
  if (!code) {
    console.warn('[MP OAuth] code ausente')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=no_code', request.url))
  }

  // ─── 4. Troca o code pelo access_token ────────────────────────────────────
  const appId = process.env.MERCADOPAGO_APP_ID
  if (!appId) {
    console.error('[MP OAuth] MERCADOPAGO_APP_ID nao configurado')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=config', request.url))
  }

  const redirectUri = new URL('/api/auth/mercadopago/callback', request.url).toString()

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
    access_token?: string
    refresh_token?: string
    error?: string
    message?: string
  }

  if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
    console.error('[MP OAuth] access_token ausente:', JSON.stringify(tokenData))
    return NextResponse.redirect(new URL('/admin?mp=error&reason=token_missing', request.url))
  }

  // ─── 5. Persiste os tokens ────────────────────────────────────────────────
  const adminClient = createAdminClient()
  const { error: dbError } = await adminClient
    .from('business_config')
    .update({
      mp_access_token: tokenData.access_token,
      mp_refresh_token: tokenData.refresh_token ?? null,
    })
    .eq('id', 1)

  if (dbError) {
    console.error('[MP OAuth] Erro ao salvar token no banco:', dbError)
    return NextResponse.redirect(new URL('/admin?mp=error&reason=db', request.url))
  }

  revalidatePath('/admin')
  return NextResponse.redirect(new URL('/admin?mp=connected', request.url))
}
