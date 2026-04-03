'use client'

import { useState, useCallback, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import { ptBR } from 'date-fns/locale'
import { format, isBefore, startOfDay, getDay, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { getAvailableSlots, createAppointment, getMyAppointments, cancelMyAppointment } from '@/app/agendar/actions'
import { TurnstileWidget } from '@/components/booking/TurnstileWidget'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Service, Barber, WorkingHours, SpecialSchedule, BusinessConfig } from '@/lib/supabase/types'
import 'react-day-picker/style.css'

interface Props {
  services: Service[]
  barber: Barber | null
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  config: BusinessConfig | null
  userEmail: string | null
  userId: string | null
}

export function BookingForm({
  services,
  barber,
  workingHours,
  specialSchedules,
  config,
  userEmail,
  userId,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [showTurnstile, setShowTurnstile] = useState(false)

  // Modo livre (sem Google)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')

  const isLoggedIn = !!userId
  const requireLogin = config?.require_google_login ?? true
  const showFreeMode = !isLoggedIn && !requireLogin

  // Dias desabilitados no calendário
  const closedDayOfWeeks = workingHours
    .filter((wh) => !wh.is_open)
    .map((wh) => wh.day_of_week)

  const closedSpecialDates = specialSchedules
    .filter((ss) => ss.is_closed)
    .map((ss) => parseISO(ss.date))

  const isDateDisabled = (date: Date) => {
    if (isBefore(date, startOfDay(new Date()))) return true
    if (closedDayOfWeeks.includes(getDay(date))) return true
    if (closedSpecialDates.some((d) => d.toDateString() === date.toDateString())) return true
    return false
  }

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service)
    setSelectedDate(undefined)
    setAvailableSlots([])
    setSelectedTime(null)
  }

  const handleDateSelect = useCallback(
    async (date: Date | undefined) => {
      setSelectedDate(date)
      setSelectedTime(null)
      setAvailableSlots([])

      if (!date || !selectedService) return

      setLoadingSlots(true)
      const dateStr = format(date, 'yyyy-MM-dd')
      const { slots, error } = await getAvailableSlots(dateStr, selectedService.id)
      setLoadingSlots(false)

      if (error) {
        toast.error(error)
        return
      }
      setAvailableSlots(slots)
    },
    [selectedService]
  )

  const handleConfirm = () => {
    if (!selectedService || !selectedDate || !selectedTime) return
    if (showFreeMode && (!clientName.trim() || !clientPhone.trim())) {
      toast.error('Informe seu nome e telefone.')
      return
    }
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    if (!siteKey || siteKey === 'sua_site_key_aqui') {
      submitBooking('')
      return
    }
    setShowTurnstile(true)
  }

  const handleTurnstileSuccess = (token: string) => {
    setTurnstileToken(token)
    setShowTurnstile(false)
    submitBooking(token)
  }

  const submitBooking = (token: string) => {
    if (!selectedService || !selectedDate || !selectedTime || !barber) return

    startTransition(async () => {
      const result = await createAppointment({
        serviceId: selectedService.id,
        barberId: barber.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: selectedTime + ':00',
        turnstileToken: token,
        clientName: showFreeMode ? clientName : undefined,
        clientPhone: showFreeMode ? clientPhone : undefined,
      })

      if (result.success && result.appointmentId) {
        router.push(`/agendar/sucesso?id=${result.appointmentId}`)
      } else {
        toast.error(result.error ?? 'Erro ao confirmar agendamento.')
        setTurnstileToken(null)
      }
    })
  }

  const canConfirm =
    !!selectedService &&
    !!selectedDate &&
    !!selectedTime &&
    (!showFreeMode || (clientName.trim().length > 0 && clientPhone.trim().length > 0))

  const displayName =
    config?.display_name_preference === 'nickname'
      ? config?.barber_nickname
      : config?.barber_name

  return (
    <div className="flex flex-col gap-0">

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Image
              src={config?.logo_url ?? '/logo-barbearialeste.png'}
              alt="Leste Barbearia"
              width={36}
              height={36}
              className="object-contain rounded"
            />
          <span className="text-sm font-medium text-foreground">Leste Barbearia</span>
        </div>
        {isLoggedIn && (
          <a
            href="/api/auth/signout"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sair
          </a>
        )}
      </header>

      <div className="px-5 pt-6 flex flex-col gap-8 max-w-lg mx-auto w-full">

        {/* Secao 1: Servico */}
        <section>
          <h2 className="text-base font-medium text-foreground mb-4">
            1. O que vamos fazer hoje?
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {services.map((service) => (
              <button
                key={service.id}
                onClick={() => handleServiceSelect(service)}
                className={[
                  'flex flex-col gap-1 p-4 rounded-xl border text-left transition-all',
                  selectedService?.id === service.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:border-foreground/20',
                ].join(' ')}
              >
                <span className="text-sm font-medium text-foreground">{service.name}</span>
                <span className="text-sm font-semibold text-primary">
                  R$ {service.price.toFixed(2).replace('.', ',')}
                </span>
                <span className="text-xs text-muted-foreground">{service.duration_minutes} min</span>
              </button>
            ))}
          </div>
        </section>

        {/* Secao 2: Data */}
        {selectedService && (
          <section>
            <h2 className="text-base font-medium text-foreground mb-4">
              2. Escolha o melhor momento:
            </h2>
            <div className="flex justify-center">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                disabled={isDateDisabled}
                classNames={{
                  root: 'w-full max-w-xs',
                  months: 'w-full',
                  month: 'w-full',
                  month_caption: 'flex justify-between items-center px-1 pb-3',
                  caption_label: 'text-sm font-medium text-foreground capitalize',
                  nav: 'flex gap-1',
                  button_previous: 'h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                  button_next: 'h-7 w-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                  month_grid: 'w-full border-collapse',
                  weekdays: 'flex mb-1',
                  weekday: 'flex-1 text-center text-xs text-muted-foreground font-normal pb-1',
                  weeks: 'flex flex-col gap-1',
                  week: 'flex',
                  day: 'flex-1 relative',
                  day_button: [
                    'mx-auto h-8 w-8 flex items-center justify-center rounded-lg text-sm transition-colors',
                    'hover:bg-muted hover:text-foreground',
                  ].join(' '),
                  today: 'font-semibold text-primary',
                  selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary',
                  disabled: 'opacity-25 pointer-events-none',
                  outside: 'opacity-0 pointer-events-none',
                  hidden: 'invisible',
                }}
              />
            </div>
          </section>
        )}

        {/* Secao 3: Horarios */}
        {selectedDate && (
          <section>
            <h2 className="text-base font-medium text-foreground mb-4">
              Horarios disponiveis ({format(selectedDate, 'dd/MM')}):
            </h2>

            {loadingSlots && (
              <div className="flex gap-2 flex-wrap">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-9 w-20 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            )}

            {!loadingSlots && availableSlots.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum horario disponivel neste dia.
              </p>
            )}

            {!loadingSlots && availableSlots.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(slot)}
                    className={[
                      'h-9 px-4 rounded-lg border text-sm font-medium transition-all',
                      selectedTime === slot
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-foreground hover:border-foreground/30',
                    ].join(' ')}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Modo livre: nome e telefone */}
        {showFreeMode && selectedTime && (
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium text-foreground">Seus dados:</h2>
            <div className="flex flex-col gap-2">
              <Label htmlFor="clientName" className="text-sm text-muted-foreground">
                Nome completo
              </Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Seu nome"
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="clientPhone" className="text-sm text-muted-foreground">
                Telefone com DDD
              </Label>
              <Input
                id="clientPhone"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                type="tel"
                className="h-10"
              />
            </div>
          </section>
        )}

        {/* Meus agendamentos (logado) */}
        {isLoggedIn && (
          <MyAppointments
            cancellationWindowMinutes={config?.cancellation_window_minutes ?? 120}
          />
        )}

      </div>

      {/* Turnstile (renderizado fora do fluxo visual) */}
      {showTurnstile && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50">
          <div className="bg-card border border-border rounded-t-2xl p-6 w-full max-w-sm">
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Verificando seguranca...
            </p>
            <TurnstileWidget
              siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
              onSuccess={handleTurnstileSuccess}
              onError={() => {
                setShowTurnstile(false)
                toast.error('Verificacao de seguranca falhou. Tente novamente.')
              }}
            />
          </div>
        </div>
      )}

      {/* Barra de confirmacao fixa */}
      {selectedService && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-5 py-4 z-40">
          <div className="max-w-lg mx-auto">
            {selectedTime && selectedDate ? (
              <div className="flex flex-col gap-1 mb-3">
                <span className="text-xs text-muted-foreground">Resumo</span>
                <span className="text-sm text-foreground">
                  {selectedService.name} — {format(selectedDate, 'dd/MM')} as {selectedTime}
                </span>
                <span className="text-xs text-muted-foreground">
                  Profissional: {displayName}
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">
                {!selectedDate ? 'Selecione uma data' : 'Selecione um horario'}
              </p>
            )}
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || isPending}
              className="w-full h-11 text-sm font-semibold tracking-wide bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-30"
            >
              {isPending ? 'Confirmando...' : 'Confirmar Agendamento'}
            </Button>
          </div>
        </div>
      )}

      {config?.show_agency_brand && (
        <p className="text-center text-xs text-muted-foreground/30 py-4 mt-4 select-none">
          Sistema desenvolvido por Agencia JN
        </p>
      )}
    </div>
  )
}

