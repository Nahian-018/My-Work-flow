import { describe, expect, it } from 'vitest'
import {
  addDhakaCalendarDays,
  dhakaDateKey,
  dhakaLocalToUtc,
  formatClockSeconds,
  getPlannedEndAt,
  getTaskClockSnapshot,
} from './task-time'

describe('Asia/Dhaka wall-clock helpers', () => {
  it('converts Dhaka wall time independently of the device timezone', () => {
    expect(dhakaLocalToUtc('2026-10-10', '09:30').toISOString()).toBe('2026-10-10T03:30:00.000Z')
  })

  it('assigns the correct Dhaka calendar day around UTC midnight', () => {
    expect(dhakaDateKey('2026-10-09T18:00:00.000Z')).toBe('2026-10-10')
    expect(dhakaDateKey('2026-10-09T17:59:59.000Z')).toBe('2026-10-09')
  })

  it('adds calendar days without changing the Dhaka day boundary', () => {
    expect(addDhakaCalendarDays('2026-10-10', 1)).toBe('2026-10-11')
    expect(addDhakaCalendarDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(() => addDhakaCalendarDays('2026-02-30', 1)).toThrow(RangeError)
  })

  it('rejects malformed and impossible date/time values', () => {
    expect(() => dhakaLocalToUtc('2026-02-30', '09:00')).toThrow(RangeError)
    expect(() => dhakaLocalToUtc('2026-10-10', '24:00')).toThrow(RangeError)
    expect(() => dhakaLocalToUtc('10/10/2026', '09:00')).toThrow(RangeError)
  })
})

describe('task timing calculations', () => {
  it('derives planned end from the scheduled start and duration', () => {
    expect(getPlannedEndAt('2026-10-10T23:30:00.000Z', 90).toISOString()).toBe('2026-10-11T01:00:00.000Z')
    expect(() => getPlannedEndAt('2026-10-10T23:30:00.000Z', 0)).toThrow(RangeError)
  })

  it('calculates elapsed time from persisted timestamps; display refresh does not reset it', () => {
    const task = {
      plannedStartAt: '2026-10-10T04:00:00.000Z',
      expectedDurationMinutes: 60,
      status: 'in_progress' as const,
      accumulatedSeconds: 300,
      runningSince: '2026-10-10T04:10:00.000Z',
    }
    const first = getTaskClockSnapshot(task, '2026-10-10T04:20:00.000Z')
    const refreshed = getTaskClockSnapshot(task, '2026-10-10T04:21:00.000Z')

    expect(first.elapsedSeconds).toBe(900)
    expect(first.remainingSeconds).toBe(2700)
    expect(refreshed.elapsedSeconds).toBe(960)
    expect(refreshed.remainingSeconds).toBe(2640)
  })

  it('holds elapsed time steady while a timer is paused', () => {
    const snapshot = getTaskClockSnapshot({
      plannedStartAt: '2026-10-10T04:00:00.000Z',
      expectedDurationMinutes: 30,
      status: 'in_progress',
      accumulatedSeconds: 930,
      runningSince: null,
    }, '2026-10-10T08:00:00.000Z')

    expect(snapshot.elapsedSeconds).toBe(930)
    expect(snapshot.remainingSeconds).toBe(870)
  })

  it('reports overdue status from the planned end without altering the stored task', () => {
    const snapshot = getTaskClockSnapshot({
      plannedStartAt: '2026-10-10T04:00:00.000Z',
      expectedDurationMinutes: 60,
      status: 'pending',
    }, '2026-10-10T05:15:00.000Z')

    expect(snapshot.effectiveStatus).toBe('overdue')
    expect(snapshot.overdueSeconds).toBe(0)
    expect(snapshot.remainingSeconds).toBe(3600)
    expect(snapshot.scheduleDeltaSeconds).toBeNull()
  })

  it('calculates elapsed overrun separately from schedule lateness', () => {
    const snapshot = getTaskClockSnapshot({
      plannedStartAt: '2026-10-10T04:00:00.000Z',
      expectedDurationMinutes: 30,
      status: 'overdue',
      actualStartedAt: '2026-10-10T04:00:00.000Z',
      accumulatedSeconds: 1900,
    }, '2026-10-10T05:00:00.000Z')

    expect(snapshot.overdueSeconds).toBe(100)
    expect(snapshot.scheduleDeltaSeconds).toBe(100)
  })

  it('formats durations as stable HH:MM:SS display strings', () => {
    expect(formatClockSeconds(3661)).toBe('01:01:01')
    expect(formatClockSeconds(-12)).toBe('00:00:00')
  })
})
