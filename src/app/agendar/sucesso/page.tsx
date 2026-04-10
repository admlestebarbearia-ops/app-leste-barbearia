import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ProductVitrine } from './ProductVitrine'
import { getActiveProducts } from '@/app/agendar/actions'
import { GUEST_BOOKING_PHONE_COOKIE, normalizePhoneLookup } from '@/lib/auth/session-state'
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

  const [{ data: config }, { products }] = await Promise.all([
    supabase
      .from('business_config')
      .select('logo_url, barber_name, barber_nickname, display_name_preference, show_agency_brand')
      .single(),
    getActiveProducts(id),
  ])

  const guestPhone = normalizePhoneLookup(
    cookieStore.get(GUEST_BOOKING_PHONE_COOKIE)?.value
  )

  const typedConfig = config as Pick<
    BusinessConfig,
    'logo_url' | 'barber_name' | 'barber_nickname' | 'display_name_preference' | 'show_agency_brand'
  > | null

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
          <div className="w-full flex items-start gap-3 bg-amber-500/[0.08] border border-amber-500/25 rounded-xl p-4">
            <span className="text-xl shrink-0">💵</span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-amber-300 uppercase tracking-wider">Pagamento na barbearia</p>
              <p className="text-xs text-amber-300/70 leading-relaxed">
                Lembre-se de levar <strong className="text-amber-300">R$ {service.price.toFixed(2).replace('.', ',')}</strong> para pagar ao barbeiro ao chegar. Não é necessário pagar antecipadamente.
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
