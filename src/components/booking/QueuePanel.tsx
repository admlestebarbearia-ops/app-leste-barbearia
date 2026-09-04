'use client'

import { useState, useEffect, useCallback } from 'react'
import { joinQueue, getMyQueueStatus, leaveQueue, setQueueNotifyTarget } from '@/app/agendar/queue-actions'
import { savePushSubscription } from '@/app/api/push/actions'
import { ensurePushBrowserSession } from '@/lib/push/browser-session'
import { toast } from 'sonner'
import { Clock, Check, Users, LogOut, Bell } from 'lucide-react'
import type { QueueDay } from '@/lib/supabase/types'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

function isIosNonStandalone(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = !!(
    (navigator as unknown as Record<string, unknown>)['standalone'] ||
    window.matchMedia('(display-mode: standalone)').matches
  )
  return ios && !standalone
}

interface Props {
  date: string
  serviceId: string | null
  isLoggedIn: boolean
  userPhone: string | null
  queueDay: QueueDay
}

function formatClock(minutesFromNow: number): string {
  const d = new Date(Date.now() + Math.max(0, minutesFromNow) * 60000)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

type QueueStatus = Awaited<ReturnType<typeof getMyQueueStatus>>

function formatMinutes(min: number): string {
  if (min <= 0) return 'já já'
  if (min < 60) return `~${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `~${h}h ${m}min` : `~${h}h`
}

export function QueuePanel({ date, serviceId, isLoggedIn, userPhone, queueDay }: Props) {
  const storageKey = `queue_entry_${date}`
  const [entryId, setEntryId] = useState<string | null>(null)
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(userPhone ?? '')
  const [joining, setJoining] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notifBusy, setNotifBusy] = useState(false)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [lostSpot, setLostSpot] = useState(false)

  const enableNotifications = useCallback(async (id: string) => {
    if (isIosNonStandalone()) {
      toast.error('No iPhone, adicione o app à Tela de Início para receber avisos.')
      return
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
      toast.error('Seu navegador não suporta avisos.')
      return
    }
    setNotifBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Permissão de avisos negada.')
        return
      }
      const session = await ensurePushBrowserSession()
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'))
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      })
      const json = sub.toJSON()
      await savePushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
      })
      await setQueueNotifyTarget(id, session.userId)
      setNotifEnabled(true)
      toast.success('Avisos ativados! Vamos te chamar aqui e no celular.')
    } catch {
      toast.error('Não foi possível ativar os avisos.')
    } finally {
      setNotifBusy(false)
    }
  }, [])

  // Recupera uma entrada já salva neste dispositivo.
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(storageKey) } catch { /* private mode */ }
    setEntryId(saved)
    setLoading(false)
  }, [storageKey])

  const refresh = useCallback(async (id: string) => {
    const s = await getMyQueueStatus(id)
    if (!s.found || (s.status && ['atendido', 'desistiu'].includes(s.status))) {
      try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
      setEntryId(null)
      setStatus(null)
      return
    }
    if (s.status === 'ausente') {
      // Perdeu a vez (não estava presente quando foi chamado).
      try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
      setEntryId(null)
      setStatus(null)
      setLostSpot(true)
      return
    }
    setStatus(s)
  }, [storageKey])

  // Poll ao vivo enquanto estiver na fila.
  useEffect(() => {
    if (!entryId) return
    void refresh(entryId)
    const t = setInterval(() => { void refresh(entryId) }, 15000)
    return () => clearInterval(t)
  }, [entryId, refresh])

  const handleJoin = async () => {
    if (!isLoggedIn) {
      if (!name.trim()) { toast.error('Informe seu nome.'); return }
      if (phone.replace(/\D/g, '').length < 10) { toast.error('Informe um WhatsApp válido.'); return }
    }
    setJoining(true)
    const res = await joinQueue({
      date,
      serviceId,
      name: isLoggedIn ? null : name.trim(),
      phone: isLoggedIn ? null : phone,
    })
    setJoining(false)
    if (res.success && res.entryId) {
      try { localStorage.setItem(storageKey, res.entryId) } catch { /* ignore */ }
      setEntryId(res.entryId)
      toast.success('Você entrou na fila!')
    } else {
      toast.error(res.error ?? 'Não foi possível entrar na fila.')
    }
  }

  const handleLeave = async () => {
    if (!entryId) return
    await leaveQueue(entryId)
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    setEntryId(null)
    setStatus(null)
    toast.success('Você saiu da fila.')
  }

  if (loading) {
    return <div className="text-center text-xs text-zinc-600 py-8">Carregando…</div>
  }

  // ── Perdeu a vez: não estava presente quando foi chamado ──
  if (lostSpot) {
    return (
      <div className="w-full max-w-[360px] mx-auto">
        <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-[2rem] p-6 flex flex-col gap-3 text-center">
          <p className="text-base font-bold text-white">Você perdeu a vez 😕</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Você foi chamado, mas não estava na barbearia. Não tem problema — você pode entrar de novo na fila (vai para o fim, mantendo a ordem).
          </p>
          <button
            onClick={() => setLostSpot(false)}
            className="mt-2 h-11 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm active:scale-[0.98] transition-all"
          >
            Voltar para a fila
          </button>
        </div>
      </div>
    )
  }

  // ── Já está na fila: mostra a posição ao vivo ──
  if (entryId && status?.found) {
    const isCalled = status.status === 'chamado'
    const pos = status.position ?? 0
    const isNext = pos <= 0

    return (
      <div className="w-full max-w-[360px] mx-auto flex flex-col items-center gap-5 animate-in fade-in duration-500">
        <div className={[
          'w-full rounded-[2rem] p-7 flex flex-col items-center text-center border',
          isCalled
            ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.25)]'
            : 'bg-[#141418] border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]',
        ].join(' ')}>
          {isCalled ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3 animate-pulse">
                <Check size={32} className="text-emerald-400" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400 font-bold">É a sua vez!</p>
              <p className="text-2xl font-black text-white mt-2 leading-tight">Pode vir 💈</p>
              <p className="text-sm text-zinc-400 mt-2">O barbeiro está te chamando.</p>
            </>
          ) : isNext ? (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                <Clock size={30} className="text-primary" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-primary font-bold">Você é o próximo</p>
              <p className="text-2xl font-black text-white mt-2 leading-tight">Falta pouco!</p>
              <p className="text-sm text-zinc-400 mt-2">Já pode ir se encaminhando.</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <Users size={28} className="text-zinc-300" />
              </div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 font-bold">Sua posição na fila</p>
              <p className="text-5xl font-black text-white mt-2 tabular-nums leading-none">
                {pos}
                <span className="text-base font-bold text-zinc-500"> na frente</span>
              </p>
              {typeof status.estimateMinutes === 'number' && (
                <>
                  <p className="text-sm text-zinc-400 mt-3">
                    Previsão de atendimento: <span className="text-white font-semibold">~{formatClock(status.estimateMinutes)}</span>
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">Espera aproximada de {formatMinutes(status.estimateMinutes)}</p>
                </>
              )}
              <p className="text-[10px] text-zinc-600 mt-1">Previsão, não garantia — é atendimento por ordem de chegada.</p>
            </>
          )}
        </div>

        {notifEnabled ? (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-400 text-center">
            <Bell size={12} /> Avisos ativados — vamos te chamar no celular.
          </p>
        ) : (
          <button
            onClick={() => entryId && enableNotifications(entryId)}
            disabled={notifBusy}
            className="flex items-center gap-2 text-xs font-bold text-white bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 hover:bg-white/15 disabled:opacity-50 transition-all"
          >
            <Bell size={14} /> {notifBusy ? 'Ativando…' : 'Avisar no meu celular'}
          </button>
        )}

        <button
          onClick={handleLeave}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors py-2"
        >
          <LogOut size={13} /> Sair da fila
        </button>
      </div>
    )
  }

  // ── Fila cheia (barbeiro fechou a entrada) ──
  if (!queueDay.accepting_joins) {
    return (
      <div className="w-full max-w-[360px] mx-auto">
        <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-[2rem] p-6 flex flex-col gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto">
            <Users size={26} className="text-amber-400" />
          </div>
          <p className="text-base font-bold text-white">Fila cheia por enquanto</p>
          <p className="text-xs text-zinc-400 leading-relaxed">
            A fila de hoje está lotada. Pode abrir vaga quando o barbeiro for atendendo — volte em alguns minutos e fique de olho.
          </p>
        </div>
      </div>
    )
  }

  // ── Ainda não está na fila: entrar ──
  const introMessage = queueDay.call_message?.trim()
    || 'Hoje não precisa marcar horário. Entre na fila e acompanhe sua posição pelo celular — sem precisar esperar na barbearia.'
  return (
    <div className="w-full max-w-[360px] mx-auto flex flex-col gap-4">
      <div className="bg-[#141418] border border-white/10 rounded-[2rem] p-6 flex flex-col gap-3 text-center shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
        <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
          <Users size={26} className="text-primary" />
        </div>
        <p className="text-base font-bold text-white">Atendimento por ordem de chegada</p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {introMessage}
        </p>

        {!isLoggedIn && (
          <div className="flex flex-col gap-2 mt-2">
            <input
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 bg-[#0f0f12] border border-white/10 rounded-xl px-4 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
            />
            <input
              type="tel"
              inputMode="numeric"
              placeholder="WhatsApp (com DDD)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 bg-[#0f0f12] border border-white/10 rounded-xl px-4 text-sm text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
            />
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="mt-2 h-12 rounded-xl bg-primary text-primary-foreground font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {joining ? 'Entrando…' : 'Entrar na fila'}
        </button>
      </div>
    </div>
  )
}
