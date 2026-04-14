'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, Clock, Scissors, ChevronLeft, RefreshCw, ShoppingBag, AlertTriangle, MessageCircle, X, Check, QrCode } from 'lucide-react'
import { cancelMyAppointment, cancelPendingPayment, dismissCancelledAppointment } from '@/app/agendar/actions'
import { DayPicker } from 'react-day-picker'
import { getReservationHistoryCalendarMeta } from '@/lib/booking/reservation-history'
import type { ProductReservation, ProductReservationStatus } from '@/lib/supabase/types'
import { PushNotificationToggle } from '@/components/booking/PushNotificationToggle'
import type { AppointmentPaymentContext } from '@/lib/booking/appointment-payment-context'

interface Appt {
  id: string
  date: string
  start_time: string
  status: string
  services: { name: string; price: number; duration_minutes: number | null } | null
  payment_context: AppointmentPaymentContext | null
  expiresAt: string | null
}

interface CancelledAppt {
  id: string
  date: string
  start_time: string
  service_name_snapshot: string | null
}

interface HistoryAppt {
  id: string
  date: string
  start_time: string
  status: string
  service_name_snapshot: string | null
  services: { name: string } | null
  payment_context: AppointmentPaymentContext | null
}

const STATUS_LABEL: Record<string, string> = {
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  faltou: 'Faltou',
  aguardando_pagamento: 'Aguardando pagamento',
  aguardando_acao_barbeiro: 'Aguardando ação do barbeiro',
}

const APPOINTMENT_PAYMENT_LABEL: Record<AppointmentPaymentContext, string> = {
  paid_online: 'Pago online',
  pay_locally: 'Pagar no local',
  paid: 'Pago',
  refunded: 'Estornado',
}

interface Props {
  appointments: Appt[]
  cancelledByAdmin: CancelledAppt[]
  cancellationWindowMinutes: number
  whatsappNumber: string | null
  productReservations: ProductReservation[]
  historyAppts: HistoryAppt[]
  notice: string | null
  highlightedAppointmentId: string | null
}

/** Cron\u00f4metro regressivo para pagamento pendente — chama onExpired quando chega a zero */
function PendingPaymentTimer({
  expiresAt,
  onExpired,
}: {
  expiresAt: string
  onExpired: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  )
  const expiredRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // J\u00e1 expirou no momento do mount
    if (secondsLeft === 0 && !expiredRef.current) {
      expiredRef.current = true
      onExpired()
      return
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          if (!expiredRef.current) {
            expiredRef.current = true
            // Chama no pr\u00f3ximo tick para evitar atualizar estado dentro do reducer
            setTimeout(onExpired, 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const secs = String(secondsLeft % 60).padStart(2, '0')
  const isUrgent = secondsLeft <= 60

  return (
    <span
      className={[
        'text-xs font-mono font-bold tabular-nums',
        isUrgent ? 'text-red-400 animate-pulse' : 'text-yellow-400/80',
      ].join(' ')}
    >
      {mins}:{secs}
    </span>
  )
}

function AppointmentStatusBadge({ status }: { status: string }) {  const styleByStatus: Record<string, string> = {
    confirmado: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300',
    concluido: 'border-blue-500/30 bg-blue-500/12 text-blue-300',
    cancelado: 'border-white/10 bg-white/5 text-zinc-400',
    faltou: 'border-amber-500/30 bg-amber-500/12 text-amber-300',
    aguardando_pagamento: 'border-yellow-500/30 bg-yellow-500/12 text-yellow-300',
    aguardando_acao_barbeiro: 'border-orange-500/30 bg-orange-500/12 text-orange-300',
  }
  const Icon = status === 'confirmado'
    ? Check
    : status === 'aguardando_pagamento'
    ? QrCode
    : status === 'aguardando_acao_barbeiro'
    ? AlertTriangle
    : null

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
        styleByStatus[status] ?? 'border-white/10 bg-white/5 text-zinc-400',
      ].join(' ')}
    >
      {Icon ? <Icon size={11} /> : null}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function AppointmentPaymentBadge({ paymentContext }: { paymentContext: AppointmentPaymentContext | null }) {
  if (!paymentContext) return null

  const styleByContext: Record<AppointmentPaymentContext, string> = {
    paid_online: 'border-sky-500/30 bg-sky-500/12 text-sky-200',
    pay_locally: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
    paid: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-200',
    refunded: 'border-orange-500/30 bg-orange-500/12 text-orange-200',
  }

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
        styleByContext[paymentContext],
      ].join(' ')}
    >
      {APPOINTMENT_PAYMENT_LABEL[paymentContext]}
    </span>
  )
}

