import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LoginButton } from '@/components/auth/LoginButton'
import { isAuthenticatedUser } from '@/lib/auth/session-state'
import type { BusinessConfig } from '@/lib/supabase/types'

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

        <div className="relative flex flex-col items-center gap-3">
          <div className="absolute inset-0 bg-primary/12 blur-3xl scale-110 rounded-full" />
          <div className="relative w-40 h-40 rounded-[2rem] border border-white/10 bg-card/80 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.42)] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.05),transparent_45%,rgba(11,65,150,0.18))]" />
            <Image
              src={typedConfig?.logo_url ?? '/logo-barbearialeste.png'}
              alt="Leste Barbearia"
              width={120}
              height={120}
              className="object-contain relative"
              priority
            />
          </div>
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
 
