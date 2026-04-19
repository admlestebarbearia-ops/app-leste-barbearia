'use client'

/**
 * DailyAdminGrid — Grade interativa de agendamentos (Epic 1)
 *
 * Arquitetura segura (guardrails respeitados):
 * - buildAdminTimeline() é uma função PURA de VIEW: apenas mescla dados já
 *   calculados, nunca acessa o banco ou duplica lógica de disponibilidade.
 * - A validação de colisão de tempo está em createAdminAppointment (admin/actions.ts)
 *   que replica a query do engine sem tocar em calculateAvailableSlots.
 * - getAdminDayTimeline() gera slots brutos de horário para EXIBIÇÃO apenas.
 */

import React, { useState, useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { isAppointmentPast } from '@/lib/booking/appointment-visibility'

// useSyncExternalStore helpers (ver AdminDashboard.tsx para comentário completo)
const _subNoop = (_: () => void) => () => {}
const _getTrue = () => true
const _getFalse = () => false
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  getAdminDayTimeline,
  createAdminAppointment,
  createAdminBlock,
  listActiveBarbers,
  updateAppointmentStatus,
  toggleBlockClient,
} from '@/app/admin/actions'
import type { Appointment, Service, BusinessConfig } from '@/lib/supabase/types'

// ── Tipos da timeline ──────────────────────────────────────────────────────────

type FreeSlot = { time: string; isBooked: false }
type BookedSlot = { time: string; isBooked: true; isBlock: boolean; data: Appointment }
export type TimelineSlot = FreeSlot | BookedSlot

/**
 * buildAdminTimeline — função pura (CA09.1).
 * Funde rawSlots (todos os slots do dia) com bookedAppointments (agendamentos confirmados).
 * Retorna array ordenado cronologicamente com estado de cada slot.
 */
