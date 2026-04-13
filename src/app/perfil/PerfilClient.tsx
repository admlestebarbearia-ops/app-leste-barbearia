'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, User, Phone, Mail, CalendarDays, LogOut, Check, Pencil, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { saveUserProfile } from '@/app/agendar/actions'
import { cancelMyAppointment, cancelPendingPayment } from '@/app/agendar/actions'
import type { AppointmentPaymentContext } from '@/lib/booking/appointment-payment-context'

const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  confirmado: 'Confirmado',
  aguardando_pagamento: 'Aguardando pagamento',
}

const APPOINTMENT_STATUS_COLOR: Record<string, string> = {
  confirmado: 'text-emerald-400',
  aguardando_pagamento: 'text-yellow-400',
}

const APPOINTMENT_PAYMENT_LABEL: Record<AppointmentPaymentContext, string> = {
  paid_online: 'Pago online',
  pay_locally: 'Pagar no local',
}

function AppointmentStatusBadge({ status }: { status: string }) {
  const isConfirmed = status === 'confirmado'

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
        isConfirmed
          ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-300'
          : 'border-yellow-500/30 bg-yellow-500/12 text-yellow-300',
      ].join(' ')}
    >
      {isConfirmed ? <Check size={11} /> : null}
      {APPOINTMENT_STATUS_LABEL[status] ?? status}
    </span>
  )
}

function AppointmentPaymentBadge({ paymentContext }: { paymentContext: AppointmentPaymentContext | null }) {
  if (!paymentContext) return null

  const isPaidOnline = paymentContext === 'paid_online'

  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
        isPaidOnline
          ? 'border-sky-500/30 bg-sky-500/12 text-sky-200'
          : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300',
      ].join(' ')}
    >
      {APPOINTMENT_PAYMENT_LABEL[paymentContext]}
    </span>
  )
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

type Appt = {
  id: string
  date: string
  start_time: string
  status: string
  services: { name: string; price: number } | null
  payment_context: AppointmentPaymentContext | null
}

interface Props {
  userId: string
  email: string | null
  avatarUrl: string | null
  displayName: string | null
  phone: string | null
  appointments: Appt[]
  cancellationWindowMinutes: number
  logoUrl: string | null
}

