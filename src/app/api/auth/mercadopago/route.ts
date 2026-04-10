import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
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

  const appId = process.env.MERCADOPAGO_APP_ID
  if (!appId) {
    console.error('[MP OAuth] MERCADOPAGO_APP_ID não configurado')
    return NextResponse.redirect(new URL('/admin?mp=error&reason=config', request.url))
  }

  // Gera state aleatório para proteção CSRF
  const state = crypto.randomUUID()

  const cookieStore = await cookies()
  cookieStore.set('mp_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10 minutos
    path: '/',
    sameSite: 'lax',
  })

  const redirectUri = new URL('/api/auth/mercadopago/callback', request.url).toString()
  const authUrl =
    `https://auth.mercadopago.com.br/authorization` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&response_type=code` +
    `&platform_id=mp` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`

  return NextResponse.redirect(authUrl)
}
