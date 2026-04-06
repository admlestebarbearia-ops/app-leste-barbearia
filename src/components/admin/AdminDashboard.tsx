'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseBrowser } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Camera, LogOut, Pause, Play, Menu, X, CalendarDays, Settings2, Scissors, Users, Images, ShieldCheck, ChevronDown, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { compressImageToWebP } from '@/lib/image-utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DomainModal } from '@/components/admin/DomainModal'
import {
  updateAppointmentStatus,
  deleteAppointment,
  toggleBlockClient,
  saveBusinessConfig,
  saveWorkingHours,
  addSpecialSchedule,
  removeSpecialSchedule,
  upsertService,
  toggleServiceActive,
  uploadImage,
  listUsers,
  setAdminRole,
  togglePauseStatus,
  fetchAdminGalleryPhotos,
  deleteGalleryPhoto,
  approveGalleryPhoto,
  uploadAdminGalleryPhoto,
  listBarbers,
  upsertBarber,
  toggleBarberActive,
  listProducts,
  upsertProduct,
  toggleProductActive,
  deleteProduct,
  uploadProductImage,
  listProductReservations,
  updateProductReservationStatus,
  deleteProductReservation,
} from '@/app/admin/actions'
import type {
  BusinessConfig,
  WorkingHours,
  SpecialSchedule,
  Service,
  Appointment,
  Barber,
  Product,
  ProductReservation,
  ProductReservationStatus,
} from '@/lib/supabase/types'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

type Tab = 'hoje' | 'configuracoes' | 'servicos' | 'barbeiros' | 'admins' | 'galeria' | 'produtos'

interface Props {
  config: BusinessConfig
  appointments: Appointment[]
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  services: Service[]
  products: Product[]
  initialProductReservations?: ProductReservation[]
  initialStandaloneReservations?: ProductReservation[]
  appointmentsError?: string | null
}