export function PerfilClient({
  email,
  avatarUrl,
  displayName: initialName,
  phone: initialPhone,
  appointments: initialAppts,
  cancellationWindowMinutes,
  logoUrl,
}: Props) {
  const [displayName, setDisplayName] = useState(initialName ?? '')
  const [phone, setPhone] = useState(initialPhone ?? '')
  const [editingName, setEditingName] = useState(false)
  const [editingPhone, setEditingPhone] = useState(false)
  const [nameInput, setNameInput] = useState(initialName ?? '')
  const [phoneInput, setPhoneInput] = useState(initialPhone ?? '')
  const [appointments, setAppointments] = useState<Appt[]>(initialAppts)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSaveName = () => {
    const trimmed = nameInput.trim()
    if (!trimmed) { toast.error('Nome não pode ser vazio.'); return }
    startTransition(async () => {
      const res = await saveUserProfile({ displayName: trimmed })
      if (res.success) {
        setDisplayName(trimmed)
        setEditingName(false)
        toast.success('Nome atualizado!')
      } else {
        toast.error(res.error ?? 'Erro ao salvar nome.')
      }
    })
  }

  const handleSavePhone = () => {
    const digits = phoneInput.replace(/\D/g, '')
    if (digits.length !== 11) { toast.error('Informe um celular válido com DDD.'); return }
    startTransition(async () => {
      const res = await saveUserProfile({ phone: digits })
      if (res.success) {
        setPhone(formatPhone(digits))
        setEditingPhone(false)
        toast.success('WhatsApp atualizado!')
      } else {
        toast.error(res.error ?? 'Erro ao salvar telefone.')
      }
    })
  }

  const handleCancelPending = async (id: string) => {
    setCancelling(id)
    const res = await cancelPendingPayment(id)
    if (res.success) {
      setAppointments((prev) => prev.filter((appt) => appt.id !== id))
      toast.success('Reserva pendente cancelada!')
    } else {
      toast.error(res.error ?? 'Erro ao cancelar pagamento pendente.')
    }
    setCancelling(null)
  }

  const canCancel = (appt: Appt) => {
    const apptTime = parseISO(`${appt.date}T${appt.start_time}`)
    const deadline = new Date(apptTime.getTime() - cancellationWindowMinutes * 60000)
    return new Date() < deadline
  }

  const handleCancel = async (id: string) => {
    setCancelling(id)
    const result = await cancelMyAppointment(id)
    if (result.success) {
      setAppointments((prev) => prev.filter((a) => a.id !== id))
      toast.success('Reserva cancelada.')
    } else {
      toast.error(result.error ?? 'Erro ao cancelar.')
    }
    setCancelling(null)
  }

  const displayPhone = phone ? (phone.length >= 10 ? formatPhone(phone) : phone) : null

  return (
    <main className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-lg mx-auto px-4 py-8 pb-16 flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/agendar"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            <ChevronLeft size={18} />
          </Link>
          <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-white/80">Meu Perfil</h1>
          {logoUrl && (
            <Image
              src={logoUrl}
              alt="Logo"
              width={28}
              height={28}
              className="ml-auto object-contain opacity-60"
              unoptimized
            />
          )}
        </div>

        {/* Avatar + nome */}
        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="relative">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName || 'Foto'}
                width={80}
                height={80}
                className="w-20 h-20 rounded-full object-cover border-2 border-white/10"
                unoptimized
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                <User size={36} className="text-zinc-500" />
              </div>
            )}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-white">{displayName || 'Sem nome'}</p>
            <p className="text-xs text-zinc-500">{email}</p>
          </div>
        </div>

        {/* Dados do perfil */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-600">Informações</h2>

          {/* Nome */}
          <div className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <User size={16} className="text-zinc-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-0.5">Nome de exibição</p>
                  {editingName ? (
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                      className="bg-transparent text-sm font-semibold text-white outline-none border-b border-primary/60 w-full max-w-50 pb-0.5"
                      autoFocus
                      maxLength={80}
                    />
                  ) : (
                    <p className="text-sm font-semibold text-white/90 truncate">{displayName || '—'}</p>
                  )}
                </div>
              </div>
              {editingName ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={handleSaveName}
                    disabled={isPending}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameInput(displayName) }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setNameInput(displayName); setEditingName(true) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:text-white transition-colors shrink-0"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </div>

          {/* WhatsApp */}
          <div className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Phone size={16} className="text-zinc-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-0.5">WhatsApp</p>
                  {editingPhone ? (
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(formatPhone(e.target.value))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSavePhone(); if (e.key === 'Escape') setEditingPhone(false) }}
                      className="bg-transparent text-sm font-semibold text-white outline-none border-b border-primary/60 w-full max-w-45 pb-0.5"
                      autoFocus
                      maxLength={16}
                      placeholder="(11) 99999-9999"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-white/90">{displayPhone || '—'}</p>
                  )}
                </div>
              </div>
              {editingPhone ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={handleSavePhone}
                    disabled={isPending}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => { setEditingPhone(false); setPhoneInput(displayPhone ?? '') }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-zinc-400 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setPhoneInput(displayPhone ?? ''); setEditingPhone(true) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-zinc-500 hover:text-white transition-colors shrink-0"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </div>

          {/* E-mail (somente leitura) */}
          <div className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Mail size={16} className="text-zinc-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold mb-0.5">E-mail Google</p>
                <p className="text-sm font-semibold text-white/50 truncate">{email || '—'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Minhas reservas */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-600">Próximas reservas</h2>
            <Link
              href="/reservas"
              className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 hover:text-white transition-colors"
            >
              Ver todas →
            </Link>
          </div>

          {appointments.length === 0 ? (
            <div className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-5 flex flex-col gap-1">
              <p className="text-sm font-semibold text-white/50">Nenhuma reserva futura</p>
              <p className="text-xs text-zinc-600">
                <Link href="/agendar" className="underline underline-offset-2 hover:text-white transition-colors">
                  Agendar agora
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {appointments.map((appt) => {
                const canCancelAppt = canCancel(appt)
                const isPendingPayment = appt.status === 'aguardando_pagamento'
                return (
                  <div
                    key={appt.id}
                    className="bg-zinc-900 border border-white/6 rounded-2xl px-5 py-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <CalendarDays size={16} className="text-zinc-500 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white/90">{appt.services?.name ?? 'Serviço'}</p>
                        <p className="text-xs text-zinc-500">
                          {format(parseISO(appt.date), "dd 'de' MMM", { locale: ptBR })} às {appt.start_time?.slice(0, 5)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <AppointmentStatusBadge status={appt.status} />
                          <AppointmentPaymentBadge paymentContext={appt.payment_context} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isPendingPayment ? (
                        <>
                          <Link
                            href={`/agendar/pagamento/retomar?appt_id=${appt.id}`}
                            className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                          >
                            Pagar
                          </Link>
                          <button
                            onClick={() => handleCancelPending(appt.id)}
                            disabled={cancelling === appt.id}
                            className="text-[10px] font-bold uppercase tracking-widest text-red-500/70 hover:text-red-400 transition-colors disabled:opacity-50"
                          >
                            {cancelling === appt.id ? '...' : 'Cancelar'}
                          </button>
                        </>
                      ) : canCancelAppt ? (
                        <button
                          onClick={() => handleCancel(appt.id)}
                          disabled={cancelling === appt.id}
                          className="text-[10px] font-bold uppercase tracking-widest text-red-500/70 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          {cancelling === appt.id ? '...' : 'Cancelar'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Sair */}
        <div className="pt-4">
          <a
            href="/api/auth/signout"
            className="flex items-center gap-3 w-full px-5 py-4 rounded-2xl bg-zinc-900 border border-white/6 text-sm font-bold text-red-500/70 hover:text-red-400 hover:bg-red-500/5 transition-all"
          >
            <LogOut size={16} />
            Sair da conta
          </a>
        </div>
      </div>
    </main>
  )
}