// ─── Sub-componente: Meus Agendamentos ────────────────────────────────────
function MyAppointments({ cancellationWindowMinutes }: { cancellationWindowMinutes: number }) {
  const [appointments, setAppointments] = useState<
    Array<{
      id: string
      date: string
      start_time: string
      services: { name: string; price: number } | null
    }>
  >([])
  const [loaded, setLoaded] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { appointments: data } = await getMyAppointments()
    setAppointments(data as typeof appointments)
    setLoaded(true)
  }, [])

  const handleCancel = async (id: string) => {
    setCancelling(id)
    const result = await cancelMyAppointment(id)
    if (result.success) {
      setAppointments((prev) => prev.filter((a) => a.id !== id))
      toast.success('Agendamento cancelado.')
    } else {
      toast.error(result.error)
    }
    setCancelling(null)
  }

  if (!loaded) {
    return (
      <button
        onClick={load}
        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
      >
        Ver meus agendamentos
      </button>
    )
  }

  if (appointments.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-medium text-foreground">Meus agendamentos:</h2>
      <div className="flex flex-col gap-2">
        {appointments.map((appt) => {
          const apptTime = parseISO(`${appt.date}T${appt.start_time}`)
          const deadline = new Date(apptTime.getTime() - cancellationWindowMinutes * 60000)
          const canCancel = new Date() < deadline

          return (
            <div
              key={appt.id}
              className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {appt.services?.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(appt.date), 'dd/MM')} as {appt.start_time?.slice(0, 5)}
                </span>
              </div>
              {canCancel && (
                <button
                  onClick={() => handleCancel(appt.id)}
                  disabled={cancelling === appt.id}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
                >
                  {cancelling === appt.id ? 'Cancelando...' : 'Cancelar'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
