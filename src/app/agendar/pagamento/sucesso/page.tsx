import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import type { BusinessConfig } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<{ appt_id?: string; collection_id?: string; collection_status?: string }>
}

export default async function PagamentoSucessoPage({ searchParams }: Props) {
  const { appt_id } = await searchParams

  if (!appt_id) redirect('/agendar')

  const supabase = await createClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('*, services(name, price, duration_minutes)')
    .eq('id', appt_id)
    .single()

  if (!appt) redirect('/agendar')

  const { data: config } = await supabase
    .from('business_config')
    .select('logo_url, barber_name, barber_nickname, display_name_preference')
    .single()

  const typedConfig = config as Pick<
    BusinessConfig,
    'logo_url' | 'barber_name' | 'barber_nickname' | 'display_name_preference'
  > | null

  const service = appt.services as { name: string; price: number; duration_minutes: number } | null
  const apptDate = parseISO(appt.date)
  const displayDate = format(apptDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const displayTime = appt.start_time?.slice(0, 5)

  // Se o agendamento ainda está aguardando (webhook ainda não chegou), mostramos mensagem de processamento
  const isPending = appt.status === 'aguardando_pagamento'
  const isConfirmed = appt.status === 'confirmado'

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
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isPending ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-emerald-500/10 border border-emerald-500/30'}`}>
            {isPending ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            )}
          </div>
          {isConfirmed ? (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Pagamento confirmado!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Seu horário está reservado. Até breve!
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">Pagamento em processamento</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Estamos aguardando a confirmação do seu pagamento. Você receberá uma notificação em breve.
              </p>
            </>
          )}
        </div>

        {service && (
          <div className="w-full bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Serviço</span>
              <span className="text-sm font-medium text-right">{service.name}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Data</span>
              <span className="text-sm text-right capitalize">{displayDate}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Horário</span>
              <span className="text-sm font-medium">{displayTime}</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex justify-between items-start">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${isConfirmed ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'}`}>
                {isConfirmed ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                )}
                {isConfirmed ? 'Confirmado' : 'Aguardando confirmação'}
              </span>
            </div>
          </div>
        )}

        <Link
          href="/agendar"
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  )
}