export function buildAdminTimeline(
  rawSlots: string[],
  bookedAppointments: Appointment[],
): TimelineSlot[] {
  // Monta mapa de horários ocupados (apenas confirmados / aguardando pagamento)
  const bookedMap = new Map<string, Appointment>()
  for (const appt of bookedAppointments) {
    if (appt.status !== 'confirmado' && appt.status !== 'aguardando_pagamento') continue
    const t = appt.start_time?.slice(0, 5)
    if (t) bookedMap.set(t, appt)
  }

  const result: TimelineSlot[] = []
  const processed = new Set<string>()

  for (const time of rawSlots) {
    processed.add(time)
    const appt = bookedMap.get(time)
    if (appt) {
      result.push({ time, isBooked: true, isBlock: appt.is_admin_block === true, data: appt })
    } else {
      result.push({ time, isBooked: false })
    }
  }

  // Agendamentos que caem fora dos slots (ex: quando o intervalo foi alterado depois)
  for (const [time, appt] of bookedMap) {
    if (!processed.has(time)) {
      result.push({ time, isBooked: true, isBlock: appt.is_admin_block === true, data: appt })
    }
  }

  return result.sort((a, b) => a.time.localeCompare(b.time))
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface DailyAdminGridProps {
  selectedDay: string
  dayAppts: Appointment[]
  services: Service[]
  config: Pick<BusinessConfig, 'whatsapp_number'>
  onRefresh: () => void
  /** Abre o modal de conclusão já existente no pai (evita duplicar lógica complexa) */
  onConclude: (appt: Appointment) => void
  /** Abre o modal de cancelamento já existente no pai */
  onCancel: (appt: Appointment) => void
}

// ── Componente principal ───────────────────────────────────────────────────────

export function DailyAdminGrid({
  selectedDay,
  dayAppts,
  services,
  config,
  onRefresh,
  onConclude,
  onCancel,
}: DailyAdminGridProps) {
  // ── Dados da grade ──────────────────────────────────────────────────────────
  const [rawSlots, setRawSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [barbers, setBarbers] = useState<Array<{ id: string; name: string; nickname: string | null }>>([])

  // ── Modal: slot livre ───────────────────────────────────────────────────────
  const [selectedFreeTime, setSelectedFreeTime] = useState<string | null>(null)
  const [freeModalTab, setFreeModalTab] = useState<'agendar' | 'bloquear'>('agendar')

  // Form: agendar cliente
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formServiceId, setFormServiceId] = useState('')
  const [formBarberId, setFormBarberId] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Form: bloquear horário
  const [blockReason, setBlockReason] = useState('')
  const [blockDuration, setBlockDuration] = useState('30')
  const [blockLoading, setBlockLoading] = useState(false)

  // ── Modal: slot ocupado (detalhes) ──────────────────────────────────────────
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  // isMounted: false no SSR/hydration, true no cliente. Imune ao HMR.
  const isMounted = useSyncExternalStore(_subNoop, _getTrue, _getFalse)

  // ── Busca slots e barbeiros ao montar / quando o dia muda ───────────────────
  useEffect(() => {
    if (!selectedDay) return
    setSlotsLoading(true)
    Promise.all([
      getAdminDayTimeline(selectedDay),
      listActiveBarbers(),
    ]).then(([{ allSlots }, { barbers: b }]) => {
      setRawSlots(allSlots ?? [])
      setBarbers(b ?? [])
      // Pré-seleciona o primeiro barbeiro se houver apenas um
      if (b.length === 1) setFormBarberId(b[0].id)
      else {
        // Tenta pegar o barbeiro de um agendamento já existente
        const barbFromExisting = dayAppts.find(a => a.barber_id)?.barber_id
        if (barbFromExisting) setFormBarberId(barbFromExisting)
        else setFormBarberId(b[0]?.id ?? '')
      }
    }).catch(() => {
      setRawSlots([])
      setBarbers([])
    }).finally(() => setSlotsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay])

  const timeline = buildAdminTimeline(rawSlots, dayAppts)
  const activeServices = services.filter(s => s.is_active)

  // ── Handlers ────────────────────────────────────────────────────────────────

  const openFreeModal = (time: string) => {
    setSelectedFreeTime(time)
    setFreeModalTab('agendar')
    setFormName('')
    setFormPhone('')
    setFormServiceId(activeServices[0]?.id ?? '')
    setBlockReason('')
    setBlockDuration('30')
  }

  const handleBookSubmit = async () => {
    if (!selectedFreeTime || !formName.trim() || !formServiceId || !formBarberId) return
    setFormLoading(true)
    const result = await createAdminAppointment({
      serviceId: formServiceId,
      barberId: formBarberId,
      date: selectedDay,
      startTime: selectedFreeTime,
      clientName: formName.trim(),
      clientPhone: formPhone.trim() || undefined,
    })
    setFormLoading(false)
    if (result.success) {
      toast.success('Cliente agendado com sucesso!')
      setSelectedFreeTime(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao agendar.')
    }
  }

  const handleBlockSubmit = async () => {
    if (!selectedFreeTime || !blockReason.trim() || !formBarberId) return
    setBlockLoading(true)
    const result = await createAdminBlock({
      date: selectedDay,
      startTime: selectedFreeTime,
      durationMinutes: parseInt(blockDuration, 10) || 30,
      reason: blockReason.trim(),
      barberId: formBarberId,
    })
    setBlockLoading(false)
    if (result.success) {
      toast.success('Horário bloqueado.')
      setSelectedFreeTime(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro ao bloquear.')
    }
  }

  const handleFaltou = async (id: string) => {
    setActionLoading('faltou' + id)
    const result = await updateAppointmentStatus(id, 'faltou')
    setActionLoading(null)
    if (result.success) {
      toast.success('Marcado como faltou.')
      setSelectedAppt(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const handleBlockClient = async (clientId: string | null, apptId: string) => {
    if (!clientId) { toast.error('Somente clientes com login Google podem ser bloqueados.'); return }
    setActionLoading('block' + apptId)
    const result = await toggleBlockClient(clientId, true)
    setActionLoading(null)
    if (result.success) {
      toast.success('Cliente bloqueado.')
      setSelectedAppt(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  const handleRemoveBlock = async (appt: Appointment) => {
    setActionLoading('rmblock' + appt.id)
    const result = await updateAppointmentStatus(appt.id, 'cancelado')
    setActionLoading(null)
    if (result.success) {
      toast.success('Bloqueio removido.')
      setSelectedAppt(null)
      onRefresh()
    } else {
      toast.error(result.error ?? 'Erro.')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (slotsLoading) {
    return (
      <div className="flex items-center justify-center py-14">
        <span className="text-zinc-500 text-sm animate-pulse">Carregando grade…</span>
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center py-10 bg-neutral-900 rounded-2xl border border-white/5">
        <p className="text-zinc-600 text-sm">Agenda fechada neste dia ou horários não configurados.</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Grade de slots ── */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {timeline.map((slot) => {
          if (!slot.isBooked) {
            return (
              <button
                key={slot.time}
                onClick={() => openFreeModal(slot.time)}
                className="flex flex-col items-center justify-center gap-0.5 bg-neutral-800 hover:bg-neutral-700 border border-white/8 rounded-xl px-2 py-3 transition-all"
              >
                <span className="text-sm font-bold text-white tabular-nums">{slot.time}</span>
                <span className="text-[9px] text-zinc-600 font-medium">livre</span>
              </button>
            )
          }

          // Slot ocupado
          const appt = slot.data
          const isBlock = slot.isBlock
          const firstName = (
            appt.profiles?.display_name ?? appt.client_name ?? '?'
          ).split(' ')[0].slice(0, 8)

          return (
            <button
              key={`${slot.time}-${appt.id}`}
              onClick={() => setSelectedAppt(appt)}
              className={[
                'flex flex-col items-center justify-center gap-0.5 border rounded-xl px-2 py-3 transition-all',
                isBlock
                  ? 'bg-zinc-800/60 border-zinc-600/40 hover:bg-zinc-700/60'
                  : 'bg-emerald-700/25 border-emerald-500/30 hover:bg-emerald-700/35',
              ].join(' ')}
            >
              <span className={[
                'text-sm font-bold tabular-nums',
                isBlock ? 'text-zinc-400' : 'text-emerald-300',
              ].join(' ')}>
                {appt.start_time?.slice(0, 5)}
              </span>
              <span className={[
                'text-[9px] font-semibold leading-tight text-center w-full truncate px-0.5',
                isBlock ? 'text-zinc-500' : 'text-emerald-400',
              ].join(' ')}>
                {isBlock ? '🔒' : firstName}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Modal: slot livre ── */}
      <Dialog open={!!selectedFreeTime} onOpenChange={(open) => { if (!open) setSelectedFreeTime(null) }}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-base">
              {selectedFreeTime} — Horário livre
            </DialogTitle>
          </DialogHeader>

          {/* Seletor de barbeiro (visível apenas quando há múltiplos) */}
          {barbers.length > 1 && (
            <div className="flex flex-col gap-1.5 -mt-1">
              <Label className="text-xs text-zinc-400">Barbeiro</Label>
              <select
                value={formBarberId}
                onChange={e => setFormBarberId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                {barbers.map(b => (
                  <option key={b.id} value={b.id} className="bg-neutral-900">
                    {b.nickname ?? b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tabs: Agendar / Bloquear */}
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {(['agendar', 'bloquear'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFreeModalTab(tab)}
                className={[
                  'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                  freeModalTab === tab ? 'bg-white text-black' : 'text-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {tab === 'agendar' ? '✂️ Agendar Cliente' : '🔒 Bloquear Horário'}
              </button>
            ))}
          </div>

          {freeModalTab === 'agendar' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-400">Nome do cliente *</Label>
                <Input
                  placeholder="Ex: João da Silva"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-400">Telefone (opcional)</Label>
                <Input
                  placeholder="(11) 99999-0000"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-400">Serviço *</Label>
                <select
                  value={formServiceId}
                  onChange={e => setFormServiceId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  <option value="" disabled className="bg-neutral-900">Selecione um serviço</option>
                  {activeServices.map(s => (
                    <option key={s.id} value={s.id} className="bg-neutral-900">
                      {s.name} · {s.duration_minutes}min · R$ {s.price.toFixed(2).replace('.', ',')}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-zinc-600">
                Status: Confirmado · Pagamento: Pagar no local
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSelectedFreeTime(null)} disabled={formLoading} className="text-zinc-400">
                  Cancelar
                </Button>
                <Button
                  onClick={handleBookSubmit}
                  disabled={formLoading || !formName.trim() || !formServiceId || !formBarberId}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {formLoading ? 'Agendando…' : 'Confirmar Agendamento'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-400">Motivo *</Label>
                <Input
                  placeholder="Ex: Almoço, consulta médica…"
                  value={blockReason}
                  onChange={e => setBlockReason(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-600"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-400">Duração</Label>
                <select
                  value={blockDuration}
                  onChange={e => setBlockDuration(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  {[15, 30, 45, 60, 90, 120].map(d => (
                    <option key={d} value={d} className="bg-neutral-900">{d} minutos</option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSelectedFreeTime(null)} disabled={blockLoading} className="text-zinc-400">
                  Cancelar
                </Button>
                <Button
                  onClick={handleBlockSubmit}
                  disabled={blockLoading || !blockReason.trim() || !formBarberId}
                  className="bg-zinc-600 hover:bg-zinc-500 text-white"
                >
                  {blockLoading ? 'Bloqueando…' : 'Bloquear Horário'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Modal: slot ocupado ── */}
      <Dialog open={!!selectedAppt} onOpenChange={(open) => { if (!open) setSelectedAppt(null) }}>
        <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white text-base">
              {selectedAppt?.is_admin_block ? '🔒 Bloqueio de Horário' : 'Detalhes do Agendamento'}
            </DialogTitle>
          </DialogHeader>

          {selectedAppt && (
            <div className="flex flex-col gap-4 py-1">
              {/* Informações do card */}
              <div className="bg-white/5 rounded-xl px-4 py-3 flex flex-col gap-2">
                <InfoRow
                  label="Serviço"
                  value={
                    selectedAppt.is_admin_block
                      ? 'Bloqueio ad-hoc'
                      : (selectedAppt.services?.name ?? selectedAppt.service_name_snapshot ?? '—')
                  }
                />
                <InfoRow
                  label="Horário"
                  value={`${selectedAppt.date?.split('-').reverse().join('/')} às ${selectedAppt.start_time?.slice(0, 5)}`}
                />
                {!selectedAppt.is_admin_block && selectedAppt.services?.price != null && (
                  <InfoRow
                    label="Valor"
                    value={`R$ ${selectedAppt.services.price.toFixed(2).replace('.', ',')}`}
                    valueClass="text-emerald-400 font-bold"
                  />
                )}
                {!selectedAppt.is_admin_block && (
                  <>
                    <InfoRow
                      label="Agendado em"
                      value={new Date(selectedAppt.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    />
                    <InfoRow label="Pagamento" value="Pagar no local" />
                    <div className="border-t border-white/8 my-0.5" />
                    <InfoRow
                      label="Cliente"
                      value={selectedAppt.profiles?.display_name ?? selectedAppt.client_name ?? '—'}
                    />
                    {(selectedAppt.client_email || selectedAppt.profiles?.email) && (
                      <InfoRow
                        label="E-mail"
                        value={selectedAppt.client_email ?? selectedAppt.profiles?.email ?? '—'}
                      />
                    )}
                    {(selectedAppt.client_phone || selectedAppt.profiles?.phone) && (
                      <InfoRow
                        label="Telefone"
                        value={selectedAppt.client_phone ?? selectedAppt.profiles?.phone ?? '—'}
                      />
                    )}
                  </>
                )}
                {selectedAppt.is_admin_block && (
                  <InfoRow
                    label="Motivo"
                    value={(selectedAppt.client_name ?? '').replace('🔒 ', '') || '—'}
                  />
                )}
              </div>

              {/* Ações: agendamento confirmado */}
              {!selectedAppt.is_admin_block && selectedAppt.status === 'confirmado' && (
                <div className="flex flex-col gap-2">
                  {/* CTA: contato WhatsApp */}
                  {(selectedAppt.client_phone || selectedAppt.profiles?.phone) && (
                    <a
                      href={`https://wa.me/55${(selectedAppt.profiles?.phone ?? selectedAppt.client_phone ?? '').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-sm font-semibold hover:bg-emerald-600/30 transition-colors"
                    >
                      💬 Contactar Cliente
                    </a>
                  )}

                  {/* Concluir: sempre no DOM; visibilidade via CSS evita mismatch estrutural SSR↔CSR.
                      suppressHydrationWarning: tolera diff de className se isMounted diferir na hidratação. */}
                  <button
                    suppressHydrationWarning
                    onClick={() => {
                      const appt = selectedAppt
                      // Fecha este dialog primeiro; deixa o frame de animação
                      // do Radix completar antes de abrir o modal do pai,
                      // evitando conflito de focus-trap entre dois dialogs.
                      setSelectedAppt(null)
                      requestAnimationFrame(() => onConclude(appt))
                    }}
                    className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors${isMounted && isAppointmentPast(selectedAppt.date, selectedAppt.start_time) ? '' : ' hidden'}`}
                  >
                    ✓ Concluir Atendimento
                  </button>

                  {/* Botões secundários: Faltou / Cancelar / Bloquear */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      disabled={actionLoading === 'faltou' + selectedAppt.id}
                      onClick={() => handleFaltou(selectedAppt.id)}
                      className="py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                    >
                      {actionLoading === 'faltou' + selectedAppt.id ? '…' : 'Faltou'}
                    </button>
                    <button
                      onClick={() => {
                        const appt = selectedAppt
                        setSelectedAppt(null)
                        onCancel(appt)
                      }}
                      className="py-2.5 rounded-xl bg-white/5 border border-white/10 text-zinc-400 text-[11px] font-bold hover:bg-white/10 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={!selectedAppt.client_id || actionLoading === 'block' + selectedAppt.id}
                      onClick={() => handleBlockClient(selectedAppt.client_id, selectedAppt.id)}
                      className="py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold hover:bg-red-500/20 transition-colors disabled:opacity-40"
                      title={!selectedAppt.client_id ? 'Apenas clientes com login Google' : undefined}
                    >
                      {actionLoading === 'block' + selectedAppt.id ? '…' : 'Bloquear'}
                    </button>
                  </div>
                </div>
              )}

              {/* Ações: bloqueio ad-hoc → permite remoção */}
              {selectedAppt.is_admin_block && (
                <button
                  disabled={actionLoading === 'rmblock' + selectedAppt.id}
                  onClick={() => handleRemoveBlock(selectedAppt)}
                  className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/20 transition-colors disabled:opacity-40"
                >
                  {actionLoading === 'rmblock' + selectedAppt.id ? 'Removendo…' : '🗑 Remover Bloqueio'}
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Helper de linha de info ────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  valueClass = 'text-white',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold shrink-0">{label}</span>
      <span className={`text-xs text-right break-all ${valueClass}`}>{value}</span>
    </div>
  )
}
