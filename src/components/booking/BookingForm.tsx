'use client'

import { useState, useCallback, useEffect, useTransition, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import { ptBR } from 'date-fns/locale'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { getAvailableSlots, createAppointment, getMyAppointments, cancelMyAppointment, saveUserPhone, cancelPendingPayment } from '@/app/agendar/actions'
import { PaymentBrick } from '@/components/payment/PaymentBrick'
import { createClient } from '@/lib/supabase/client'
import {
  buildAvailabilitySyncKey,
  getBarberAvailabilityChangeMessage,
  isBookingDateDisabled,
  resolveSelectedService,
} from '@/lib/booking/public-booking-sync'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Service, Barber, WorkingHours, SpecialSchedule, BusinessConfig } from '@/lib/supabase/types'
import 'react-day-picker/style.css'
import { Scissors, Star, CalendarDays, User, Menu, Home, Check, MapPin, MessageCircle, X, FileText, Shield, LogOut, ShoppingBag, Images, Download, Share } from 'lucide-react'

// Ícones SVG customizados da pasta public/barber-icon
const SERVICE_ICON_PATHS: Record<string, string> = {
  scissors:  '/barber-icon/scissor-icon.svg',
  smile:     '/barber-icon/beard-icon.svg',
  crown:     '/barber-icon/barber-svgrepo-com.svg',
  sparkles:  '/barber-icon/hair-salon-icon.svg',
  zap:       '/barber-icon/electric-trimmer-icon.svg',
  star:      '/barber-icon/man-hair-icon.svg',
  flame:     '/barber-icon/straight-barber-razor-icon.svg',
  droplets:  '/barber-icon/hairdryer-icon.svg',
  knife:     '/barber-icon/barber-knife-svgrepo-com.svg',
  man:       '/barber-icon/bearded-man-icon.svg',
}


interface Props {
  services: Service[]
  barber: Barber | null
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  config: BusinessConfig | null
  userEmail: string | null
  userId: string | null
  userPhone: string | null
  isAdmin?: boolean
  isAuthenticatedUser: boolean
  canViewAppointments: boolean
}

