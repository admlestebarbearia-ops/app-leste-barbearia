'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient as createSupabaseBrowser } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Camera, LogOut, Pause, Play, Menu, X, CalendarDays, Settings2, Scissors, Users, Images, ShieldCheck, ChevronDown, Package, Trash2, Eye, DollarSign, Star, TrendingUp, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { compressImageToWebP } from '@/lib/image-utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MAX_PAYMENT_EXPIRY_MINUTES, normalizePaymentExpiryMinutes } from '@/lib/mercadopago/payment-policy'
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
  saveBusinessConfig,  saveWorkingHours,
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
  deleteUser,
  getUserDetails,
  concludeAppointment,
  estornarAgendamento,
  listFinancialEntries,
  addManualFinancialEntry,
  deleteManualFinancialEntry,
  listFinancialTransactions,
  addManualTransaction,
  deleteManualTransaction,
  markTransactionAsPaid,
  saveCardRates,
  listClientDirectory,
  getClientDirectoryDetails,
  deleteClientFromDirectory,
  saveMercadoPagoConfig,
  disconnectMercadoPago,
  getPendingPaymentsCount,
  adminConfirmFiadoPayment,
} from '@/app/admin/actions'
import { PushNotificationToggle } from '@/components/booking/PushNotificationToggle'
import type { PaymentMethod } from '@/lib/supabase/types'
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
  FinancialEntry,
  FinancialTransaction,
} from '@/lib/supabase/types'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

