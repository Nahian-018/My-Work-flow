export type TaskClockStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export interface TaskClockInput {
  plannedStartAt: string | Date
  expectedDurationMinutes: number
  status: TaskClockStatus
  actualStartedAt?: string | Date | null
  accumulatedSeconds?: number
  runningSince?: string | Date | null
}

export interface TaskClockSnapshot {
  plannedStartAt: Date
  plannedEndAt: Date
  elapsedSeconds: number
  remainingSeconds: number
  overdueSeconds: number
  scheduleDeltaSeconds: number | null
  effectiveStatus: TaskClockStatus
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function asValidDate(value: string | Date, fieldName: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new RangeError(`${fieldName} must be a valid date`)
  return date
}

function dhakaParts(date: Date) {
  const values = Object.fromEntries(dateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function utcFromParts(parts: { year: number; month: number; day: number; hour: number; minute: number; second: number }) {
  const result = new Date(0)
  result.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  result.setUTCHours(parts.hour, parts.minute, parts.second, 0)
  return result.getTime()
}

/** Convert a Dhaka wall-clock date/time to an instant without using the device's timezone. */
export function dhakaLocalToUtc(dateText: string, timeText: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText)
  if (!dateMatch || !timeMatch) throw new RangeError('Use YYYY-MM-DD and HH:mm time formats')

  const [, yearText, monthText, dayText] = dateMatch
  const [, hourText, minuteText, secondText = '0'] = timeMatch
  const wanted = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText),
    hour: Number(hourText), minute: Number(minuteText), second: Number(secondText),
  }
  const calendarCheck = new Date(0)
  calendarCheck.setUTCFullYear(wanted.year, wanted.month - 1, wanted.day)
  calendarCheck.setUTCHours(0, 0, 0, 0)
  if (calendarCheck.toISOString().slice(0, 10) !== dateText || wanted.hour > 23 || wanted.minute > 59 || wanted.second > 59) {
    throw new RangeError('The requested Dhaka date/time does not exist')
  }

  const targetWallTime = utcFromParts(wanted)
  let guess = targetWallTime
  // Correct the UTC guess against the wall-clock representation in the requested zone.
  // Dhaka currently has no DST transition; a few iterations also cover normal offset changes.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actualWallTime = utcFromParts(dhakaParts(new Date(guess)))
    const adjustment = targetWallTime - actualWallTime
    if (adjustment === 0) return new Date(guess)
    guess += adjustment
  }

  const actual = dhakaParts(new Date(guess))
  if (utcFromParts(actual) !== targetWallTime) throw new RangeError('Could not resolve the requested Dhaka wall-clock time')
  return new Date(guess)
}

export function dhakaDateKey(instant: string | Date = new Date()): string {
  const { year, month, day } = dhakaParts(asValidDate(instant, 'instant'))
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

export function addDhakaCalendarDays(dateKey: string, dayOffset: number): string {
  if (!Number.isInteger(dayOffset)) throw new RangeError('Day offset must be a whole number')
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new RangeError('Date must use YYYY-MM-DD format')
  const [, year, month, day] = match
  const date = new Date(0)
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day))
  date.setUTCHours(12, 0, 0, 0)
  if (date.toISOString().slice(0, 10) !== dateKey) throw new RangeError('Date is not a valid calendar day')
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

export function getPlannedEndAt(plannedStartAt: string | Date, durationMinutes: number): Date {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    throw new RangeError('Expected duration must be between 1 and 1440 whole minutes')
  }
  const start = asValidDate(plannedStartAt, 'planned start')
  return new Date(start.getTime() + durationMinutes * 60_000)
}

/** Compute display values from durable timestamps; a UI tick must never restart the timer. */
export function getTaskClockSnapshot(task: TaskClockInput, now: string | Date = new Date()): TaskClockSnapshot {
  const currentTime = asValidDate(now, 'now')
  const plannedStartAt = asValidDate(task.plannedStartAt, 'planned start')
  const plannedEndAt = getPlannedEndAt(plannedStartAt, task.expectedDurationMinutes)
  const accumulatedSeconds = Math.max(0, Math.floor(task.accumulatedSeconds ?? 0))
  const runningSince = task.runningSince ? asValidDate(task.runningSince, 'running since') : null
  const actualStartedAt = task.actualStartedAt ? asValidDate(task.actualStartedAt, 'actual start') : null
  const timerCanRun = task.status === 'in_progress' || task.status === 'overdue'
  const currentSegment = timerCanRun && runningSince
    ? Math.max(0, Math.floor((currentTime.getTime() - runningSince.getTime()) / 1000))
    : 0
  const elapsedSeconds = accumulatedSeconds + currentSegment
  const expectedSeconds = task.expectedDurationMinutes * 60
  const remainingSeconds = Math.max(0, expectedSeconds - elapsedSeconds)
  const overdueSeconds = Math.max(0, elapsedSeconds - expectedSeconds)
  const effectiveStatus: TaskClockStatus = task.status !== 'completed' && currentTime >= plannedEndAt ? 'overdue' : task.status
  const scheduleDeltaSeconds = actualStartedAt ? elapsedSeconds - expectedSeconds : null

  return { plannedStartAt, plannedEndAt, elapsedSeconds, remainingSeconds, overdueSeconds, scheduleDeltaSeconds, effectiveStatus }
}

export function formatClockSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')
}