export function BookingForm({
  services,
  barber,
  workingHours,
  specialSchedules,
  config,
  userEmail,
  userId,
  userPhone,
  isAdmin = false,
  isAuthenticatedUser,
  canViewAppointments,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)

  // Refs de scroll para navegação automática entre etapas
  const barberSectionRef = useRef<HTMLElement>(null)
  const calendarSectionRef = useRef<HTMLElement>(null)
  const slotsSectionRef = useRef<HTMLElement>(null)

  const scrollToRef = (ref: React.RefObject<HTMLElement | null>) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }

  // PWA Install
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIOSTip, setShowIOSTip] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Verifica se já está instalado (mode standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
      return
    }
    // Detecta iOS Safari (sem beforeinstallprompt)
    const ua = navigator.userAgent
    if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios/i.test(ua)) {
      setIsIOS(true)
    }
    // Captura o evento de instalação (Android/Chrome/Edge)
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Banner de instalação: exibe 1× por sessão após 5s (apenas se não instalado)
    const alreadyShown = sessionStorage.getItem('pwa-banner-shown')
    if (!alreadyShown) {
      const timer = setTimeout(() => {
        sessionStorage.setItem('pwa-banner-shown', '1')
        // será lido pelo componente via estado
        setPwaBannerVisible(true)
      }, 5000)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', handler)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const [pwaBannerVisible, setPwaBannerVisible] = useState(false)

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSTip(true)
      return
    }
    if (!installPrompt) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (installPrompt as any).prompt?.()
    if (result?.outcome === 'accepted' || !result) {
      setInstallPrompt(null)
    }
  }

  // WhatsApp obrigatório
  const [savedPhone, setSavedPhone] = useState<string | null>(userPhone)
  const [showWhatsCapture, setShowWhatsCapture] = useState(false)
  const [whatsInput, setWhatsInput] = useState('')
  const [whatsError, setWhatsError] = useState('')
  const [savingWhats, setSavingWhats] = useState(false)

  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [payCash, setPayCash] = useState(false)

  // Estado do Payment Brick inline (substitui redirecionamento externo)
  const [paymentData, setPaymentData] = useState<{
    preferenceId: string
    amount: number
    appointmentId: string
    serviceName: string
    serviceDate: string
    serviceTime: string
  } | null>(null)
  const [cancellingPaymentStep, setCancellingPaymentStep] = useState(false)

  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')

  // Pré-preenche nome salvo localmente (só visitante, nunca dados sensíveis)
  useEffect(() => {
    if (isAuthenticatedUser) return
    try {
      const saved = localStorage.getItem('guest_name')
      if (saved) setClientName(saved)
    } catch {}
  }, [isAuthenticatedUser])

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (/\d/.test(value)) {
      setNameError('Nome nao pode conter numeros.')
    } else {
      setNameError('')
    }
    const sanitized = value.replace(/\d/g, '')
    setClientName(sanitized)
    try { if (!isAuthenticatedUser) localStorage.setItem('guest_name', sanitized) } catch {}
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

  const requireLogin = config?.require_google_login ?? true
  const showFreeMode = !isAuthenticatedUser && !requireLogin

  useEffect(() => {
    if (isAuthenticatedUser || !userPhone || clientPhone) return
    setClientPhone(formatPhone(userPhone))
  }, [clientPhone, isAuthenticatedUser, userPhone])

  // Ref sempre aponta para a versão mais recente do refetch — evita stale closure
  const refetchRef = useRef<() => Promise<void>>(async () => {})
  const realtimeRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevAvailabilityKeyRef = useRef('')
  const prevBarberIdRef = useRef<string | null>(barber?.id ?? null)

  const resetScheduleSelection = useCallback((options?: { clearDate?: boolean; clearService?: boolean }) => {
    setAvailableSlots([])
    setSelectedTime(null)
    if (options?.clearDate) setSelectedDate(undefined)
    if (options?.clearService) setSelectedService(null)
  }, [])

  const refetchCurrentSlots = useCallback(async () => {
    if (!selectedDate || !selectedService) return
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const { slots, error } = await getAvailableSlots(dateStr, selectedService.id)
    if (error) {
      setAvailableSlots([])
      setSelectedTime(null)
      return
    }
    setAvailableSlots(slots)
    setSelectedTime(null)
  }, [selectedDate, selectedService])

  // Mantém ref sempre atualizada com a última versão do callback
  useEffect(() => { refetchRef.current = refetchCurrentSlots }, [refetchCurrentSlots])

  // Reflexo imediato: ao voltar para a aba busca slots frescos + atualiza server props
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refetchRef.current()
        router.refresh()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [router])

  // Polling a cada 30s: reflexo automático sem precisar trocar de aba
  useEffect(() => {
    const id = setInterval(() => {
      refetchRef.current()
      router.refresh()
    }, 30_000)
    return () => clearInterval(id)
  }, [router])

  useEffect(() => {
    const supabase = createClient()

    const scheduleSync = () => {
      if (realtimeRefreshRef.current) {
        clearTimeout(realtimeRefreshRef.current)
      }

      realtimeRefreshRef.current = setTimeout(() => {
        refetchRef.current()
        router.refresh()
      }, 250)
    }

    const channel = supabase
      .channel('booking-public-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_config' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'working_hours' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'special_schedules' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, scheduleSync)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, scheduleSync)
      .subscribe()

    return () => {
      if (realtimeRefreshRef.current) {
        clearTimeout(realtimeRefreshRef.current)
      }
      supabase.removeChannel(channel)
    }
  }, [router])

  const isDateDisabled = (date: Date) => {
    return isBookingDateDisabled(date, workingHours, specialSchedules)
  }

  useEffect(() => {
    if (!selectedService) return

    const freshService = resolveSelectedService(services, selectedService)
    if (!freshService) {
      resetScheduleSelection({ clearDate: true, clearService: true })
      toast.error('O servico selecionado nao esta mais disponivel. Escolha outro servico.')
      return
    }

    if (freshService !== selectedService) {
      setSelectedService(freshService)
    }
  }, [services, selectedService, resetScheduleSelection])

  useEffect(() => {
    if (!selectedDate) return
    if (!isDateDisabled(selectedDate)) return

    resetScheduleSelection({ clearDate: true })
    toast.error('A data selecionada nao esta mais disponivel. Escolha outro dia.')
  }, [selectedDate, workingHours, specialSchedules, resetScheduleSelection])

  useEffect(() => {
    const currentBarberId = barber?.id ?? null
    const previousBarberId = prevBarberIdRef.current
    const barberChangeMessage = getBarberAvailabilityChangeMessage(previousBarberId, currentBarberId)

    if (barberChangeMessage) {
      resetScheduleSelection({ clearDate: true })
      toast.error(barberChangeMessage)
    }

    prevBarberIdRef.current = currentBarberId
  }, [barber?.id, resetScheduleSelection])

  useEffect(() => {
    const availabilityKey = buildAvailabilitySyncKey({
      workingHours,
      specialSchedules,
      isPaused: config?.is_paused ?? false,
      slotIntervalMinutes: config?.slot_interval_minutes ?? 30,
      barberId: barber?.id ?? null,
    })

    if (prevAvailabilityKeyRef.current !== '' && prevAvailabilityKeyRef.current !== availabilityKey) {
      refetchRef.current()
    }

    prevAvailabilityKeyRef.current = availabilityKey
  }, [workingHours, specialSchedules, config?.is_paused, config?.slot_interval_minutes, barber?.id])

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service)
    setSelectedDate(undefined)
    setAvailableSlots([])
    setSelectedTime(null)
    scrollToRef(barberSectionRef)
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