type Tab = 'hoje' | 'configuracoes' | 'servicos' | 'barbeiros' | 'admins' | 'galeria' | 'produtos' | 'financeiro' | 'clientes'

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
  mpStatus?: string
  mpReason?: string
  paymentMethodByApptId?: Record<string, string | null>
  onlineMpApptIds?: Set<string>
  refundedApptIds?: Set<string>
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
  mpStatus,
  mpReason,
  paymentMethodByApptId = {},
  onlineMpApptIds = new Set(),
  refundedApptIds = new Set(),
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('hoje')

  // Melhoria 2: lê ?tab= da URL na montagem para preservar aba após refresh
  useEffect(() => {
    const validTabs: Tab[] = ['hoje', 'configuracoes', 'servicos', 'barbeiros', 'admins', 'galeria', 'produtos', 'financeiro', 'clientes']
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab') as Tab | null
    if (tabParam && validTabs.includes(tabParam)) setTab(tabParam)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Melhoria 2: atualiza ?tab= na URL sempre que a aba mudar
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    window.history.replaceState({}, '', url.toString())
  }, [tab])

  // Trata retorno do OAuth do Mercado Pago (?mp=connected ou ?mp=error)
  useEffect(() => {
    if (!mpStatus) return
    if (mpStatus === 'connected') {
      toast.success('Mercado Pago vinculado com sucesso!')
      setTab('configuracoes')
      window.history.replaceState({}, '', '/admin')
      // Força reload dos dados do servidor para que config.mp_access_token seja atualizado
      router.refresh()
    } else if (mpStatus === 'error') {
      const reasonMap: Record<string, string> = {
        token: 'Falha ao trocar o código MP (redirect_uri ou credenciais inválidas)',
        token_missing: 'Resposta do MP sem access_token',
        state: 'Parâmetro de estado inválido (tente novamente)',
        expired: 'Link expirado. Inicie o fluxo novamente',
        user: 'Usuário não corresponde ao iniciador do fluxo',
        auth: 'Sessão não encontrada. Faça login e tente novamente',
        no_code: 'Código de autorização ausente',
        config: 'Variáveis de ambiente MP não configuradas',
        db: 'Erro ao salvar token no banco de dados',
      }
      const detail = mpReason ? (reasonMap[mpReason] ?? mpReason) : 'motivo desconhecido'
      // Lê o detalhe do erro direto do MP (passado como mp_detail no redirect do callback)
      const mpDetailRaw = new URLSearchParams(window.location.search).get('mp_detail')
      const mpDetailSuffix = mpDetailRaw ? ` — MP: ${decodeURIComponent(mpDetailRaw)}` : ''
      toast.error(`Erro ao vincular Mercado Pago: ${detail}${mpDetailSuffix}`, { duration: 15000 })
      setTab('configuracoes')
      window.history.replaceState({}, '', '/admin')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          // Vibração (Android Chrome; iOS e PC ignoram silenciosamente)
          try { navigator.vibrate?.([300, 100, 300, 100, 300]) } catch {}
          try {
            const audio = new Audio('/bell.mp3')
            audio.volume = 1.0
            audio.play().catch(() => {})
            audio.onended = () => {
              const audio2 = new Audio('/bell.mp3')
              audio2.volume = 1.0
              audio2.play().catch(() => {})
            }
          } catch {}
          // Notificação do sistema via Service Worker (funciona em segundo plano / tela de bloqueio)
          if (typeof window !== 'undefined' && Notification.permission === 'granted') {
            const swTitle = '🛍 Nova reserva — Barbearia Leste'
            const swBody = `${productName}${clientPhone ? ` — ${clientPhone}` : ''}`
            navigator.serviceWorker?.ready.then((reg) => {
              reg.showNotification(swTitle, {
                body: swBody,
                icon: '/android-chrome-192x192.png',
                badge: '/android-chrome-192x192.png',
                // vibrate não está nos tipos TS mas é suportado pelo SW spec
                ...({ vibrate: [300, 100, 300, 100, 300] } as object),
                tag: 'barbearia-leste-reserva',
                renotify: true,
              } as NotificationOptions).catch(() => {
                new Notification(swTitle, { body: swBody, icon: '/android-chrome-192x192.png' })
              })
            }).catch(() => {
              try { new Notification('🛍 Nova reserva — Barbearia Leste', { body: `${productName}` }) } catch {}
            })
          }
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
    { key: 'financeiro', label: 'FINANCEIRO' },
    { key: 'clientes', label: 'CLIENTES' },
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
            { key: 'financeiro',    label: 'Financeiro',  icon: DollarSign },
            { key: 'clientes',      label: 'Clientes',    icon: UserCheck },
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
            {/* Notificações push para o admin */}
            <PushNotificationToggle compact />

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
            config={config}
            onRefresh={() => router.refresh()}
            queryError={appointmentsError}
            productReservationsByAppt={productReservationsByAppt}
            standaloneReservations={standaloneReservations}
            paymentMethodByApptId={paymentMethodByApptId}
            onlineMpApptIds={onlineMpApptIds}
            refundedApptIds={refundedApptIds}
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
        {tab === 'financeiro' && (
          <TabFinanceiro config={config} onRefresh={() => router.refresh()} />
        )}
        {tab === 'clientes' && (
          <TabClientes />
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
  config,
  onRefresh,
  queryError,
  productReservationsByAppt = {},
  standaloneReservations = [],
  paymentMethodByApptId = {},
  onlineMpApptIds = new Set(),
  refundedApptIds = new Set(),
  onStandaloneUpdated,
}: {
  appointments: Appointment[]
  displayPref: string
  config: BusinessConfig
  onRefresh: () => void
  queryError?: string | null
  productReservationsByAppt?: Record<string, ProductReservation[]>
  standaloneReservations?: ProductReservation[]
  paymentMethodByApptId?: Record<string, string | null>
  onlineMpApptIds?: Set<string>
  refundedApptIds?: Set<string>
  onStandaloneUpdated?: (id: string, newStatus: 'reservado' | 'retirado' | 'cancelado' | 'deleted') => void
}) {
  const todayStr = new Date().toISOString().split('T')[0]
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  // Modal Concluir Agendamento
  const [concludeAppt, setConcludeAppt] = useState<Appointment | null>(null)
  const [concludeLoading, setConcludeLoading] = useState(false)
  const [concludePayment, setConcludePayment] = useState<PaymentMethod | ''>('')
  const [ratingScore, setRatingScore] = useState(0)
  const [ratingNote, setRatingNote] = useState('')
  // Fiado
  const [concludeIsPending, setConcludeIsPending] = useState(false)
  const [concludePendingDate, setConcludePendingDate] = useState('')
  // Modal Cancelar
  const [cancelAppt, setCancelAppt] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelCanRefund, setCancelCanRefund] = useState(false)
  const [cancelWithRefund, setCancelWithRefund] = useState(false)
  // Estorno
  const [estornoLoading, setEstornoLoading] = useState<string | null>(null)
  const [newBadge, setNewBadge] = useState(0)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const [notifLoading, setNotifLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const swRef = useRef<ServiceWorkerRegistration | null>(null)
  const [calMonth, setCalMonth] = useState(() => todayStr.slice(0, 7))
  const [selectedDay, setSelectedDay] = useState<string | null>(todayStr)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [fiadoPaymentMethod, setFiadoPaymentMethod] = useState<PaymentMethod | null>(null)
  const [confirmingFiado, setConfirmingFiado] = useState(false)
  const [pendingAppts, setPendingAppts] = useState<Appointment[]>([])
  const concludeHasApprovedOnlinePayment = concludeAppt
    ? onlineMpApptIds.has(concludeAppt.id) && !refundedApptIds.has(concludeAppt.id)
    : false
  const concludeHasExistingRevenue = concludeAppt
    ? Boolean(paymentMethodByApptId[concludeAppt.id]) && !refundedApptIds.has(concludeAppt.id)
    : false
  const concludeCanSkipManualPayment = concludeHasApprovedOnlinePayment || concludeHasExistingRevenue

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('Notification' in window) setNotifPermission(Notification.permission)
      setIsStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true
      )
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
          swRef.current = reg
        }).catch(() => {})
      }
    }
  }, [])

  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return
    if (notifLoading) return

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true

    // Se já negado, o browser não abre mais diálogo — orienta o usuário
    if (Notification.permission === 'denied') {
      const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent)
      if (isStandalone && isIosDevice) {
        toast.error(
          'Notificações bloqueadas. Vá em Configurações do iPhone → Barbearia Leste → Notificações e ative.',
          { duration: 9000 },
        )
      } else if (isStandalone) {
        // Android Chrome PWA — permissão fica no Chrome, não em "Aplicativos"
        toast.error(
          'Notificações bloqueadas. Toque no 🔒 ao lado do endereço no Chrome → Permissões do site → Notificações → Permitir.',
          { duration: 9000 },
        )
      } else {
        toast.error(
          'Notificações bloqueadas. Clique no 🔒 na barra de endereço → Permissões do site → Notificações → Permitir.',
          { duration: 9000 },
        )
      }
      return
    }

    setNotifLoading(true)
    try {
      const result = await Notification.requestPermission()
      setNotifPermission(result)
      if (result === 'granted') {
        if ('serviceWorker' in navigator && !swRef.current) {
          swRef.current = await navigator.serviceWorker.register('/sw.js').catch(() => null)
        }
        toast.success('Notificações ativadas! Você receberá alertas mesmo com a tela bloqueada.')
      } else if (result === 'denied') {
        toast.error('Permissão negada. Para ativar, clique no cadeado 🔒 na barra de endereço e permita notificações.')
      }
    } finally {
      setNotifLoading(false)
    }
  }

  const sendBrowserNotif = (dateStr: string, time: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    const d = dateStr ? dateStr.split('-').reverse().join('/') : ''
    const title = '📅 Novo agendamento — Barbearia Leste'
    const body = `${d} às ${time}`
    const icon = '/android-chrome-192x192.png'
    // Usa SW showNotification: funciona em segundo plano e na tela de bloqueio
    const reg = swRef.current
    if (reg) {
      reg.showNotification(title, {
        body,
        icon,
        badge: icon,
        // vibrate não está nos tipos TS mas é suportado pelo SW spec
        ...({ vibrate: [200, 100, 200, 100, 200] } as object),
        requireInteraction: true,
        tag: 'barbearia-leste-notif',
        renotify: true,
        data: { url: '/admin' },
      } as NotificationOptions).catch(() => {
        new Notification(title, { body, icon })
      })
    } else {
      // Fallback: prefere postMessage ao SW; só usa new Notification se o SW controller não tiver
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SHOW_NOTIFICATION', title, body, icon, url: '/admin' })
      } else {
        new Notification(title, { body, icon })
      }
    }
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

          // Só notifica (toast + som) quando o agendamento já entrou confirmado (dinheiro presencial).
          // Pagamentos online entram como 'aguardando_pagamento' — a notificação real vem no UPDATE abaixo.
          // Bug 05: também notifica para 'aguardando_pagamento' pois o admin precisa saber que
          // o cliente está ativamente no checkout (MP pode demorar ou o cliente pode desistir).
          const isConfirmed = newRow.status === 'confirmado'
          const isAwaitingPayment = newRow.status === 'aguardando_pagamento'
          if (isConfirmed) {
            toast.success(`Novo agendamento! ${d ? d.split('-').reverse().join('/') : ''} às ${t}`, { duration: 8000, icon: '📅' })
            sendBrowserNotif(d, t)
            try { navigator.vibrate?.([300, 100, 300, 100, 300]) } catch {}
            try {
              const audio = new Audio('/bell.mp3')
              audio.volume = 1.0
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
          } else if (isAwaitingPayment) {
            // Notificação visual discreta — cliente no checkout, aguardando pagamento
            toast(`🕐 Aguardando pagamento — ${d ? d.split('-').reverse().join('/') : ''} às ${t}`, { duration: 6000 })
          }

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
          if (isConfirmed || isAwaitingPayment) setNewBadge((prev) => prev + 1)
          onRefresh()
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments' },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const updated = payload.new as unknown as Appointment
          const old = payload.old as unknown as Appointment

          // Pagamento online confirmado: aguardando_pagamento → confirmado
          if (updated.status === 'confirmado' && old.status === 'aguardando_pagamento') {
            const d = updated.date ?? ''
            const t = updated.start_time?.slice(0, 5) ?? ''
            toast.success(`Pagamento confirmado! ${d ? d.split('-').reverse().join('/') : ''} às ${t}`, { duration: 8000, icon: '💰' })
            sendBrowserNotif(d, t)
            try { navigator.vibrate?.([300, 100, 300, 100, 300]) } catch {}
            try {
              const audio = new Audio('/bell.mp3')
              audio.volume = 1.0
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
            setNewBadge((prev) => prev + 1)
            onRefresh()
            return
          }

          // Notifica admin apenas quando o status muda para 'cancelado'
          if (updated.status === 'cancelado' && old.status !== 'cancelado') {
            const d = updated.date ?? ''
            const t = updated.start_time?.slice(0, 5) ?? ''
            const name = updated.client_name ?? 'Cliente'
            toast.error(`${name} cancelou — ${d ? d.split('-').reverse().join('/') : ''} às ${t}`, { duration: 8000, icon: '❌' })
            try { navigator.vibrate?.([200, 100, 200]) } catch {}
            try {
              const ctx = new AudioContext()
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.type = 'sawtooth'
              osc.frequency.value = 330
              gain.gain.setValueAtTime(0.2, ctx.currentTime)
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
              osc.start(ctx.currentTime)
              osc.stop(ctx.currentTime + 0.5)
            } catch {}
            onRefresh()
          }
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

  const handleConclude = async () => {
    if (!concludeAppt || (!concludeHasExistingRevenue && !concludePayment && !concludeIsPending)) return
    setConcludeLoading(true)
    const rating = ratingScore > 0 ? { score: ratingScore, note: ratingNote.trim() || undefined } : undefined
    const concludePaymentMethod = (concludeHasExistingRevenue || !concludePayment || concludeIsPending)
      ? undefined
      : concludePayment
    const result = await concludeAppointment(
      concludeAppt.id,
      concludePaymentMethod,
      rating,
      concludeIsPending ? (concludePendingDate || undefined) : undefined
    )
    setConcludeLoading(false)
    if (result.success) {
      toast.success(concludeIsPending ? 'Atendimento concluído! Pagamento pendente registrado.' : 'Agendamento concluído!')
      setConcludeAppt(null)
      setConcludePayment('')
      setConcludeIsPending(false)
      setConcludePendingDate('')
      setRatingScore(0)
      setRatingNote('')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao concluir.')
    }
  }

  const handleEstorno = async (apptId: string) => {
    setEstornoLoading(apptId)
    const result = await estornarAgendamento(apptId)
    setEstornoLoading(null)
    if (result.success) {
      toast.success('Estorno registrado.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao estornar.')
    }
  }

  const handleConfirmFiado = async (apptId: string, method: PaymentMethod) => {
    setConfirmingFiado(true)
    const result = await adminConfirmFiadoPayment(apptId, method)
    setConfirmingFiado(false)
    if (result.success) {
      toast.success('Pagamento confirmado!')
      setSelectedAppt(null)
      setFiadoPaymentMethod(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao confirmar pagamento.')
    }
  }

  const handleCancel = async () => {
    if (!cancelAppt) return
    setCancelLoading(true)
    const result = await updateAppointmentStatus(cancelAppt.id, 'cancelado', cancelReason.trim() || undefined)
    if (result.success) {
      if (cancelWithRefund && cancelCanRefund) {
        const refundResult = await estornarAgendamento(cancelAppt.id)
        if (!refundResult.success) toast.error(refundResult.error ?? 'Erro ao registrar estorno.')
      }
      toast.success('Agendamento cancelado.')
      setCancelAppt(null)
      setCancelReason('')
      setCancelWithRefund(false)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao cancelar.')
    }
    setCancelLoading(false)
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
          disabled={notifLoading}
          className="flex items-center gap-3 w-full bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-3.5 text-left hover:bg-amber-500/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="text-2xl shrink-0">{notifLoading ? '⏳' : notifPermission === 'denied' ? '🚫' : '🔔'}</span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-xs text-amber-300 font-bold">
              {notifLoading ? 'Aguardando permissão...' : notifPermission === 'denied' ? 'Notificações bloqueadas' : 'Ativar notificações'}
            </span>
            <span className="text-[11px] text-amber-400/70 leading-tight">
              {notifPermission === 'denied'
                ? isStandalone
                  ? 'Toque para ver como ativar nas Configurações do celular'
                  : 'Clique para ver como desbloquear no navegador'
                : 'Receba alertas de novos agendamentos mesmo com a tela bloqueada'}
            </span>
          </div>
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
              {dayAppts.map((appt) => {
                const canRefund = !refundedApptIds.has(appt.id) && (Boolean(paymentMethodByApptId[appt.id]) || onlineMpApptIds.has(appt.id))

                return (
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
                        {(() => {
                          if (refundedApptIds.has(appt.id)) {
                            return (
                              <span className="text-[9px] font-black bg-orange-500/20 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                                ESTORNADO
                              </span>
                            )
                          }
                          const isPaid = Boolean(paymentMethodByApptId[appt.id]) || onlineMpApptIds.has(appt.id)
                          if (isPaid) {
                            return (
                              <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                                PAGO
                              </span>
                            )
                          }
                          if (appt.status === 'confirmado') {
                            return (
                              <span className="text-[9px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                                A PAGAR
                              </span>
                            )
                          }
                          return null
                        })()}
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
                        appt.status === 'concluido'  ? 'text-blue-400 border-blue-500/20 bg-blue-500/10' :
                                                        'text-amber-400 border-amber-500/20 bg-amber-500/10',
                      ].join(' ')}>
                        {appt.status}
                      </span>
                    </div>
                  </div>

                  {/* Rodapé — botões de ação */}
                  <div className="flex gap-2 flex-wrap pt-1 border-t border-white/5">
                    {appt.status === 'aguardando_pagamento' && (
                      <>
                        <span className="text-[9px] font-bold text-amber-300/70 self-center">💳 Aguardando pagamento MP</span>
                        <button
                          disabled={!!loading}
                          onClick={() => { setCancelAppt(appt); setCancelReason(''); setCancelWithRefund(false); setCancelCanRefund(false) }}
                          className="text-[10px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-2.5 py-1 rounded-lg disabled:opacity-40"
                        >
                          Cancelar
                        </button>
                      </>
                    )}

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
                        {appt.date === todayStr && (
                          <button
                            disabled={!!loading}
                            onClick={() => { setConcludeAppt(appt); setConcludeIsPending(false); setConcludePendingDate(''); setRatingScore(0); setRatingNote('') }}
                            className="text-[10px] font-bold text-blue-400 border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                          >
                            ✓ Concluir
                          </button>
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
                          onClick={() => { setCancelAppt(appt); setCancelReason(''); setCancelWithRefund(false); setCancelCanRefund(canRefund) }}
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

                    {appt.status === 'concluido' && (
                      canRefund ? (
                        <button
                          disabled={estornoLoading === appt.id}
                          onClick={() => handleEstorno(appt.id)}
                          className="text-[10px] font-bold text-orange-400 border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                        >
                          {estornoLoading === appt.id ? '...' : 'Estornar'}
                        </button>
                      ) : refundedApptIds.has(appt.id) ? (
                        <span className="text-[10px] font-bold text-orange-300 border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 rounded-lg">
                          Estornado
                        </span>
                      ) : null
                    )}

                    {(appt.status === 'cancelado' || appt.status === 'faltou') && (
                      <>
                        {canRefund ? (
                          <button
                            disabled={estornoLoading === appt.id}
                            onClick={() => handleEstorno(appt.id)}
                            className="text-[10px] font-bold text-orange-400 border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                          >
                            {estornoLoading === appt.id ? '...' : 'Estornar'}
                          </button>
                        ) : refundedApptIds.has(appt.id) ? (
                          <span className="text-[10px] font-bold text-orange-300 border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 rounded-lg">
                            Estornado
                          </span>
                        ) : null}
                        {deleteConfirm === appt.id ? (
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
                        )}
                      </>
                    )}
                  </div>
                </div>
                )
              })}
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
    <Dialog open={!!selectedAppt} onOpenChange={(open) => { if (!open) setSelectedAppt(null) }}>      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
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
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Agendado em</span>
                <span className="text-xs text-zinc-300 tabular-nums">
                  {new Date(selectedAppt.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {(() => {
                const method = paymentMethodByApptId[selectedAppt.id]
                const isOnline = onlineMpApptIds.has(selectedAppt.id)
                const isRefunded = refundedApptIds.has(selectedAppt.id)
                const PAYMENT_LABEL: Record<string, string> = {
                  dinheiro: 'Dinheiro',
                  pix: 'PIX',
                  debito: 'Débito',
                  credito: 'Crédito',
                  mercado_pago: 'Saldo MP',
                }
                const isPaid = Boolean(method) || isOnline
                const label = isRefunded
                  ? 'Estornado'
                  : method
                  ? PAYMENT_LABEL[method] ?? method
                  : isOnline
                  ? 'Pago online'
                  : selectedAppt.status === 'confirmado'
                  ? 'Pagar no local'
                  : selectedAppt.status === 'concluido' && selectedAppt.expected_payment_date && !isPaid
                  ? 'Pendente (Fiado)'
                  : selectedAppt.status === 'concluido'
                  ? 'Pago no local'
                  : null
                if (!label) return null
                const badgeClass = isRefunded
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20'
                  : isPaid
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/20'
                return (
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Pagamento</span>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${badgeClass}`}>{label}</span>
                  </div>
                )
              })()}
            </div>

            {/* ── Baixa Manual de Fiado ── */}
            {selectedAppt.status === 'concluido' &&
              selectedAppt.expected_payment_date &&
              !paymentMethodByApptId[selectedAppt.id] &&
              !onlineMpApptIds.has(selectedAppt.id) && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">Confirmar Recebimento Manual</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['dinheiro', 'pix', 'credito'] as PaymentMethod[]).map((pm) => (
                    <button
                      key={pm}
                      onClick={() => setFiadoPaymentMethod(pm)}
                      className={`text-[10px] font-bold px-2 py-1.5 rounded-lg border transition-all cursor-pointer ${
                        fiadoPaymentMethod === pm
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-white/5 text-zinc-400'
                      }`}
                    >
                      {pm === 'dinheiro' ? 'Dinheiro' : pm === 'pix' ? 'PIX' : 'Crédito'}
                    </button>
                  ))}
                </div>
                <button
                  disabled={!fiadoPaymentMethod || confirmingFiado}
                  onClick={() => fiadoPaymentMethod && void handleConfirmFiado(selectedAppt.id, fiadoPaymentMethod)}
                  className="w-full text-[11px] font-black uppercase tracking-widest py-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {confirmingFiado ? 'Aguarde...' : '✓ Confirmar Recebimento'}
                </button>
              </div>
            )}

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

    {/* ── Modal: Concluir Agendamento + Pagamento + Rating ── */}
    <Dialog open={!!concludeAppt} onOpenChange={(open) => { if (!open) { setConcludeAppt(null); setConcludePayment(''); setConcludeIsPending(false); setConcludePendingDate(''); setRatingScore(0); setRatingNote('') } }}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Concluir Atendimento</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {concludeAppt && (
              <>
                {concludeAppt.service_name_snapshot ?? concludeAppt.services?.name ?? 'Serviço'}
                {concludeAppt.service_price_snapshot != null && (
                  <> — <span className="text-emerald-400 font-bold">R$ {concludeAppt.service_price_snapshot.toFixed(2).replace('.', ',')}</span></>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-1">
          {/* Forma de pagamento */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-zinc-400">Como foi pago?</span>
            {concludeCanSkipManualPayment ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
                <p className="text-sm font-semibold text-emerald-300">
                  {concludeHasApprovedOnlinePayment ? 'Pagamento online aprovado' : 'Pagamento já registrado'}
                </p>
                <p className="mt-1 text-xs text-emerald-200/80">
                  {concludeHasApprovedOnlinePayment
                    ? 'Ao concluir, a receita entra no financeiro com a forma já aprovada no checkout.'
                    : 'Você pode concluir sem informar outra forma de pagamento.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(['dinheiro', 'pix', 'credito'] as PaymentMethod[]).map((pm) => {
                    const labels: Record<PaymentMethod, string> = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', mercado_pago: 'Mercado Pago' }
                    const rate = pm === 'credito' ? (config.credit_rate_pct ?? 0) : 0
                    return (
                      <button
                        key={pm}
                        onClick={() => { setConcludePayment(pm); setConcludeIsPending(false) }}
                        className={`flex flex-col items-start px-3 py-2 rounded-lg border text-sm transition-all ${
                          concludePayment === pm && !concludeIsPending
                            ? 'border-blue-500 bg-blue-500/15 text-white'
                            : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20'
                        }`}
                      >
                        <span className="font-medium">{labels[pm]}</span>
                        {rate > 0 && <span className="text-[10px] text-zinc-500">{rate}% de taxa</span>}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => { setConcludeIsPending(!concludeIsPending); setConcludePayment('') }}
                    className={`flex flex-col items-start px-3 py-2 rounded-lg border text-sm transition-all ${
                      concludeIsPending
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span className="font-medium">Pagar Depois</span>
                    <span className="text-[10px] text-zinc-500">Fiado / Promessa</span>
                  </button>
                </div>
                {concludeIsPending && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-zinc-400">Data prometida de pagamento (opcional)</span>
                    <input
                      type="date"
                      value={concludePendingDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setConcludePendingDate(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                    />
                  </div>
                )}
                {concludePayment && !concludeIsPending && concludeAppt?.service_price_snapshot != null && concludeAppt.service_price_snapshot > 0 && (() => {
                  const amount = concludeAppt.service_price_snapshot
                  const rate = concludePayment === 'credito' ? (config.credit_rate_pct ?? 0) : 0
                  const net = amount * (1 - rate / 100)
                  return (
                    <p className="text-xs text-zinc-500 mt-1">
                      {rate > 0
                        ? <>R$ {amount.toFixed(2).replace('.', ',')} − {rate}% = <span className="text-emerald-400">R$ {net.toFixed(2).replace('.', ',')}</span> líquido</>
                        : <>Você recebe <span className="text-emerald-400">R$ {amount.toFixed(2).replace('.', ',')}</span> integrais</>}
                    </p>
                  )
                })()}
              </>
            )}
          </div>

          {/* Avaliação opcional */}
          <div className="flex flex-col gap-2">
            <span className="text-xs text-zinc-400">Avaliação (opcional)</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRatingScore(ratingScore === star ? 0 : star)}
                  className={`text-2xl transition-all ${star <= ratingScore ? 'opacity-100' : 'opacity-30 hover:opacity-60'}`}
                >
                  ⭐
                </button>
              ))}
            </div>
            {ratingScore > 0 && (
              <input
                type="text"
                placeholder="Observação (opcional)"
                value={ratingNote}
                onChange={(e) => setRatingNote(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setConcludeAppt(null); setConcludePayment(''); setConcludeIsPending(false); setConcludePendingDate(''); setRatingScore(0); setRatingNote('') }} disabled={concludeLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleConclude}
            disabled={concludeLoading || (!concludeCanSkipManualPayment && !concludePayment && !concludeIsPending)}
            className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
          >
            {concludeLoading ? 'Salvando...' : concludeIsPending ? 'Confirmar (Fiado)' : 'Confirmar Conclusão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Modal: Cancelar Agendamento ── */}
    <Dialog open={!!cancelAppt} onOpenChange={(open) => { if (!open) { setCancelAppt(null); setCancelReason(''); setCancelWithRefund(false) } }}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Cancelar Agendamento</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {cancelAppt && (
              <>{getDisplayName(cancelAppt)} — {cancelAppt.start_time?.slice(0, 5)}</>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-2">
            <span className="text-xs text-zinc-400">Motivo do cancelamento (opcional)</span>
            <input
              type="text"
              placeholder="Ex: Cliente remarcou, feriado..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30"
            />
          </div>
          {cancelCanRefund && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-3 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-amber-300">Efetuar reembolso?</span>
                <span className="text-xs text-amber-200/70">Pagamento registrado neste agendamento.</span>
              </div>
              <Switch checked={cancelWithRefund} onCheckedChange={setCancelWithRefund} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setCancelAppt(null); setCancelReason(''); setCancelWithRefund(false) }} disabled={cancelLoading}>
            Voltar
          </Button>
          <Button
            onClick={handleCancel}
            disabled={cancelLoading}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
          >
            {cancelLoading ? 'Cancelando...' : 'Confirmar Cancelamento'}
          </Button>
        </DialogFooter>
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
  const [retirePendingId, setRetirePendingId] = useState<string | null>(null)

  const handleStatus = async (id: string, status: 'retirado' | 'cancelado', paymentMethod?: PaymentMethod) => {
    setLoading(id + status)
    const result = await updateProductReservationStatus(id, status, paymentMethod)
    if (result.success) {
      toast.success(status === 'retirado' ? 'Marcado como retirado.' : 'Reserva cancelada.')
      onUpdated?.(id, status)
    } else {
      toast.error(result.error ?? 'Erro.')
    }
    setLoading(null)
    setRetirePendingId(null)
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

  const active = reservations.filter((r) => r.status === 'reservado' || r.status === 'aguardando_pagamento')

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
            (r.status !== 'reservado' && r.status !== 'aguardando_pagamento') ? 'opacity-60' : '',
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
                : r.status === 'aguardando_pagamento'
                ? 'text-yellow-300 border-yellow-500/20 bg-yellow-500/10'
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
              retirePendingId === r.id ? (
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[10px] text-zinc-400">Como foi pago?</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['dinheiro', 'pix', 'credito'] as PaymentMethod[]).map((m) => (
                      <button
                        key={m}
                        disabled={!!loading}
                        onClick={() => handleStatus(r.id, 'retirado', m)}
                        className="text-[10px] font-bold capitalize text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
                      >
                        {m === 'dinheiro' ? 'Dinheiro' : m === 'pix' ? 'PIX' : 'Crédito'}
                      </button>
                    ))}
                    <button
                      disabled={!!loading}
                      onClick={() => setRetirePendingId(null)}
                      className="text-[10px] font-bold text-zinc-400 border border-white/10 bg-white/5 px-2.5 py-1 rounded-lg disabled:opacity-40"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    disabled={!!loading}
                    onClick={() => setRetirePendingId(r.id)}
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
              )
            )}
            {r.status === 'aguardando_pagamento' && (
              <button
                disabled={!!loading}
                onClick={() => handleStatus(r.id, 'cancelado')}
                className="text-[10px] font-bold text-yellow-300 border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 rounded-lg disabled:opacity-40"
              >
                Cancelar pendência
              </button>
            )}
            {deleteConfirmId === r.id ? (
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

  // Fase 2: Controles de Agenda
  const [maxApptPerDay, setMaxApptPerDay] = useState(String(config.max_appointments_per_day ?? ''))
  const [blockMultiDay, setBlockMultiDay] = useState(config.block_multi_day_booking ?? false)
  const [maxDaysAhead, setMaxDaysAhead] = useState(String(config.calendar_max_days_ahead ?? 30))
  const [openUntilDate, setOpenUntilDate] = useState(config.calendar_open_until_date ?? '')
  const [savingAgenda, setSavingAgenda] = useState(false)

  // Fase 4: Mercado Pago — estado local do token para refletir connect/disconnect imediatamente
  const [mpConnected, setMpConnected] = useState<boolean>(!!config.mp_access_token)
  // Sync quando config muda (ex: após router.refresh() pós-OAuth bem sucedido)
  useEffect(() => { setMpConnected(!!config.mp_access_token) }, [config.mp_access_token])
  const [paymentMode, setPaymentMode] = useState<'presencial' | 'online_obrigatorio'>(config.payment_mode ?? 'presencial')
  const [aceitaDinheiro, setAceitaDinheiro] = useState<boolean>(config.aceita_dinheiro ?? true)
  const [mpExpiryMinutes, setMpExpiryMinutes] = useState(String(normalizePaymentExpiryMinutes(config.payment_expiry_minutes)))
  const [savingMp, setSavingMp] = useState(false)
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [disconnectPendingCount, setDisconnectPendingCount] = useState(0)

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
  const [openSection, setOpenSection] = useState<string>('')
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

  // Melhoria 01: copia os horários do primeiro dia útil aberto (Seg-Sex) para todos os outros dias úteis
  const applyToWeekdays = () => {
    // Dias úteis = 1 (Seg) a 5 (Sex)
    const firstOpen = hours.find(h => h.day_of_week >= 1 && h.day_of_week <= 5 && h.is_open)
    if (!firstOpen) {
      toast.error('Nenhum dia útil aberto para usar como referência.')
      return
    }
    setHours(prev => prev.map(h => {
      if (h.day_of_week < 1 || h.day_of_week > 5) return h
      return {
        ...h,
        is_open: firstOpen.is_open,
        open_time: firstOpen.open_time,
        close_time: firstOpen.close_time,
        lunch_start: firstOpen.lunch_start,
        lunch_end: firstOpen.lunch_end,
      }
    }))
    toast.success('Horário aplicado a todos os dias úteis. Clique em Salvar para confirmar.')
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

  const handleSaveAgenda = async () => {
    const maxDaysAheadParsed = parseInt(maxDaysAhead, 10)
    if (isNaN(maxDaysAheadParsed) || maxDaysAheadParsed < 1) {
      toast.error('Dias de antecedência inválido.')
      return
    }
    const parsedMaxAppt = maxApptPerDay.trim() === '' ? null : parseInt(maxApptPerDay, 10)
    if (parsedMaxAppt !== null && (isNaN(parsedMaxAppt) || parsedMaxAppt < 1 || parsedMaxAppt > 20)) {
      toast.error('Limite de agendamentos por dia deve ser entre 1 e 20.')
      return
    }
    setSavingAgenda(true)
    const result = await saveBusinessConfig({
      max_appointments_per_day: parsedMaxAppt,
      block_multi_day_booking: blockMultiDay,
      calendar_max_days_ahead: maxDaysAheadParsed,
      calendar_open_until_date: openUntilDate.trim() || null,
    })
    setSavingAgenda(false)
    if (result.success) {
      toast.success('Controles de agenda salvos.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleSaveMercadoPago = async () => {
    const expiryParsed = parseInt(mpExpiryMinutes, 10)
    if (isNaN(expiryParsed) || expiryParsed < 1 || expiryParsed > MAX_PAYMENT_EXPIRY_MINUTES) {
      toast.error(`Tempo de expiração deve ser entre 1 e ${MAX_PAYMENT_EXPIRY_MINUTES} minutos.`)
      return
    }
    setSavingMp(true)
    const result = await saveMercadoPagoConfig({
      payment_mode: paymentMode,
      payment_expiry_minutes: expiryParsed,
      aceita_dinheiro: aceitaDinheiro,
    })
    setSavingMp(false)
    if (result.success) {
      toast.success('Configurações do Mercado Pago salvas.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleDisconnectMP = async () => {
    setSavingMp(true)
    const { count } = await getPendingPaymentsCount()
    setSavingMp(false)
    setDisconnectPendingCount(count)
    setDisconnectDialogOpen(true)
  }

  const confirmDisconnectMP = async () => {
    setDisconnectDialogOpen(false)
    setSavingMp(true)
    const result = await disconnectMercadoPago()
    setSavingMp(false)
    if (result.success) {
      setMpConnected(false)
      toast.success('Mercado Pago desvinculado. Cole o token da nova conta para reconectar.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao desvincular.')
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

            {/* Logos — lado a lado */}
            <section className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Logos</h3>
              <div className="grid grid-cols-2 gap-5">
                {/* Logo Principal */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] text-zinc-500">Logo principal</span>
                  <button onClick={() => logoRef.current?.click()} className="w-20 h-20 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors">
                    {logoPreview ? (
                      <Image src={logoPreview} alt="Logo" width={80} height={80} className="object-contain w-full h-full" />
                    ) : (
                      <span className="text-xs text-muted-foreground text-center px-2">Sem logo</span>
                    )}
                  </button>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  <div className="flex flex-col gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>Trocar imagem</Button>
                    {logoFile && <Button size="sm" onClick={handleSaveLogo} disabled={savingLogo}>{savingLogo ? 'Enviando...' : 'Salvar'}</Button>}
                  </div>
                </div>
                {/* Logo Menu Inferior */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[11px] text-zinc-500">Menu inferior</span>
                  <button onClick={() => bottomLogoRef.current?.click()} className="w-20 h-20 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors">
                    {bottomLogoPreview ? (
                      <Image src={bottomLogoPreview} alt="Logo Bottom" width={80} height={80} className="object-contain w-full h-full" />
                    ) : (
                      <span className="text-xs text-muted-foreground text-center px-2">Sem logo</span>
                    )}
                  </button>
                  <input ref={bottomLogoRef} type="file" accept="image/*" className="hidden" onChange={handleBottomLogoChange} />
                  <div className="flex flex-col gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => bottomLogoRef.current?.click()}>Trocar imagem</Button>
                    {bottomLogoFile && <Button size="sm" onClick={handleSaveBottomLogo} disabled={savingBottomLogo}>{savingBottomLogo ? 'Enviando...' : 'Salvar'}</Button>}
                  </div>
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
              <div className="flex gap-2">
                <Button onClick={applyToWeekdays} variant="outline" size="sm" className="flex-1">
                  Aplicar a dias úteis
                </Button>
                <Button onClick={handleSaveHours} disabled={savingHours} size="sm" className="flex-1">
                  {savingHours ? 'Salvando...' : 'Salvar horários'}
                </Button>
              </div>
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

      {/* ── ACCORDION: Controles de Agenda ── */}
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('agenda')}
          className="w-full flex items-center justify-between px-4 py-4 bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Controles de Agenda</span>
            <span className="text-xs text-zinc-500">Limites de agendamento e janela do calendário</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${openSection === 'agenda' ? 'rotate-180' : ''}`} />
        </button>
        {openSection === 'agenda' && (
          <div className="border-t border-white/5 px-4 py-5 flex flex-col gap-5">

            {/* Limite de agendamentos por dia */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Limite de agendamentos por cliente por dia</Label>
              <p className="text-[11px] text-muted-foreground/70">Máximo de agendamentos confirmados que um cliente pode ter no mesmo dia. Deixe em branco para usar o padrão (3).</p>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min="1"
                  max="20"
                  placeholder="3"
                  value={maxApptPerDay}
                  onChange={(e) => setMaxApptPerDay(e.target.value)}
                  className="h-9 w-24"
                />
                <span className="text-xs text-muted-foreground">por dia</span>
              </div>
            </div>

            {/* Bloquear multi-dia */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-sm text-foreground">Bloquear agendamento em múltiplas datas</span>
                <span className="text-xs text-muted-foreground">Cliente com agendamento confirmado não pode marcar em outra data simultaneamente.</span>
              </div>
              <Switch checked={blockMultiDay} onCheckedChange={setBlockMultiDay} />
            </div>

            {/* Dias de antecedência */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Dias de antecedência do calendário</Label>
              <p className="text-[11px] text-muted-foreground/70">Clientes só conseguem agendar dentro deste número de dias a partir de hoje.</p>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={maxDaysAhead}
                  onChange={(e) => setMaxDaysAhead(e.target.value)}
                  className="h-9 w-24"
                />
                <span className="text-xs text-muted-foreground">dias</span>
              </div>
            </div>

            {/* Data limite absoluta */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Data limite do calendário (opcional)</Label>
              <p className="text-[11px] text-muted-foreground/70">Quando definida, o calendário fecha após esta data. Tem prioridade sobre os dias de antecedência.</p>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="date"
                  value={openUntilDate}
                  onChange={(e) => setOpenUntilDate(e.target.value)}
                  className="h-9 w-44"
                />
                {openUntilDate && (
                  <button
                    onClick={() => setOpenUntilDate('')}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <Button onClick={handleSaveAgenda} disabled={savingAgenda} size="sm">
              {savingAgenda ? 'Salvando...' : 'Salvar controles de agenda'}
            </Button>
          </div>
        )}
      </div>

      {/* ── ACCORDION: Pagamento Online ── */}
      <div className="border border-white/10 rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection('pagamento')}
          className="w-full flex items-center justify-between px-4 py-4 bg-white/[0.03] hover:bg-white/5 transition-colors text-left"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-white">Pagamento Online</span>
            <span className="text-xs text-zinc-500">Mercado Pago e formas de cobrança</span>
          </div>
          <div className="flex items-center gap-2">
            {mpConnected ? (
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">Conectado</span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-500/10 border border-zinc-500/15 rounded-full px-2 py-0.5">Desconectado</span>
            )}
            <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${openSection === 'pagamento' ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {openSection === 'pagamento' && (
          <div className="border-t border-white/5 px-4 py-5 flex flex-col gap-4">

          {/* Conexão da conta */}
          {mpConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-zinc-400">Conta Mercado Pago vinculada</span>
              </div>
              <button
                onClick={handleDisconnectMP}
                disabled={savingMp}
                className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-40 font-medium"
              >
                Desvincular
              </button>
            </div>
          ) : (
            <button
              onClick={() => { window.location.href = '/api/auth/mercadopago' }}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] flex items-center justify-center gap-2.5"
              style={{ background: 'linear-gradient(135deg, #009EE3 0%, #0077B5 100%)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              Vincular Mercado Pago
            </button>
          )}

          <div className="h-px bg-border" />

          {/* Modo de pagamento */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">Cobrança</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMode('presencial')}
                className={[
                  'flex flex-col items-center py-2.5 rounded-xl border text-xs font-bold transition-all',
                  paymentMode === 'presencial'
                    ? 'bg-white/[0.08] border-white/20 text-foreground'
                    : 'border-border text-zinc-600 hover:text-zinc-400 hover:border-zinc-700',
                ].join(' ')}
              >
                <span>Receber na barbearia</span>
                <span className="text-[9px] font-normal text-zinc-500 mt-0.5">Sem cobrança no app</span>
              </button>
              <button
                onClick={() => {
                  if (!mpConnected) return
                  setPaymentMode('online_obrigatorio')
                }}
                disabled={!mpConnected}
                title={!mpConnected ? 'Vincule o Mercado Pago primeiro' : undefined}
                className={[
                  'flex flex-col items-center py-2.5 rounded-xl border text-xs font-bold transition-all',
                  paymentMode === 'online_obrigatorio'
                    ? 'bg-white/[0.08] border-white/20 text-foreground'
                    : !mpConnected
                    ? 'border-border text-zinc-700 cursor-not-allowed opacity-50'
                    : 'border-border text-zinc-600 hover:text-zinc-400 hover:border-zinc-700',
                ].join(' ')}
              >
                <span>Cobrar no agendamento</span>
                <span className="text-[9px] font-normal text-zinc-500 mt-0.5">
                  {mpConnected ? 'Exige pagamento antecipado' : 'Vincule o MP primeiro'}
                </span>
              </button>
            </div>
          </div>

          {/* Toggle: aceita dinheiro */}
          {paymentMode === 'online_obrigatorio' && (
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-border">
              <div className="flex flex-col gap-0">
                <span className="text-xs font-medium text-foreground">Permitir pagamento presencial</span>
                <span className="text-[11px] text-zinc-500">Cliente pode optar por pagar em dinheiro ao chegar</span>
              </div>
              <Switch checked={aceitaDinheiro} onCheckedChange={setAceitaDinheiro} className="shrink-0" />
            </div>
          )}

          {/* Expiração */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">Expiração do pagamento</span>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min="1"
                max={MAX_PAYMENT_EXPIRY_MINUTES}
                value={mpExpiryMinutes}
                onChange={(e) => setMpExpiryMinutes(e.target.value)}
                className="h-8 w-16 text-center text-xs"
              />
              <span className="text-[11px] text-zinc-600">min</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Reservas online ficam bloqueadas por no máximo {MAX_PAYMENT_EXPIRY_MINUTES} minutos antes de serem liberadas automaticamente.
          </p>

          <Button onClick={handleSaveMercadoPago} disabled={savingMp} size="sm" className="w-full">
            {savingMp ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
        )}
      </div>

      {/* Footer */}
      {config.show_agency_brand && (
        <p className="text-center text-xs text-muted-foreground pb-4">
          Sistema desenvolvido por Agencia JN
        </p>
      )}

      {/* Dialog de confirmação — Desvincular Mercado Pago */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Desvincular Mercado Pago?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {disconnectPendingCount > 0
                ? `Atenção: há ${disconnectPendingCount} agendamento${disconnectPendingCount > 1 ? 's' : ''} aguardando pagamento. Eles ficarão presos nesse status até serem resolvidos manualmente. Recomendamos concluí-los antes.`
                : 'O token será removido. Você poderá vincular uma nova conta colando o token imediatamente após.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setDisconnectDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDisconnectMP} disabled={savingMp}>
              {disconnectPendingCount > 0 ? 'Desvincular mesmo assim' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<{
    profile: { email: string | null; is_admin: boolean; is_blocked: boolean; created_at: string }
    appointments: { id: string; date: string; start_time: string; status: string; service_name_snapshot: string | null; service_price_snapshot: number | null }[]
    totalAppointments: number
  } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [adminToggleConfirm, setAdminToggleConfirm] = useState<{
    userId: string
    email: string
    toAdmin: boolean
  } | null>(null)

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

  const handleDeleteUser = async () => {
    if (!deleteConfirmId) return
    setDeleting(true)
    const result = await deleteUser(deleteConfirmId)
    if (result.success) {
      toast.success('Usuário excluído com sucesso.')
      setDeleteConfirmId(null)
      await load()
    } else {
      toast.error(result.error ?? 'Erro ao excluir usuário.')
    }
    setDeleting(false)
  }

  const handleOpenDetail = async (userId: string) => {
    setDetailUserId(userId)
    setDetailData(null)
    setLoadingDetail(true)
    const result = await getUserDetails(userId)
    setLoadingDetail(false)
    if (result.success && result.data) {
      setDetailData(result.data)
    }
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

  const deleteTarget = users.find((u) => u.id === deleteConfirmId)

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
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Admins atuais ({admins.length})</p>
          {admins.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4"
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground truncate">
                  {u.email ?? 'Email nao disponivel'}
                </span>
                <span className="text-xs text-primary">Admin</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleOpenDetail(u.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted/20 transition-colors"
                  title="Ver detalhes"
                >
                  <Eye size={15} />
                </button>
                <Switch
                  checked={true}
                  onCheckedChange={() => setAdminToggleConfirm({ userId: u.id, email: u.email ?? u.id, toAdmin: false })}
                  disabled={togglingId === u.id}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Outros usuários ({others.length})</p>
          {others.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 bg-card border border-border rounded-xl p-4"
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-sm text-foreground truncate">
                  {u.email ?? 'Email nao disponivel'}
                </span>
                <span className="text-xs text-muted-foreground">Cliente</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={false}
                  onCheckedChange={() => setAdminToggleConfirm({ userId: u.id, email: u.email ?? u.id, toAdmin: true })}
                  disabled={togglingId === u.id}
                />
                <button
                  onClick={() => handleOpenDetail(u.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:bg-muted/20 transition-colors"
                  title="Ver detalhes"
                >
                  <Eye size={15} />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(u.id)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Excluir usuário"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmação de toggle admin */}
      {adminToggleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 shadow-2xl">
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-foreground">
                {adminToggleConfirm.toAdmin ? 'Promover a administrador?' : 'Remover acesso admin?'}
              </p>
              <p className="text-sm text-muted-foreground break-all">{adminToggleConfirm.email}</p>
            </div>
            <p className="text-sm text-muted-foreground leading-snug">
              {adminToggleConfirm.toAdmin
                ? 'Esta pessoa terá acesso total ao painel administrativo — agendamentos, finanças, configurações e clientes.'
                : 'Esta pessoa perderá o acesso ao painel administrativo imediatamente.'}
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setAdminToggleConfirm(null)}
                disabled={togglingId === adminToggleConfirm.userId}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const { userId, toAdmin } = adminToggleConfirm
                  setAdminToggleConfirm(null)
                  await handleToggleAdmin(userId, !toAdmin)
                }}
                disabled={togglingId === adminToggleConfirm.userId}
                className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold transition-colors disabled:opacity-60"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full flex flex-col gap-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 shrink-0">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-foreground">Excluir usuário</p>
                <p className="text-sm text-muted-foreground break-all">
                  {deleteTarget?.email ?? deleteConfirmId}
                </p>
              </div>
            </div>
            <p className="text-sm text-red-400 font-medium leading-snug">
              ⚠️ Esta ação é permanente. O usuário precisará criar uma nova conta do zero. Usuários com histórico de serviços não podem ser excluídos.
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted/20 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {deleting ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalhes do usuário */}
      {detailUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="bg-card border border-border rounded-2xl max-w-sm w-full flex flex-col shadow-2xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <p className="font-semibold text-foreground text-sm">Detalhes do usuário</p>
              <button
                onClick={() => setDetailUserId(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {loadingDetail ? (
              <div className="flex flex-col gap-3 p-5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : detailData ? (
              <div className="flex flex-col gap-5 p-5 overflow-y-auto">
                {/* Perfil */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-foreground font-medium break-all">
                      {detailData.profile.email ?? 'Email não disponível'}
                    </span>
                    {detailData.profile.is_admin && (
                      <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">Admin</span>
                    )}
                    {detailData.profile.is_blocked && (
                      <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium">Bloqueado</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Cliente desde {new Date(detailData.profile.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </span>
                </div>

                {/* Histórico de agendamentos */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Agendamentos ({detailData.totalAppointments})
                  </p>
                  {detailData.appointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum agendamento registrado.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {detailData.appointments.map((a) => (
                        <div key={a.id} className="flex items-start justify-between gap-2 bg-background/50 border border-border rounded-xl p-3">
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs font-medium text-foreground">
                              {new Date(a.date + 'T00:00:00').toLocaleDateString('pt-BR')} às {a.start_time.slice(0, 5)}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">
                              {a.service_name_snapshot ?? 'Serviço não registrado'}
                              {a.service_price_snapshot != null && ` · R$ ${a.service_price_snapshot.toFixed(2).replace('.', ',')}`}
                            </span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                            a.status === 'confirmado' ? 'bg-green-500/15 text-green-400' :
                            a.status === 'faltou' ? 'bg-red-500/15 text-red-400' :
                            'bg-zinc-500/15 text-zinc-400'
                          }`}>
                            {a.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-5">Erro ao carregar dados do usuário.</p>
            )}
          </div>
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

  const [retirePendingResId, setRetirePendingResId] = useState<string | null>(null)

  const handleReservationStatus = async (id: string, status: 'reservado' | 'cancelado' | 'retirado', paymentMethod?: PaymentMethod) => {
    const result = await updateProductReservationStatus(id, status, paymentMethod)
    if (result.success) {
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status } : r))
      toast.success('Status atualizado.')
    } else {
      toast.error(result.error ?? 'Erro.')
    }
    setRetirePendingResId(null)
  }

  const statusLabel: Record<ProductReservationStatus, string> = {
    aguardando_pagamento: 'Aguardando pagamento',
    reservado: 'Reservado',
    cancelado: 'Cancelado',
    retirado: 'Retirado',
  }
  const statusColor: Record<ProductReservationStatus, string> = {
    aguardando_pagamento: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
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
                    retirePendingResId === r.id ? (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-zinc-400">Como foi pago?</span>
                        <div className="flex gap-1.5 flex-wrap">
                          {(['dinheiro', 'pix', 'credito'] as PaymentMethod[]).map((m) => (
                            <button
                              key={m}
                              onClick={() => handleReservationStatus(r.id, 'retirado', m)}
                              className="flex-1 text-[10px] font-black uppercase tracking-widest text-blue-400 border border-blue-400/20 bg-blue-400/5 py-1.5 rounded-lg"
                            >
                              {m === 'dinheiro' ? 'Dinheiro' : m === 'pix' ? 'PIX' : 'Crédito'}
                            </button>
                          ))}
                          <button
                            onClick={() => setRetirePendingResId(null)}
                            className="text-[10px] font-black uppercase tracking-widest text-zinc-400 border border-white/10 bg-white/5 py-1.5 px-2 rounded-lg"
                          >
                            Voltar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setRetirePendingResId(r.id)}
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
                    )
                  )}
                  {r.status === 'aguardando_pagamento' && (
                    <button
                      onClick={() => handleReservationStatus(r.id, 'cancelado')}
                      className="w-full text-[10px] font-black uppercase tracking-widest text-red-400 border border-red-400/20 bg-red-400/5 py-1.5 rounded-lg"
                    >
                      Cancelar pedido pendente
                    </button>
                  )}
                  {deleteResConfirm === r.id ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          const result = await deleteProductReservation(r.id)
                          if (result.success) {
                            toast.success('Reserva excluida.')
                            setDeleteResConfirm(null)
                            loadReservations()
                          } else {
                            toast.error(result.error ?? 'Erro ao excluir reserva.')
                          }
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

// ------------------------------------------------------------------
// Tab: Financeiro
// ------------------------------------------------------------------
function TabFinanceiro({
  config,
  onRefresh,
}: {
  config: BusinessConfig
  onRefresh: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)

  // Configurações de maquininha
  const [hasMachine, setHasMachine] = useState(config.has_card_machine ?? false)
  const [debitRateInput, setDebitRateInput] = useState(String(config.debit_rate_pct ?? config.default_card_rate_pct ?? ''))
  const [creditRateInput, setCreditRateInput] = useState(String(config.credit_rate_pct ?? config.default_card_rate_pct ?? ''))
  const [savingMachine, setSavingMachine] = useState(false)
  const [machineSetup, setMachineSetup] = useState(false)

  // Modal novo lançamento
  const [showForm, setShowForm] = useState(false)
  const [formKind, setFormKind] = useState<'entrada' | 'saida'>('saida')
  const [formDesc, setFormDesc] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDate, setFormDate] = useState(today)
  const [savingForm, setSavingForm] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [baixaLoadingId, setBaixaLoadingId] = useState<string | null>(null)

  const loadEntries = async () => {
    setLoadingEntries(true)
    const result = await listFinancialTransactions({ dateFrom, dateTo })
    setTransactions(result.transactions)
    setLoadingEntries(false)
  }

  useEffect(() => { loadEntries() }, [dateFrom, dateTo])

  const totalEntradas  = transactions.filter(t => t.type === 'IN'  && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const totalSaidas    = transactions.filter(t => t.type === 'OUT' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const totalPendente  = transactions.filter(t => t.type === 'IN'  && t.status === 'PENDING').reduce((s, t) => s + t.amount, 0)
  const saldo = totalEntradas - totalSaidas

  const todayTransactions = transactions.filter(t => t.due_date === today)
  const todayEntradas = todayTransactions.filter(t => t.type === 'IN'  && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)
  const todaySaidas   = todayTransactions.filter(t => t.type === 'OUT' && t.status === 'PAID').reduce((s, t) => s + t.amount, 0)

  const handleSaveMachine = async () => {
    setSavingMachine(true)
    const debit  = hasMachine ? parseFloat(debitRateInput.replace(',', '.'))  : 0
    const credit = hasMachine ? parseFloat(creditRateInput.replace(',', '.')) : 0
    if (hasMachine && (isNaN(debit)  || debit  < 0 || debit  > 50)) { toast.error('Taxa débito inválida (0–50%).'); setSavingMachine(false); return }
    if (hasMachine && (isNaN(credit) || credit < 0 || credit > 50)) { toast.error('Taxa crédito inválida (0–50%).'); setSavingMachine(false); return }
    const [rateResult, configResult] = await Promise.all([
      saveCardRates(debit, credit),
      saveBusinessConfig({ has_card_machine: hasMachine } as Partial<BusinessConfig>),
    ])
    setSavingMachine(false)
    if (rateResult.success && configResult.success) {
      toast.success('Configuração salva.')
      setMachineSetup(false)
      onRefresh()
    } else {
      toast.error(rateResult.error ?? configResult.error ?? 'Erro.')
    }
  }

  const handleAddEntry = async () => {
    const amount = parseFloat(formAmount.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) { toast.error('Informe um valor válido.'); return }
    if (!formDesc.trim()) { toast.error('Informe uma descrição.'); return }
    setSavingForm(true)
    const result = await addManualTransaction({
      type: formKind === 'entrada' ? 'IN' : 'OUT',
      amount,
      description: formDesc.trim(),
      due_date: formDate,
    })
    setSavingForm(false)
    if (result.success) {
      toast.success('Lançamento salvo.')
      setShowForm(false)
      setFormDesc('')
      setFormAmount('')
      loadEntries()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleDelete = async (id: string) => {
    const result = await deleteManualTransaction(id)
    if (result.success) {
      toast.success('Removido.')
      setDeleteConfirmId(null)
      setTransactions(prev => prev.filter(t => t.id !== id))
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const handleBaixa = async (id: string) => {
    setBaixaLoadingId(id)
    const result = await markTransactionAsPaid(id)
    setBaixaLoadingId(null)
    if (result.success) {
      toast.success('Pagamento registrado.')
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'PAID' as const } : t))
    } else {
      toast.error(result.error ?? 'Erro ao dar baixa.')
    }
  }

  const brl = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="flex flex-col gap-6">

      {/* ── Cabeçalho ────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1">Painel</h2>
          <p className="text-xl font-semibold text-white leading-none">Financeiro</p>
        </div>
        {/* Seletor período */}
        <div className="flex items-center gap-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-3 py-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-transparent text-[11px] text-zinc-400 focus:outline-none focus:text-white cursor-pointer"
          />
          <span className="text-zinc-700 text-xs">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-transparent text-[11px] text-zinc-400 focus:outline-none focus:text-white cursor-pointer"
          />
        </div>
      </div>

      {/* ── Card de Saldo (destaque) ──────────────────────────────── */}
      <div className={`relative overflow-hidden rounded-2xl p-6 ${saldo >= 0 ? 'bg-[#1a1a1a]' : 'bg-[#1a0f0f]'}`}>
        {/* Linha decorativa sutil */}
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${saldo >= 0 ? 'bg-gradient-to-r from-transparent via-[#3a3a3a] to-transparent' : 'bg-gradient-to-r from-transparent via-red-900/60 to-transparent'}`} />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-2">Saldo do Período</p>
        <p className={`text-3xl font-semibold tabular-nums tracking-tight ${saldo >= 0 ? 'text-white' : 'text-red-400'}`}>
          {brl(saldo)}
        </p>
        <p className="text-[11px] text-zinc-600 mt-1.5">
          {saldo >= 0 ? 'Caixa positivo' : 'Caixa negativo'} · {transactions.length} lançamento{transactions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Cards Entradas / Saídas ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Entradas */}
        <div className="bg-[#1a1a1a] rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#34a853] opacity-80" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Entradas</span>
          </div>
          <p className="text-xl font-semibold tabular-nums text-[#34a853] leading-none">{brl(totalEntradas)}</p>
          <div className="h-px bg-[#262626]" />
          <p className="text-[10px] text-zinc-600">Hoje: <span className="text-zinc-400">{brl(todayEntradas)}</span></p>
        </div>
        {/* Saídas */}
        <div className="bg-[#1a1a1a] rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#e05c5c] opacity-80" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Saídas</span>
          </div>
          <p className="text-xl font-semibold tabular-nums text-[#e05c5c] leading-none">{brl(totalSaidas)}</p>
          <div className="h-px bg-[#262626]" />
          <p className="text-[10px] text-zinc-600">Hoje: <span className="text-zinc-400">{brl(todaySaidas)}</span></p>
        </div>
      </div>

      {/* ── Card A Receber (Pendentes / Fiado) ───────────────────── */}
      {totalPendente > 0 && (
        <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-600">A Receber (Fiado)</span>
            <p className="text-lg font-semibold tabular-nums text-amber-400 leading-tight">{brl(totalPendente)}</p>
          </div>
          <span className="text-[10px] text-amber-700">Dê Baixa nos lançamentos abaixo ↓</span>
        </div>
      )}

      {/* ── Configuração de maquininha ────────────────────────────── */}
      <div className="bg-[#1a1a1a] border border-[#262626] rounded-xl overflow-hidden">
        <button
          onClick={() => setMachineSetup(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${hasMachine ? 'bg-[#34a853]' : 'bg-zinc-700'}`} />
            <span className="text-sm text-zinc-300">
              {hasMachine
                ? `Maquininha — Déb ${config.debit_rate_pct ?? 0}% · Créd ${config.credit_rate_pct ?? 0}%`
                : 'Sem maquininha'}
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 uppercase tracking-wider">{machineSetup ? 'Fechar' : 'Configurar'}</span>
        </button>
        {machineSetup && (
          <div className="px-4 pb-4 border-t border-[#262626] flex flex-col gap-4">
            <p className="text-xs text-zinc-500 pt-3">
              Informe a taxa cobrada pela operadora. Ela será descontada automaticamente das receitas com cartão.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setHasMachine(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${!hasMachine ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-[#2a2a2a] hover:border-[#3a3a3a]'}`}
              >Sem maquininha</button>
              <button
                onClick={() => setHasMachine(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${hasMachine ? 'bg-white text-black border-white' : 'bg-transparent text-zinc-500 border-[#2a2a2a] hover:border-[#3a3a3a]'}`}
              >Com maquininha</button>
            </div>
            {hasMachine && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">Taxa Débito (%)</label>
                  <input type="number" min="0" max="50" step="0.1" placeholder="Ex: 1.5"
                    value={debitRateInput} onChange={(e) => setDebitRateInput(e.target.value)}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3a3a3a] placeholder-zinc-700"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-zinc-500">Taxa Crédito (%)</label>
                  <input type="number" min="0" max="50" step="0.1" placeholder="Ex: 2.5"
                    value={creditRateInput} onChange={(e) => setCreditRateInput(e.target.value)}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3a3a3a] placeholder-zinc-700"
                  />
                </div>
              </div>
            )}
            <p className="text-[11px] text-zinc-700">Encontre as taxas no contrato ou app da sua maquininha.</p>
            <button onClick={handleSaveMachine} disabled={savingMachine}
              className="self-start px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40 hover:bg-zinc-100 transition-colors">
              {savingMachine ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>

      {/* ── CTA Registrar Lançamento ──────────────────────────────── */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-sm text-black bg-[#FFBF00] hover:bg-[#e6ac00] active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(255,191,0,0.18)]"
        >
          <span className="text-base leading-none font-bold">+</span>
          Registrar Lançamento
        </button>
      )}

      {/* ── Formulário inline ─────────────────────────────────────── */}
      {showForm && (
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Novo Lançamento</p>
            <button onClick={() => { setShowForm(false); setFormDesc(''); setFormAmount('') }}
              className="text-zinc-600 hover:text-zinc-300 transition-colors text-xs uppercase tracking-wider">
              Cancelar
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setFormKind('entrada')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${formKind === 'entrada' ? 'bg-[#34a853]/15 text-[#34a853] border-[#34a853]/30' : 'bg-transparent text-zinc-600 border-[#2a2a2a] hover:border-[#3a3a3a]'}`}>
              Entrada
            </button>
            <button onClick={() => setFormKind('saida')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${formKind === 'saida' ? 'bg-[#e05c5c]/15 text-[#e05c5c] border-[#e05c5c]/30' : 'bg-transparent text-zinc-600 border-[#2a2a2a] hover:border-[#3a3a3a]'}`}>
              Saída
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <input type="text"
              placeholder={formKind === 'entrada' ? 'Descrição (ex: Corte avulso)' : 'Descrição (ex: Aluguel, Produto)'}
              value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
              className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-[#3a3a3a]"
            />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Valor em R$"
                value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
                className="bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-[#3a3a3a]"
              />
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)}
                className="bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#3a3a3a]"
              />
            </div>
          </div>

          <button onClick={handleAddEntry} disabled={savingForm}
            className="w-full py-3 rounded-xl text-sm font-semibold text-black bg-[#FFBF00] hover:bg-[#e6ac00] disabled:opacity-40 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(255,191,0,0.1)]">
            {savingForm ? 'Salvando...' : 'Salvar Lançamento'}
          </button>
        </div>
      )}

      {/* ── Tabela de Lançamentos ──────────────────────────────────── */}
      <div className="bg-[#1a1a1a] rounded-xl overflow-hidden">
        {/* Cabeçalho da tabela */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262626]">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 flex-1">Lançamentos</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600 w-20 text-right">Valor</span>
        </div>

        {loadingEntries ? (
          /* Skeleton */
          <div className="flex flex-col">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#262626] last:border-0">
                <div className="w-1 h-8 rounded-full bg-[#262626] shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3 w-2/3 rounded bg-[#262626] animate-pulse" />
                  <div className="h-2 w-1/3 rounded bg-[#1e1e1e] animate-pulse" />
                </div>
                <div className="h-3 w-16 rounded bg-[#262626] animate-pulse" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          /* Empty state estruturado */
          <div className="flex flex-col">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-4 border-b border-[#262626] last:border-0 opacity-20">
                <div className={`w-1 h-8 rounded-full shrink-0 ${i % 2 === 0 ? 'bg-[#34a853]' : 'bg-[#e05c5c]'}`} />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className={`h-3 rounded bg-[#2a2a2a] ${i === 0 ? 'w-2/3' : i === 1 ? 'w-1/2' : 'w-3/4'}`} />
                  <div className="h-2 w-1/4 rounded bg-[#222]" />
                </div>
                <div className="h-3 w-14 rounded bg-[#2a2a2a]" />
              </div>
            ))}
            <div className="px-4 py-5 text-center">
              <p className="text-xs text-zinc-600 font-medium">Nenhum lançamento no período</p>
              <p className="text-[10px] text-zinc-700 mt-0.5">Use o botão acima para registrar</p>
            </div>
          </div>
        ) : (
          transactions.map((tx) => {
            const isIN      = tx.type === 'IN'
            const isPending = tx.status === 'PENDING'
            const isCancelled = tx.status === 'CANCELLED' || tx.status === 'REFUNDED'

            const sourceLabel = (s: string) => {
              if (s === 'APPOINTMENT') return 'Serviço'
              if (s === 'STORE_SALE')  return 'Produto'
              return 'Manual'
            }
            const statusBadge = () => {
              if (tx.status === 'PAID')      return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider text-emerald-400 bg-emerald-500/10">Pago</span>
              if (tx.status === 'PENDING')   return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider text-amber-400 bg-amber-500/10">Pendente</span>
              if (tx.status === 'CANCELLED') return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider text-zinc-500 bg-zinc-500/10">Cancelado</span>
              if (tx.status === 'REFUNDED')  return <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider text-orange-400 bg-orange-500/10">Estornado</span>
              return null
            }

            return (
              <div
                key={tx.id}
                className={`flex items-center gap-3 px-4 py-3.5 border-b border-[#262626] last:border-0 transition-colors group ${isCancelled ? 'opacity-50' : 'hover:bg-[#1f1f1f]'}`}
              >
                <div className={`w-1 h-8 rounded-full shrink-0 ${isIN ? (isPending ? 'bg-amber-500' : 'bg-[#34a853]') : 'bg-[#e05c5c]'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200 truncate">{tx.description ?? '—'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-zinc-600">{tx.due_date?.split('-').reverse().join('/')}</span>
                    <span className="text-[10px] text-zinc-700">·</span>
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                      tx.source_type === 'APPOINTMENT' ? 'text-sky-400 bg-sky-500/10' :
                      tx.source_type === 'STORE_SALE'  ? 'text-violet-400 bg-violet-500/10' :
                      'text-zinc-500 bg-zinc-500/10'
                    }`}>{sourceLabel(tx.source_type)}</span>
                    {statusBadge()}
                  </div>
                </div>

                {/* Valor */}
                <span className={`text-sm font-semibold tabular-nums shrink-0 ${isIN ? (isPending ? 'text-amber-400' : 'text-[#34a853]') : 'text-[#e05c5c]'}`}>
                  {isIN ? '+' : '−'}{brl(tx.amount)}
                </span>

                {/* Botão Dar Baixa */}
                {isPending && (
                  <button
                    onClick={() => handleBaixa(tx.id)}
                    disabled={baixaLoadingId === tx.id}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold text-amber-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-colors"
                  >
                    {baixaLoadingId === tx.id ? '...' : 'Dar Baixa'}
                  </button>
                )}

                {/* Botão deletar (só manual) */}
                {tx.source_type === 'MANUAL' && !isPending && (
                  deleteConfirmId === tx.id ? (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => handleDelete(tx.id)} className="text-[10px] text-red-400 border border-red-900/40 px-2 py-1 rounded-md">Sim</button>
                      <button onClick={() => setDeleteConfirmId(null)} className="text-[10px] text-zinc-600 border border-[#2a2a2a] px-2 py-1 rounded-md">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(tx.id)}
                      className="text-zinc-700 hover:text-[#e05c5c] transition-colors opacity-0 group-hover:opacity-100 shrink-0 ml-1">
                      <Trash2 size={13} />
                    </button>
                  )
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Tab: Clientes
// ------------------------------------------------------------------
function TabClientes() {
  type ClientDirectoryItem = Awaited<ReturnType<typeof listClientDirectory>>['directory'][number]
  type ClientDirectoryDetails = NonNullable<Awaited<ReturnType<typeof getClientDirectoryDetails>>['data']>
  type ClientTimelineItem = ClientDirectoryDetails['appointments'][number]

  const [directory, setDirectory] = useState<ClientDirectoryItem[]>([])
  const [ranking, setRanking] = useState<ClientDirectoryItem[]>([])
  const [dormant, setDormant] = useState<ClientDirectoryItem[]>([])
  const [totals, setTotals] = useState({ total_clients: 0, registered_clients: 0, visitor_clients: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState<'all' | 'registered' | 'visitor' | 'dormant'>('all')
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null)
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailData, setDetailData] = useState<ClientDirectoryDetails | null>(null)
  const [deleteClientConfirm, setDeleteClientConfirm] = useState(false)
  const [deletingClient, setDeletingClient] = useState(false)

  const loadDirectory = async () => {
    setLoading(true)
    setError(null)

    const result = await listClientDirectory()

    setDirectory(result.directory)
    setRanking(result.ranking)
    setDormant(result.dormant)
    setTotals(result.totals)
    setError(result.error ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void loadDirectory()
  }, [])

  const normalizeSearchValue = (value: string | null | undefined) =>
    (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  const filteredDirectory = useMemo(() => {
    const term = normalizeSearchValue(search.trim())

    // Melhoria: determina o conjunto base pelo filtro de card ativo
    let base: ClientDirectoryItem[]
    if (cardFilter === 'registered') {
      base = directory.filter((c) => c.is_registered)
    } else if (cardFilter === 'visitor') {
      base = directory.filter((c) => !c.is_registered)
    } else if (cardFilter === 'dormant') {
      base = dormant
    } else {
      base = directory
    }

    if (!term) return base
    return base.filter((client) => {
      const haystack = [client.name, client.email, client.phone]
        .map((value) => normalizeSearchValue(value))
        .join(' ')
      return haystack.includes(term)
    })
  }, [directory, dormant, search, cardFilter])

  const formatCurrency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const formatDate = (value: string | null) => {
    if (!value) return 'Sem registro'
    return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
  }

  const formatDateTime = (date: string | null, time: string | null) => {
    if (!date) return 'Sem agendamento futuro'
    return `${formatDate(date)}${time ? ` às ${time.slice(0, 5)}` : ''}`
  }

  const getDormantDays = (value: string | null) => {
    if (!value) return null
    return Math.max(0, Math.floor((Date.now() - new Date(`${value}T12:00:00`).getTime()) / 86400000))
  }

  const getWhatsAppHref = (phone: string | null) => {
    if (!phone) return null
    const digits = phone.replace(/\D/g, '')
    if (!digits) return null
    return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`
  }

  const getStatusBadge = (status: ClientTimelineItem['status']) => {
    switch (status) {
      case 'confirmado':
        return { label: 'Confirmado', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
      case 'aguardando_pagamento':
        return { label: 'Aguardando pagamento', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' }
      case 'aguardando_acao_barbeiro':
        return { label: 'Aguardando ação do barbeiro', className: 'border-orange-500/30 bg-orange-500/10 text-orange-200' }
      case 'concluido':
        return { label: 'Concluído', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
      case 'cancelado':
        return { label: 'Cancelado', className: 'border-zinc-600/40 bg-zinc-500/10 text-zinc-300' }
      case 'faltou':
        return { label: 'Faltou', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' }
      default:
        return { label: status, className: 'border-zinc-600/40 bg-zinc-500/10 text-zinc-300' }
    }
  }

  const getPaymentBadge = (paymentContext: ClientTimelineItem['payment_context']) => {
    switch (paymentContext) {
      case 'paid_online':
        return { label: 'Pago online', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
      case 'pay_locally':
        return { label: 'Pagar no local', className: 'border-zinc-600/40 bg-zinc-500/10 text-zinc-300' }
      case 'paid':
        return { label: 'Pago', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
      case 'refunded':
        return { label: 'Estornado', className: 'border-rose-500/30 bg-rose-500/10 text-rose-300' }
      default:
        return null
    }
  }

  const openClientDetails = async (client: ClientDirectoryItem) => {
    setSelectedClientKey(client.client_key)
    setSelectedClientName(client.name)
    setDetailLoading(true)
    setDetailError(null)
    setDetailData(null)

    const result = await getClientDirectoryDetails(client.client_key)

    setDetailLoading(false)
    if (!result.success || !result.data) {
      // Bug 1: remove o registro órfão imediatamente do estado local
      setDirectory((prev) => prev.filter((c) => c.client_key !== client.client_key))
      setDormant((prev) => prev.filter((c) => c.client_key !== client.client_key))
      setDetailError(result.error ?? 'Não foi possível carregar a ficha do cliente.')
      return
    }

    setDetailData(result.data)
  }

  const closeClientDetails = () => {
    setSelectedClientKey(null)
    setSelectedClientName(null)
    setDetailLoading(false)
    setDetailError(null)
    setDetailData(null)
    setDeleteClientConfirm(false)
    setDeletingClient(false)
  }

  const handleDeleteClient = async () => {
    if (!selectedClientKey) return
    setDeletingClient(true)
    const result = await deleteClientFromDirectory(selectedClientKey)
    setDeletingClient(false)
    if (!result.success) {
      toast.error(result.error ?? 'Erro ao excluir cliente.')
      setDeleteClientConfirm(false)
      return
    }
    toast.success('Cliente excluído com sucesso.')
    closeClientDetails()
    void loadDirectory()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-extrabold uppercase tracking-widest text-white">Clientes</h2>
        <p className="text-sm text-zinc-500">
          Diretório em ordem alfabética com clientes cadastrados e visitantes, ficha completa por pessoa e ranking de recorrência.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          onClick={() => setCardFilter(cardFilter === 'all' ? 'all' : 'all')}
          className={`rounded-2xl border p-4 text-left transition-all ${
            cardFilter === 'all'
              ? 'border-white/30 bg-white/5 ring-1 ring-white/20'
              : 'border-[#2a2a2a] bg-neutral-900 hover:border-white/15 hover:bg-white/[0.03]'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total</p>
          <p className="mt-2 text-2xl font-black text-white">{totals.total_clients}</p>
          <p className="text-xs text-zinc-500">Clientes identificados no histórico</p>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'registered' ? 'all' : 'registered')}
          className={`rounded-2xl border p-4 text-left transition-all ${
            cardFilter === 'registered'
              ? 'border-sky-500/50 bg-sky-500/10 ring-1 ring-sky-500/30'
              : 'border-[#2a2a2a] bg-neutral-900 hover:border-sky-500/20 hover:bg-sky-500/[0.04]'
          }`}
        >
          <p className={`text-[10px] font-black uppercase tracking-widest ${
            cardFilter === 'registered' ? 'text-sky-400' : 'text-zinc-500'
          }`}>Cadastrados</p>
          <p className="mt-2 text-2xl font-black text-white">{totals.registered_clients}</p>
          <p className={`text-xs ${cardFilter === 'registered' ? 'text-sky-200/60' : 'text-zinc-500'}`}>Com conta vinculada</p>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'visitor' ? 'all' : 'visitor')}
          className={`rounded-2xl border p-4 text-left transition-all ${
            cardFilter === 'visitor'
              ? 'border-zinc-400/40 bg-zinc-500/10 ring-1 ring-zinc-400/20'
              : 'border-[#2a2a2a] bg-neutral-900 hover:border-zinc-500/30 hover:bg-zinc-500/[0.04]'
          }`}
        >
          <p className={`text-[10px] font-black uppercase tracking-widest ${
            cardFilter === 'visitor' ? 'text-zinc-300' : 'text-zinc-500'
          }`}>Visitantes</p>
          <p className="mt-2 text-2xl font-black text-white">{totals.visitor_clients}</p>
          <p className={`text-xs ${cardFilter === 'visitor' ? 'text-zinc-300/60' : 'text-zinc-500'}`}>Atendidos sem cadastro</p>
        </button>
        <button
          onClick={() => setCardFilter(cardFilter === 'dormant' ? 'all' : 'dormant')}
          className={`rounded-2xl border p-4 text-left transition-all ${
            cardFilter === 'dormant'
              ? 'border-amber-500/50 bg-amber-500/15 ring-1 ring-amber-500/30'
              : 'border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15 hover:border-amber-500/30'
          }`}
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Sem retorno</p>
          <p className="mt-2 text-2xl font-black text-white">{dormant.length}</p>
          <p className="text-xs text-amber-100/70">30+ dias sem novo atendimento</p>
        </button>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Busca rápida</p>
          <p className="text-sm text-zinc-500">Procure por nome, e-mail ou telefone.</p>
        </div>
        <div className="flex items-center gap-2 w-full xl:max-w-sm">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente"
            className="border-[#2a2a2a] bg-neutral-900 text-white placeholder:text-zinc-600"
          />
          {cardFilter !== 'all' && (
            <button
              onClick={() => setCardFilter('all')}
              className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-bold text-zinc-400 hover:text-white hover:border-white/20 transition-colors"
            >
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-28 rounded-2xl bg-neutral-900 animate-pulse" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <div className="h-64 rounded-2xl bg-neutral-900 animate-pulse" />
            <div className="h-56 rounded-2xl bg-neutral-900 animate-pulse" />
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : directory.length === 0 ? (
        <div className="text-center py-10 bg-neutral-900 rounded-2xl text-zinc-600 text-sm border border-[#2a2a2a]">
          Nenhum cliente encontrado no histórico.
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Diretório em ordem alfabética</p>
              <span className="text-[11px] text-zinc-500">{filteredDirectory.length} resultado(s)</span>
            </div>

            {filteredDirectory.length === 0 ? (
              <div className="rounded-2xl border border-[#2a2a2a] bg-neutral-900 p-5 text-sm text-zinc-500">
                Nenhum cliente corresponde à busca atual.
              </div>
            ) : (
              filteredDirectory.map((client) => {
                const whatsappHref = getWhatsAppHref(client.phone)

                return (
                  <div
                    key={client.client_key}
                    data-client-id={client.client_key}
                    className="rounded-2xl border border-[#2a2a2a] bg-neutral-900 p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{client.name}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${client.is_registered ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : 'border-zinc-600/40 bg-zinc-500/10 text-zinc-300'}`}>
                          {client.is_registered ? 'Cadastrado' : 'Visitante'}
                        </span>
                        {client.is_blocked && (
                          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                            Bloqueado
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 text-[11px] text-zinc-500">
                        {client.email && <span className="break-all">{client.email}</span>}
                        {client.phone && <span>{client.phone}</span>}
                        {!client.email && !client.phone && <span>Sem contato informado</span>}
                      </div>

                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="rounded-full border border-[#2f2f2f] bg-black/20 px-2 py-1 text-zinc-300">
                          {client.total_bookings} reserva(s)
                        </span>
                        <span className="rounded-full border border-[#2f2f2f] bg-black/20 px-2 py-1 text-zinc-300">
                          {client.total_services} concluído(s)
                        </span>
                        <span className="rounded-full border border-[#2f2f2f] bg-black/20 px-2 py-1 text-zinc-300">
                          {formatCurrency(client.total_spent)}
                        </span>
                        {client.avg_rating != null && (
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-300">
                            ⭐ {client.avg_rating.toFixed(1)}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-500">
                        Último atendimento: {formatDate(client.last_service_date)}
                        {client.next_service_date ? ` · Próximo: ${formatDateTime(client.next_service_date, client.next_service_time)}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {whatsappHref && (
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-300"
                        >
                          WhatsApp
                        </a>
                      )}
                      <button
                        onClick={() => void openClientDetails(client)}
                        className="rounded-xl border border-[#2f2f2f] bg-black/20 px-3 py-2 text-[11px] font-bold text-white hover:border-white/20 transition-colors"
                      >
                        Abrir ficha
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-[#2a2a2a] bg-neutral-900 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Ranking de recorrência</p>
                <span className="text-[11px] text-zinc-500">Top {ranking.length}</span>
              </div>

              {ranking.length === 0 ? (
                <div className="rounded-xl border border-[#2a2a2a] bg-black/20 p-4 text-sm text-zinc-500">
                  Ainda não há clientes com atendimento concluído.
                </div>
              ) : (
                ranking.map((client, index) => (
                  <button
                    key={client.client_key}
                    type="button"
                    onClick={() => void openClientDetails(client)}
                    className="rounded-xl border border-[#2a2a2a] bg-black/20 p-3 text-left hover:border-white/10 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">#{index + 1}</p>
                        <p className="mt-1 text-sm font-semibold text-white truncate">{client.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {client.total_services} concluído(s) · {formatCurrency(client.total_spent)}
                        </p>
                      </div>
                      {client.avg_rating != null && (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300">
                          ⭐ {client.avg_rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {dormant.length > 0 && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">Clientes sem retorno</p>
                  <span className="text-[11px] text-amber-100/70">30+ dias</span>
                </div>

                {dormant.slice(0, 8).map((client) => {
                  const whatsappHref = getWhatsAppHref(client.phone)
                  const dormantDays = getDormantDays(client.last_service_date)

                  return (
                    <div
                      key={client.client_key}
                      className="rounded-xl border border-amber-500/20 bg-black/20 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{client.name}</p>
                        <p className="text-[11px] text-amber-100/70">
                          {dormantDays != null ? `${dormantDays} dia(s) desde o último serviço concluído` : 'Sem data de atendimento concluído'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {whatsappHref && (
                          <a
                            href={whatsappHref}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-bold text-emerald-300"
                          >
                            WhatsApp
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => void openClientDetails(client)}
                          className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-200"
                        >
                          Ver ficha
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedClientKey)} onOpenChange={(open) => { if (!open) closeClientDetails() }}>
        <DialogContent className="sm:max-w-4xl border-[#2a2a2a] bg-[#111111] text-white max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white">{detailData?.client.name ?? selectedClientName ?? 'Cliente'}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Histórico operacional e financeiro consolidado por cliente.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="h-64 rounded-2xl bg-neutral-900 animate-pulse" />
              <div className="h-64 rounded-2xl bg-neutral-900 animate-pulse" />
            </div>
          ) : detailError ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
              <p className="text-sm text-red-300">{detailError}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { closeClientDetails(); void loadDirectory() }}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-200 hover:bg-red-500/20 transition-colors"
                >
                  Atualizar lista
                </button>
                {!deleteClientConfirm ? (
                  <button
                    onClick={() => setDeleteClientConfirm(true)}
                    className="rounded-xl border border-rose-600/40 bg-rose-600/10 px-3 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-600/20 transition-colors"
                  >
                    Forçar exclusão
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => void handleDeleteClient()}
                      disabled={deletingClient}
                      className="rounded-xl border border-rose-600/50 bg-rose-600/20 px-3 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-600/30 transition-colors disabled:opacity-50"
                    >
                      {deletingClient ? 'Excluindo...' : 'Confirmar exclusão'}
                    </button>
                    <button
                      onClick={() => setDeleteClientConfirm(false)}
                      className="rounded-xl border border-zinc-600/40 bg-zinc-500/10 px-3 py-1.5 text-[11px] font-bold text-zinc-400 hover:bg-zinc-500/20 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : detailData ? (
            <div className="flex-1 min-h-0 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] overflow-y-auto pr-1">
              <div className="rounded-2xl border border-[#2a2a2a] bg-neutral-900 p-4 flex flex-col gap-4 h-fit">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${detailData.client.is_registered ? 'border-sky-500/20 bg-sky-500/10 text-sky-300' : 'border-zinc-600/40 bg-zinc-500/10 text-zinc-300'}`}>
                    {detailData.client.is_registered ? 'Cadastrado' : 'Visitante'}
                  </span>
                  {detailData.client.is_blocked && (
                    <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                      Bloqueado
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 text-sm text-zinc-300">
                  {detailData.client.email && <span className="break-all">{detailData.client.email}</span>}
                  {detailData.client.phone && <span>{detailData.client.phone}</span>}
                  {!detailData.client.email && !detailData.client.phone && <span className="text-zinc-500">Sem contato informado</span>}
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="rounded-xl border border-[#2a2a2a] bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Reservas</p>
                    <p className="mt-1 text-lg font-black text-white">{detailData.client.total_bookings}</p>
                  </div>
                  <div className="rounded-xl border border-[#2a2a2a] bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Concluídos</p>
                    <p className="mt-1 text-lg font-black text-white">{detailData.client.total_services}</p>
                  </div>
                  <div className="rounded-xl border border-[#2a2a2a] bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Faturado</p>
                    <p className="mt-1 text-lg font-black text-white">{formatCurrency(detailData.client.total_spent)}</p>
                  </div>
                  <div className="rounded-xl border border-[#2a2a2a] bg-black/20 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Nota média</p>
                    <p className="mt-1 text-lg font-black text-white">
                      {detailData.client.avg_rating != null ? detailData.client.avg_rating.toFixed(1) : 'Sem nota'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-[#2a2a2a] bg-black/20 p-3 text-[11px] text-zinc-400">
                  <p>Último concluído: <span className="text-zinc-200">{formatDate(detailData.client.last_service_date)}</span></p>
                  <p>Próximo agendamento: <span className="text-zinc-200">{formatDateTime(detailData.client.next_service_date, detailData.client.next_service_time)}</span></p>
                  {detailData.client.created_at && (
                    <p>Cadastro: <span className="text-zinc-200">{new Date(detailData.client.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span></p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#2a2a2a] bg-neutral-900 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Linha do tempo</p>
                  <span className="text-[11px] text-zinc-500">{detailData.appointments.length} registro(s)</span>
                </div>

                {detailData.appointments.length === 0 ? (
                  <div className="rounded-xl border border-[#2a2a2a] bg-black/20 p-4 text-sm text-zinc-500">
                    Nenhum histórico encontrado para este cliente.
                  </div>
                ) : (
                  detailData.appointments.map((appointment) => {
                    const statusBadge = getStatusBadge(appointment.status)
                    const paymentBadge = getPaymentBadge(appointment.payment_context)

                    return (
                      <div key={appointment.id} className="rounded-2xl border border-[#2a2a2a] bg-black/20 p-4 flex flex-col gap-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {appointment.service_name_snapshot ?? 'Serviço sem nome'}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {formatDateTime(appointment.date, appointment.start_time)}
                              {appointment.service_price_snapshot != null && ` · ${formatCurrency(appointment.service_price_snapshot)}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadge.className}`}>
                              {statusBadge.label}
                            </span>
                            {paymentBadge && (
                              <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${paymentBadge.className}`}>
                                {paymentBadge.label}
                              </span>
                            )}
                          </div>
                        </div>

                        {(appointment.rating_score != null || appointment.rating_note) && (
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-100/80">
                            {appointment.rating_score != null && (
                              <p className="font-semibold text-amber-200">Avaliação: {appointment.rating_score.toFixed(1)} / 5</p>
                            )}
                            {appointment.rating_note && (
                              <p className="mt-1 leading-relaxed">{appointment.rating_note}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}

          {detailData && (
            <div className="mt-2 pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
              {deleteClientConfirm ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-red-300 font-semibold">Confirma exclusão permanente?</span>
                  <button
                    onClick={() => void handleDeleteClient()}
                    disabled={deletingClient}
                    className="rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                  >
                    {deletingClient ? 'Excluindo...' : 'Sim, excluir tudo'}
                  </button>
                  <button
                    onClick={() => setDeleteClientConfirm(false)}
                    disabled={deletingClient}
                    className="rounded-lg border border-zinc-600/40 bg-zinc-500/10 px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-zinc-500/20 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteClientConfirm(true)}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-400 hover:bg-red-500/20 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 size={12} />
                  Excluir cliente
                </button>
              )}
              <span className="text-[10px] text-zinc-600">
                {detailData.client.is_registered ? 'Remove conta e todo o histórico' : 'Remove histórico de agendamentos'}
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
