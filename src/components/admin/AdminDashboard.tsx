'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
} from '@/app/admin/actions'
import type {
  BusinessConfig,
  WorkingHours,
  SpecialSchedule,
  Service,
  Appointment,
} from '@/lib/supabase/types'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

type Tab = 'hoje' | 'configuracoes' | 'servicos'

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

  const TABS: { key: Tab; label: string }[] = [
    { key: 'hoje', label: 'Hoje' },
    { key: 'configuracoes', label: 'Configuracoes' },
    { key: 'servicos', label: 'Servicos' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
              src={config.logo_url ?? '/logo-barbearialeste.png'}
              alt="Logo"
              width={32}
              height={32}
              className="w-8 h-8 rounded-lg object-contain"
            />
          <span className="font-semibold text-sm text-foreground">Painel Admin</span>
        </div>
        <a
          href="/api/auth/signout"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sair
        </a>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-border px-4 gap-4 bg-background">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'py-3 text-sm border-b-2 transition-colors',
              tab === t.key
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-5 max-w-lg mx-auto w-full">
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
      </main>
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
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {confirmed.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          Nenhum agendamento confirmado para hoje.
        </div>
      )}

      {confirmed.map((appt) => (
        <div key={appt.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-sm text-foreground">{getDisplayName(appt)}</span>
              <span className="text-xs text-muted-foreground">{appt.services?.name}</span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-sm font-semibold text-foreground">{appt.start_time}</span>
              {appt.services?.price != null && (
                <span className="text-xs text-muted-foreground">
                  R&#36; {appt.services.price.toFixed(2).replace('.', ',')}
                </span>
              )}
            </div>
          </div>
          {appt.client_phone && (
            <span className="text-xs text-muted-foreground">{appt.client_phone}</span>
          )}
          <div className="flex gap-2 flex-wrap">
            <button
              disabled={loading === appt.id + 'cancelado'}
              onClick={() => handleStatus(appt.id, 'cancelado')}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-lg transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              disabled={loading === appt.id + 'faltou'}
              onClick={() => handleStatus(appt.id, 'faltou')}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-lg transition-colors disabled:opacity-40"
            >
              Nao compareceu
            </button>
            {appt.client_id && (
              <button
                disabled={loading === 'block' + appt.client_id}
                onClick={() => handleBlock(appt.client_id, true)}
                className="text-xs text-destructive hover:text-destructive/80 px-3 py-1.5 border border-destructive/30 rounded-lg transition-colors disabled:opacity-40"
              >
                Bloquear cliente
              </button>
            )}
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            Ver outros status ({others.length})
          </summary>
          <div className="flex flex-col gap-2 mt-2">
            {others.map((appt) => (
              <div
                key={appt.id}
                className="bg-card/50 border border-border/50 rounded-xl p-3 flex items-center justify-between"
              >
                <div>
                  <span className="text-sm text-muted-foreground">{getDisplayName(appt)}</span>
                  <span className="text-xs text-muted-foreground ml-2">— {appt.start_time}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-border text-muted-foreground">
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
  const [savingConfig, setSavingConfig] = useState(false)

  // Logo
  const [logoPreview, setLogoPreview] = useState<string | null>(config.logo_url)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [savingLogo, setSavingLogo] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

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
    })
    setSavingConfig(false)
    if (result.success) {
      toast.success('Configuracoes salvas.')
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao salvar.')
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
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
        <h3 className="text-sm font-medium text-foreground">Logo</h3>
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

      {/* Regras */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-foreground">Regras de agendamento</h3>
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-foreground">Exigir login com Google</span>
              <span className="text-xs text-muted-foreground">Desativado = qualquer um agenda</span>
            </div>
            <Switch checked={requireGoogle} onCheckedChange={setRequireGoogle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Cancelamento ate (minutos antes)</Label>
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
