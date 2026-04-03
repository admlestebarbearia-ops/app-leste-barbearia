'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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
} from '@/app/admin/actions'
import type {
  BusinessConfig,
  WorkingHours,
  SpecialSchedule,
  Service,
  Appointment,
} from '@/lib/supabase/types'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

type Tab = 'hoje' | 'configuracoes' | 'servicos' | 'admins' | 'galeria'

interface Props {
  config: BusinessConfig
  appointments: Appointment[]
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  services: Service[]
}

export function AdminDashboard({
  config,
  appointments,
  workingHours,
  specialSchedules,
  services,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('hoje')
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false)
  const [pauseMessage, setPauseMessage] = useState(config.pause_message || '')
  const [pauseReturnTime, setPauseReturnTime] = useState(config.pause_return_time || '')

  const handlePauseConfirm = async (val: boolean) => {
    const id = toast.loading(val ? 'Pausando expediente...' : 'Retornando expediente...')
    const res = await togglePauseStatus(val, val ? pauseMessage : null, val ? pauseReturnTime : null)
    if (res.success) {
      toast.success(val ? 'Sistema pausado.' : 'Sistema liberado.', { id })
      setIsPauseDialogOpen(false)
      router.refresh()
    } else {
      toast.error('Erro ao alterar status: ' + res.error, { id })
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'hoje', label: 'AGENDA' },
    { key: 'configuracoes', label: 'PREFERÊNCIAS' },
    { key: 'servicos', label: 'CATÁLOGO' },
    { key: 'galeria', label: 'GALERIA' },
    { key: 'admins', label: 'SEGURANÇA' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b] text-[#f4f4f5] font-sans selection:bg-white/20">
      {/* Header Premium (Glassmorphism) */}
      <header className="sticky top-0 z-30 bg-black/40 backdrop-blur-2xl border-b border-white/10 px-6 py-4 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4">
          <div className="relative p-[1px] bg-gradient-to-b from-white/20 to-white/5 rounded-xl">
            <div className="bg-black/50 p-1.5 rounded-xl backdrop-blur-xl">
              <Image
                src={config.logo_url ?? '/logo-barbearialeste.png'}
                alt="Logo"
                width={32}
                height={32}
                className="w-8 h-8 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]"
              />
            </div>
          </div>
          <span className="font-extrabold text-sm tracking-widest text-white uppercase opacity-90">Painel Executivo</span>
        </div>

          <div className="flex items-center gap-5">
            <button
              onClick={() => setIsPauseDialogOpen(true)}
              className={`flex items-center gap-3 text-xs uppercase tracking-wider font-bold cursor-pointer bg-white/[0.03] backdrop-blur-md px-4 py-2 rounded-xl border transition-all duration-300 hover:bg-white/[0.05] ${config.is_paused ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-white/10 hover:border-white/20'}`}
            >
              <span className={config.is_paused ? "text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "text-zinc-400"}>
                {config.is_paused ? 'PAUSADO' : 'SISTEMA ATIVO'}
              </span>
              <div
                className={`w-10 h-5 flex items-center rounded-full transition-colors duration-500 ease-in-out ${config.is_paused ? 'bg-red-500/20' : 'bg-white/10'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-transform duration-500 ease-out ${config.is_paused ? 'translate-x-5 bg-red-400' : 'translate-x-1'}`} />
              </div>
            </button>

            <a
              href="/api/auth/signout"
              className="text-xs font-bold tracking-widest uppercase text-zinc-500 hover:text-white transition-colors"
            >
              SAIR
            </a>
          </div>
        </header>

        {/* Tabs Premium */}
        <div className="flex border-b border-white/5 px-6 gap-6 bg-black/20 backdrop-blur-md overflow-x-auto hide-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'py-4 text-[10px] uppercase tracking-[0.15em] font-extrabold border-b-2 transition-all duration-300 whitespace-nowrap',
                tab === t.key
                  ? 'border-white text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]'
                  : 'border-transparent text-zinc-600 hover:text-zinc-300',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

      {/* Content Area com background mais limpo */}
      <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        {tab === 'hoje' && (
          <TabHoje
            appointments={appointments}
            displayPref={config.display_name_preference}
            onRefresh={() => router.refresh()}
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
        {tab === 'galeria' && (
          <TabGaleria />
        )}
        {tab === 'admins' && (
          <TabAdmins />
        )}
        </div>
      </main>

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
                <Label htmlFor="pauseReturn">Retornos previsto as (ex: 14:00)</Label>
                <Input
                  id="pauseReturn"
                  placeholder="14:00"
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
// Tab: Hoje
// ------------------------------------------------------------------
function TabHoje({
  appointments,
  displayPref,
  onRefresh,
}: {
  appointments: Appointment[]
  displayPref: string
  onRefresh: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)

  const getDisplayName = (appt: Appointment) => {
    return appt.profiles?.display_name ?? appt.client_name ?? 'Cliente'
  }

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

  const confirmed = appointments.filter((a) => a.status === 'confirmado')
  const others = appointments.filter((a) => a.status !== 'confirmado')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold uppercase tracking-widest text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">Agenda do Dia</h2>
        <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 bg-white/5 py-1 px-3 rounded-full border border-white/5">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {confirmed.length === 0 && (
        <div className="text-center py-16 bg-white/[0.02] border border-white/5 rounded-3xl backdrop-blur-sm -mt-2">
          <p className="text-zinc-500 font-medium tracking-wide uppercase text-xs">Agenda livre no momento.</p>
        </div>
      )}

      {confirmed.map((appt) => (
        <div key={appt.id} className="relative group bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-500 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col gap-4 shadow-[0_4px_25px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="flex flex-col gap-1.5">
              <span className="font-bold text-sm tracking-wide text-white uppercase">{getDisplayName(appt)}</span>
              <span className="text-[11px] font-medium tracking-widest uppercase text-zinc-400">{appt.services?.name}</span>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0 bg-black/40 px-3 py-2 rounded-xl border border-white/5">
              <span className="text-xs font-black tracking-wider text-white">{appt.start_time}</span>
              {appt.services?.price != null && (
                <span className="text-[10px] font-bold text-zinc-400">
                  R&#36; {appt.services.price.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
          </div>
          {appt.client_phone && (
            <a
              href={`https://wa.me/55${appt.client_phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-bold tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1.5 uppercase"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              WhatsApp
            </a>
          )}
          <div className="flex gap-2 flex-wrap pt-2 border-t border-white/5 relative z-10 mt-2">
            <button
              disabled={loading === appt.id + 'cancelado'}
              onClick={() => handleStatus(appt.id, 'cancelado')}
              className="text-[10px] font-extrabold tracking-widest uppercase text-white/50 hover:text-white bg-white/5 px-3 py-1.5 border border-white/5 hover:border-white/20 rounded-xl transition-all disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              disabled={loading === appt.id + 'faltou'}
              onClick={() => handleStatus(appt.id, 'faltou')}
              className="text-[10px] font-extrabold tracking-widest uppercase text-amber-500/70 hover:text-amber-400 bg-amber-500/5 px-3 py-1.5 border border-amber-500/10 hover:border-amber-500/30 rounded-xl transition-all disabled:opacity-40"
            >
              Faltou
            </button>
            {appt.client_id && (
              <button
                disabled={loading === 'block' + appt.client_id}
                onClick={() => handleBlock(appt.client_id, true)}
                className="text-[10px] font-extrabold tracking-widest uppercase text-red-500 hover:text-red-400 bg-red-500/5 px-3 py-1.5 border border-red-500/20 hover:border-red-500/40 rounded-xl transition-all disabled:opacity-40"
              >
                Bloquear Acesso
              </button>
            )}
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <details className="mt-4 group">
          <summary className="text-[10px] font-extrabold tracking-widest uppercase text-zinc-500 cursor-pointer hover:text-white transition-colors bg-white/5 px-4 py-3 rounded-xl border border-white/10 w-fit">
            Ver Outros
          </summary>
          <div className="flex flex-col gap-3 mt-4">
            {others.map((appt) => (
              <div
                key={appt.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between backdrop-blur-sm"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-bold tracking-wide uppercase text-zinc-300">{getDisplayName(appt)}</span>
                  <span className="text-[10px] font-extrabold tracking-widest text-zinc-500">{appt.start_time}</span>
                </div>
                <span className="text-[9px] font-black tracking-widest uppercase px-3 py-1.5 rounded-full border border-white/10 bg-black/40 text-zinc-400">
                  {appt.status}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
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
  const [enableGallery, setEnableGallery] = useState(config.enable_gallery)
  const [allowClientUploads, setAllowClientUploads] = useState(config.allow_client_uploads)
  const [savingConfig, setSavingConfig] = useState(false)

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

  const updateHour = (dayOfWeek: number, field: keyof WorkingHours, value: unknown) => {
    setHours((prev) =>
      prev.map((h) => (h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h))
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
    <div className="flex flex-col gap-6">
      {/* Logo */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Logo Principal</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={() => logoRef.current?.click()}
            className="w-20 h-20 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors shrink-0"
          >
            {logoPreview ? (
              <Image src={logoPreview} alt="Logo" width={80} height={80} className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-muted-foreground text-center px-2">Sem logo</span>
            )}
          </button>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => logoRef.current?.click()}
            >
              Trocar imagem
            </Button>
            {logoFile && (
              <Button size="sm" onClick={handleSaveLogo} disabled={savingLogo}>
                {savingLogo ? 'Enviando...' : 'Salvar logo'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Logo Menu Inferior */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Logo Menu Inferior (Separado)</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={() => bottomLogoRef.current?.click()}
            className="w-20 h-20 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors shrink-0"
          >
            {bottomLogoPreview ? (
              <Image src={bottomLogoPreview} alt="Logo Bottom" width={80} height={80} className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-muted-foreground text-center px-2">Sem logo</span>
            )}
          </button>
          <input ref={bottomLogoRef} type="file" accept="image/*" className="hidden" onChange={handleBottomLogoChange} />
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bottomLogoRef.current?.click()}
            >
              Trocar menu logo
            </Button>
            {bottomLogoFile && (
              <Button size="sm" onClick={handleSaveBottomLogo} disabled={savingBottomLogo}>
                {savingBottomLogo ? 'Enviando...' : 'Salvar logo inferior'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Regras e Galeria */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Configurações Gerais</h3>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="text-sm text-foreground">Exigir login com Google</span>
              <span className="text-xs text-muted-foreground">Desativado = qualquer um agenda</span>
            </div>
            <Switch checked={requireGoogle} onCheckedChange={setRequireGoogle} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="text-sm text-foreground">Ativar Galeria</span>
              <span className="text-xs text-muted-foreground">Exibe a aba de fotos para clientes</span>
            </div>
            <Switch checked={enableGallery} onCheckedChange={setEnableGallery} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 flex-1">
              <span className="text-sm text-foreground">Clientes enviam fotos</span>
              <span className="text-xs text-muted-foreground">Clientes podem enviar fotos para aprovação</span>
            </div>
            <Switch checked={allowClientUploads} onCheckedChange={setAllowClientUploads} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Cancelamento até (minutos antes)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                value={cancelWindow}
                onChange={(e) => setCancelWindow(e.target.value)}
                className="h-9 w-24"
              />
              <span className="text-xs text-muted-foreground">minutos</span>
            </div>
          </div>
          <Button onClick={handleSaveConfig} disabled={savingConfig} size="sm">
            {savingConfig ? 'Salvando...' : 'Salvar regras'}
          </Button>
        </div>
      </section>

      {/* Horários semanais */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Horarios semanais</h3>
        <div className="flex flex-col gap-2">
          {hours.map((h) => (
            <div key={h.day_of_week} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{DAYS[h.day_of_week]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{h.is_open ? 'Aberto' : 'Fechado'}</span>
                  <Switch
                    checked={h.is_open}
                    onCheckedChange={(v) => updateHour(h.day_of_week, 'is_open', v)}
                  />
                </div>
              </div>
              {h.is_open && (
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1 flex-1">
                    <Label className="text-xs text-muted-foreground">Abertura</Label>
                    <input
                      type="time"
                      value={h.open_time ?? '09:00'}
                      onChange={(e) => updateHour(h.day_of_week, 'open_time', e.target.value || null)}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <Label className="text-xs text-muted-foreground">Fechamento</Label>
                    <input
                      type="time"
                      value={h.close_time ?? '19:00'}
                      onChange={(e) => updateHour(h.day_of_week, 'close_time', e.target.value || null)}
                      className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <Button onClick={handleSaveHours} disabled={savingHours} size="sm">
          {savingHours ? 'Salvando...' : 'Salvar horarios'}
        </Button>
      </section>

      {/* Folgas / Feriados */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Folgas e feriados</h3>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Data</Label>
            <input
              type="date"
              value={folgaDate}
              onChange={(e) => setFolgaDate(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Motivo (opcional)</Label>
            <Input
              value={folgaMotivo}
              onChange={(e) => setFolgaMotivo(e.target.value)}
              placeholder="Ex: Feriado nacional"
              className="h-9"
            />
          </div>
          <Button size="sm" onClick={handleAddFolga} disabled={addingFolga}>
            {addingFolga ? 'Adicionando...' : 'Adicionar folga'}
          </Button>
        </div>

        {specialSchedules.length > 0 && (
          <div className="flex flex-col gap-2">
            {specialSchedules.map((ss) => (
              <div
                key={ss.id}
                className="flex items-center justify-between bg-card/50 border border-border/50 rounded-xl px-4 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-foreground">
                    {new Date(ss.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                  </span>
                  {ss.reason && <span className="text-xs text-muted-foreground">{ss.reason}</span>}
                </div>
                <button
                  onClick={() => handleRemoveFolga(ss.id)}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dominio */}
      <section className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Dominio proprio</span>
        <p className="text-xs text-muted-foreground">
          Seu site esta em leste.agenciajn.com.br. Para ter um dominio proprio, entre em contato.
        </p>
        <div className="mt-1">
          <DomainModal />
        </div>
      </section>

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
  const [saving, setSaving] = useState(false)

  // Novo servico
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newDuration, setNewDuration] = useState('30')

  const startEdit = (svc: Service) => {
    setEditingId(svc.id)
    setEditName(svc.name)
    setEditPrice(String(svc.price))
    setEditDuration(String(svc.duration_minutes))
  }

  const handleSaveEdit = async () => {
    if (!editingId) return
    const price = parseFloat(editPrice)
    const duration = parseInt(editDuration, 10)
    if (isNaN(price) || isNaN(duration)) { toast.error('Valores invalidos.'); return }
    setSaving(true)
    const result = await upsertService({ id: editingId, name: editName.trim(), price, duration_minutes: duration })
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
    const result = await upsertService({ name: newName.trim(), price, duration_minutes: duration })
    setSaving(false)
    if (result.success) {
      toast.success('Servico criado.')
      setShowNew(false)
      setNewName('')
      setNewPrice('')
      setNewDuration('30')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Servicos</h3>
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
          <Button size="sm" onClick={handleCreateNew} disabled={saving}>
            {saving ? 'Salvando...' : 'Criar servico'}
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

  useState(() => { load() })

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
