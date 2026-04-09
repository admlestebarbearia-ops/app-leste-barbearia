import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LoginButton } from '@/components/auth/LoginButton'
import { isAuthenticatedUser } from '@/lib/auth/session-state'
import type { BusinessConfig } from '@/lib/supabase/types'

export const runtime = 'edge'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { next } = await searchParams
  const nextPath = typeof next === 'string' && next.startsWith('/') ? next : '/agendar'

  const { data: { user } } = await supabase.auth.getUser()
  if (isAuthenticatedUser(user)) {
    // Verifica se é admin para redirecionar ao painel correto
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    if (profile?.is_admin) {
      redirect('/admin')
    }
    redirect('/agendar')
  }

  const { data: config } = await supabase
    .from('business_config')
    .select('logo_url, require_google_login')
    .single()

  const typedConfig = config as Pick<BusinessConfig, 'logo_url' | 'require_google_login'> | null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center gap-10">

        <div className="relative flex w-full items-center justify-center">
          <div className="absolute h-36 w-36 rounded-full bg-primary/12 blur-3xl" />
          <Image
            src={typedConfig?.logo_url ?? '/logo-barbearialeste.png'}
            alt="Leste Barbearia"
            width={220}
            height={220}
            className="relative h-auto w-44 object-contain animate-logo-glow drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
            priority
          />
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Agende seu horario de forma rapida e facil
        </p>

        <div className="w-full flex flex-col gap-3">
          <LoginButton nextPath={nextPath} />

          {typedConfig?.require_google_login === false && (
            <a
              href="/agendar"
              className="w-full h-10 flex items-center justify-center rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              Continuar sem login
            </a>
          )}
        </div>

      </div>
    </main>
  )
}
 
