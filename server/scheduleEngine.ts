import type { DatabaseSync } from 'node:sqlite';
import type { CourseYear } from '../types';
import type {
  AttendanceEntryStatus,
  CourseScheduleOverride,
  ExitType,
  NonSchoolDayRule,
  ScheduleConfigPayload,
  ShiftScheduleConfig,
  ShiftType,
} from '../shared/attendanceDomain';

export interface EffectiveSchedule {
  shift: ShiftType;
  label: string;
  entryTime: string;
  punctualityCutoffTime: string;
  toleranceMinutes: number;
  exitTime: string;
  absenceCloseTime: string;
  source: 'override' | 'shift';
}

export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.trim().split(':');
  if (parts.length < 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function isValidHHMM(hhmm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm.trim());
}

export function isValidISODate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

export function getScheduleConfig(db: DatabaseSync): ScheduleConfigPayload {
  const shiftsRows = db
    .prepare(
      `SELECT shift, label, entry_time, punctuality_cutoff_time, tolerance_minutes, exit_time, absence_close_time, enabled
       FROM shift_schedules
       ORDER BY CASE shift WHEN 'manana' THEN 1 WHEN 'tarde' THEN 2 ELSE 3 END`
    )
    .all() as {
    shift: ShiftType;
    label: string;
    entry_time: string;
    punctuality_cutoff_time: string;
    tolerance_minutes: number;
    exit_time: string;
    absence_close_time: string;
    enabled: number;
  }[];

  const shifts: ShiftScheduleConfig[] = shiftsRows.map((r) => ({
    shift: r.shift,
    label: r.label,
    entryTime: r.entry_time,
    punctualityCutoffTime: r.punctuality_cutoff_time,
    toleranceMinutes: Number(r.tolerance_minutes || 0),
    exitTime: r.exit_time,
    absenceCloseTime: r.absence_close_time,
    enabled: r.enabled === 1,
  }));

  const overrideRows = db
    .prepare(
      `SELECT id, course, division, shift, entry_time, punctuality_cutoff_time, tolerance_minutes, exit_time, absence_close_time, active
       FROM course_schedule_overrides
       ORDER BY course ASC, division ASC, shift ASC`
    )
    .all() as {
    id: string;
    course: CourseYear;
    division: string;
    shift: ShiftType;
    entry_time: string;
    punctuality_cutoff_time: string;
    tolerance_minutes: number;
    exit_time: string;
    absence_close_time: string;
    active: number;
  }[];

  const overrides: CourseScheduleOverride[] = overrideRows.map((r) => ({
    id: r.id,
    course: r.course,
    division: r.division,
    shift: r.shift,
    entryTime: r.entry_time,
    punctualityCutoffTime: r.punctuality_cutoff_time,
    toleranceMinutes: Number(r.tolerance_minutes || 0),
    exitTime: r.exit_time,
    absenceCloseTime: r.absence_close_time,
    active: r.active === 1,
  }));

  const nonSchoolRows = (
    db.prepare(`SELECT id, date, reason, source FROM non_school_days ORDER BY date ASC`).all() as unknown as NonSchoolDayRule[]
  ).map((r) => ({
    id: String(r.id),
    date: String(r.date),
    reason: String(r.reason),
    source: r.source,
  }));

  const weekendRow = db
    .prepare(`SELECT value_json FROM school_calendar_settings WHERE key = 'weekend_is_non_school_day'`)
    .get() as { value_json: string } | undefined;

  let weekendIsNonSchoolDay = true;
  if (weekendRow?.value_json) {
    try {
      weekendIsNonSchoolDay = Boolean(JSON.parse(weekendRow.value_json));
    } catch {
      weekendIsNonSchoolDay = true;
    }
  }

  return {
    shifts,
    overrides,
    nonSchoolDays: nonSchoolRows,
    weekendIsNonSchoolDay,
  };
}

