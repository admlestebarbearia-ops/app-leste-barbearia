import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LoginButton } from '@/components/auth/LoginButton'
import { isAuthenticatedUser } from '@/lib/auth/session-state'
import type { BusinessConfig } from '@/lib/supabase/types'

export const runtime = 'edge'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const supabase = await createClient()
  const { next } = await searchParams
  const nextPath = typeof next === 'string' && next.startsWith('/') ? next : '/agendar'

  const { data: { user } } = await supabase.auth.getUser()
  if (isAuthenticatedUser(user)) {
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
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logotipo */}
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

        {/* Apresentação pública do app — visível sem login */}
        <div className="w-full flex flex-col items-center gap-3 text-center">
          <h1 className="text-xl font-extrabold uppercase tracking-widest text-foreground">
            Leste Barbearia
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Aplicativo oficial de agendamento online da Leste Barbearia.
            Escolha o serviço, o profissional e o horário que preferir — tudo pelo celular, sem espera.
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-zinc-500 text-left w-full px-2">
            <li>✓ Corte, barba, sobrancelha e combos</li>
            <li>✓ Agendamento disponível 24 horas</li>
            <li>✓ Pagamento antecipado pelo app ou na hora</li>
          </ul>
        </div>

        {/* Ações de acesso */}
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

      <footer className="pt-10 text-center text-sm text-zinc-500">
        <p>
          © 2026 Leste Barbearia. Todos os direitos reservados. |{' '}
          <Link href="/privacidade" className="hover:text-zinc-300 transition-colors">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </main>
  )
}
 