const handleConfirm = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return
    if (!barber) {
      toast.error('Nenhum barbeiro esta disponivel no momento. Tente novamente em instantes.')
      return
    }
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

    // Se logado mas sem WhatsApp salvo, exige captura antes de prosseguir
    if (isAuthenticatedUser && !savedPhone) {
      setShowWhatsCapture(true)
      return
    }

    submitBooking()
  }

  const handleSaveWhats = async () => {
    const nums = whatsInput.replace(/\D/g, '')
    if (nums.length !== 11 || nums[2] !== '9') {
      setWhatsError('Informe um celular válido com DDD (ex: 11 99999-9999).')
      return
    }
    setWhatsError('')
    setSavingWhats(true)
    const result = await saveUserPhone(whatsInput)
    setSavingWhats(false)
    if (!result.success) {
      toast.error(result.error ?? 'Erro ao salvar. Tente novamente.')
      return
    }
    setSavedPhone(whatsInput)
    setShowWhatsCapture(false)
    submitBooking(whatsInput)
  }

  const submitBooking = (overridePhone?: string) => {
    if (!selectedService || !selectedDate || !selectedTime) return
    if (!barber) {
      toast.error('Nenhum barbeiro esta disponivel no momento. Tente novamente em instantes.')
      return
    }

    startTransition(async () => {
      const result = await createAppointment({
        serviceId: selectedService.id,
        barberId: barber.id,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: selectedTime + ':00',
        clientName: showFreeMode ? clientName : undefined,
        clientPhone: showFreeMode ? clientPhone : undefined,
        loggedUserPhone: isAuthenticatedUser ? (overridePhone ?? savedPhone ?? undefined) : undefined,
        payCash: payCash,
      })

      if (result.success && result.appointmentId) {
        if (result.preferenceId && result.amount) {
          // Modo pagamento online: exibe Payment Brick inline (sem redirecionamento)
          setPaymentData({
            preferenceId: result.preferenceId,
            amount: result.amount,
            appointmentId: result.appointmentId,
            serviceName: selectedService.name,
            serviceDate: format(selectedDate, 'dd/MM/yyyy'),
            serviceTime: selectedTime,
          })
        } else {
          router.push(`/agendar/sucesso?id=${result.appointmentId}`)
        }
      } else {
        toast.error(result.error ?? 'Erro ao confirmar agendamento.')
      }
    })
  }

  const handleOpenProfile = () => {
    if (isAuthenticatedUser) {
      router.push('/perfil')
      return
    }

    toast('Faça login com Google para abrir seu perfil.')
    router.push('/?next=/perfil')
  }

  const canConfirm =
    !!barber &&
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

  const handleCancelPayment = async () => {
    if (!paymentData || cancellingPaymentStep) return
    setCancellingPaymentStep(true)
    await cancelPendingPayment(paymentData.appointmentId)
    setPaymentData(null)
    setCancellingPaymentStep(false)
  }

  const mpPublicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? ''

  // ─── Tela de pagamento inline (substitui o wizard de agendamento) ─────────
  if (paymentData) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        {/* Barra superior */}
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 py-4 bg-background/90 backdrop-blur-md border-b border-white/[0.06]">
          <button
            onClick={handleCancelPayment}
            disabled={cancellingPaymentStep}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white/80 transition-colors disabled:opacity-40"
          >
            <span className="text-base">←</span>
            {cancellingPaymentStep ? 'Cancelando...' : 'Voltar'}
          </button>
          <span className="flex-1 text-center text-xs font-bold uppercase tracking-[0.2em] text-foreground">
            Pagamento
          </span>
          <div className="w-16" />
        </div>

        <div className="flex flex-col gap-6 px-4 pt-6 pb-12 max-w-lg mx-auto w-full">
          {/* Resumo do agendamento */}
          <div className="bg-card border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/40">Resumo</p>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-foreground">{paymentData.serviceName}</span>
                <span className="text-xs text-white/50">
                  {paymentData.serviceDate} às {paymentData.serviceTime}
                </span>
              </div>
              <span className="text-base font-extrabold text-primary whitespace-nowrap">
                R$ {paymentData.amount.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          {/* Payment Brick */}
          {mpPublicKey ? (
            <PaymentBrick
              amount={paymentData.amount}
              preferenceId={paymentData.preferenceId}
              appointmentId={paymentData.appointmentId}
              publicKey={mpPublicKey}
              onSuccess={(apptId) => router.push(`/agendar/sucesso?id=${apptId}`)}
              onError={(msg) => toast.error(msg)}
            />
          ) : (
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 text-center">
              <p className="text-xs font-bold text-destructive uppercase tracking-wider">
                Chave pública do MercadoPago não configurada.
              </p>
              <p className="text-[10px] text-white/40 mt-1">
                Adicione NEXT_PUBLIC_MP_PUBLIC_KEY nas variáveis de ambiente.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0 pb-32 min-h-screen">
      {/* Header Premium */}
      <header className="flex flex-col items-center justify-center pt-10 pb-6 px-4">
        <div className="relative mb-6 flex w-full items-center justify-center">
          <div className="absolute h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
          <Image
            src={config?.logo_url ?? '/logo-barbearialeste.png'}
            alt="Leste Barbearia"
            width={180}
            height={180}
            className="relative h-auto w-36 object-contain animate-logo-glow drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
          />
        </div>
        <h1 className="text-foreground text-xs md:text-sm tracking-[0.15em] font-bold uppercase text-center">
          SELECIONE O SERVIÇO
        </h1>
        {isAuthenticatedUser && isAdmin && (
          <a href="/admin" className="text-[10px] text-primary font-bold mt-3 tracking-widest uppercase py-1 px-3 bg-primary/10 rounded-full">Painel Admin</a>
        )}
      </header>

      <div className="px-4 pt-2 flex flex-col gap-10 max-w-lg mx-auto w-full">

        {/* Secao 1: Servico — Grid 3 colunas */}
        <section>
          <div className="grid grid-cols-3 gap-3">
            {services.map((service) => {
              const isSelected = selectedService?.id === service.id;
              const iconPath = SERVICE_ICON_PATHS[service.icon_name ?? ''] ?? SERVICE_ICON_PATHS.scissors;
              return (
              <button
                key={service.id}
                onClick={() => handleServiceSelect(service)}
                className={[
                  'w-full h-[110px] flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-200',
                  isSelected
                    ? 'border-primary bg-primary/20 ring-2 ring-primary/40 shadow-[0_0_20px_rgba(80,100,255,0.25)] scale-[1.04]'
                    : 'border-white/[0.06] bg-[#1a1a1a] active:bg-[#222] active:scale-[0.97]',
                ].join(' ')}
              >
                <img
                  src={iconPath}
                  alt={service.name}
                  className={['w-8 h-8 object-contain select-none transition-opacity', isSelected ? 'invert opacity-100' : 'invert opacity-40'].join(' ')}
                  draggable={false}
                />
                <span className={['text-[10px] uppercase tracking-wider text-center leading-tight px-2 font-medium', isSelected ? 'text-white' : 'text-white/60'].join(' ')}>
                  {service.name}
                </span>
              </button>
            )})}</div>
        </section>

        {/* Secao 2: Barbeiro */}
        {selectedService && (
          <section ref={barberSectionRef} className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
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
                    src={barber?.photo_url ?? config?.barber_photo_url ?? '/barbearialeste.png'}
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
          <section ref={calendarSectionRef} className="mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center gap-4 w-full mb-8 max-w-[250px] mx-auto opacity-70">
               <div className="h-[1px] flex-1 bg-border"></div>
               <CalendarDays size={18} className="text-muted-foreground" />
               <div className="h-[1px] flex-1 bg-border"></div>
            </div>
            
            <div className="flex justify-center bg-card rounded-[2rem] p-5 card-shadow border border-border w-full max-w-[340px] mx-auto">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                handleDateSelect(date)
                if (date) scrollToRef(slotsSectionRef)
              }}
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
          <section ref={slotsSectionRef} className="mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
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

            {/* Nudge discreto — login Google */}
            <p className="text-[10px] text-zinc-600 text-center pt-1 leading-relaxed">
              Entre com Google e nunca preencha esses dados de novo.{' '}
              <a
                href={`/?next=/agendar`}
                className="text-zinc-500 underline underline-offset-2 hover:text-zinc-300 transition-colors"
              >
                Fazer login
              </a>
            </p>
          </section>
        )}

        {/* Meus agendamentos */}
        {canViewAppointments && (
          <div id="meus-agendamentos" className="mt-8 mb-[100px] max-w-[340px] mx-auto w-full scroll-mt-24">
            <MyAppointments
              cancellationWindowMinutes={config?.cancellation_window_minutes ?? 120}
            />
          </div>
        )}
        
        {/* Footer JN */}
        {config?.show_agency_brand !== false && (
          <div className="mt-auto pt-10 pb-10 text-center opacity-30 hover:opacity-100 transition-opacity">
            <a href="https://agenciajn.com.br" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[9px] uppercase tracking-widest font-extrabold text-foreground">
              <span>Desenvolvido por</span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="text-primary">Agência JN</span>
            </a>
          </div>
        )}

      </div>

      {/* Barra de confirmacao flutuante (CTA) */}
      <div className={`fixed bottom-[90px] left-0 right-0 px-4 z-40 transition-all duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${selectedTime ? 'translate-y-0 opacity-100 pointer-events-auto scale-100' : 'translate-y-full opacity-0 pointer-events-none scale-95'}`}>
        {/* Escolha de forma de pagamento (modo online com dinheiro permitido) */}
        {config?.payment_mode === 'online_obrigatorio' && config?.aceita_dinheiro && (
          <div className="max-w-[340px] mx-auto w-full mb-2">
            <div className="flex gap-1.5 p-1 bg-[#09090b]/95 backdrop-blur-xl border border-white/10 rounded-2xl">
              <button
                onClick={() => setPayCash(false)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${!payCash ? 'bg-primary text-primary-foreground' : 'text-white/40 hover:text-white/70'}`}
              >
                Pagar online (MP)
              </button>
              <button
                onClick={() => setPayCash(true)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${payCash ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                Pagar em dinheiro
              </button>
            </div>
          </div>
        )}
        {/* Aviso de pagamento online obrigatório (sem opção de dinheiro) */}
        {config?.payment_mode === 'online_obrigatorio' && !config?.aceita_dinheiro && (
          <div className="max-w-[340px] mx-auto w-full mb-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl">
              <span className="text-primary text-base">💳</span>
              <span className="text-[11px] text-primary/80 font-medium">Pagamento online via Mercado Pago</span>
            </div>
          </div>
        )}
         <div className="max-w-[340px] mx-auto w-full flex gap-2">
            <button
              onClick={() => setSelectedTime(null)}
              className="shrink-0 h-14 px-5 rounded-2xl text-xs font-extrabold tracking-[0.12em] uppercase text-white/50 border border-white/[0.08] hover:text-white/80 hover:border-white/20 transition-colors"
            >
              ← Voltar
            </button>
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm || isPending}
              className="flex-1 h-14 rounded-2xl text-xs font-extrabold tracking-[0.15em] uppercase bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-primary/50"
            >
              {isPending ? 'Confirmando...' : 'Confirmar'}
            </Button>
         </div>
      </div>

      {/* Banner PWA — aparece 1× por sessão, 5s após carregar */}
      {pwaBannerVisible && !isInstalled && (installPrompt || isIOS) && (
        <div className="fixed bottom-[72px] left-3 right-3 z-40 animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-[#18181b] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
            <span className="text-2xl shrink-0">📲</span>
            <div className="flex flex-col gap-0 flex-1 min-w-0">
              <span className="text-xs font-bold text-white leading-tight">Instale o app no celular</span>
              <span className="text-[11px] text-zinc-400 leading-tight">Acesse mais rápido, com notificações</span>
            </div>
            <button
              onClick={() => { setPwaBannerVisible(false); handleInstallClick() }}
              className="shrink-0 bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-xl"
            >
              Instalar
            </button>
            <button
              onClick={() => setPwaBannerVisible(false)}
              className="shrink-0 text-zinc-500 hover:text-zinc-300 p-1"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Nav (App-like) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#09090b]/95 backdrop-blur-xl border-t border-white/5 px-6 py-2 pb-safe z-50">
       <div className="max-w-md mx-auto flex items-center justify-between relative">

         <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1">
            <Home size={24} strokeWidth={2} />
            <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Início</span>
         </button>

         <button
           onClick={() => canViewAppointments ? router.push('/reservas') : toast('Faça login com Google para ver seu perfil e reservas')}
           className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1"
         >
            <CalendarDays size={24} strokeWidth={2} />
            <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Reservas</span>
         </button>

         <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="relative z-10 transition-transform hover:scale-105 active:scale-95 group">
             <div className="absolute inset-0 bg-primary rounded-full blur-[20px] opacity-20 group-hover:opacity-50 transition-opacity"></div>
             <div className="bg-[#18181b] border-2 border-white/10 p-3 h-16 w-16 rounded-full card-shadow shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center justify-center relative translate-y-[-20px]">
                 <Image
                    src={config?.bottom_logo_url ?? config?.logo_url ?? '/logo-barbearialeste.png'}
                    alt="Logo"
                    width={34}
                    height={34}
                    className="object-contain animate-shine"
                 />
             </div>
         </button>

        <button
           onClick={() => router.push('/loja')}
           className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1"
         >
           <ShoppingBag size={24} strokeWidth={2} />
           <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">Loja</span>
        </button>

         <button
           onClick={() => setMenuOpen(true)}
           className="flex flex-col items-center gap-1 min-w-[50px] text-muted-foreground hover:text-foreground transition-all hover:-translate-y-1"
         >
           <Menu size={24} strokeWidth={2} />
           <span className="text-[9px] uppercase tracking-[0.15em] font-extrabold mt-0.5">{isAdmin ? 'Admin' : 'Opções'}</span>
         </button>
       </div>
      </nav>

      {/* ── BOTÃO FLUTUANTE WHATSAPP ── */}
      {config?.whatsapp_number && (
        <a
          href={`https://wa.me/55${config.whatsapp_number.replace(/\D/g, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-[88px] right-4 z-50 w-13 h-13 rounded-full bg-[#25D366] shadow-[0_4px_20px_rgba(37,211,102,0.45)] flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
          style={{ width: 52, height: 52 }}
          aria-label="Falar no WhatsApp"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
          </svg>
        </a>
      )}

      {/* ── MODAL CAPTURA WHATSAPP ── */}
      {showWhatsCapture && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowWhatsCapture(false)} />
          <div className="relative bg-[#111] border-t border-white/[0.08] rounded-t-3xl px-6 pt-6 pb-10 flex flex-col gap-5 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-white/90">Seu WhatsApp</p>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                  Precisamos do seu número para enviar confirmações e lembretes.
                </p>
              </div>
              <button onClick={() => setShowWhatsCapture(false)} className="text-white/40 hover:text-white/70 transition-colors mt-0.5">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <Input
                type="tel"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                value={whatsInput}
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value)
                  setWhatsInput(formatted)
                  const nums = formatted.replace(/\D/g, '')
                  if (nums.length > 0 && nums.length < 11) setWhatsError('Informe um celular válido com DDD.')
                  else if (nums.length === 11 && nums[2] !== '9') setWhatsError('Deve começar com 9 após o DDD.')
                  else setWhatsError('')
                }}
                className="bg-white/[0.04] border-white/[0.08] text-white h-12 rounded-xl text-sm"
              />
              {whatsError && <p className="text-[10px] text-destructive font-bold px-1 uppercase tracking-wider">{whatsError}</p>}
            </div>
            <Button
              onClick={handleSaveWhats}
              disabled={savingWhats || whatsInput.replace(/\D/g, '').length !== 11}
              className="w-full h-12 rounded-xl text-xs font-extrabold tracking-[0.15em] uppercase bg-primary hover:bg-primary/90 disabled:opacity-50"
            >
              {savingWhats ? 'Salvando...' : 'Salvar e confirmar reserva'}
            </Button>
          </div>
        </div>
      )}

      {/* ── PAINEL OPÇÕES (slide-up) ── */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          {/* Painel */}
          <div className="relative bg-[#111] border-t border-white/8 rounded-t-3xl px-5 pb-safe pt-5 flex flex-col gap-1">
            {/* Handle */}
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />

            {/* Fechar */}
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-zinc-400 hover:text-white"
            >
              <X size={15} />
            </button>

            {isAdmin && (
              <MenuLink href="/admin" icon={<Menu size={18} />} label="Painel Admin" />
            )}

            {isAuthenticatedUser ? (
              <MenuLink href="/perfil" icon={<User size={18} />} label="Meu Perfil" />
            ) : (
              <MenuLink href="/?next=/perfil" icon={<User size={18} />} label="Entrar" />
            )}

            {isAuthenticatedUser && (
              <MenuLink href="/api/auth/signout" icon={<LogOut size={18} />} label="Sair da conta" />
            )}

            {/* Galeria aparece no menu Opções quando ativa */}
            {config?.enable_gallery && (
              <MenuLink href="/galeria" icon={<Images size={18} />} label="Galeria" />
            )}

            {config?.whatsapp_number && (
              <MenuLink
                href={`https://wa.me/55${config.whatsapp_number.replace(/\D/g, '')}`}
                icon={<MessageCircle size={18} />}
                label="WhatsApp"
                external
              />
            )}

            {config?.instagram_url && (
              <MenuLink
                href={config.instagram_url.startsWith('http') ? config.instagram_url : `https://instagram.com/${config.instagram_url.replace(/^@/, '')}`}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                    <circle cx="12" cy="12" r="4"/>
                    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/>
                  </svg>
                }
                label="Instagram"
                external
              />
            )}

            {config?.address && (
              <MenuLink
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.address)}`}
                icon={<MapPin size={18} />}
                label="Como chegar"
                sub={config.address}
                external
              />
            )}

            {/* Instalar App */}
            {!isInstalled && (installPrompt || isIOS) && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/8 w-full text-left"
              >
                <span className="text-emerald-500"><Download size={18} /></span>
                <div className="flex flex-col gap-0 flex-1 min-w-0">
                  <span className="text-sm font-semibold leading-tight">Instalar App</span>
                  <span className="text-[11px] text-emerald-400/60 leading-tight">Adicionar à tela inicial</span>
                </div>
              </button>
            )}

            <div className="h-px bg-white/5 my-2" />

            <MenuLink href="/termos" icon={<FileText size={16} />} label="Termos de Uso" subtle />
            <MenuLink href="/privacidade" icon={<Shield size={16} />} label="Política de Privacidade" subtle />

            <div className="pb-6" />
          </div>
        </div>
      )}

      {/* ── MODAL iOS: instrução "Adicionar à tela inicial" ── */}
      {showIOSTip && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowIOSTip(false)} />
          <div className="relative bg-[#111] border-t border-white/8 rounded-t-3xl px-5 pb-safe pt-5 flex flex-col gap-4">
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto" />
            <button
              onClick={() => setShowIOSTip(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-zinc-400 hover:text-white"
            >
              <X size={15} />
            </button>
            <div className="flex flex-col gap-1 pt-1">
              <span className="text-base font-bold text-white">Adicionar à tela inicial</span>
              <span className="text-xs text-zinc-400">Siga os passos abaixo no Safari:</span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span className="text-sm text-zinc-300 leading-snug">Toque no ícone de compartilhar <span className="inline-flex items-center gap-1 align-middle bg-white/10 px-1.5 py-0.5 rounded text-white"><Share size={12} /> Compartilhar</span> na barra inferior do Safari</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span className="text-sm text-zinc-300 leading-snug">Role para baixo e toque em <strong className="text-white">"Adicionar à Tela de Início"</strong></span>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span className="text-sm text-zinc-300 leading-snug">Toque em <strong className="text-white">"Adicionar"</strong> no canto superior direito</span>
              </div>
            </div>
            <button
              onClick={() => setShowIOSTip(false)}
              className="w-full bg-white/8 hover:bg-white/12 text-white font-semibold rounded-xl py-3 text-sm transition-colors mt-1"
            >
              Entendido
            </button>
            <div className="pb-4" />
          </div>
        </div>
      )}

    </div>
  )
}


// ─── Sub-componente: Meus Agendamentos ────────────────────────────────────
function MyAppointments({ cancellationWindowMinutes }: { cancellationWindowMinutes: number }) {
  type Appt = { id: string; date: string; start_time: string; services: { name: string; price: number } | null }
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [loaded, setLoaded] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    getMyAppointments().then(({ appointments: data }) => {
      setAppointments(data as Appt[])
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
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

  if (!loaded) return null

  const nextAppt = appointments.find((a) => parseISO(`${a.date}T${a.start_time}`) > now)

  if (!nextAppt) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#1a1a1a] px-5 py-5 flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-white/80">Nenhum agendamento futuro</p>
        <p className="text-xs text-white/40 leading-relaxed">Escolha um serviço acima para fazer sua reserva.</p>
      </div>
    )
  }

  const apptTime = parseISO(`${nextAppt.date}T${nextAppt.start_time}`)
  const diffMs = apptTime.getTime() - now.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffM = Math.floor((diffMs % 3600000) / 60000)
  const countdownText = diffH > 0 ? `${diffH}h ${diffM}min` : `${diffM} minutos`
  const deadline = new Date(apptTime.getTime() - cancellationWindowMinutes * 60000)
  const canCancel = now < deadline

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#1a1a1a] px-5 py-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Próximo agendamento</p>
          <p className="text-sm font-semibold text-white/90">{nextAppt.services?.name}</p>
          <p className="text-xs text-white/50">
            {format(parseISO(nextAppt.date), "dd 'de' MMMM", { locale: ptBR })} às {nextAppt.start_time?.slice(0, 5)}
          </p>
        </div>
        {canCancel && (
          <button
            onClick={() => handleCancel(nextAppt.id)}
            disabled={cancelling === nextAppt.id}
            className="text-[10px] font-bold uppercase tracking-widest text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50 mt-1 shrink-0"
          >
            {cancelling === nextAppt.id ? 'Cancelando...' : 'Cancelar'}
          </button>
        )}
      </div>
      <div className="border-t border-white/[0.06] pt-3 flex flex-col gap-0.5">
        <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Faltam</p>
        <p className="text-xl font-black text-white/90 tabular-nums">{countdownText}</p>
      </div>
    </div>
  )
}

// ─── Sub-componente: MenuItem do painel Opções ────────────────────────────
function MenuLink({
  href,
  icon,
  label,
  sub,
  external,
  subtle,
}: {
  href: string
  icon: React.ReactNode
  label: string
  sub?: string
  external?: boolean
  subtle?: boolean
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={[
        'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors',
        subtle
          ? 'text-zinc-600 hover:text-zinc-400 hover:bg-white/3'
          : 'text-zinc-300 hover:text-white hover:bg-white/8',
      ].join(' ')}
    >
      <span className={subtle ? 'text-zinc-600' : 'text-zinc-400'}>{icon}</span>
      <div className="flex flex-col gap-0 flex-1 min-w-0">
        <span className={['font-semibold leading-tight', subtle ? 'text-[12px]' : 'text-sm'].join(' ')}>
          {label}
        </span>
        {sub && (
          <span className="text-[11px] text-zinc-500 truncate mt-0.5">{sub}</span>
        )}
      </div>
    </a>
  )
}