export function resolveEffectiveSchedule(
  db: DatabaseSync,
  course: CourseYear,
  division: string,
  shift: ShiftType
): EffectiveSchedule {
  const normalizedDiv = (division || '').trim().toUpperCase();

  // First try exact course + division override, then course-wide override (division = '')
  const overrideRow = db
    .prepare(
      `SELECT entry_time, punctuality_cutoff_time, tolerance_minutes, exit_time, absence_close_time
       FROM course_schedule_overrides
       WHERE course = ? AND shift = ? AND active = 1 AND UPPER(division) IN (?, '')
       ORDER BY CASE WHEN UPPER(division) = ? AND ? <> '' THEN 0 ELSE 1 END
       LIMIT 1`
    )
    .get(course, shift, normalizedDiv, normalizedDiv, normalizedDiv) as
    | {
        entry_time: string;
        punctuality_cutoff_time: string;
        tolerance_minutes: number;
        exit_time: string;
        absence_close_time: string;
      }
    | undefined;

  const shiftRow = db
    .prepare(
      `SELECT label, entry_time, punctuality_cutoff_time, tolerance_minutes, exit_time, absence_close_time
       FROM shift_schedules
       WHERE shift = ?`
    )
    .get(shift) as
    | {
        label: string;
        entry_time: string;
        punctuality_cutoff_time: string;
        tolerance_minutes: number;
        exit_time: string;
        absence_close_time: string;
      }
    | undefined;

  if (overrideRow) {
    return {
      shift,
      label: shiftRow?.label || `Turno ${shift}`,
      entryTime: overrideRow.entry_time,
      punctualityCutoffTime: overrideRow.punctuality_cutoff_time,
      toleranceMinutes: Number(overrideRow.tolerance_minutes || 0),
      exitTime: overrideRow.exit_time,
      absenceCloseTime: overrideRow.absence_close_time,
      source: 'override',
    };
  }

  if (shiftRow) {
    return {
      shift,
      label: shiftRow.label,
      entryTime: shiftRow.entry_time,
      punctualityCutoffTime: shiftRow.punctuality_cutoff_time,
      toleranceMinutes: Number(shiftRow.tolerance_minutes || 0),
      exitTime: shiftRow.exit_time,
      absenceCloseTime: shiftRow.absence_close_time,
      source: 'shift',
    };
  }

  return {
    shift,
    label: 'Turno Mañana',
    entryTime: '07:30',
    punctualityCutoffTime: '07:35',
    toleranceMinutes: 5,
    exitTime: '12:30',
    absenceCloseTime: '09:30',
    source: 'shift',
  };
}

export function classifyEntryStatus(
  recordedTimeHHMM: string,
  schedule: EffectiveSchedule
): AttendanceEntryStatus {
  const actualMinutes = timeToMinutes(recordedTimeHHMM);
  const cutoffWithTolerance =
    timeToMinutes(schedule.punctualityCutoffTime) + Math.max(0, schedule.toleranceMinutes);

  return actualMinutes <= cutoffWithTolerance ? 'presente' : 'tarde';
}

export function classifyExitTypeSuggestion(
  recordedTimeHHMM: string,
  schedule: EffectiveSchedule
): ExitType {
  const actualMinutes = timeToMinutes(recordedTimeHHMM);
  const scheduledExitMinutes = timeToMinutes(schedule.exitTime);
  if (actualMinutes < scheduledExitMinutes - 5) {
    return 'retiro_anticipado';
  }
  return 'habitual';
}

export function evaluateSchoolDay(
  db: DatabaseSync,
  dateStr: string
): { isSchoolDay: boolean; reason?: string } {
  const explicit = db
    .prepare(`SELECT reason FROM non_school_days WHERE date = ?`)
    .get(dateStr) as { reason: string } | undefined;

  if (explicit) {
    return { isSchoolDay: false, reason: explicit.reason };
  }

  const weekendSettingRow = db
    .prepare(`SELECT value_json FROM school_calendar_settings WHERE key = 'weekend_is_non_school_day'`)
    .get() as { value_json: string } | undefined;

  let weekendIsNonSchoolDay = true;
  if (weekendSettingRow?.value_json) {
    try {
      weekendIsNonSchoolDay = Boolean(JSON.parse(weekendSettingRow.value_json));
    } catch {
      weekendIsNonSchoolDay = true;
    }
  }

  if (weekendIsNonSchoolDay) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (utcDay === 0 || utcDay === 6) {
      return {
        isSchoolDay: false,
        reason: utcDay === 0 ? 'Domingo (día no lectivo)' : 'Sábado (día no lectivo)',
      };
    }
  }

  return { isSchoolDay: true };
}
