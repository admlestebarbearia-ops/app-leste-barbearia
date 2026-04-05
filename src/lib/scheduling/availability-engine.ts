import { addMinutes, format, isAfter, isBefore, parse, parseISO } from 'date-fns'
import type { SpecialSchedule, WorkingHours } from '@/lib/supabase/types'

export interface ExistingAppointmentWindow {
  start_time: string
  duration_minutes: number
  status?: string | null
  deleted_at?: string | null
}

export interface AvailabilityEngineInput {
  date: string
  serviceDurationMinutes: number
  slotIntervalMinutes?: number | null
  isPaused?: boolean
  workingHours: WorkingHours | null
  specialSchedule: SpecialSchedule | null
  existingAppointments?: ExistingAppointmentWindow[]
  now?: Date
}

export interface AvailabilityEngineResult {
  slots: string[]
  error?: string
}

function normalizeTimeValue(time: string) {
  return time.length === 5 ? `${time}:00` : time
}

function parseTimeOnDate(date: string, time: string) {
  return parse(normalizeTimeValue(time), 'HH:mm:ss', new Date(`${date}T00:00:00`))
}

function hasOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return isBefore(startA, endB) && isAfter(endA, startB)
}

function isToday(date: string, now: Date) {
  return format(now, 'yyyy-MM-dd') === date
}

function sanitizeSlotInterval(slotIntervalMinutes?: number | null) {
  if (!slotIntervalMinutes || slotIntervalMinutes <= 0) return 30
  return slotIntervalMinutes
}

export function calculateAvailableSlots({
  date,
  serviceDurationMinutes,
  slotIntervalMinutes,
  isPaused = false,
  workingHours,
  specialSchedule,
  existingAppointments = [],
  now = new Date(),
}: AvailabilityEngineInput): AvailabilityEngineResult {
  if (!Number.isFinite(serviceDurationMinutes) || serviceDurationMinutes <= 0) {
    return { slots: [], error: 'Servico com duracao invalida.' }
  }

  if (specialSchedule?.is_closed) {
    return { slots: [], error: 'Barbearia fechada neste dia (data especial).' }
  }

  const isOpen = specialSchedule ? !specialSchedule.is_closed : (workingHours?.is_open ?? false)
  if (!isOpen) {
    return { slots: [], error: 'Barbearia não abre neste dia da semana.' }
  }

  const openTime = specialSchedule?.open_time ?? workingHours?.open_time
  const closeTime = specialSchedule?.close_time ?? workingHours?.close_time
  if (!openTime || !closeTime) {
    return { slots: [], error: 'Horário de funcionamento não configurado para este dia. Por favor, contate a barbearia.' }
  }

  if (isPaused && isToday(date, now)) {
    return { slots: [], error: 'A barbearia está em pausa (horário de almoço). Tente novamente em instantes ou escolha outro dia.' }
  }

  const slotInterval = sanitizeSlotInterval(slotIntervalMinutes)
  const openingDateTime = parseTimeOnDate(date, openTime)
  const closingDateTime = parseTimeOnDate(date, closeTime)

  if (!isBefore(openingDateTime, closingDateTime)) {
    return { slots: [], error: 'Horário de funcionamento não configurado para este dia. Por favor, contate a barbearia.' }
  }

  const lunchStart = workingHours?.lunch_start ? parseTimeOnDate(date, workingHours.lunch_start) : null
  const lunchEnd = workingHours?.lunch_end ? parseTimeOnDate(date, workingHours.lunch_end) : null

  const slots: string[] = []
  const lastValidStart = addMinutes(closingDateTime, -serviceDurationMinutes)
  let current = openingDateTime

  while (!isAfter(current, lastValidStart)) {
    const slotEnd = addMinutes(current, serviceDurationMinutes)
    const slotDateTime = parseISO(`${date}T${format(current, 'HH:mm:ss')}`)

    if (isBefore(slotDateTime, now)) {
      current = addMinutes(current, slotInterval)
      continue
    }

    const crossesLunch = !!lunchStart && !!lunchEnd && hasOverlap(current, slotEnd, lunchStart, lunchEnd)
    if (crossesLunch) {
      current = addMinutes(current, slotInterval)
      continue
    }

    const hasConflict = existingAppointments
      .filter((appt) => appt.deleted_at == null && (appt.status == null || appt.status === 'confirmado'))
      .some((appt) => {
        const apptStart = parseTimeOnDate(date, appt.start_time)
        const apptEnd = addMinutes(apptStart, appt.duration_minutes > 0 ? appt.duration_minutes : 30)
        return hasOverlap(current, slotEnd, apptStart, apptEnd)
      })

    if (!hasConflict) {
      slots.push(format(current, 'HH:mm'))
    }

    current = addMinutes(current, slotInterval)
  }

  return { slots }
}