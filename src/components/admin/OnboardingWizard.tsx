'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { completeOnboarding, uploadImage } from '@/app/admin/actions'
import type { BusinessConfig, WorkingHours } from '@/lib/supabase/types'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

interface WizardHour {
  day_of_week: number
  is_open: boolean
  open_time: string | null
  close_time: string | null
  lunch_start: string | null
  lunch_end: string | null
}

interface Props {
  initialConfig: BusinessConfig | null
  workingHours: WorkingHours[]
}

export function OnboardingWizard({ initialConfig, workingHours }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Passo 1: Perfil
  const [barberName, setBarberName] = useState(initialConfig?.barber_name ?? 'Willians Lopes')
  const [barberNickname, setBarberNickname] = useState(initialConfig?.barber_nickname ?? 'China')
  const [displayPref, setDisplayPref] = useState<'name' | 'nickname'>(
    initialConfig?.display_name_preference ?? 'nickname'
  )
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialConfig?.barber_photo_url ?? null)

  // Passo 2: Logo
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(initialConfig?.logo_url ?? null)

  // Passo 3: Horários
  const [hours, setHours] = useState<WizardHour[]>(
    workingHours.length > 0
      ? workingHours.map((wh) => ({
          day_of_week: wh.day_of_week,
          is_open: wh.is_open,
          open_time: wh.open_time,
          close_time: wh.close_time,
          lunch_start: wh.lunch_start,
          lunch_end: wh.lunch_end,
        }))
      : Array.from({ length: 7 }, (_, i) => ({
          day_of_week: i,
          is_open: i !== 0,
          open_time: '09:00',
          close_time: i === 6 ? '18:00' : '19:00',
          lunch_start: null,
          lunch_end: null,
        }))
  )

  // Passo 4: Regras
  const [requireGoogleLogin, setRequireGoogleLogin] = useState(
    initialConfig?.require_google_login ?? true
  )
  const [cancellationWindow, setCancellationWindow] = useState(
    String(initialConfig?.cancellation_window_minutes ?? 120)
  )

  const photoInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const updateHour = (dayOfWeek: number, field: keyof WizardHour, value: unknown) => {
    setHours((prev) =>
      prev.map((h) => (h.day_of_week === dayOfWeek ? { ...h, [field]: value } : h))
    )
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      let finalPhotoUrl = initialConfig?.barber_photo_url ?? null
      let finalLogoUrl = initialConfig?.logo_url ?? null

      // Upload foto de perfil
      if (photoFile && photoPreview) {
        const { url, error } = await uploadImage('barbeiro-foto', photoPreview, photoFile.type)
        if (error) { toast.error('Erro ao enviar foto: ' + error); setSaving(false); return }
        finalPhotoUrl = url
      }

      // Upload logo
      if (logoFile && logoPreview) {
        const { url, error } = await uploadImage('logo', logoPreview, logoFile.type)
        if (error) { toast.error('Erro ao enviar logo: ' + error); setSaving(false); return }
        finalLogoUrl = url
      }

      const window_minutes = parseInt(cancellationWindow, 10)
      if (isNaN(window_minutes) || window_minutes < 0) {
        toast.error('Janela de cancelamento invalida.')
        setSaving(false)
        return
      }

      const result = await completeOnboarding({
        barber_name: barberName.trim(),
        barber_nickname: barberNickname.trim(),
        display_name_preference: displayPref,
        barber_photo_url: finalPhotoUrl,
        logo_url: finalLogoUrl,
        require_google_login: requireGoogleLogin,
        cancellation_window_minutes: window_minutes,
        workingHours: hours,
      })

      if (result.success) {
        toast.success('Configuracao salva! Bem-vindo ao painel.')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Erro ao salvar.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-5 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="w-full mb-8">
        <h1 className="text-xl font-semibold text-foreground">Configuracao inicial</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vamos configurar tudo em 4 passos rapidos.
        </p>
        {/* Progress */}
        <div className="flex gap-1.5 mt-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={[
                'flex-1 h-1 rounded-full transition-colors',
                n <= step ? 'bg-primary' : 'bg-border',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {/* Passo 1: Perfil */}
      {step === 1 && (
        <div className="w-full flex flex-col gap-5">
          <h2 className="text-base font-medium text-foreground">Passo 1 — Seu perfil</h2>

          {/* Foto */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-24 h-24 rounded-full bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors"
            >
              {photoPreview ? (
                <Image src={photoPreview} alt="Foto" width={96} height={96} className="object-cover w-full h-full" />
              ) : (
                <span className="text-xs text-muted-foreground text-center leading-snug px-2">
                  Adicionar foto (opcional)
                </span>
              )}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="barberName" className="text-sm text-muted-foreground">Nome completo</Label>
            <Input
              id="barberName"
              value={barberName}
              onChange={(e) => setBarberName(e.target.value)}
              placeholder="Willians Lopes"
              className="h-10"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="barberNickname" className="text-sm text-muted-foreground">Apelido</Label>
            <Input
              id="barberNickname"
              value={barberNickname}
              onChange={(e) => setBarberNickname(e.target.value)}
              placeholder="China"
              className="h-10"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm text-muted-foreground">Como aparecer para os clientes?</Label>
            <div className="flex gap-3">
              {(['name', 'nickname'] as const).map((pref) => (
                <button
                  key={pref}
                  onClick={() => setDisplayPref(pref)}
                  className={[
                    'flex-1 h-10 rounded-lg border text-sm transition-all',
                    displayPref === pref
                      ? 'border-primary bg-primary/5 text-foreground font-medium'
                      : 'border-border text-muted-foreground hover:border-foreground/20',
                  ].join(' ')}
                >
                  {pref === 'name' ? barberName || 'Nome completo' : barberNickname || 'Apelido'}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={() => setStep(2)} className="w-full h-10 mt-2">
            Proximo
          </Button>
        </div>
      )}

      {/* Passo 2: Logo */}
      {step === 2 && (
        <div className="w-full flex flex-col gap-5">
          <h2 className="text-base font-medium text-foreground">Passo 2 — Logo da barbearia</h2>

          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => logoInputRef.current?.click()}
              className="w-40 h-40 rounded-xl bg-card border border-border overflow-hidden flex items-center justify-center hover:border-primary/50 transition-colors"
            >
              {logoPreview ? (
                <Image src={logoPreview} alt="Logo" width={160} height={160} className="object-contain w-full h-full" />
              ) : (
                <Image src="/logo-barbearialeste.png" alt="Logo" width={160} height={160} className="object-contain w-full h-full" />
              )}
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoChange}
            />
            <p className="text-xs text-muted-foreground text-center">
              {logoPreview ? 'Clique na imagem para trocar' : 'Formatos aceitos: PNG, JPG, SVG'}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-10">
              Voltar
            </Button>
            <Button onClick={() => setStep(3)} className="flex-1 h-10">
              Proximo
            </Button>
          </div>
        </div>
      )}

      {/* Passo 3: Horários */}
      {step === 3 && (
        <div className="w-full flex flex-col gap-5">
          <h2 className="text-base font-medium text-foreground">Passo 3 — Horarios de funcionamento</h2>
          <p className="text-xs text-muted-foreground -mt-2">
            Configure quantos dias e horarios quiser. Pode alterar a qualquer momento.
          </p>

          <div className="flex flex-col gap-3">
            {hours.map((h) => (
              <div key={h.day_of_week} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{DAYS[h.day_of_week]}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {h.is_open ? 'Aberto' : 'Fechado'}
                    </span>
                    <Switch
                      checked={h.is_open}
                      onCheckedChange={(v) => updateHour(h.day_of_week, 'is_open', v)}
                    />
                  </div>
                </div>

                {h.is_open && (
                  <div className="flex flex-col gap-2">
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

                    <details className="text-xs">
                      <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                        Intervalo de almoco (opcional)
                      </summary>
                      <div className="flex gap-2 mt-2">
                        <div className="flex flex-col gap-1 flex-1">
                          <Label className="text-xs text-muted-foreground">Inicio</Label>
                          <input
                            type="time"
                            value={h.lunch_start ?? ''}
                            onChange={(e) => updateHour(h.day_of_week, 'lunch_start', e.target.value || null)}
                            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                          <Label className="text-xs text-muted-foreground">Fim</Label>
                          <input
                            type="time"
                            value={h.lunch_end ?? ''}
                            onChange={(e) => updateHour(h.day_of_week, 'lunch_end', e.target.value || null)}
                            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1 h-10">
              Voltar
            </Button>
            <Button onClick={() => setStep(4)} className="flex-1 h-10">
              Proximo
            </Button>
          </div>
        </div>
      )}

      {/* Passo 4: Regras */}
      {step === 4 && (
        <div className="w-full flex flex-col gap-5">
          <h2 className="text-base font-medium text-foreground">Passo 4 — Regras de agendamento</h2>

          <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  Exigir login com Google?
                </span>
                <span className="text-xs text-muted-foreground">
                  Sim = cliente precisa logar. Nao = livre com nome e telefone.
                </span>
              </div>
              <Switch
                checked={requireGoogleLogin}
                onCheckedChange={setRequireGoogleLogin}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cancelWindow" className="text-sm text-muted-foreground">
              Cliente pode cancelar ate quantos minutos antes?
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="cancelWindow"
                type="number"
                min="0"
                value={cancellationWindow}
                onChange={(e) => setCancellationWindow(e.target.value)}
                className="h-10 w-28"
              />
              <span className="text-sm text-muted-foreground">minutos</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ex: 120 = cliente pode cancelar ate 2 horas antes do horario marcado.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(3)} className="flex-1 h-10">
              Voltar
            </Button>
            <Button
              onClick={handleFinish}
              disabled={saving}
              className="flex-1 h-10"
            >
              {saving ? 'Salvando...' : 'Concluir configuracao'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
