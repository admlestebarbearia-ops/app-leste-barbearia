import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import type { BusinessConfig } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<{ appt_id?: string }>
}

export default async function PagamentoFalhaPage({ searchParams }: Props) {
  const { appt_id } = await searchParams

  const supabase = await createClient()
  const { data: config } = await supabase
    .from('business_config')
    .select('logo_url, whatsapp_number')
    .single()

  const typedConfig = config as Pick<BusinessConfig, 'logo_url' | 'whatsapp_number'> | null

  const whatsappUrl = typedConfig?.whatsapp_number
    ? `https://wa.me/55${typedConfig.whatsapp_number.replace(/\D/g, '')}`
    : null

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        <Image
          src={typedConfig?.logo_url ?? '/logo-barbearialeste.png'}
          alt="Leste Barbearia"
          width={80}
          height={80}
          className="object-contain"
        />

        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Pagamento não realizado</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Houve um problema com seu pagamento. O horário foi liberado automaticamente.
          </p>
        </div>

        <div className="w-full bg-card border border-border rounded-xl p-5 text-sm text-muted-foreground">
          Você pode tentar novamente fazendo um novo agendamento. Se o problema persistir, entre em contato com a barbearia.
        </div>

        <div className="w-full flex flex-col gap-3">
          <Link
            href="/agendar"
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
          >
            Tentar novamente
          </Link>

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl border border-border text-sm font-medium text-center"
            >
              Falar no WhatsApp
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
