import { createClient } from '@/lib/supabase/server'
import Image from 'next/image'
import Link from 'next/link'
import type { BusinessConfig } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<{ appt_id?: string }>
}

export default async function PagamentoFalhaPage({ searchParams }: Props) {
  const { appt_id } = await searchParams

  if (!appt_id) return null

  const supabase = await createClient()
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, status')
    .eq('id', appt_id)
    .single()

  if (appt?.status === 'confirmado') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Pagamento já confirmado</h1>
          <p className="text-sm text-muted-foreground">
            Seu pagamento já foi compensado. Abra a confirmação do agendamento para ver os detalhes.
          </p>
          <Link
            href={`/agendar/pagamento/sucesso?appt_id=${appt_id}`}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
          >
            Ver confirmação
          </Link>
        </div>
      </main>
    )
  }

  const { data: config } = await supabase
    .from('business_config')
    .select('logo_url, whatsapp_number')
    .single()

  const typedConfig = config as Pick<BusinessConfig, 'logo_url' | 'whatsapp_number'> | null

  const whatsappUrl = typedConfig?.whatsapp_number
    ? `https://wa.me/55${typedConfig.whatsapp_number.replace(/\D/g, '')}`
    : null

  const isStillPending = appt?.status === 'aguardando_pagamento'
  const title = isStillPending ? 'Seu agendamento ainda não foi confirmado' : 'Seu agendamento não foi confirmado'
  const description = isStillPending
    ? 'Ele continua ativo em Minhas Reservas aguardando pagamento. Conclua o pagamento para confirmar o horário.'
    : 'Refaça seu agendamento para reservar um novo horário.'
  const primaryHref = isStillPending
    ? `/reservas?notice=pending-payment&appt_id=${appt_id}`
    : '/agendar'
  const primaryLabel = isStillPending ? 'Ver minhas reservas' : 'Refazer agendamento'

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
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {description}
          </p>
        </div>

        <div className="w-full bg-card border border-border rounded-xl p-5 text-sm text-muted-foreground">
          {isStillPending
            ? 'Se você sair agora, o agendamento continuará pendente até você concluir o pagamento, expirar o prazo ou cancelar em Minhas Reservas.'
            : 'Se o problema persistir, entre em contato com a barbearia para validar o que aconteceu com a cobrança.'}
        </div>

        <div className="w-full flex flex-col gap-3">
          <Link
            href={primaryHref}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold text-center"
          >
            {primaryLabel}
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
