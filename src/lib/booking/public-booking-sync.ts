import { getDay, isBefore, parseISO, startOfDay } from 'date-fns'
import type { Service, SpecialSchedule, WorkingHours } from '@/lib/supabase/types'

export function isBookingDateDisabled(
  date: Date,
  workingHours: WorkingHours[],
  specialSchedules: SpecialSchedule[],
  now = new Date()
) {
  const closedDayOfWeeks = workingHours
    .filter((workingHour) => !workingHour.is_open)
    .map((workingHour) => workingHour.day_of_week)

  const closedSpecialDates = specialSchedules
    .filter((schedule) => schedule.is_closed)
    .map((schedule) => parseISO(schedule.date))

  if (isBefore(date, startOfDay(now))) return true
  if (closedDayOfWeeks.includes(getDay(date))) return true
  if (closedSpecialDates.some((closedDate) => closedDate.toDateString() === date.toDateString())) return true

  return false
}

export function resolveSelectedService(
  services: Service[],
  selectedService: Service | null
) {
  if (!selectedService) return null
  return services.find((service) => service.id === selectedService.id) ?? null
}

export function getBarberAvailabilityChangeMessage(
  previousBarberId: string | null,
  currentBarberId: string | null
) {
  if (!previousBarberId || currentBarberId === previousBarberId) {
    return null
  }

  if (!currentBarberId) {
    return 'Nenhum barbeiro esta disponivel no momento. Tente novamente em instantes.'
  }

  return 'O barbeiro disponivel mudou. Escolha a data e o horario novamente.'
}

export function buildAvailabilitySyncKey(input: {
  workingHours: WorkingHours[]
  specialSchedules: SpecialSchedule[]
  isPaused: boolean
  slotIntervalMinutes: number
  barberId: string | null
}) {
  const workingHoursKey = input.workingHours
    .map(
      (hour) =>
        `${hour.day_of_week}:${hour.is_open}:${hour.open_time}:${hour.close_time}:${hour.lunch_start}:${hour.lunch_end}`
    )
    .join('|')

  const specialSchedulesKey = input.specialSchedules
    .map(
      (schedule) => `${schedule.date}:${schedule.is_closed}:${schedule.open_time}:${schedule.close_time}`
    )
    .join('|')

  return [
    workingHoursKey,
    specialSchedulesKey,
    `${input.isPaused}:${input.slotIntervalMinutes}`,
    input.barberId ?? 'none',
  ].join('||')
}