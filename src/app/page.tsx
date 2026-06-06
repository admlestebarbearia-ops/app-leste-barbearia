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
      {/* Overlay escuro */}
      <div className="absolute inset-0 bg-black/65" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">

        {/* Logotipo */}
        <Image
          src={typedConfig?.logo_url ?? '/logo-barbearialeste.png'}
          alt="Leste Barbearia"
          width={200}
          height={200}
          className="h-auto w-40 object-contain drop-shadow-2xl"
          priority
        />

        {/* Título e tagline — visíveis sem login (requisito Google OAuth) */}
        <div className="text-center flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold uppercase tracking-widest text-white">
            Leste Barbearia
          </h1>
          <p className="text-sm text-zinc-300 leading-relaxed italic">
            Excelência em cada detalhe.<br />Estilo que fala por você.
          </p>
        </div>

        {/* Card de acesso */}
        <div className="w-full bg-black/50 backdrop-blur-sm rounded-2xl p-6 flex flex-col gap-4 border border-white/10">
          <LoginButton nextPath={nextPath} />

          {typedConfig?.require_google_login === false && (
            <a
              href="/agendar"
              className="w-full h-11 flex items-center justify-center rounded-lg border border-white/20 text-sm text-zinc-300 hover:text-white hover:border-white/40 transition-colors"
            >
              Continuar sem login
            </a>
          )}

          {/* Diferenciais */}
          <div className="grid grid-cols-3 gap-2 pt-1">
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
 