export function ReservasClient({ appointments: initial, cancelledByAdmin, cancellationWindowMinutes, whatsappNumber, productReservations, historyAppts, notice, highlightedAppointmentId }: Props) {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appt[]>(initial)
  const [cancelledAlerts, setCancelledAlerts] = useState<CancelledAppt[]>(cancelledByAdmin)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)
  // IDs de reservas pendentes que expiraram no client — removidas enquanto o server cancela
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set())
  const historyCalendar = useMemo(
    () => getReservationHistoryCalendarMeta(historyAppts),
    [historyAppts]
  )
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<Date | undefined>(historyCalendar.selectedDate)
  const [historyMonth, setHistoryMonth] = useState<Date>(historyCalendar.initialMonth)

  const datesWithAppts = useMemo(
    () => historyCalendar.selectableDateKeys.map((dateKey) => new Date(`${dateKey}T12:00:00`)),
    [historyCalendar.selectableDateKeys]
  )

  const selectedDayAppts = useMemo(() => {
    if (!selectedHistoryDate) return []
    const dateStr = format(selectedHistoryDate, 'yyyy-MM-dd')
    return historyAppts
      .filter((a) => a.date === dateStr)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [historyAppts, selectedHistoryDate])

  const handleCancel = async (id: string) => {
    setCancelling(id)
    const result = await cancelMyAppointment(id)
    if (result.success) {
      setAppointments((prev) => prev.filter((a) => a.id !== id))
      toast.success('Reserva cancelada.')
      setConfirmId(null)
    } else {
      toast.error(result.error ?? 'Erro ao cancelar.')
    }
    setCancelling(null)
  }

  const handleDismiss = async (id: string) => {
    setDismissing(id)
    const result = await dismissCancelledAppointment(id)
    if (result.success) {
      setCancelledAlerts((prev) => prev.filter((a) => a.id !== id))
    } else {
      toast.error(result.error ?? 'Erro ao dispensar aviso.')
    }
    setDismissing(null)
  }

  const handleCancelPending = async (id: string) => {
    setCancelling(id)
    const result = await cancelPendingPayment(id)
    if (result.success) {
      setAppointments((prev) => prev.filter((a) => a.id !== id))
      toast.success('Reserva pendente cancelada.')
    } else {
      toast.error(result.error ?? 'Erro ao cancelar pagamento pendente.')
    }
    setCancelling(null)
  }

  // Chamado pelo PendingPaymentTimer quando o prazo expira no client
  const handleExpired = async (id: string) => {
    setExpiredIds((prev) => new Set([...prev, id]))
    const result = await cancelPendingPayment(id)
    if (result.success) {
      setAppointments((prev) => prev.filter((a) => a.id !== id))
      toast.error('Prazo de pagamento expirado. Faça um novo agendamento.', { duration: 8000 })
    } else {
      // Erro esperado se já foi cancelado por outro caminho
      setExpiredIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const canCancel = (appt: Appt) => {
    const apptTime = parseISO(`${appt.date}T${appt.start_time}`)
    const deadline = new Date(apptTime.getTime() - cancellationWindowMinutes * 60000)
    return new Date() < deadline
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto px-4 py-10 flex flex-col gap-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <Link
            href="/agendar"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="text-xl font-extrabold uppercase tracking-widest text-white flex-1">
            Minhas Reservas
          </h1>
          <button
            onClick={() => router.refresh()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Toggle lembretes push */}
        <PushNotificationToggle />

        {notice === 'pending-payment' && (
          <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 px-4 py-4 flex flex-col gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-300">Pagamento pendente</span>
            <p className="text-sm text-yellow-100/90 leading-relaxed">
              Seu agendamento ainda não foi confirmado. Ele continua reservado aguardando pagamento. Use o botão abaixo para concluir o pagamento e confirmar o horário.
            </p>
          </div>
        )}

        {/* ── Avisos de cancelamento pelo admin ── */}
        {cancelledAlerts.length > 0 && (
          <div className="flex flex-col gap-3">
            {cancelledAlerts.map((appt) => {
              const date = parseISO(appt.date)
              const timeLabel = appt.start_time?.slice(0, 5) ?? ''
              const whatsappHref = whatsappNumber
                ? `https://wa.me/55${whatsappNumber.replace(/\D/g, '')}`
                : 'https://wa.me/'

              return (
                <div
                  key={appt.id}
                  className="bg-red-950/40 rounded-2xl border border-red-500/30 overflow-hidden"
                >
                  {/* Barra de alerta */}
                  <div className="bg-red-500/15 px-4 py-2 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-300 uppercase tracking-widest flex-1">
                      Agendamento cancelado
                    </span>
                    <button
                      onClick={() => handleDismiss(appt.id)}
                      disabled={dismissing === appt.id}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-red-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                      title="Dispensar aviso"
                    >
                      {dismissing === appt.id ? (
                        <div className="w-3 h-3 rounded-full border border-red-400 border-t-transparent animate-spin" />
                      ) : (
                        <X size={13} />
                      )}
                    </button>
                  </div>

                  {/* Corpo */}
                  <div className="px-4 py-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center bg-white/5 rounded-xl px-3 py-2 min-w-[54px]">
                        <Clock size={12} className="text-zinc-500 mb-0.5" />
                        <span className="text-xl font-black text-white tabular-nums leading-none">
                          {timeLabel}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs text-zinc-500 capitalize">
                          {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Scissors size={11} className="text-zinc-500 shrink-0" />
                          <span className="text-sm font-semibold text-white truncate">
                            {appt.service_name_snapshot ?? 'Serviço'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-red-300">
                      Seu agendamento foi cancelado pelo barbeiro. Entre em contato para remarcar.
                    </p>

                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-500 text-white text-xs font-extrabold uppercase tracking-widest py-3 rounded-xl transition-colors"
                    >
                      <MessageCircle size={14} />
                      Falar com o barbeiro no WhatsApp
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Lista vazia */}
        {appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-16 bg-neutral-900 rounded-2xl border border-white/5">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <CalendarDays size={28} className="text-zinc-500" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-base font-semibold text-zinc-300">Nenhuma reserva ativa</p>
              <p className="text-sm text-zinc-500">Você ainda não tem reservas ativas.</p>
            </div>
            <Link
              href="/agendar"
              className="bg-white text-black text-xs font-extrabold uppercase tracking-widest px-6 py-3 rounded-xl hover:bg-zinc-200 transition-colors"
            >
              Fazer uma reserva
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {appointments.map((appt) => {
              const date = parseISO(appt.date)
              const timeLabel = appt.start_time?.slice(0, 5) ?? ''
              const canCancelAppt = canCancel(appt)
              const isPendingPayment = appt.status === 'aguardando_pagamento'
              const isExpiring = expiredIds.has(appt.id)

              return (
                <div
                  key={appt.id}
                  className={[
                    'bg-neutral-900 rounded-2xl border overflow-hidden',
                    highlightedAppointmentId === appt.id
                      ? 'border-yellow-500/30 ring-1 ring-yellow-500/30'
                      : 'border-white/5',
                  ].join(' ')}
                >
                  {/* Barra de data */}
                  <div className="bg-white/5 px-4 py-2 flex items-center gap-2">
                    <CalendarDays size={13} className="text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-300 capitalize">
                      {format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>

                  {/* Corpo */}
                  <div className="px-4 py-4 flex items-center gap-4">
                    {/* Horário destaque */}
                    <div className="flex flex-col items-center bg-white/5 rounded-xl px-3 py-2 min-w-[54px]">
                      <Clock size={12} className="text-zinc-500 mb-0.5" />
                      <span className="text-xl font-black text-white tabular-nums leading-none">
                        {timeLabel}
                      </span>
                      {appt.services?.duration_minutes && (
                        <span className="text-[9px] text-zinc-500 mt-0.5">
                          {appt.services.duration_minutes}min
                        </span>
                      )}
                    </div>

                    {/* Serviço */}
                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Scissors size={11} className="text-zinc-500 shrink-0" />
                        <span className="text-sm font-semibold text-white truncate">
                          {appt.services?.name ?? 'Serviço'}
                        </span>
                      </div>
                      {appt.services?.price != null && (
                        <span className="text-xs text-zinc-400 font-medium">
                          R$ {appt.services.price.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      <div className="mt-1 flex flex-wrap gap-2">
                        <AppointmentStatusBadge status={appt.status} />
                        <AppointmentPaymentBadge paymentContext={appt.payment_context} />
                      </div>
                    </div>
                  </div>

                  {isPendingPayment && (
                    <div className="px-4 pb-4 flex flex-col gap-2">
                      {/* Timer de expira\u00e7\u00e3o */}
                      {appt.expiresAt && !isExpiring && (
                        <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2">
                          <span className="text-[11px] text-yellow-300/80 font-medium">Tempo restante para pagar</span>
                          <PendingPaymentTimer
                            expiresAt={appt.expiresAt}
                            onExpired={() => { void handleExpired(appt.id) }}
                          />
                        </div>
                      )}
                      {isExpiring && (
                        <div className="flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                          <div className="w-3 h-3 rounded-full border border-red-400 border-t-transparent animate-spin shrink-0" />
                          <span className="text-[11px] text-red-400 font-medium">Prazo expirado — cancelando reserva...</span>
                        </div>
                      )}
                      {/* A\u00e7\u00f5es */}
                      {!isExpiring && (
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/agendar/pagamento/retomar?appt_id=${appt.id}`}
                            className="flex-1 text-center text-[11px] font-black text-primary bg-primary/10 border border-primary/20 py-2 rounded-lg hover:bg-primary/15 transition-colors"
                          >
                            Concluir pagamento
                          </Link>
                          <button
                            onClick={() => handleCancelPending(appt.id)}
                            disabled={cancelling === appt.id}
                            className="shrink-0 text-[11px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-3 py-2 rounded-lg hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
                          >
                            {cancelling === appt.id ? '...' : 'Cancelar'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Rodapé com botão cancelar */}
                  {!isPendingPayment && canCancelAppt && (
                    <div className="px-4 pb-4">
                      {confirmId === appt.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400 flex-1">Cancelar esta reserva?</span>
                          <button
                            disabled={cancelling === appt.id}
                            onClick={() => handleCancel(appt.id)}
                            className="text-[11px] font-black text-white bg-red-600 border border-red-500 px-3 py-1.5 rounded-lg disabled:opacity-40"
                          >
                            {cancelling === appt.id ? '...' : 'Sim'}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="text-[11px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-3 py-1.5 rounded-lg"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(appt.id)}
                          className="w-full text-[11px] font-bold text-zinc-400 border border-white/10 bg-white/5 py-2 rounded-lg hover:text-white hover:border-white/20 transition-colors"
                        >
                          Cancelar reserva
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* CTA nova reserva */}
            <Link
              href="/agendar"
              className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-extrabold uppercase tracking-widest text-zinc-400 border border-white/10 bg-white/5 py-3 rounded-xl hover:text-white hover:border-white/15 transition-colors"
            >
              + Fazer nova reserva
            </Link>
          </div>
        )}

        {/* ── Calendário ── */}
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays size={14} className="text-zinc-500" />
              <h2 className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
                Calendário
              </h2>
            </div>

            <div className="bg-neutral-900 rounded-2xl border border-white/5 p-4 flex flex-col items-center">
              {/* Sobrepõe variáveis CSS do DayPicker para remover o azul padrão */}
              <div style={{ '--rdp-accent-color': '#dc2626', '--rdp-background-color': '#dc2626' } as React.CSSProperties} className="w-full flex flex-col items-center">
              <DayPicker
                mode="single"
                locale={ptBR}
                selected={selectedHistoryDate}
                onSelect={setSelectedHistoryDate}
                month={historyMonth}
                onMonthChange={setHistoryMonth}
                startMonth={historyCalendar.startMonth}
                endMonth={historyCalendar.endMonth}
                modifiers={{ hasAppt: datesWithAppts }}
                modifiersStyles={{
                  hasAppt: {
                    backgroundImage: 'radial-gradient(circle at 50% calc(100% - 3px), #dc2626 2px, transparent 2px)',
                  },
                }}
                classNames={{
                  chevron: 'fill-zinc-300',
                  today: 'font-extrabold !text-white',
                  selected: '!bg-red-600 !text-white rounded-full',
                }}
              />
              </div>

              {selectedHistoryDate && (
                <div className="w-full border-t border-white/10 pt-4 mt-1 flex flex-col gap-2">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest capitalize">
                    {format(selectedHistoryDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </p>
                  {selectedDayAppts.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhum agendamento neste dia.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedDayAppts.map((appt) => (
                        <div
                          key={appt.id}
                          className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-3"
                        >
                          <span className="text-base font-black text-white tabular-nums w-10 shrink-0">
                            {appt.start_time.slice(0, 5)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {appt.service_name_snapshot ?? (appt.services as { name: string } | null)?.name ?? 'Serviço'}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              <AppointmentStatusBadge status={appt.status} />
                              <AppointmentPaymentBadge paymentContext={appt.payment_context} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
      </div>

      {/* ── Reservas de Produtos ── */}
      {productReservations.length > 0 && (
        <div className="max-w-lg mx-auto px-4 pb-10 flex flex-col gap-4 w-full">
          <div className="flex items-center gap-2">
            <ShoppingBag size={14} className="text-zinc-500" />
            <h2 className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
              Produtos reservados
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {productReservations.map((pr) => {
              const statusLabel: Record<ProductReservationStatus, string> = {
                aguardando_pagamento: 'Pagamento pendente',
                reservado: 'Aguardando retirada',
                cancelado: 'Cancelado',
                retirado: 'Retirado',
              }
              const statusColor: Record<ProductReservationStatus, string> = {
                aguardando_pagamento: 'text-yellow-400',
                reservado: 'text-emerald-400',
                cancelado: 'text-zinc-500',
                retirado: 'text-blue-400',
              }
              return (
                <div
                  key={pr.id}
                  className="bg-neutral-900 rounded-2xl border border-white/5 px-4 py-4 flex items-start gap-3"
                >
                  {pr.product_image_snapshot && (
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                      <img
                        src={pr.product_image_snapshot}
                        alt={pr.product_name_snapshot}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-white truncate">
                      {pr.product_name_snapshot}
                    </span>
                    <span className="text-xs text-zinc-400">
                      R$ {pr.product_price_snapshot.toFixed(2).replace('.', ',')}
                    </span>
                    <span className={['text-[10px] font-black uppercase tracking-widest mt-0.5', statusColor[pr.status]].join(' ')}>
                      {statusLabel[pr.status]}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </main>
  )
}
