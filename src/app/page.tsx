import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LoginButton } from '@/components/auth/LoginButton'
import type { BusinessConfig } from '@/lib/supabase/types'

export default async function LoginPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
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

        <div className="flex flex-col items-center gap-3">
          <Image
              src={typedConfig?.logo_url ?? '/logo-barbearialeste.png'}
              alt="Leste Barbearia"
              width={160}
              height={160}
              className="object-contain"
              priority
            />
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Agende seu horario de forma rapida e facil
        </p>

        <div className="w-full flex flex-col gap-3">
          <LoginButton />

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
 
