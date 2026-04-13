'use client'

import { useRouter } from 'next/navigation'
import { parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { PaymentBrick } from '@/components/payment/PaymentBrick'

interface Props {
  appointment: {
    id: string
    amount: number
    serviceName: string
    serviceDate: string
    serviceTime: string
    existingPaymentId?: string
  }
  publicKey: string
}

export function ResumePaymentCheckout({ appointment, publicKey }: Props) {
  const router = useRouter()
  const displayDate = format(parseISO(appointment.serviceDate), "dd 'de' MMMM", { locale: ptBR })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-50 flex items-center gap-3 px-4 py-4 bg-background/90 backdrop-blur-md border-b border-white/[0.06]">
        <a
          href={`/reservas?notice=pending-payment&appt_id=${appointment.id}`}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors"
        >
          <span className="text-base">←</span> Voltar
        </a>
        <span className="flex-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-foreground">
          Pagamento
        </span>
        <div className="w-16" />
      </div>

      <div className="flex flex-col gap-6 px-4 pt-6 pb-12 max-w-lg mx-auto w-full">
        <div className="bg-card border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-widest font-bold text-white/40">Retomar pagamento</p>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-bold text-foreground">{appointment.serviceName}</span>
              <span className="text-xs text-white/50 capitalize">
                {displayDate} às {appointment.serviceTime}
              </span>
            </div>
            <span className="text-base font-extrabold text-primary whitespace-nowrap">
              R$ {appointment.amount.toFixed(2).replace('.', ',')}
            </span>
          </div>
          <p className="text-[11px] text-yellow-400 font-bold uppercase tracking-widest">
            Aguardando pagamento
          </p>
        </div>

        {publicKey ? (
          <PaymentBrick
            amount={appointment.amount}
            appointmentId={appointment.id}
            publicKey={publicKey}
            existingPaymentId={appointment.existingPaymentId}
            onSuccess={(apptId) => router.push(`/agendar/pagamento/sucesso?appt_id=${apptId}`)}
            onError={(message) => {
              toast.error(message)
              router.push(`/agendar/pagamento/falha?appt_id=${appointment.id}`)
            }}
          />
        ) : (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 text-center">
            <p className="text-xs font-bold text-destructive uppercase tracking-wider">
              Chave pública do Mercado Pago não configurada.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}