import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { BusinessConfig } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<{ appt_id?: string }>
}

export default async function PagamentoPendentePage({ searchParams }: Props) {
  const { appt_id } = await searchParams

  if (!appt_id) redirect('/agendar')

  const supabase = await createClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('status, date, start_time, services(name)')
    .eq('id', appt_id)
    .single()

  if (!appt) redirect('/agendar')

  // Se o pagamento já foi confirmado pelo webhook, redireciona para sucesso
  if (appt.status === 'confirmado') {
    redirect(`/agendar/pagamento/sucesso?appt_id=${appt_id}`)
  }

  const { data: config } = await supabase
    .from('business_config')
    .select('logo_url, whatsapp_number')
    .single()

  const typedConfig = config as Pick<BusinessConfig, 'logo_url' | 'whatsapp_number'> | null

  const whatsappUrl = typedConfig?.whatsapp_number
    ? `https://wa.me/55${typedConfig.whatsapp_number.replace(/\D/g, '')}`
    : null

  const service = (Array.isArray(appt.services) ? appt.services[0] : appt.services) as { name: string } | null

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
          <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Pagamento pendente</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seu pagamento está sendo processado. O horário fica reservado enquanto confirmamos.
          </p>
        </div>

        <div className="w-full bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
          {service && (
            <>
              <div className="flex justify-between items-start">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Serviço</span>
                <span className="text-sm font-medium">{service.name}</span>
              </div>
              <div className="h-px bg-border" />
            </>
          )}
          <div className="flex justify-between items-start">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
            <span className="text-sm font-medium text-yellow-500">Aguardando confirmação</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Se usar PIX ou boleto, o prazo de compensação pode ser de até 1 dia útil. Caso não seja confirmado, o horário será liberado automaticamente.
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <Link
            href="/agendar"
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
          >
            Voltar ao início
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
