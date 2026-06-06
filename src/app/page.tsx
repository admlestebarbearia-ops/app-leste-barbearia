import Image from 'next/image'
import Link from 'next/link'
import { Clock, User, Star, ShieldCheck } from 'lucide-react'
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
    <main
      className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
      style={{ backgroundImage: "url('/fundo.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* Overlay — gradiente para preservar a foto no topo e escurecer na base */}
      <div className="absolute inset-0 bg-linear-to-b from-black/30 via-black/50 to-black/80" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">

        {/* Logotipo */}
        <div className="relative flex w-full items-center justify-center">
          <div className="absolute h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
          <Image
            src={typedConfig?.logo_url ?? '/logo-barbearialeste.png'}
            alt="Leste Barbearia"
            width={200}
            height={200}
            className="relative h-auto w-40 object-contain animate-logo-glow drop-shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
            priority
          />
        </div>

        {/* Tagline — visível sem login (requisito Google OAuth) */}
        <p className="text-sm text-zinc-200/80 leading-relaxed italic text-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
          Excelência em cada detalhe.<br />Estilo que fala por você.
        </p>

        {/* Card de acesso — glassmorphism */}
        <div className="w-full bg-white/6 backdrop-blur-2xl rounded-2xl p-6 flex flex-col gap-4 border border-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <LoginButton nextPath={nextPath} />

          {typedConfig?.require_google_login === false && (
            <a
              href="/agendar"
              className="w-full h-11 flex items-center justify-center rounded-lg bg-white/4 border border-white/15 text-sm text-zinc-300 hover:bg-white/10 hover:text-white hover:border-white/30 transition-all"
            >
              Continuar sem login
            </a>
          )}

          {/* Diferenciais */}
          <div className="border-t border-white/10 pt-4 grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Clock className="size-5 text-amber-400" />
              <span className="text-xs text-zinc-400 leading-tight">Agendamento<br />em segundos</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <User className="size-5 text-amber-400" />
              <span className="text-xs text-zinc-400 leading-tight">Profissionais<br />especializados</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 text-center">
              <Star className="size-5 text-amber-400" />
              <span className="text-xs text-zinc-400 leading-tight">Experiência<br />premium</span>
            </div>
          </div>
        </div>

        {/* Rodapé de privacidade */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <ShieldCheck className="size-3.5" />
            <span>Seus dados estão protegidos.</span>
          </div>
          <Link href="/privacidade" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Política de Privacidade
          </Link>
        </div>

      </div>
    </main>
  )
}
 
