import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Inicia o fluxo OAuth do Mercado Pago.
 * Usa estado assinado com HMAC (sem cookies) — robusto a qualquer tipo de
 * redirect cross-site do MP (GET ou POST).
 */
export async function GET(request: NextRequest) {
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

  const appId = process.env.MERCADOPAGO_APP_ID
  const appSecret = process.env.MERCADOPAGO_APP_SECRET
  if (!appId || !appSecret) {
    console.error('[MP OAuth] MERCADOPAGO_APP_ID ou APP_SECRET nao configurado')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=config', request.url))
  }

  // Estado CSRF assinado: base64url(payload) + '.' + HMAC-SHA256(payload, appSecret)
  // Sem cookies — funciona mesmo quando MP faz POST redirect (sameSite:lax nao funciona)
  const payload = Buffer.from(JSON.stringify({
    uid: user.id,
    ts: Date.now(),
    n: Math.random().toString(36).slice(2),
  })).toString('base64url')

  const sig = createHmac('sha256', appSecret).update(payload).digest('base64url')
  const state = `${payload}.${sig}`

  // Usa NEXT_PUBLIC_SITE_URL ou x-forwarded-host para garantir URL consistente no Vercel
  // (request.url pode conter hostname interno do Vercel, não o domínio customizado)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (forwardedHost ? `${proto}://${forwardedHost}` : new URL(request.url).origin)
  const redirectUri = `${siteUrl}/api/auth/mercadopago/callback`
  const authUrl =
    `https://auth.mercadopago.com.br/authorization` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&response_type=code` +
    `&platform_id=mp` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.redirect(authUrl)
}