export function AdminDashboard({
  config,
  appointments,
  workingHours,
  specialSchedules,
  services,
  products,
  initialProductReservations = [],
  initialStandaloneReservations = [],
  appointmentsError,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('hoje')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false)
  const [pauseMessage, setPauseMessage] = useState(config.pause_message || '')
  const [pauseReturnTime, setPauseReturnTime] = useState(() => {
    if (!config.pause_return_time) return ''
    try { return new Date(config.pause_return_time).toTimeString().slice(0, 5) } catch { return '' }
  })

  // Upload de logo direto do header
  const headerLogoRef = useRef<HTMLInputElement>(null)
  const [headerLogoSrc, setHeaderLogoSrc] = useState(config.admin_logo_url ?? '/logo-barbearialeste.png')
  const [savingHeaderLogo, setSavingHeaderLogo] = useState(false)

  const handleHeaderLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSavingHeaderLogo(true)
    try {
      const compressed = await compressImageToWebP(file)
      const { url, error } = await uploadImage('logo', compressed, 'image/webp')
      if (error) { toast.error('Erro ao enviar logo: ' + error); setSavingHeaderLogo(false); return }
      const result = await saveBusinessConfig({ admin_logo_url: url })
      if (result.success) { setHeaderLogoSrc(url!); toast.success('Logo do painel atualizado!'); router.refresh() }
      else toast.error(result.error ?? 'Erro ao salvar.')
    } catch { toast.error('Erro ao processar imagem.') }
    setSavingHeaderLogo(false)
  }

  const handlePauseConfirm = async (val: boolean) => {
    const id = toast.loading(val ? 'Pausando expediente...' : 'Retornando expediente...')
    let returnTimestamp: string | null = null
    if (val && pauseReturnTime) {
      const d = new Date()
      const [h, m] = pauseReturnTime.split(':').map(Number)
      d.setHours(h, m, 0, 0)
      returnTimestamp = d.toISOString()
    }
    const res = await togglePauseStatus(val, val ? pauseMessage : null, returnTimestamp)
    if (res.success) {
      toast.success(val ? 'Sistema pausado.' : 'Sistema liberado.', { id })
      setIsPauseDialogOpen(false)
      router.refresh()
    } else {
      toast.error('Erro ao alterar status: ' + res.error, { id })
    }
  }

  // Estado local das reservas de produtos (atualizado via realtime)
  const [productReservations, setProductReservations] = React.useState<ProductReservation[]>(initialProductReservations)
  // Estado das reservas standalone da loja (/loja sem agendamento)
  const [standaloneReservations, setStandaloneReservations] = React.useState<ProductReservation[]>(initialStandaloneReservations)

  const productReservationsByAppt = React.useMemo(() => {
    const map: Record<string, ProductReservation[]> = {}
    for (const pr of productReservations) {
      if (!pr.appointment_id) continue
      if (!map[pr.appointment_id]) map[pr.appointment_id] = []
      map[pr.appointment_id].push(pr)
    }
    return map
  }, [productReservations])

  // Notificação realtime para reservas de produtos (visível em qualquer aba)
  useEffect(() => {
    const supabase = createSupabaseBrowser()
    const channel = supabase
      .channel('admin-product-reservations')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'product_reservations' },
        (payload: { new: Record<string, unknown> }) => {
          const r = payload.new
          const productName = (r.product_name_snapshot as string | null) ?? 'Produto'
          const clientPhone = (r.client_phone as string | null)
          toast.success(
            `🛍 Nova reserva: ${productName}${clientPhone ? ` — ${clientPhone}` : ''}`,
            { duration: 12000 }
          )
          try {
            const audio = new Audio('/bell.mp3')
            audio.volume = 0.5
            audio.play().catch(() => {})
          } catch {}
          // Atualiza estado local para aparecer no card imediatamente
          const newReservation = r as unknown as ProductReservation
          if (newReservation.appointment_id) {
            setProductReservations(prev => {
              if (prev.some(pr => pr.id === newReservation.id)) return prev
              return [...prev, newReservation]
            })
          } else {
            setStandaloneReservations(prev => {
              if (prev.some(pr => pr.id === newReservation.id)) return prev
              return [newReservation, ...prev]
            })
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'hoje', label: 'AGENDA' },
    { key: 'configuracoes', label: 'PREFERÊNCIAS' },
    { key: 'servicos', label: 'CATÁLOGO' },
    { key: 'barbeiros', label: 'BARBEIROS' },
    { key: 'produtos', label: 'LOJA' },
    { key: 'galeria', label: 'GALERIA' },
    { key: 'admins', label: 'SEGURANÇA' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-[#f4f4f5] font-sans selection:bg-white/20">
      {/* Drawer Overlay */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Drawer lateral */}
      <aside
        className={[
          'fixed top-0 right-0 z-50 h-full w-72 bg-neutral-950/90 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out',
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Cabeçalho do Drawer com logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Image
              src={headerLogoSrc}
              alt="Logo"
              width={32}
              height={32}
              className="w-8 h-8 object-contain"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white leading-tight">Painel Admin</span>
              <span className="text-[10px] text-zinc-500 leading-tight">Barbearia Leste</span>
            </div>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Itens de navegação */}
        <nav className="flex-1 flex flex-col gap-1 p-3 overflow-y-auto">
          {([
            { key: 'hoje',          label: 'Agenda',      icon: CalendarDays },
            { key: 'configuracoes', label: 'Preferências', icon: Settings2 },
            { key: 'servicos',      label: 'Catálogo',    icon: Scissors },
            { key: 'barbeiros',     label: 'Barbeiros',   icon: Users },
            { key: 'galeria',       label: 'Galeria',     icon: Images },
            { key: 'produtos',      label: 'Loja',        icon: Package },
            { key: 'admins',        label: 'Segurança',   icon: ShieldCheck },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTab(key); setIsDrawerOpen(false) }}
              className={[
                'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200',
                tab === key
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
              ].join(' ')}
            >
              <Icon size={18} className={tab === key ? 'text-white' : 'text-zinc-500'} />
              {label}
              {tab === key && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </button>
          ))}
        </nav>

        {/* Rodapé do Drawer */}
        <div className="px-5 py-4 border-t border-white/10">
          <a
            href="/api/auth/signout"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200"
          >
            <LogOut size={18} />
            Sair
          </a>
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-neutral-950/80 backdrop-blur-2xl border-b border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Logo — clicável para upload, sem bordas */}
            <button
              onClick={() => headerLogoRef.current?.click()}
              disabled={savingHeaderLogo}
              className="relative group shrink-0"
              title="Clique para trocar o logo do painel"
            >
              <Image
                src={headerLogoSrc}
                alt="Logo"
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                {savingHeaderLogo
                  ? <span className="text-[9px] text-white animate-pulse">...</span>
                  : <Camera size={13} className="text-white" />}
              </div>
            </button>
            <input ref={headerLogoRef} type="file" accept="image/*" className="hidden" onChange={handleHeaderLogoChange} />

            <div className="min-w-0">
              <span className="block font-bold text-sm text-white truncate">Painel Administrativo</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Botão Pausar Agendamentos */}
            <button
              onClick={() => setIsPauseDialogOpen(true)}
              className={`flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                config.is_paused
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
              }`}
            >
              {config.is_paused ? 'Retomar agenda' : 'Pausar agenda'}
            </button>

            {/* Menu Hambúrguer */}
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/20 transition-all"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Content Area com background mais limpo */}
      <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        {tab === 'hoje' && (
          <TabHoje
            appointments={appointments}
            displayPref={config.display_name_preference}
            onRefresh={() => router.refresh()}
            queryError={appointmentsError}
            productReservationsByAppt={productReservationsByAppt}
            standaloneReservations={standaloneReservations}
            onStandaloneUpdated={(id, newStatus) => {
              if (newStatus === 'deleted') {
                setStandaloneReservations(prev => prev.filter(r => r.id !== id))
              } else {
                setStandaloneReservations(prev =>
                  prev.map(r => r.id === id ? { ...r, status: newStatus } : r)
                )
              }
            }}
          />
        )}
        {tab === 'configuracoes' && (
          <TabConfiguracoes
            config={config}
            workingHours={workingHours}
            specialSchedules={specialSchedules}
            onRefresh={() => router.refresh()}
          />
        )}
        {tab === 'servicos' && (
          <TabServicos services={services} onRefresh={() => router.refresh()} />
        )}
        {tab === 'barbeiros' && (
          <TabBarbeiros />
        )}
        {tab === 'galeria' && (
          <TabGaleria />
        )}
        {tab === 'admins' && (
          <TabAdmins />
        )}
        {tab === 'produtos' && (
          <TabProdutos
            config={config}
            products={products}
            onRefresh={() => router.refresh()}
          />
        )}
        </div>
      </main>

      {/* Rodapé da agência */}
      <footer className="py-5 flex flex-col items-center gap-1.5">
        <p className="text-[10px] text-zinc-700 tracking-wide">
          Sistema desenvolvido por{' '}
          <a
            href="https://wa.me/5511940825120?text=Ol%C3%A1%2C+quero+saber+mais+sobre+ter+um+dom%C3%ADnio+pr%C3%B3prio+para+minha+barbearia"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 hover:text-white transition-colors font-semibold"
          >
            Agência JN
          </a>
        </p>
        <a
          href="https://wa.me/5511940825120?text=Ol%C3%A1%2C+quero+saber+mais+sobre+ter+um+dom%C3%ADnio+pr%C3%B3prio+para+minha+barbearia"
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
        >
          🌐 Ative seu domínio próprio
        </a>
      </footer>

      {/* Dialog de Pausa */}
      <Dialog open={isPauseDialogOpen} onOpenChange={setIsPauseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{config.is_paused ? 'Retomar Expediente' : 'Pausar Expediente'}</DialogTitle>
            <DialogDescription>
              {config.is_paused
                ? 'Deseja reabrir os agendamentos online agora?'
                : 'Defina uma mensagem e um horario de retorno (opcional) para avisar os clientes.'}
            </DialogDescription>
          </DialogHeader>

          {!config.is_paused && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="pauseMsg">Mensagem (ex: Sai para almoco)</Label>
                <Input
                  id="pauseMsg"
                  placeholder="Volto logo"
                  value={pauseMessage}
                  onChange={(e) => setPauseMessage(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pauseReturn">Retorno previsto às</Label>
                <Input
                  id="pauseReturn"
                  type="time"
                  value={pauseReturnTime}
                  onChange={(e) => setPauseReturnTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPauseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={config.is_paused ? 'default' : 'destructive'}
              onClick={() => handlePauseConfirm(!config.is_paused)}
            >
              {config.is_paused ? 'Retomar Agora' : 'Confirmar Pausa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ------------------------------------------------------------------
// Tab: Agenda — Calendário estilo iOS + lista vertical
// ------------------------------------------------------------------
function TabHoje({
  appointments,
  displayPref,
  onRefresh,
  queryError,
  productReservationsByAppt = {},
  standaloneReservations = [],
  onStandaloneUpdated,
}: {
  appointments: Appointment[]
  displayPref: string
  onRefresh: () => void
  queryError?: string | null
  productReservationsByAppt?: Record<string, ProductReservation[]>
  standaloneReservations?: ProductReservation[]
  onStandaloneUpdated?: (id: string, newStatus: 'reservado' | 'retirado' | 'cancelado' | 'deleted') => void
}) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [newBadge, setNewBadge] = useState(0)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const [calMonth, setCalMonth] = useState(() => todayStr.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [pendingAppts, setPendingAppts] = useState<Appointment[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setNotifPermission(result)
    if (result === 'granted') toast.success('Notificações do navegador ativadas!')
  }

  const sendBrowserNotif = (dateStr: string, time: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    const d = dateStr ? dateStr.split('-').reverse().join('/') : ''
    new Notification('📅 Novo agendamento — Barbearia Leste', {
      body: `${d} às ${time}`,
      icon: '/logo-barbearialeste.png',
    })
  }

  useEffect(() => {
    const supabase = createSupabaseBrowser()
    const channel = supabase
      .channel('admin-appointments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' },
        async (payload: { new: Record<string, unknown> }) => {
          const newRow = payload.new as unknown as Appointment
          const d = newRow.date ?? ''
          const t = newRow.start_time?.slice(0, 5) ?? ''
          toast.success(`Novo agendamento! ${d ? d.split('-').reverse().join('/') : ''} às ${t}`, { duration: 8000, icon: '📅' })
          sendBrowserNotif(d, t)
          // Som de notificação
          try {
            const audio = new Audio('/bell.mp3')
            audio.volume = 0.6
            audio.play().catch(() => {
              const ctx = new AudioContext()
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.frequency.value = 880
              gain.gain.setValueAtTime(0.3, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
              osc.start(ctx.currentTime)
              osc.stop(ctx.currentTime + 0.6)
            })
          } catch {}
          // Adicionar ao estado local imediatamente (com services buscados)
          try {
            const { data: svcData } = await supabase
              .from('services')
              .select('name, price, duration_minutes')
              .eq('id', newRow.service_id)
              .single()
            setPendingAppts(prev => {
              if (prev.some(a => a.id === newRow.id)) return prev
              return [...prev, { ...newRow, services: svcData ?? undefined }]
            })
          } catch {
            setPendingAppts(prev => {
              if (prev.some(a => a.id === newRow.id)) return prev
              return [...prev, newRow]
            })
          }
          setNewBadge((prev) => prev + 1)
          onRefresh()
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [onRefresh])

  // Mescla server appointments + realtime pending (sem duplicatas)
  const localAppointments = useMemo(() => {
    const serverFiltered = appointments.filter(a => !deletedIds.has(a.id))
    const serverIds = new Set(serverFiltered.map(a => a.id))
    const pending = pendingAppts.filter(a => !deletedIds.has(a.id) && !serverIds.has(a.id))
    return [...serverFiltered, ...pending].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      return (a.start_time ?? '').localeCompare(b.start_time ?? '')
    })
  }, [appointments, deletedIds, pendingAppts])

  // Mapa de data → agendamentos (sem os excluídos localmente)
  const apptByDate = useMemo(() => {
    return localAppointments.reduce<Record<string, Appointment[]>>((acc, a) => {
      if (!a.date) return acc
      if (!acc[a.date]) acc[a.date] = []
      acc[a.date].push(a)
      return acc
    }, {})
  }, [localAppointments])

  // Dados do calendário
  const [calYear, calMonthNum] = calMonth.split('-').map(Number)
  const firstDayOfWeek = new Date(calYear, calMonthNum - 1, 1).getDay() // 0=Dom
  const daysInMonth = new Date(calYear, calMonthNum, 0).getDate()
  const calMonthLabel = new Date(calYear, calMonthNum - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  const prevMonth = () => {
    const d = new Date(calYear, calMonthNum - 2, 1)
    setCalMonth(d.toISOString().slice(0, 7))
  }
  const nextMonth = () => {
    const d = new Date(calYear, calMonthNum, 1)
    setCalMonth(d.toISOString().slice(0, 7))
  }

  // 42 células = 6 linhas × 7 colunas
  const gridCells = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfWeek + 1
    if (dayNum < 1 || dayNum > daysInMonth) return null
    return dayNum
  })

  const dayAppts = selectedDay ? (apptByDate[selectedDay] ?? []).slice().sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? '')) : []

  const getDisplayName = (appt: Appointment) =>
    appt.profiles?.display_name ?? appt.client_name ?? 'Cliente'

  const handleStatus = async (id: string, status: 'cancelado' | 'faltou') => {
    setLoading(id + status)
    const result = await updateAppointmentStatus(id, status)
    if (result.success) {
      toast.success(status === 'cancelado' ? 'Agendamento cancelado.' : 'Marcado como faltou.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
    setLoading(null)
  }

  const handleBlock = async (clientId: string | null, block: boolean) => {
    if (!clientId) { toast.error('Somente clientes com login podem ser bloqueados.'); return }
    setLoading('block' + clientId)
    const result = await toggleBlockClient(clientId, block)
    if (result.success) {
      toast.success(block ? 'Cliente bloqueado.' : 'Cliente desbloqueado.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
    setLoading(null)
  }

  const handleDelete = async (id: string) => {
    setLoading('del' + id)
    const result = await deleteAppointment(id)
    if (result.success) {
      toast.success('Agendamento excluído.')
      setDeleteConfirm(null)
      setDeletedIds(prev => new Set(prev).add(id))
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao excluir.')
    }
    setLoading(null)
  }

  const formatSelectedDay = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }).toUpperCase()
  }

  const totalConfirmed = localAppointments.filter(a => a.status === 'confirmado').length

  return (
    <>
    <div className="flex flex-col gap-5">
      {/* Erro de configuração */}
      {queryError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex flex-col gap-1">
          <span className="text-xs font-black text-red-400 uppercase tracking-widest">Erro ao carregar agendamentos</span>
          <span className="text-[11px] text-red-300/70">{queryError}</span>
          <span className="text-[10px] text-zinc-500 mt-1">Verifique se SUPABASE_SERVICE_ROLE_KEY está configurada no Vercel e faça um novo deploy.</span>
        </div>
      )}

      {/* Notificações */}
      {notifPermission !== 'granted' && (
        <button
          onClick={requestNotifPermission}
          className="flex items-center gap-2 w-full bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400 font-semibold"
        >
          <span>🔔</span>
          Ativar notificações de novos agendamentos
        </button>
      )}

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold uppercase tracking-widest text-white">Agenda</h2>
          {newBadge > 0 && (
            <button
              onClick={() => { setNewBadge(0); onRefresh() }}
              className="text-[10px] font-black bg-emerald-500 text-black px-2 py-0.5 rounded-full animate-pulse"
            >
              +{newBadge} novo{newBadge > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <span className="text-[10px] font-bold text-zinc-500 bg-white/5 py-1 px-3 rounded-full border border-white/5">
          {totalConfirmed} confirmado(s)
        </span>
      </div>

      {/* ── CALENDÁRIO ESTILO iOS ── */}
      <div className="bg-neutral-900 rounded-2xl overflow-hidden">
        {/* Navegação de mês */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-all text-lg"
          >‹</button>
          <span className="text-sm font-bold text-white capitalize">{calMonthLabel}</span>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-all text-lg"
          >›</button>
        </div>

        {/* Dias da semana */}
        <div className="grid grid-cols-7 px-2 pb-1">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <div key={i} className="flex items-center justify-center text-[10px] font-bold text-zinc-600 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Grade de dias */}
        <div className="grid grid-cols-7 gap-y-1 px-2 pb-4">
          {gridCells.map((dayNum, i) => {
            if (!dayNum) return <div key={i} />
            const dateStr = `${calMonth}-${String(dayNum).padStart(2, '0')}`
            const appts = apptByDate[dateStr] ?? []
            const hasAppts = appts.length > 0
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDay

            return (
              <div key={i} className="flex items-center justify-center py-0.5">
                <button
                  onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                  className={[
                    'relative w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150 select-none',
                    isSelected
                      ? 'bg-blue-600'
                      : isToday
                        ? 'bg-white/15 ring-1 ring-white/30'
                        : 'hover:bg-white/8',
                  ].join(' ')}
                >
                  <span className={[
                    'text-[13px] font-semibold leading-none',
                    isSelected ? 'text-white' : isToday ? 'text-white' : hasAppts ? 'text-white' : 'text-zinc-600',
                  ].join(' ')}>
                    {dayNum}
                  </span>
                  {hasAppts && (
                    <span className={[
                      'absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-black',
                      isSelected ? 'bg-white text-blue-600' : 'bg-red-600 text-white',
                    ].join(' ')}>
                      {appts.length}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── LISTA DO DIA ── */}
      {selectedDay && (
        <div className="flex flex-col gap-3">
          {/* Título dinâmico */}
          <p className="text-[10px] font-black tracking-[0.15em] text-zinc-500 uppercase">
            Agendamentos — {formatSelectedDay(selectedDay)}
          </p>

          {dayAppts.length === 0 ? (
            <div className="text-center py-10 bg-neutral-900 rounded-2xl border border-white/5">
              <p className="text-zinc-600 text-sm">Nenhum agendamento neste dia.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {dayAppts.map((appt) => (
                <div
                  key={appt.id}
                  className={[
                    'bg-neutral-900 rounded-xl p-4 flex flex-col gap-3 transition-all',
                    appt.status === 'cancelado' ? 'opacity-60' : '',
                    appt.status === 'faltou' ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {/* Corpo do card — clicável para abrir modal */}
                  <div
                    className="flex items-start gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setSelectedAppt(appt)}
                  >
                    {/* Lado esquerdo — hora em destaque */}
                    <div className="flex flex-col items-center justify-center bg-white/5 rounded-xl px-3 py-2 min-w-[56px]">
                      <span className="text-2xl font-black text-white leading-none tabular-nums">
                        {appt.start_time?.slice(0, 5)}
                      </span>
                      {appt.services?.duration_minutes && (
                        <span className="text-[9px] text-zinc-500 mt-0.5 font-medium">
                          {appt.services.duration_minutes}min
                        </span>
                      )}
                    </div>

                    {/* Lado direito — detalhes */}
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-white truncate">
                          {getDisplayName(appt)}
                        </span>
                        {appt.client_id && (
                          <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                            Google
                          </span>
                        )}
                        {appt.profiles?.is_blocked && (
                          <span className="text-[9px] font-black bg-red-500/20 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                            Bloqueado
                          </span>
                        )}
                      </div>
                      {appt.services && (
                        <span className="text-xs text-zinc-400">{appt.services.name}</span>
                      )}
                      {(appt.client_email || appt.profiles?.email) && (
                        <span className="text-[10px] text-zinc-600 truncate">
                          {appt.client_email ?? appt.profiles?.email}
                        </span>
                      )}
                      {(appt.client_phone || appt.profiles?.phone) && (
                        <span className="text-[10px] text-zinc-600">
                          {appt.client_phone ?? appt.profiles?.phone}
                        </span>
                      )}
                      {appt.services?.price != null && (
                        <span className="text-xs font-bold text-zinc-300">
                          R$ {appt.services.price.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      {(productReservationsByAppt[appt.id] ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {productReservationsByAppt[appt.id].map((pr) => (
                            <span key={pr.id} className="text-[9px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded-full">
                              🛍 {pr.product_name_snapshot}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Badge de status */}
                    <div className="shrink-0">
                      <span className={[
                        'text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border',
                        appt.status === 'confirmado' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' :
                        appt.status === 'cancelado'  ? 'text-zinc-500 border-white/10 bg-white/5' :
                                                        'text-amber-400 border-amber-500/20 bg-amber-500/10',
                      ].join(' ')}>
                        {appt.status}
                      </span>
                    </div>
                  </div>

                  {/* Rodapé — botões de ação */}
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-white/5">
                    {appt.status === 'confirmado' && (
                      <>
                        {(appt.client_phone || appt.profiles?.phone) && (
                          <a
                            href={`https://wa.me/55${(appt.profiles?.phone ?? appt.client_phone ?? '').replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 rounded-lg"
                          >
                            WhatsApp
                          </a>
                        )}
                        <button
                          disabled={!!loading}
                          onClick={() => handleStatus(appt.id, 'faltou')}
                          className="text-[10px] font-bold text-amber-400 border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                        >
                          Faltou
                        </button>
                        <button
                          disabled={!!loading}
                          onClick={() => handleStatus(appt.id, 'cancelado')}
                          className="text-[10px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-2.5 py-1 rounded-lg disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                        {appt.client_id && !appt.profiles?.is_blocked && (
                          <button
                            disabled={!!loading}
                            onClick={() => handleBlock(appt.client_id, true)}
                            className="text-[10px] font-bold text-red-400 border border-red-500/20 bg-red-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                          >
                            Bloquear
                          </button>
                        )}
                        {appt.client_id && appt.profiles?.is_blocked && (
                          <button
                            disabled={!!loading}
                            onClick={() => handleBlock(appt.client_id, false)}
                            className="text-[10px] font-bold text-blue-400 border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                          >
                            Desbloquear
                          </button>
                        )}
                      </>
                    )}

                    {(appt.status === 'cancelado' || appt.status === 'faltou') && (
                      deleteConfirm === appt.id ? (
                        <>
                          <span className="text-[10px] text-zinc-500 self-center">Confirmar?</span>
                          <button
                            disabled={loading === 'del' + appt.id}
                            onClick={() => handleDelete(appt.id)}
                            className="text-[10px] font-black text-white bg-red-600 border border-red-500 px-2.5 py-1 rounded-lg disabled:opacity-40"
                          >
                            {loading === 'del' + appt.id ? '...' : 'Excluir'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-[10px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-2.5 py-1 rounded-lg"
                          >
                            Não
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(appt.id)}
                          className="text-[10px] font-bold text-red-400 border border-red-500/20 bg-red-500/10 px-2.5 py-1 rounded-lg"
                        >
                          Excluir
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── RESERVAS DA LOJA (standalone, sem agendamento) ── */}
      {standaloneReservations.length > 0 && (
        <StandaloneReservasSection
          reservations={standaloneReservations}
          onUpdated={onStandaloneUpdated}
        />
      )}
    </div>

    {/* ── Modal: Detalhes do Cliente ── */}
    <Dialog open={!!selectedAppt} onOpenChange={(open) => { if (!open) setSelectedAppt(null) }}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Detalhes do Agendamento</DialogTitle>
        </DialogHeader>
        {selectedAppt && (
          <div className="flex flex-col gap-4 py-2">
            {/* Info do serviço */}
            <div className="bg-white/5 rounded-xl px-4 py-3 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Serviço</span>
                <span className="text-sm font-semibold">{selectedAppt.services?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Horário</span>
                <span className="text-sm tabular-nums">{selectedAppt.date?.split('-').reverse().join('/')} às {selectedAppt.start_time?.slice(0, 5)}</span>
              </div>
              {selectedAppt.services?.price != null && (
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Valor</span>
                  <span className="text-sm font-bold text-emerald-400">R$ {selectedAppt.services.price.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
            </div>

            {/* Info do cliente */}
            <div className="bg-white/5 rounded-xl px-4 py-3 flex flex-col gap-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Cliente</span>
              <p className="text-sm font-semibold text-white">
                {getDisplayName(selectedAppt)}
              </p>
              {(selectedAppt.client_email || selectedAppt.profiles?.email) && (
                <p className="text-xs text-zinc-400 break-all">
                  {selectedAppt.client_email ?? selectedAppt.profiles?.email}
                </p>
              )}
              {(selectedAppt.client_phone || selectedAppt.profiles?.phone) && (
                <p className="text-xs text-zinc-400">
                  {selectedAppt.client_phone ?? selectedAppt.profiles?.phone}
                </p>
              )}
              {selectedAppt.client_id && (
                <span className="self-start text-[9px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-full">
                  Login Google
                </span>
              )}
            </div>

            {/* Produtos reservados */}
            {(productReservationsByAppt[selectedAppt.id] ?? []).length > 0 && (
              <div className="bg-white/5 rounded-xl px-4 py-3 flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Produtos reservados</span>
                {productReservationsByAppt[selectedAppt.id].map((pr) => (
                  <div key={pr.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">🛍</span>
                      <span className="text-sm text-white/90 truncate">{pr.product_name_snapshot}</span>
                      {pr.quantity > 1 && (
                        <span className="text-[10px] text-zinc-500">×{pr.quantity}</span>
                      )}
                    </div>
                    {pr.product_price_snapshot != null && (
                      <span className="text-xs font-bold text-emerald-400 shrink-0">
                        R$ {(pr.product_price_snapshot * pr.quantity).toFixed(2).replace('.', ',')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Botão WhatsApp */}
            {(selectedAppt.client_phone || selectedAppt.profiles?.phone) && (
              <a
                href={`https://wa.me/55${(selectedAppt.client_phone ?? selectedAppt.profiles?.phone ?? '').replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-[#25D366] text-white font-bold text-sm hover:bg-[#20b858] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                </svg>
                Contactar Cliente
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}

// ------------------------------------------------------------------
// StandaloneReservasSection — Reservas feitas diretamente na loja
// ------------------------------------------------------------------
function StandaloneReservasSection({
  reservations,
  onUpdated,
}: {
  reservations: ProductReservation[]
  onUpdated?: (id: string, newStatus: 'reservado' | 'retirado' | 'cancelado' | 'deleted') => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleStatus = async (id: string, status: 'retirado' | 'cancelado') => {
    setLoading(id + status)
    const result = await updateProductReservationStatus(id, status)
    if (result.success) {
      toast.success(status === 'retirado' ? 'Marcado como retirado.' : 'Reserva cancelada.')
      onUpdated?.(id, status)
    } else {
      toast.error(result.error ?? 'Erro.')
    }
    setLoading(null)
  }

  const handleDelete = async (id: string) => {
    setLoading('del' + id)
    const result = await deleteProductReservation(id)
    if (result.success) {
      toast.success('Reserva excluída.')
      onUpdated?.(id, 'deleted')
    } else {
      toast.error(result.error ?? 'Erro.')
    }
    setLoading(null)
    setDeleteConfirmId(null)
  }

  const active = reservations.filter((r) => r.status === 'reservado')
  const others = reservations.filter((r) => r.status !== 'reservado')

  return (
    <div className="flex flex-col gap-3 mt-2">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-extrabold uppercase tracking-widest text-white">
          Reservas da Loja
        </h2>
        {active.length > 0 && (
          <span className="text-[10px] font-black bg-violet-500 text-white px-2 py-0.5 rounded-full">
            {active.length}
          </span>
        )}
      </div>

      {reservations.map((r) => (
        <div
          key={r.id}
          className={[
            'bg-neutral-900 rounded-xl p-4 flex flex-col gap-3',
            r.status !== 'reservado' ? 'opacity-60' : '',
          ].join(' ')}
        >
          {/* Corpo */}
          <div className="flex items-start gap-3">
            {/* Imagem */}
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/5 shrink-0">
              {r.product_image_snapshot ? (
                <img
                  src={r.product_image_snapshot}
                  alt={r.product_name_snapshot}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package size={16} className="text-zinc-700" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <p className="text-sm font-bold text-white truncate">{r.product_name_snapshot}</p>
              <p className="text-xs font-bold text-emerald-400">
                R$ {(r.product_price_snapshot * r.quantity).toFixed(2).replace('.', ',')}
                {r.quantity > 1 && (
                  <span className="text-zinc-500 font-normal ml-1">× {r.quantity}</span>
                )}
              </p>
              {/* Cliente */}
              {(r.profiles?.display_name || r.profiles?.email || r.client_phone) && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  {r.profiles?.display_name ?? r.profiles?.email ?? r.client_phone}
                </p>
              )}
              {(r.profiles?.phone || r.client_phone) && (r.profiles?.display_name || r.profiles?.email) && (
                <p className="text-[10px] text-zinc-600">
                  {r.profiles?.phone ?? r.client_phone}
                </p>
              )}
              <p className="text-[9px] text-zinc-700 mt-0.5">
                {new Date(r.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>

            {/* Badge status */}
            <span className={[
              'text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border shrink-0',
              r.status === 'reservado'
                ? 'text-violet-400 border-violet-500/20 bg-violet-500/10'
                : r.status === 'retirado'
                ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10'
                : 'text-zinc-500 border-white/10 bg-white/5',
            ].join(' ')}>
              {r.status}
            </span>
          </div>

          {/* Ações */}
          <div className="flex gap-2 flex-wrap pt-1 border-t border-white/5">
            {r.status === 'reservado' && (
              <>
                <button
                  disabled={!!loading}
                  onClick={() => handleStatus(r.id, 'retirado')}
                  className="text-[10px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                >
                  Retirado
                </button>
                <button
                  disabled={!!loading}
                  onClick={() => handleStatus(r.id, 'cancelado')}
                  className="text-[10px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-2.5 py-1 rounded-lg disabled:opacity-40"
                >
                  Cancelar
                </button>
              </>
            )}
            {r.status === 'cancelado' && (
              deleteConfirmId === r.id ? (
                <>
                  <span className="text-[10px] text-zinc-500 self-center">Confirmar?</span>
                  <button
                    disabled={loading === 'del' + r.id}
                    onClick={() => handleDelete(r.id)}
                    className="text-[10px] font-black text-white bg-red-600 border border-red-500 px-2.5 py-1 rounded-lg disabled:opacity-40"
                  >
                    {loading === 'del' + r.id ? '...' : 'Excluir'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="text-[10px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-2.5 py-1 rounded-lg"
                  >
                    Não
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setDeleteConfirmId(r.id)}
                  className="text-[10px] font-bold text-red-400 border border-red-500/20 bg-red-500/10 px-2.5 py-1 rounded-lg"
                >
                  Excluir
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------
// Tab: Configuracoes
// ------------------------------------------------------------------
function TabConfiguracoes({
  config,
  workingHours,
  specialSchedules,
  onRefresh,
}: {
  config: BusinessConfig
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  onRefresh: () => void
}) {
  const [hours, setHours] = useState(workingHours)
  const [savingHours, setSavingHours] = useState(false)

  // Config geral
  const [requireGoogle, setRequireGoogle] = useState(config.require_google_login)
  const [cancelWindow, setCancelWindow] = useState(String(config.cancellation_window_minutes))
  const [slotInterval, setSlotInterval] = useState(String(config.slot_interval_minutes ?? 30))
  const [enableGallery, setEnableGallery] = useState(config.enable_gallery)
  const [allowClientUploads, setAllowClientUploads] = useState(config.allow_client_uploads)
  const [savingConfig, setSavingConfig] = useState(false)

  // Contatos e localização
  const [whatsapp, setWhatsapp] = useState(config.whatsapp_number ?? '')
  const [instagram, setInstagram] = useState(config.instagram_url ?? '')
  const [address, setAddress] = useState(config.address ?? '')
  const [savingContacts, setSavingContacts] = useState(false)

  // Logo
  const [logoPreview, setLogoPreview] = useState<string | null>(config.logo_url)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [savingLogo, setSavingLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  // Bottom Logo
  const [bottomLogoPreview, setBottomLogoPreview] = useState<string | null>(config.bottom_logo_url)
  const [bottomLogoFile, setBottomLogoFile] = useState<File | null>(null)
  const [savingBottomLogo, setSavingBottomLogo] = useState(false)
  const bottomLogoRef = useRef<HTMLInputElement>(null)

  // Folga
  const [folgaDate, setFolgaDate] = useState('')
  const [folgaMotivo, setFolgaMotivo] = useState('')
  const [addingFolga, setAddingFolga] = useState(false)

  // Accordion
  const [openSection, setOpenSection] = useState<string>('geral')
  const toggleSection = (id: string) => setOpenSection(prev => prev === id ? '' : id)

  const updateHour = (dayOfWeek: number, field: keyof WorkingHours, value: unknown) => {
    setHours((prev) =>
      prev.map((h) => {
        if (h.day_of_week !== dayOfWeek) return h
        const updated = { ...h, [field]: value }
        // Ao ativar um dia sem horários configurados, aplica defaults editáveis
        if (field === 'is_open' && value === true) {
          if (!updated.open_time)  updated.open_time  = '09:00'
          if (!updated.close_time) updated.close_time = '19:00'
        }
        return updated
      })
    )
  }

  const handleSaveHours = async () => {
    setSavingHours(true)
    const result = await saveWorkingHours(
      hours.map((h) => ({
        day_of_week: h.day_of_week,
        is_open: h.is_open,
        open_time: h.open_time,
        close_time: h.close_time,
        lunch_start: h.lunch_start,
        lunch_end: h.lunch_end,
      }))
    )
    setSavingHours(false)
    if (result.success) {
      toast.success('Horarios salvos.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleSaveContacts = async () => {
    setSavingContacts(true)
    const result = await saveBusinessConfig({
      whatsapp_number: whatsapp.trim() || null,
      instagram_url: instagram.trim() || null,
      address: address.trim() || null,
    })
    setSavingContacts(false)
    if (result.success) {
      toast.success('Contatos e endereço salvos.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleSaveConfig = async () => {
    const window_minutes = parseInt(cancelWindow, 10)
    if (isNaN(window_minutes) || window_minutes < 0) {
      toast.error('Janela de cancelamento invalida.')
      return
    }
    setSavingConfig(true)
    const result = await saveBusinessConfig({
      require_google_login: requireGoogle,
      cancellation_window_minutes: window_minutes,
      slot_interval_minutes: parseInt(slotInterval, 10) || 30,
      enable_gallery: enableGallery,
      allow_client_uploads: allowClientUploads,
    })
    setSavingConfig(false)
    if (result.success) {
      toast.success('Configuracoes salvas.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const webpDataUrl = await compressImageToWebP(file)
      // Substitui o File original por um objeto compatível com lógica posterior
      const newFile = new File([await (await fetch(webpDataUrl)).blob()], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' })
      setLogoFile(newFile)
      setLogoPreview(webpDataUrl)
    } catch (err) {
      toast.error('Erro ao converter imagem')
    }
  }

  const handleBottomLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const webpDataUrl = await compressImageToWebP(file)
      const newFile = new File([await (await fetch(webpDataUrl)).blob()], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' })
      setBottomLogoFile(newFile)
      setBottomLogoPreview(webpDataUrl)
    } catch (err) {
      toast.error('Erro ao converter imagem')
    }
  }

  const handleSaveLogo = async () => {
    if (!logoFile || !logoPreview) return
    setSavingLogo(true)
    const { url, error } = await uploadImage('logo', logoPreview, logoFile.type)
    if (error) { toast.error('Erro ao enviar logo: ' + error); setSavingLogo(false); return }
    const result = await saveBusinessConfig({ logo_url: url })
    setSavingLogo(false)
    if (result.success) {
      toast.success('Logo atualizada.')
      setLogoFile(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleSaveBottomLogo = async () => {
    if (!bottomLogoFile || !bottomLogoPreview) return
    setSavingBottomLogo(true)
    const { url, error } = await uploadImage('logo', bottomLogoPreview, bottomLogoFile.type)
    if (error) { toast.error('Erro ao enviar logo do painel inferior: ' + error); setSavingBottomLogo(false); return }
    const result = await saveBusinessConfig({ bottom_logo_url: url })
    setSavingBottomLogo(false)
    if (result.success) {
      toast.success('Logo do menu inferior atualizada.')
      setBottomLogoFile(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleAddFolga = async () => {
    if (!folgaDate) { toast.error('Selecione uma data.'); return }
    setAddingFolga(true)
    const result = await addSpecialSchedule({
      date: folgaDate,
      is_closed: true,
      reason: folgaMotivo.trim() || null,
      open_time: null,
      close_time: null,
    })
    setAddingFolga(false)
    if (result.success) {
      toast.success('Folga/feriado adicionado.')
      setFolgaDate('')
      setFolgaMotivo('')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const handleRemoveFolga = async (id: string) => {
    const result = await removeSpecialSchedule(id)
    if (result.success) { toast.success('Removido.'); onRefresh() }
    else toast.error(result.error ?? 'Erro.')
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── ACCORDION 1: Geral & Logos ── */}
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('geral')}
          className="w-full flex items-center justify-between px-4 py-4 bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Geral &amp; Logos</span>
            <span className="text-xs text-zinc-500">Logos, permissões e regras de uso</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${openSection === 'geral' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'geral' && (
          <div className="border-t border-white/5 px-4 py-5 flex flex-col gap-6">

            {/* Logo Principal */}
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Logo Principal</h3>
              <div className="flex items-center gap-4">
                <button onClick={() => logoRef.current?.click()} className="w-20 h-20 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors shrink-0">
                  {logoPreview ? (
                    <Image src={logoPreview} alt="Logo" width={80} height={80} className="object-contain w-full h-full" />
                  ) : (
                    <span className="text-xs text-muted-foreground text-center px-2">Sem logo</span>
                  )}
                </button>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                <div className="flex flex-col gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>Trocar imagem</Button>
                  {logoFile && <Button size="sm" onClick={handleSaveLogo} disabled={savingLogo}>{savingLogo ? 'Enviando...' : 'Salvar logo'}</Button>}
                </div>
              </div>
            </section>

            {/* Logo Menu Inferior */}
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Logo Menu Inferior</h3>
              <div className="flex items-center gap-4">
                <button onClick={() => bottomLogoRef.current?.click()} className="w-20 h-20 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors shrink-0">
                  {bottomLogoPreview ? (
                    <Image src={bottomLogoPreview} alt="Logo Bottom" width={80} height={80} className="object-contain w-full h-full" />
                  ) : (
                    <span className="text-xs text-muted-foreground text-center px-2">Sem logo</span>
                  )}
                </button>
                <input ref={bottomLogoRef} type="file" accept="image/*" className="hidden" onChange={handleBottomLogoChange} />
                <div className="flex flex-col gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => bottomLogoRef.current?.click()}>Trocar menu logo</Button>
                  {bottomLogoFile && <Button size="sm" onClick={handleSaveBottomLogo} disabled={savingBottomLogo}>{savingBottomLogo ? 'Enviando...' : 'Salvar logo inferior'}</Button>}
                </div>
              </div>
            </section>

            {/* Configurações Gerais */}
            <section className="flex flex-col gap-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Configurações Gerais</h3>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm text-foreground">Exigir login com Google</span>
                  <span className="text-xs text-muted-foreground">Apenas clientes logados poderão agendar.</span>
                </div>
                <Switch checked={requireGoogle} onCheckedChange={setRequireGoogle} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm text-foreground">Exibir Galeria de Fotos</span>
                  <span className="text-xs text-muted-foreground">Aparece aba Galeria no app dos clientes.</span>
                </div>
                <Switch checked={enableGallery} onCheckedChange={setEnableGallery} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-sm text-foreground">Upload de fotos por clientes</span>
                  <span className="text-xs text-muted-foreground">Clientes enviam fotos para aprovação antes da galeria.</span>
                </div>
                <Switch checked={allowClientUploads} onCheckedChange={setAllowClientUploads} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Prazo mínimo para cancelamento</Label>
                <p className="text-[11px] text-muted-foreground/70">Ex: 60 = cliente pode cancelar até 1h antes. 0 = a qualquer momento.</p>
                <div className="flex items-center gap-2 mt-1">
                  <Input type="number" min="0" value={cancelWindow} onChange={(e) => setCancelWindow(e.target.value)} className="h-9 w-24" />
                  <span className="text-xs text-muted-foreground">minutos antes</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Intervalo entre horários disponíveis</Label>
                <p className="text-[11px] text-muted-foreground/70">Define o espaçamento entre slots na agenda. Ex: 15min → 09:00, 09:15, 09:30...</p>
                <select
                  value={slotInterval}
                  onChange={(e) => setSlotInterval(e.target.value)}
                  className="h-9 w-36 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring"
                >
                  {[5, 10, 15, 20, 30, 60].map((v) => (
                    <option key={v} value={String(v)}>{v} minutos</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleSaveConfig} disabled={savingConfig} size="sm">
                {savingConfig ? 'Salvando...' : 'Salvar configurações'}
              </Button>
            </section>

            {/* Domínio */}
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Domínio</h3>
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Domínio próprio</span>
                <p className="text-xs text-muted-foreground">Seu site está em lestebarbearia.agenciajn.com.br. Para ter um domínio próprio, entre em contato.</p>
                <div className="mt-1"><DomainModal /></div>
              </div>
            </section>

          </div>
        )}
      </div>

      {/* ── ACCORDION 2: Localização & Redes Sociais ── */}
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('social')}
          className="w-full flex items-center justify-between px-4 py-4 bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Localização &amp; Redes Sociais</span>
            <span className="text-xs text-zinc-500">WhatsApp, Instagram e endereço</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${openSection === 'social' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'social' && (
          <div className="border-t border-white/5 px-4 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">WhatsApp (somente números, com DDD)</Label>
              <p className="text-[11px] text-muted-foreground/70">Ex: 11999998888 — aparece como link no menu do app</p>
              <Input type="tel" placeholder="11999998888" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ''))} className="h-9" maxLength={11} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Instagram (usuário ou URL)</Label>
              <p className="text-[11px] text-muted-foreground/70">Ex: @lestebarbearia</p>
              <Input type="text" placeholder="@lestebarbearia" value={instagram} onChange={(e) => setInstagram(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Endereço (para Google Maps)</Label>
              <p className="text-[11px] text-muted-foreground/70">Ex: Rua das Flores, 123 – São Paulo, SP</p>
              <Input type="text" placeholder="Rua das Flores, 123 – São Paulo, SP" value={address} onChange={(e) => setAddress(e.target.value)} className="h-9" />
            </div>
            <Button onClick={handleSaveContacts} disabled={savingContacts} size="sm">
              {savingContacts ? 'Salvando...' : 'Salvar contatos'}
            </Button>
          </div>
        )}
      </div>

      {/* ── ACCORDION 3: Horário de Funcionamento ── */}
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('horarios')}
          className="w-full flex items-center justify-between px-4 py-4 bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Horário de Funcionamento</span>
            <span className="text-xs text-zinc-500">Dias da semana, almoço e folgas</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${openSection === 'horarios' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'horarios' && (
          <div className="border-t border-white/5 px-4 py-5 flex flex-col gap-6">

            {/* Horários semanais */}
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Horários semanais</h3>
              <div className="flex flex-col gap-2">
                {hours.map((h) => (
                  <div key={h.day_of_week} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{DAYS[h.day_of_week]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{h.is_open ? 'Aberto' : 'Fechado'}</span>
                        <Switch checked={h.is_open} onCheckedChange={(v) => updateHour(h.day_of_week, 'is_open', v)} />
                      </div>
                    </div>
                    {h.is_open && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <div className="flex flex-col gap-1 flex-1">
                            <Label className="text-xs text-muted-foreground">Abertura</Label>
                            <input type="time" value={h.open_time ?? '09:00'} onChange={(e) => updateHour(h.day_of_week, 'open_time', e.target.value || null)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring" />
                          </div>
                          <div className="flex flex-col gap-1 flex-1">
                            <Label className="text-xs text-muted-foreground">Fechamento</Label>
                            <input type="time" value={h.close_time ?? '19:00'} onChange={(e) => updateHour(h.day_of_week, 'close_time', e.target.value || null)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring" />
                          </div>
                        </div>
                        <details className="group">
                          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none list-none flex items-center gap-1">
                            <span className="group-open:hidden">+ Configurar horário de almoço</span>
                            <span className="hidden group-open:inline">− Ocultar almoço</span>
                          </summary>
                          <div className="flex gap-2 mt-2">
                            <div className="flex flex-col gap-1 flex-1">
                              <Label className="text-xs text-muted-foreground">Início almoço</Label>
                              <input type="time" value={h.lunch_start ?? ''} onChange={(e) => updateHour(h.day_of_week, 'lunch_start', e.target.value || null)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring" />
                            </div>
                            <div className="flex flex-col gap-1 flex-1">
                              <Label className="text-xs text-muted-foreground">Fim almoço</Label>
                              <input type="time" value={h.lunch_end ?? ''} onChange={(e) => updateHour(h.day_of_week, 'lunch_end', e.target.value || null)} className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring" />
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button onClick={handleSaveHours} disabled={savingHours} size="sm">
                {savingHours ? 'Salvando...' : 'Salvar horários'}
              </Button>
            </section>

            {/* Folgas e Feriados */}
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Folgas e Feriados</h3>
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Data</Label>
                  <input type="date" value={folgaDate} onChange={(e) => setFolgaDate(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Motivo (opcional)</Label>
                  <Input value={folgaMotivo} onChange={(e) => setFolgaMotivo(e.target.value)} placeholder="Ex: Feriado nacional" className="h-9" />
                </div>
                <Button size="sm" onClick={handleAddFolga} disabled={addingFolga}>
                  {addingFolga ? 'Adicionando...' : 'Adicionar folga'}
                </Button>
              </div>
              {specialSchedules.length > 0 && (
                <div className="flex flex-col gap-2">
                  {specialSchedules.map((ss) => (
                    <div key={ss.id} className="flex items-center justify-between bg-card/50 border border-border/50 rounded-xl px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm text-foreground">
                          {new Date(ss.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                        </span>
                        {ss.reason && <span className="text-xs text-muted-foreground">{ss.reason}</span>}
                      </div>
                      <button onClick={() => handleRemoveFolga(ss.id)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        )}
      </div>

      {/* Footer */}
      {config.show_agency_brand && (
        <p className="text-center text-xs text-muted-foreground pb-4">
          Sistema desenvolvido por Agencia JN
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Tab: Servicos
// ------------------------------------------------------------------
const ADMIN_ICON_OPTIONS: { key: string; icon: React.ReactNode; label: string }[] = [
  { key: 'scissors', icon: <img src="/barber-icon/scissor-icon.svg"                   alt="" className="w-5 h-5 invert opacity-80" />, label: 'Tesoura'    },
  { key: 'smile',    icon: <img src="/barber-icon/beard-icon.svg"                     alt="" className="w-5 h-5 invert opacity-80" />, label: 'Barba'      },
  { key: 'crown',    icon: <img src="/barber-icon/barber-svgrepo-com.svg"             alt="" className="w-5 h-5 invert opacity-80" />, label: 'Premium'    },
  { key: 'sparkles', icon: <img src="/barber-icon/hair-salon-icon.svg"                alt="" className="w-5 h-5 invert opacity-80" />, label: 'Tratamento' },
  { key: 'zap',      icon: <img src="/barber-icon/electric-trimmer-icon.svg"          alt="" className="w-5 h-5 invert opacity-80" />, label: 'Express'    },
  { key: 'star',     icon: <img src="/barber-icon/man-hair-icon.svg"                  alt="" className="w-5 h-5 invert opacity-80" />, label: 'Corte'      },
  { key: 'flame',    icon: <img src="/barber-icon/straight-barber-razor-icon.svg"     alt="" className="w-5 h-5 invert opacity-80" />, label: 'Navalha'    },
  { key: 'droplets', icon: <img src="/barber-icon/hairdryer-icon.svg"                 alt="" className="w-5 h-5 invert opacity-80" />, label: 'Secagem'    },
  { key: 'knife',    icon: <img src="/barber-icon/barber-knife-svgrepo-com.svg"       alt="" className="w-5 h-5 invert opacity-80" />, label: 'Faca'       },
  { key: 'man',      icon: <img src="/barber-icon/bearded-man-icon.svg"               alt="" className="w-5 h-5 invert opacity-80" />, label: 'Barbudo'    },
]

function TabServicos({
  services,
  onRefresh,
}: {
  services: Service[]
  onRefresh: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editDuration, setEditDuration] = useState('')
  const [editIcon, setEditIcon] = useState('scissors')
  const [saving, setSaving] = useState(false)

  // Novo servico
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newDuration, setNewDuration] = useState('30')
  const [newIcon, setNewIcon] = useState('scissors')

  const startEdit = (svc: Service) => {
    setEditingId(svc.id)
    setEditName(svc.name)
    setEditPrice(String(svc.price))
    setEditDuration(String(svc.duration_minutes))
    setEditIcon(svc.icon_name ?? 'scissors')
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const price = parseFloat(editPrice)
    const duration = parseInt(editDuration, 10)
    if (isNaN(price) || isNaN(duration)) { toast.error('Valores invalidos.'); return }
    setSaving(true)
    const result = await upsertService({ id: editingId, name: editName.trim(), price, duration_minutes: duration, icon_name: editIcon })
    setSaving(false)
    if (result.success) {
      toast.success('Servico atualizado.')
      setEditingId(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const handleToggle = async (id: string, is_active: boolean) => {
    const result = await toggleServiceActive(id, !is_active)
    if (result.success) { toast.success(!is_active ? 'Servico ativado.' : 'Servico desativado.'); onRefresh() }
    else toast.error(result.error ?? 'Erro.')
  }

  const handleCreateNew = async () => {
    const price = parseFloat(newPrice)
    const duration = parseInt(newDuration, 10)
    if (!newName.trim() || isNaN(price) || isNaN(duration)) {
      toast.error('Preencha todos os campos corretamente.')
      return
    }
    setSaving(true)
    const result = await upsertService({ name: newName.trim(), price, duration_minutes: duration, icon_name: newIcon })
    setSaving(false)
    if (result.success) {
      toast.success('Servico criado.')
      setShowNew(false)
      setNewName('')
      setNewPrice('')
      setNewDuration('30')
      setNewIcon('scissors')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-foreground/80">Catálogo de Serviços</h3>
        <Button size="sm" variant="outline" onClick={() => setShowNew(!showNew)}>
          {showNew ? 'Cancelar' : '+ Novo'}
        </Button>
      </div>

      {showNew && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Degrade" className="h-9" />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Preco (R$)</Label>
              <Input type="number" min="0" step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Duracao (min)</Label>
              <Input type="number" min="5" step="5" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} className="h-9" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Ícone</Label>
            <div className="flex flex-wrap gap-1.5">
              {ADMIN_ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setNewIcon(opt.key)}
                  className={`flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-lg border transition-all ${newIcon === opt.key ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-foreground/30'}`}
                >
                  {opt.icon}
                  <span className="text-[9px] leading-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={handleCreateNew} disabled={saving}>
            {saving ? 'Salvando...' : 'Criar serviço'}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {services.map((svc) => (
          <div
            key={svc.id}
            className={[
              'bg-card border rounded-xl p-4 flex flex-col gap-3 transition-opacity',
              !svc.is_active ? 'opacity-50' : '',
              editingId === svc.id ? 'border-primary/40' : 'border-border',
            ].join(' ')}
          >
            {editingId === svc.id ? (
              <>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-9" />
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <Label className="text-xs text-muted-foreground">Preco</Label>
                    <Input type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="h-9" />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <Label className="text-xs text-muted-foreground">Duracao (min)</Label>
                    <Input type="number" min="5" step="5" value={editDuration} onChange={(e) => setEditDuration(e.target.value)} className="h-9" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Ícone</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ADMIN_ICON_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setEditIcon(opt.key)}
                        className={`flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-lg border transition-all ${editIcon === opt.key ? 'bg-primary/20 border-primary text-primary' : 'border-border text-muted-foreground hover:border-foreground/30'}`}
                      >
                        {opt.icon}
                        <span className="text-[9px] leading-tight">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="flex-1">
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="flex-1">
                    Cancelar
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{svc.name}</span>
                  <span className="text-xs text-muted-foreground">
                    R&#36; {svc.price.toFixed(2).replace('.', ',')} &bull; {svc.duration_minutes} min
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(svc)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Editar
                  </button>
                  <Switch
                    checked={svc.is_active}
                    onCheckedChange={() => handleToggle(svc.id, svc.is_active)}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Admins ─────────────────────────────────────────────────────────
function TabAdmins() {
  const [users, setUsers] = useState<
    { id: string; email: string | null; is_admin: boolean; is_blocked: boolean; created_at: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { users: data } = await listUsers()
    setUsers(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    setTogglingId(userId)
    const result = await setAdminRole(userId, !currentIsAdmin)
    if (result.success) {
      toast.success(currentIsAdmin ? 'Admin removido.' : 'Admin adicionado.')
      await load()
    } else {
      toast.error(result.error ?? 'Erro ao alterar permissao.')
    }
    setTogglingId(null)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 pt-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />
        ))}
      </div>
    )
  }

  const admins = users.filter((u) => u.is_admin)
  const others = users.filter((u) => !u.is_admin)

  return (
    <div className="flex flex-col gap-6 pt-2">
      <div>
        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Como funciona</p>
        <p className="text-sm text-muted-foreground leading-snug">
          Aqui voce ve todos os usuarios que ja fizeram login no sistema. Ative o toggle para dar ou remover acesso de Admin.
        </p>
      </div>

      {users.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum usuario cadastrado ainda.
        </p>
      )}

      {admins.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Admins atuais</p>
          {admins.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {u.email ?? 'Email nao disponivel'}
                </span>
                <span className="text-xs text-primary">Admin</span>
              </div>
              <Switch
                checked={true}
                onCheckedChange={() => handleToggleAdmin(u.id, true)}
                disabled={togglingId === u.id}
              />
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Outros usuarios</p>
          {others.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl p-4"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm text-foreground truncate">
                  {u.email ?? 'Email nao disponivel'}
                </span>
                <span className="text-xs text-muted-foreground">Cliente</span>
              </div>
              <Switch
                checked={false}
                onCheckedChange={() => handleToggleAdmin(u.id, false)}
                disabled={togglingId === u.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── Tab: Galeria ───────────────────────────────────────────────────
function TabGaleria() {
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  
  const loadPhotos = async () => {
    setLoading(true)
    const { data } = await fetchAdminGalleryPhotos()
    setPhotos(data || [])
    setLoading(false)
  }
  
  useEffect(() => {
    loadPhotos()
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploading(true)
      const webpDataUrl = await compressImageToWebP(file)
      const res = await uploadAdminGalleryPhoto(webpDataUrl, 'image/webp')
      if (res.success) {
        toast.success('Foto enviada com sucesso!')
        loadPhotos()
      } else {
        toast.error('Erro: ' + res.error)
      }
    } catch (err) {
      toast.error('Erro ao processar imagem')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar foto da galeria?')) return
    const res = await deleteGalleryPhoto(id)
    if (res.success) {
      toast.success('Foto removida')
      loadPhotos()
    } else {
      toast.error('Erro: ' + res.error)
    }
  }

  const handleApprove = async (id: string) => {
    const res = await approveGalleryPhoto(id)
    if (res.success) {
      toast.success('Foto aprovada!')
      loadPhotos()
    } else {
      toast.error('Erro: ' + res.error)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold uppercase tracking-widest text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
          Sua Galeria
        </h2>
        <Label className="cursor-pointer text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 py-2 px-4 rounded-full border border-emerald-400/20 transition-all">
          {uploading ? 'Enviando...' : 'Nova Foto'}
          <Input 
            type="file" 
            accept="image/*" 
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </Label>
      </div>

      {loading ? (
        <p className="text-center text-zinc-500 uppercase tracking-widest text-xs py-10">Carregando...</p>
      ) : photos.length === 0 ? (
        <p className="text-center text-zinc-500 uppercase tracking-widest text-xs py-10">Nenhuma foto na galeria.</p>
      ) : (
        <div className="grid justify-items-center sm:grid-cols-2 gap-4">
          {photos.map(p => (
            <div key={p.id} className="relative group bg-white/[0.03] backdrop-blur-md rounded-2xl p-2 border border-white/10 w-full">
              <img src={p.url} alt="Galeria" className="w-full h-48 object-cover rounded-xl" />
              <div className="flex justify-between items-center mt-3 px-1">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {p.status === 'approved' ? 'Pública' : 'Pendente'}
                </span>
                <div className="flex gap-2">
                  {p.status === 'pending' && (
                    <button onClick={() => handleApprove(p.id)} className="text-[10px] uppercase font-extrabold tracking-widest text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 flex items-center rounded-lg">
                      Aprovar
                    </button>
                  )}
                  <button onClick={() => handleDelete(p.id)} className="text-[10px] uppercase font-extrabold tracking-widest text-red-500 border border-red-500/20 bg-red-500/10 px-2 py-1 rounded-lg">
                    X
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── TabBarbeiros ─────────────────────────── */
function TabBarbeiros() {
  const router = useRouter()
  const [barbers, setBarbers] = useState<Barber[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Barber | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)

  const [fName, setFName] = useState('')
  const [fNickname, setFNickname] = useState('')
  const [fPhotoUrl, setFPhotoUrl] = useState('')
  const [fActive, setFActive] = useState(true)
  const photoRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    setLoading(true)
    const res = await listBarbers()
    if (res.data) setBarbers(res.data as Barber[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setFName(''); setFNickname(''); setFPhotoUrl(''); setFActive(true)
    setIsNew(true)
  }

  const openEdit = (b: Barber) => {
    setIsNew(false)
    setEditing(b)
    setFName(b.name)
    setFNickname(b.nickname ?? '')
    setFPhotoUrl(b.photo_url ?? '')
    setFActive(b.is_active)
  }

  const closeForm = () => { setEditing(null); setIsNew(false) }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await compressImageToWebP(file)
      const { url, error } = await uploadImage('barbeiro-foto', compressed, 'image/webp')
      if (error) { toast.error('Erro ao enviar foto: ' + error); return }
      setFPhotoUrl(url!)
      toast.success('Foto enviada!')
    } catch { toast.error('Erro ao processar imagem.') }
  }

  const handleSave = async () => {
    if (!fName.trim()) { toast.error('Nome é obrigatório.'); return }
    setSaving(true)
    const res = await upsertBarber({
      id: editing?.id,
      name: fName.trim(),
      nickname: fNickname.trim() || null,
      photo_url: fPhotoUrl || null,
      is_active: fActive,
    })
    if (res.success) {
      toast.success(isNew ? 'Barbeiro cadastrado!' : 'Barbeiro atualizado!')
      closeForm()
      await load()
      router.refresh()
    } else {
      toast.error(res.error ?? 'Erro ao salvar.')
    }
    setSaving(false)
  }

  const handleToggle = async (b: Barber) => {
    const res = await toggleBarberActive(b.id, !b.is_active)
    if (res.success) { await load(); router.refresh() }
    else toast.error(res.error ?? 'Erro ao alterar status.')
  }

  const showForm = isNew || editing !== null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Profissionais</h2>
        {!showForm && (
          <button
            onClick={openNew}
            className="text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 rounded-lg"
          >
            + Novo barbeiro
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            {isNew ? 'Novo barbeiro' : 'Editar barbeiro'}
          </p>

          <div className="flex flex-col items-center gap-2">
            <div
              className="w-20 h-20 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer"
              onClick={() => photoRef.current?.click()}
            >
              {fPhotoUrl
                ? <img src={fPhotoUrl} alt="Foto" className="w-full h-full object-cover" />
                : <span className="text-[10px] text-muted-foreground text-center px-1">Toque para foto</span>
              }
            </div>
            <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            <button
              onClick={() => photoRef.current?.click()}
              className="text-[10px] uppercase font-extrabold tracking-widest text-muted-foreground border border-white/10 px-2 py-1 rounded-lg"
            >
              {fPhotoUrl ? 'Trocar foto' : 'Adicionar foto'}
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Nome completo *</Label>
            <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ex: João Silva" className="h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Apelido (opcional)</Label>
            <Input value={fNickname} onChange={(e) => setFNickname(e.target.value)} placeholder="Ex: Joãozinho" className="h-9" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Ativo</span>
            <Switch checked={fActive} onCheckedChange={setFActive} />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-9 rounded-lg bg-white text-black text-xs font-black uppercase tracking-widest disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={closeForm}
              className="px-4 h-9 rounded-lg border border-white/10 text-xs font-black uppercase tracking-widest text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-6">Carregando...</p>
      ) : barbers.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-xs">Nenhum barbeiro cadastrado.</p>
          <p className="text-[10px] mt-1">Clique em &quot;+ Novo barbeiro&quot; para começar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {barbers.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 flex-shrink-0">
                {b.photo_url
                  ? <img src={b.photo_url} alt={b.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground font-black">
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                }
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">{b.name}</span>
                {b.nickname && <span className="text-[11px] text-muted-foreground">{b.nickname}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={b.is_active} onCheckedChange={() => handleToggle(b)} />
                <button
                  onClick={() => openEdit(b)}
                  className="text-[10px] uppercase font-extrabold tracking-widest text-muted-foreground border border-white/10 px-2 py-1 rounded-lg"
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Produtos & Loja ────────────────────────────────────────────────────
function TabProdutos({
  config,
  products: initialProducts,
  onRefresh,
}: {
  config: BusinessConfig
  products: Product[]
  onRefresh: () => void
}) {
  const router = useRouter()
  const [enableProducts, setEnableProducts] = useState(config.enable_products ?? false)
  const [toggling, setToggling] = useState(false)
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [fName, setFName] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fFullDesc, setFFullDesc] = useState('')
  const [fSizeInfo, setFSizeInfo] = useState('')
  const [fPrice, setFPrice] = useState('')
  const [fStock, setFStock] = useState('-1')
  const [fReserve, setFReserve] = useState(true)
  const [fActive, setFActive] = useState(true)
  const [fImageUrl, setFImageUrl] = useState<string | null>(null)
  const [uploadingImg, setUploadingImg] = useState(false)
  const imgRef = useRef<HTMLInputElement>(null)
  const [reservations, setReservations] = useState<ProductReservation[]>([])
  const [loadingReservations, setLoadingReservations] = useState(false)
  const [reservationsLoaded, setReservationsLoaded] = useState(false)
  const [showReservations, setShowReservations] = useState(false)
  const [deleteResConfirm, setDeleteResConfirm] = useState<string | null>(null)

  const loadReservations = async () => {
    setLoadingReservations(true)
    const res = await listProductReservations()
    if (res.data) setReservations(res.data as ProductReservation[])
    setLoadingReservations(false)
    setReservationsLoaded(true)
  }

  const handleToggleReservationsSection = () => {
    const next = !showReservations
    setShowReservations(next)
    if (next && !reservationsLoaded) loadReservations()
  }

  const handleToggleEnable = async (val: boolean) => {
    setToggling(true)
    const result = await saveBusinessConfig({ enable_products: val })
    setToggling(false)
    if (result.success) {
      setEnableProducts(val)
      toast.success(val ? 'Loja de produtos ativada.' : 'Loja de produtos desativada.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const openNew = () => {
    setEditingId(null)
    setFName(''); setFDesc(''); setFFullDesc(''); setFSizeInfo(''); setFPrice(''); setFStock('-1')
    setFReserve(true); setFActive(true); setFImageUrl(null)
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditingId(p.id)
    setFName(p.name)
    setFDesc(p.short_description ?? '')
    setFFullDesc(p.full_description ?? '')
    setFSizeInfo(p.size_info ?? '')
    setFPrice(String(p.price))
    setFStock(String(p.stock_quantity))
    setFReserve(p.reserve_enabled)
    setFActive(p.is_active)
    setFImageUrl(p.cover_image_url)
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditingId(null) }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const webpDataUrl = await compressImageToWebP(file)
      const res = await uploadProductImage(webpDataUrl, 'image/webp')
      if (res.error) { toast.error('Erro ao enviar imagem: ' + res.error); return }
      setFImageUrl(res.url)
      toast.success('Imagem enviada!')
    } catch { toast.error('Erro ao processar imagem.') }
    setUploadingImg(false)
  }

  const handleSave = async () => {
    const price = parseFloat(fPrice)
    const stock = parseInt(fStock, 10)
    if (!fName.trim()) { toast.error('Nome é obrigatorio.'); return }
    if (isNaN(price) || price < 0) { toast.error('Preco invalido.'); return }
    if (isNaN(stock) || stock < -1) { toast.error('Estoque invalido. Use -1 para ilimitado.'); return }
    setSaving(true)
    const result = await upsertProduct({
      id: editingId ?? undefined,
      name: fName.trim(),
      short_description: fDesc.trim() || null,
      full_description: fFullDesc.trim() || null,
      size_info: fSizeInfo.trim() || null,
      price,
      stock_quantity: stock,
      is_active: fActive,
      reserve_enabled: fReserve,
      cover_image_url: fImageUrl,
    })
    setSaving(false)
    if (result.success) {
      toast.success(editingId ? 'Produto atualizado.' : 'Produto criado.')
      closeForm()
      const reload = await listProducts()
      if (reload.data) setProducts(reload.data as Product[])
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleToggleActive = async (p: Product) => {
    const result = await toggleProductActive(p.id, !p.is_active)
    if (result.success) {
      setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, is_active: !p.is_active } : x))
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este produto? Esta acao nao pode ser desfeita.')) return
    const result = await deleteProduct(id)
    if (result.success) {
      toast.success('Produto excluido.')
      setProducts((prev) => prev.filter((p) => p.id !== id))
    } else {
      toast.error(result.error ?? 'Erro ao excluir.')
    }
  }

  const handleReservationStatus = async (id: string, status: ProductReservationStatus) => {
    const result = await updateProductReservationStatus(id, status)
    if (result.success) {
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status } : r))
      toast.success('Status atualizado.')
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const statusLabel: Record<ProductReservationStatus, string> = {
    reservado: 'Reservado',
    cancelado: 'Cancelado',
    retirado: 'Retirado',
  }
  const statusColor: Record<ProductReservationStatus, string> = {
    reservado: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    cancelado: 'text-red-400 bg-red-400/10 border-red-400/20',
    retirado: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loja &amp; Produtos</h2>
        {!showForm && (
          <button
            onClick={openNew}
            className="text-[10px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 rounded-lg"
          >
            + Novo produto
          </button>
        )}
      </div>

      {/* Toggle global */}
      <div className="flex items-center justify-between gap-4 bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground">Exibir loja de produtos</span>
          <span className="text-xs text-muted-foreground">Mostra produtos para reserva apos o agendamento.</span>
        </div>
        <Switch checked={enableProducts} onCheckedChange={handleToggleEnable} disabled={toggling} />
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            {editingId ? 'Editar produto' : 'Novo produto'}
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => imgRef.current?.click()}
              className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0"
            >
              {fImageUrl ? (
                <img src={fImageUrl} alt="Produto" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[9px] text-muted-foreground text-center px-1">
                  {uploadingImg ? 'Enviando...' : 'Tocar para foto'}
                </span>
              )}
            </button>
            <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Nome*</Label>
              <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ex: Pomada Modeladora" className="h-9" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Descrição curta (aparece na vitrine)</Label>
            <Input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Ex: Fixação forte, perfume amadeirado" className="h-9" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Descrição completa (aparece no modal)</Label>
            <textarea
              value={fFullDesc}
              onChange={(e) => setFFullDesc(e.target.value)}
              placeholder="Descreva o produto em detalhes: composição, benefícios, como usar..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Tamanhos / Variações (opcional)</Label>
            <Input value={fSizeInfo} onChange={(e) => setFSizeInfo(e.target.value)} placeholder="Ex: 50ml | 100ml | 150ml  ou  P / M / G" className="h-9" />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Preço (R$)*</Label>
              <Input type="number" min="0" step="0.01" value={fPrice} onChange={(e) => setFPrice(e.target.value)} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="text-xs text-muted-foreground">Estoque (-1 = ilimitado)</Label>
              <Input type="number" min="-1" value={fStock} onChange={(e) => setFStock(e.target.value)} className="h-9" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground">Reserva habilitada</span>
              <Switch checked={fReserve} onCheckedChange={setFReserve} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground">Produto ativo (visivel na loja)</span>
              <Switch checked={fActive} onCheckedChange={setFActive} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? 'Salvando...' : editingId ? 'Salvar alteracoes' : 'Criar produto'}
            </Button>
            <Button size="sm" variant="outline" onClick={closeForm} className="flex-1">Cancelar</Button>
          </div>
        </div>
      )}

      {/* Lista de produtos */}
      {products.length === 0 && !showForm ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-xs">Nenhum produto cadastrado.</p>
          <p className="text-[10px] mt-1">Clique em &quot;+ Novo produto&quot; para comecar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((p) => (
            <div
              key={p.id}
              className={[
                'bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 transition-opacity',
                !p.is_active ? 'opacity-50' : '',
              ].join(' ')}
            >
              {p.cover_image_url && (
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0">
                  <img src={p.cover_image_url} alt={p.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  R&#36; {p.price.toFixed(2).replace('.', ',')}
                  {' · '}
                  {p.stock_quantity === -1 ? 'Estoque ilimitado' : `${p.stock_quantity} em estoque`}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={p.is_active} onCheckedChange={() => handleToggleActive(p)} />
                <button onClick={() => openEdit(p)} className="text-[10px] uppercase font-extrabold tracking-widest text-muted-foreground border border-white/10 px-2 py-1 rounded-lg">
                  Editar
                </button>
                <button onClick={() => handleDelete(p.id)} className="text-[10px] uppercase font-extrabold tracking-widest text-red-400 border border-red-400/20 bg-red-400/5 px-2 py-1 rounded-lg">
                  X
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reservas de produtos */}
      <div className="border border-white/10 rounded-2xl overflow-hidden mt-2">
        <button
          onClick={handleToggleReservationsSection}
          className="w-full flex items-center justify-between px-4 py-4 bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Reservas de Produtos</span>
            <span className="text-xs text-zinc-500">Pedidos realizados pelos clientes</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${showReservations ? 'rotate-180' : ''}`} />
        </button>
        {showReservations && (
          <div className="border-t border-white/5 px-4 py-4">
            {loadingReservations ? (
              <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
            ) : reservations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma reserva registrada.</p>
            ) : (() => {
              const standaloneRes = reservations.filter(r => !r.appointment_id)
              const appointmentRes = reservations.filter(r => r.appointment_id)
              const renderCard = (r: typeof reservations[0]) => (
                <div key={r.id} className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-sm font-semibold text-foreground truncate">{r.product_name_snapshot}</span>
                      <span className="text-xs text-muted-foreground">
                        R&#36; {r.product_price_snapshot.toFixed(2).replace('.', ',')}
                        {r.quantity && r.quantity > 1 ? ` · ${r.quantity}x` : ''}
                        {r.client_phone && ` · ${r.client_phone}`}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(r.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <span className={['text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-full shrink-0', statusColor[r.status]].join(' ')}>
                      {statusLabel[r.status]}
                    </span>
                  </div>
                  {r.status === 'reservado' && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleReservationStatus(r.id, 'retirado')}
                        className="flex-1 text-[10px] font-black uppercase tracking-widest text-blue-400 border border-blue-400/20 bg-blue-400/5 py-1.5 rounded-lg"
                      >
                        Marcar retirado
                      </button>
                      <button
                        onClick={() => handleReservationStatus(r.id, 'cancelado')}
                        className="flex-1 text-[10px] font-black uppercase tracking-widest text-red-400 border border-red-400/20 bg-red-400/5 py-1.5 rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {r.status === 'cancelado' && !r.appointment_id && (
                    deleteResConfirm === r.id ? (
                      <div className="flex gap-1.5">
                        <button
                          onClick={async () => {
                            await deleteProductReservation(r.id)
                            setDeleteResConfirm(null)
                            loadReservations()
                          }}
                          className="flex-1 text-[10px] font-black uppercase tracking-widest text-red-400 border border-red-500/30 bg-red-500/10 py-1.5 rounded-lg"
                        >
                          Confirmar exclusão
                        </button>
                        <button
                          onClick={() => setDeleteResConfirm(null)}
                          className="flex-1 text-[10px] font-black uppercase tracking-widest text-zinc-400 border border-white/10 py-1.5 rounded-lg"
                        >
                          Não excluir
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteResConfirm(r.id)}
                        className="text-[10px] font-black uppercase tracking-widest text-zinc-500 border border-white/5 py-1.5 rounded-lg"
                      >
                        Excluir registro
                      </button>
                    )
                  )}
                </div>
              )
              return (
                <div className="flex flex-col gap-4">
                  {standaloneRes.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">Reservas da Loja</p>
                      {standaloneRes.map(renderCard)}
                    </div>
                  )}
                  {appointmentRes.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Via Agendamento</p>
                      {appointmentRes.map(renderCard)}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
