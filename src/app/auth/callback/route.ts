import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  // No Vercel, request.url pode conter o hostname interno do deploy.
  // x-forwarded-host tem o domínio real que o usuário usou (incluindo domínio customizado).
  const forwardedHost = request.headers.get('x-forwarded-host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const resolvedOrigin = forwardedHost ? `${proto}://${forwardedHost}` : origin
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/agendar'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.session) {
      // Verifica se o usuario é admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', data.session.user.id)
        .single()

      if (profile?.is_admin) {
        return NextResponse.redirect(`${resolvedOrigin}/admin`)
      }

      return NextResponse.redirect(`${resolvedOrigin}${next}`)
    }
  }

  // Falha no callback — redireciona para login
  return NextResponse.redirect(`${resolvedOrigin}/`)
}
