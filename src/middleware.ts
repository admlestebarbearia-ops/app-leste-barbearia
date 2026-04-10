import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Crawlers de redes sociais — não têm cookies, não precisam de auth
const SOCIAL_CRAWLERS = /facebookexternalhit|Twitterbot|WhatsApp|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest/i

export async function middleware(request: NextRequest) {
  // Bypassa auth completamente para crawlers sociais (OG image preview)
  const ua = request.headers.get('user-agent') ?? ''
  if (SOCIAL_CRAWLERS.test(ua)) {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Necessário para o refresh automático do token funcionar
  const { data: { user } } = await supabase.auth.getUser()

  // Se já está logado e tenta acessar a tela de login, redireciona direto
  if (user && request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/agendar'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Roda em todas as rotas exceto assets estáticos e SW
    '/((?!_next/static|_next/image|favicon|logo|sw\\.js|site\\.webmanifest|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp3)).*)',
  ],
}
