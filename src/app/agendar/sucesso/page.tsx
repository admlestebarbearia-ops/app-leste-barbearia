import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ProductVitrine } from './ProductVitrine'
import { getActiveProducts } from '@/app/agendar/actions'
import { GUEST_BOOKING_PHONE_COOKIE, normalizePhoneLookup } from '@/lib/auth/session-state'
import { PushNotificationToggle } from '@/components/booking/PushNotificationToggle'
import type { BusinessConfig } from '@/lib/supabase/types'

interface Props {
  searchParams: Promise<{ id?: string; cash?: string }>
}

export default async function SucessoPage({ searchParams }: Props) {
  const { id, cash } = await searchParams
  const isCashPayment = cash === '1'

  if (!id) redirect('/agendar')

  const supabase = await createClient()
  const cookieStore = await cookies()

  const { data: appt } = await supabase
    .from('appointments')
    .select('*, services(name, price, duration_minutes)')
    .eq('id', id)
    .single()

  if (!appt) redirect('/agendar')
  if (appt.status === 'aguardando_pagamento') {
    redirect(`/agendar/pagamento/sucesso?appt_id=${id}`)
  }

  const [{ data: config }, { products }] = await Promise.all([
    supabase
      .from('business_config')
      .select('logo_url, barber_name, barber_nickname, display_name_preference, show_agency_brand, whatsapp_number')
      .single(),
    getActiveProducts(id),
  ])

  // Garantir wa_hash para opt-in WA
  let waHash: string | null = appt.wa_hash ?? null
  if (!waHash) {
    const { randomUUID } = await import('crypto')
    waHash = randomUUID().replace(/-/g, '').slice(0, 8)
    const adminClient = createAdminClient()
    await adminClient.from('appointments').update({ wa_hash: waHash }).eq('id', id)
  }

  const guestPhone = normalizePhoneLookup(
    cookieStore.get(GUEST_BOOKING_PHONE_COOKIE)?.value
  )

  const typedConfig = config as Pick<
    BusinessConfig,
    'logo_url' | 'barber_name' | 'barber_nickname' | 'display_name_preference' | 'show_agency_brand' | 'whatsapp_number'
  > | null

  const waPhone = typedConfig?.whatsapp_number?.replace(/\D/g, '')
  const waOptInHref = waPhone && waHash
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(`Olá! Agendei um horário e quero receber lembretes. ID_${waHash}`)}`
    : null

  const service = appt.services as { name: string; price: number; duration_minutes: number } | null
  const apptDate = parseISO(appt.date)
  const displayDate = format(apptDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const displayTime = appt.start_time?.slice(0, 5)

  const barbeiroChamado =
    typedConfig?.display_name_preference === 'nickname'
      ? typedConfig?.barber_nickname
      : typedConfig?.barber_name

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
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Agendado!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seu horario esta confirmado.
          </p>
        </div>

        {/* Aviso de pagamento em dinheiro */}
        {isCashPayment && service && (
          <div className="w-full overflow-hidden rounded-2xl border-2 border-amber-500/60 bg-amber-500/10">
            <div className="flex items-center gap-2.5 bg-amber-500/20 px-4 py-3 border-b border-amber-500/30">
              <span className="text-xl">💵</span>
              <p className="text-sm font-black text-amber-300 uppercase tracking-[0.1em]">Pagamento na barbearia</p>
            </div>
            <div className="px-4 py-4 flex flex-col gap-1.5">
              <p className="text-2xl font-black text-amber-300 tracking-tight">
                R$ {service.price.toFixed(2).replace('.', ',')}
              </p>
              <p className="text-sm text-amber-200/80 leading-relaxed">
                Leve esse valor em dinheiro para pagar ao barbeiro ao chegar. Não é necessário pagar antecipadamente.
              </p>
            </div>
          </div>
        )}

        <div className="w-full bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Servico</span>
            <span className="text-sm font-medium text-right">{service?.name}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-start">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Data</span>
            <span className="text-sm text-right capitalize">{displayDate}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-start">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Horario</span>
            <span className="text-sm font-medium">{displayTime}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-start">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Profissional</span>
            <span className="text-sm">{barbeiroChamado}</span>
          </div>
          <div className="h-px bg-border" />
          <div className="flex justify-between items-start">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Valor</span>
            <span className="text-sm font-semibold text-primary">
              R$ {service?.price.toFixed(2).replace('.', ',')}
            </span>
          </div>
        </div>

        <a
          href="/reservas"
          className="w-full h-12 flex items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold tracking-wide hover:bg-primary/90 transition-colors"
        >
          Ver minhas reservas
        </a>

        {/* Prompt para ativar lembretes push */}
        <div className="w-full flex flex-col items-center gap-1.5">
          <p className="text-xs text-muted-foreground text-center">Receba lembretes antes do seu horário:</p>
          <PushNotificationToggle />
        </div>

        {/* Opt-in WhatsApp */}
        {waOptInHref && (
          <a
            href={waOptInHref}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-12 flex items-center justify-center gap-2.5 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] text-sm font-bold hover:bg-[#25D366]/25 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            🔔 Ativar Lembretes no WhatsApp
          </a>
        )}

        {products.length > 0 && (
          <ProductVitrine
            products={products}
            appointmentId={id}
            guestPhone={guestPhone}
          />
        )}

        <a
          href="/"
          className="w-full h-10 flex items-center justify-center rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar para o Início
        </a>

      </div>

      {typedConfig?.show_agency_brand && (
        <p className="fixed bottom-4 text-xs text-muted-foreground/40 select-none">
          Sistema desenvolvido por Agencia JN
        </p>
      )}
    </main>
  )
}
