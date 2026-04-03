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
import { Scissors, CalendarDays, User, Menu, Star, Home, Check } from 'lucide-react'


interface Props {
  services: Service[]
  barber: Barber | null
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  config: BusinessConfig | null
  userEmail: string | null
  userId: string | null
  isAdmin?: boolean
}

export function BookingForm({
  services,
  barber,
  workingHours,
  specialSchedules,
  config,
  userEmail,
  userId,
  isAdmin = false,
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

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (/\d/.test(value)) {
      setNameError('Nome nao pode conter numeros.')
    } else {
      setNameError('')
    }
    setClientName(value.replace(/\d/g, ''))
  }

  const formatPhone = (raw: string) => {
    const nums = raw.replace(/\D/g, '').slice(0, 11)
    if (nums.length <= 2) return nums
    if (nums.length <= 7) return `(${nums.slice(0, 2)}) ${nums.slice(2)}`
    if (nums.length <= 11) return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`
    return raw
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value)
    setClientPhone(formatted)
    const nums = formatted.replace(/\D/g, '')
    if (nums.length > 0 && nums.length < 11) {
      setPhoneError('Informe um celular valido com DDD (11 digitos).')
    } else if (nums.length === 11 && nums[2] !== '9') {
      setPhoneError('Informe um numero de celular (deve comecar com 9 apos o DDD).')
    } else {
      setPhoneError('')
    }
  }

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
    if (showFreeMode) {
      if (!clientName.trim()) {
        toast.error('Informe seu nome completo.')
        return
      }
      if (!clientPhone.trim()) {
        toast.error('Informe seu telefone com DDD.')
        return
      }
      const nums = clientPhone.replace(/\D/g, '')
      if (nums.length !== 11 || nums[2] !== '9') {
        toast.error('Telefone invalido. Use o formato (11) 99999-9999.')
        return
      }
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
    (!showFreeMode || (
      clientName.trim().length > 1 &&
      !nameError &&
      clientPhone.replace(/\D/g, '').length === 11 &&
      !phoneError
    ))

  const displayName =
    config?.display_name_preference === 'nickname'
      ? config?.barber_nickname
      : config?.barber_name

  return (
    <div className="flex flex-col gap-0 pb-32 min-h-screen">
      {/* Header Premium */}
      <header className="flex flex-col items-center justify-center pt-10 pb-6 px-4">
        <Image
            src={config?.logo_url ?? '/logo-barbearialeste.png'}
            alt="Leste Barbearia"
            width={112}
            height={112}
            className="object-contain mb-6"
          />
        <h1 className="text-foreground text-xs md:text-sm tracking-[0.15em] font-bold uppercase text-center">
          SELECIONE O SERVIÇO
        </h1>
        {isLoggedIn && isAdmin && (
          <a href="/admin" className="text-[10px] text-primary font-bold mt-3 tracking-widest uppercase py-1 px-3 bg-primary/10 rounded-full">Painel Admin</a>
        )}
      </header>

      <div className="px-4 pt-2 flex flex-col gap-10 max-w-lg mx-auto w-full">

        {/* Secao 1: Servico (Horizontal Scroll) */}
        <section>
          <div className="flex overflow-x-auto gap-4 pb-6 snap-x snap-mandatory hide-scrollbars -mx-4 px-4 items-center">
            {services.map((service) => {
              const isSelected = selectedService?.id === service.id;
              return (
              <button
                key={service.id}
                onClick={() => handleServiceSelect(service)}
                className={[
                  'flex-none w-[130px] h-[130px] flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all snap-start',
                  isSelected
                    ? 'border-primary bg-primary/20 ring-1 ring-primary card-shadow relative'
                    : 'border-border bg-card hover:border-foreground/20 card-shadow',
                ].join(' ')}
              >
                {isSelected && <div className="absolute top-2 right-2 text-primary shadow-sm bg-background/50 rounded-full p-0.5"><Check size={14} strokeWidth={4} /></div>}
                <div className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                  <Scissors size={28} strokeWidth={1.5} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground text-center leading-tight">{service.name}</span>
                  <span className="text-[10px] font-bold text-muted-foreground tracking-widest">
                    R$ {service.price.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </button>
            )})}
          </div>
        </section>

        {/* Secao 2: Barbeiro */}
        {selectedService && (
          <section className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-4 w-full mb-6 max-w-[250px] mx-auto opacity-70">
               <div className="h-[1px] flex-1 bg-border"></div>
               <Scissors size={18} className="text-muted-foreground rotate-90" />
               <div className="h-[1px] flex-1 bg-border"></div>
            </div>
            
            <h2 className="text-xs tracking-[0.2em] font-bold uppercase text-foreground mb-6 text-center">
              ESCOLHA O BARBEIRO
            </h2>
            
            <div className="w-full flex justify-center">
              <div className="flex items-center gap-5 bg-card py-4 px-6 rounded-2xl border border-primary/30 card-shadow ring-1 ring-primary/20 w-fit cursor-default">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/30 blur-md"></div>
                  <Image
                    src={config?.barber_photo_url ?? '/barbearialeste.png'}
                    alt={displayName ?? 'Barbeiro'}
                    width={56}
                    height={56}
                    className="w-14 h-14 rounded-full object-cover border-[3px] border-primary relative z-10"
                    unoptimized
                  />
                  <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-border z-20 shadow-md">
                    <Check size={12} className="text-primary" strokeWidth={4} />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 pr-2">
                  <span className="font-extrabold text-sm uppercase tracking-wide text-foreground string-capitalize">{displayName}</span>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Mestre</span>
                  <div className="flex items-center gap-1">
                     <Star size={12} className="fill-primary text-primary" strokeWidth={0} />
                     <Star size={12} className="fill-primary text-primary" strokeWidth={0} />
                     <Star size={12} className="fill-primary text-primary" strokeWidth={0} />
                     <Star size={12} className="fill-primary text-primary" strokeWidth={0} />
                     <Star size={12} className="fill-primary text-primary" strokeWidth={0} />
                     <span className="text-[10px] font-bold text-foreground ml-1">5.0</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Secao 3: Data */}
        {selectedService && (
          <section className="mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center gap-4 w-full mb-8 max-w-[250px] mx-auto opacity-70">
               <div className="h-[1px] flex-1 bg-border"></div>
               <CalendarDays size={18} className="text-muted-foreground" />
               <div className="h-[1px] flex-1 bg-border"></div>
            </div>
            
            <div className="flex justify-center bg-card rounded-[2rem] p-5 card-shadow border border-border w-full max-w-[340px] mx-auto">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                disabled={isDateDisabled}
                classNames={{
                  root: 'w-full',
                  months: 'w-full',
                  month: 'w-full',
                  month_caption: 'flex justify-between items-center px-2 pb-5',
                  caption_label: 'text-sm font-bold tracking-widest text-foreground uppercase',
                  nav: 'flex gap-2',
                  button_previous: 'h-9 w-9 flex items-center justify-center rounded-xl border-2 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                  button_next: 'h-9 w-9 flex items-center justify-center rounded-xl border-2 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                  month_grid: 'w-full border-collapse',
                  weekdays: 'flex mb-4',
                  weekday: 'flex-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground font-bold',
                  weeks: 'flex flex-col gap-3',
                  week: 'flex',
                  day: 'flex-1 relative p-0 m-0',
                  day_button: [
                    'mx-auto h-10 w-10 flex items-center justify-center rounded-full text-xs font-bold transition-all',
                    'hover:bg-muted hover:text-foreground',
                  ].join(' '),
                  today: 'text-primary border-b-2 border-primary',
                  selected: '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:scale-110 shadow-lg',
                  disabled: 'opacity-20 pointer-events-none text-muted-foreground font-normal',
                  outside: 'opacity-0 pointer-events-none',
                  hidden: 'invisible',
                }}
              />
            </div>
          </section>
        )}

        {/* Secao 4: Horarios */}
        {selectedDate && (
          <section className="mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-[10px] tracking-[0.2em] font-bold uppercase text-foreground mb-5 text-center mt-6">
               Horários disponíveis em {format(selectedDate, 'dd/MM')}
            </h2>

            {loadingSlots && (
              <div className="grid grid-cols-4 gap-3 max-w-[340px] mx-auto">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-card border border-border animate-pulse card-shadow" />
                ))}
              </div>
            )}

            {!loadingSlots && availableSlots.length === 0 && (
              <p className="text-xs tracking-widest text-muted-foreground text-center bg-card p-6 rounded-2xl border border-border uppercase font-semibold max-w-[340px] mx-auto">
                Nenhum horário disponível.
              </p>
            )}

            {!loadingSlots && availableSlots.length > 0 && (
              <div className="grid grid-cols-4 gap-3 max-w-[340px] mx-auto">
                {availableSlots.map((slot) => {
                   const isSel = selectedTime === slot;
                   return (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(slot)}
                    className={[
                      'h-12 rounded-xl border text-sm font-extrabold transition-all card-shadow',
                      isSel
                        ? 'border-primary bg-primary text-primary-foreground scale-[1.03] shadow-primary/30 shadow-lg relative'
                        : 'border-border bg-card text-foreground hover:border-foreground/30',
                    ].join(' ')}
                  >
                    {slot}
                  </button>
                )})}
              </div>
            )}
          </section>
        )}

        {/* Modo livre: nome e telefone */}
        {showFreeMode && selectedTime && (
          <section className="flex flex-col gap-5 mt-6 bg-card p-6 rounded-[2rem] border border-border card-shadow max-w-[340px] mx-auto w-full animate-in zoom-in duration-300">
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-foreground text-center">Seus dados</h2>
            <div className="flex flex-col gap-2">
              <Label htmlFor="clientName" className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-1">
                Nome completo
              </Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={handleNameChange}
                placeholder="Ex: João da Silva"
                className={`h-12 bg-background border-border rounded-xl px-4 text-sm font-medium ${nameError ? 'border-destructive' : ''}`}
                maxLength={80}
                inputMode="text"
                autoComplete="name"
              />
              {nameError && (
                <p className="text-[10px] text-destructive font-bold px-1 uppercase tracking-wider">{nameError}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <Label htmlFor="clientPhone" className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-1">
                WhatsApp com DDD
              </Label>
              <Input
                id="clientPhone"
                value={clientPhone}
                onChange={handlePhoneChange}
                placeholder="(11) 99999-9999"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                className={`h-12 bg-background border-border rounded-xl px-4 font-bold tracking-wider ${phoneError ? 'border-destructive' : ''}`}
                maxLength={16}
              />
              {phoneError && (
                <p className="text-[10px] text-destructive font-bold px-1 uppercase tracking-wider">{phoneError}</p>
              )}
            </div>
          </section>
        )}

        {/* Meus agendamentos (logado) */}
        {isLoggedIn && (
          <div className="mt-8 mb-4 max-w-[340px] mx-auto w-full">
            <MyAppointments
              cancellationWindowMinutes={config?.cancellation_window_minutes ?? 120}
            />
          </div>
        )}

      </div>

      {/* Turnstile (renderizado fora do fluxo visual) */}
      {showTurnstile && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm transition-all px-4">
          <div className="bg-card border border-border rounded-[2rem] p-8 w-full max-w-sm card-shadow relative overflow-hidden">
            <div className="absolute inset-0 bg-primary/5"></div>
            <p className="text-xs font-bold tracking-[0.2em] text-foreground mb-6 text-center uppercase relative z-10">
              Proteção contra Spam
            </p>
            <div className="flex justify-center relative z-10">
              <TurnstileWidget
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
                onSuccess={handleTurnstileSuccess}
                onError={() => {
                  setShowTurnstile(false)
                  toast.error('Verificação de segurança falhou. Tente novamente.')
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Barra de confirmacao flutuante (CTA) */}
      <div className={`fixed bottom-[90px] left-0 right-0 px-4 z-40 transition-all duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${selectedTime ? 'translate-y-0 opacity-100 pointer-events-auto scale-100' : 'translate-y-full opacity-0 pointer-events-none scale-95'}`}>
         <div className="max-w-[340px] mx-auto w-full">
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || isPending}
              className="w-full h-14 rounded-2xl text-xs font-extrabold tracking-[0.15em] uppercase bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-primary/50"
            >
              {isPending ? 'PROCESSANDO...' : 'CONFIRMAR RESERVA'}
            </Button>
         </div>
      </div>

      {/* Bottom Nav Premium */}
      <nav className="fixed bottom-0 left-0 right-0 h-[80px] bg-[#0A0A0A]/95 backdrop-blur-[20px] border-t border-white/5 z-50 flex items-center justify-between px-6 sm:px-10 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
         <button onClick={() => window.location.href = '/'} className="flex flex-col items-center gap-1 min-w-[50px] text-primary transition-all hover:-translate-y-1">
            <Home size={24} strokeWidth={2} className="drop-shadow-md" />
            <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Início</span>
         </button>
         
         <button onClick={() => { if(isLoggedIn) { window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'}) } else { toast('Faça login para ver as reservas') } }} className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1">
            <CalendarDays size={24} strokeWidth={2} />
            <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Reservas</span>
         </button>

         <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="relative z-10 transition-transform hover:scale-105 active:scale-95 group">
             <div className="absolute inset-0 bg-primary rounded-full blur-[20px] opacity-20 group-hover:opacity-50 transition-opacity"></div>
             <div className="bg-[#18181b] border-2 border-white/10 p-3 h-16 w-16 rounded-full card-shadow shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center justify-center relative translate-y-[-20px]">
                 <Image
                    src={config?.logo_url ?? '/logo-barbearialeste.png'}
                    alt="Logo"
                    width={34}
                    height={34}
                    className="object-contain"
                 />
             </div>
         </button>

         <a href={isLoggedIn ? '/api/auth/signout' : '/login'} className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1">
            <User size={24} strokeWidth={2} />
            <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">{isLoggedIn ? 'Sair' : 'Perfil'}</span>
         </a>

         {isAdmin ? (
           <a href="/admin" className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1">
             <Menu size={24} strokeWidth={2} />
             <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Menu</span>
           </a>
         ) : (
           <button onClick={() => toast.info('Em Breve: Mais opções')} className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1">
             <Menu size={24} strokeWidth={2} />
             <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Opções</span>
           </button>
         )}
      </nav>

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
