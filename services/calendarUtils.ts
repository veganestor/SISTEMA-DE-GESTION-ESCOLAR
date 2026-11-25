import { CalendarEvent } from '../types';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const isValidISODate = (dateStr: string): boolean => {
  if (!ISO_DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y &&
    parsed.getMonth() === m - 1 &&
    parsed.getDate() === d
  );
};

export const formatShortDateES = (dateStr: string): string => {
  if (!isValidISODate(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

export interface RescheduleResult {
  updatedEvent: CalendarEvent;
  previousDate: string;
}

/**
 * Reprograma un evento escolar a una nueva fecha ISO (YYYY-MM-DD),
 * preservando todos sus atributos originales y evitando operaciones redundantes si no cambia la fecha.
 */
export const rescheduleCalendarEvent = (
  events: CalendarEvent[],
  eventId: string,
  targetDate: string
): RescheduleResult | null => {
  if (!eventId || !isValidISODate(targetDate)) return null;
  const targetEvent = events.find((evt) => evt.id === eventId);
  if (!targetEvent) return null;
  if (targetEvent.date === targetDate) return null;

  return {
    previousDate: targetEvent.date,
    updatedEvent: {
      ...targetEvent,
      date: targetDate,
    },
  };
};

/**
 * Ordena eventos de un mismo día cronológicamente por hora, luego prioridad alta y luego título.
 */
export const sortDayEvents = (dayEvents: CalendarEvent[]): CalendarEvent[] => {
  return [...dayEvents].sort((a, b) => {
    const timeA = a.time || '99:99';
    const timeB = b.time || '99:99';
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    if (Boolean(b.isHighPriority) !== Boolean(a.isHighPriority)) {
      return Number(Boolean(b.isHighPriority)) - Number(Boolean(a.isHighPriority));
    }
    return a.title.localeCompare(b.title, 'es');
  });
};

export interface UpcomingCalendarEventItem {
  evt: CalendarEvent;
  diffDays: number;
}

/**
 * Suma meses calendario respetando la cantidad de días del mes destino (ej. 31 dic + 2 meses = 28/29 feb).
 */
export const addCalendarMonthsClamped = (referenceDate: Date, months: number): Date => {
  const targetMonthIndex = referenceDate.getMonth() + months;
  const targetYear = referenceDate.getFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(referenceDate.getDate(), lastDayOfTargetMonth);
  return new Date(targetYear, targetMonth, clampedDay, 0, 0, 0, 0);
};

/**
 * Retorna los próximos eventos comprendidos entre hoy (inclusive) y N meses calendario posteriores (por defecto 2 meses),
 * ordenados cronológicamente por fecha, prioridad y hora.
 */
export const getUpcomingCalendarEvents = (
  events: CalendarEvent[],
  months = 2,
  referenceDate: Date = new Date()
): UpcomingCalendarEventItem[] => {
  const startMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0
  );
  const endMidnight = addCalendarMonthsClamped(startMidnight, months);
  const startMs = startMidnight.getTime();
  const endMs = endMidnight.getTime();

  return events
    .map((evt) => {
      if (!isValidISODate(evt.date)) return null;
      const [y, m, d] = evt.date.split('-').map(Number);
      const eventMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      if (eventMs < startMs || eventMs > endMs) return null;
      const diffDays = Math.round((eventMs - startMs) / (1000 * 60 * 60 * 24));
      return { evt, diffDays };
    })
    .filter((item): item is UpcomingCalendarEventItem => item !== null)
    .sort((a, b) => {
      if (a.diffDays !== b.diffDays) return a.diffDays - b.diffDays;
      if (Boolean(b.evt.isHighPriority) !== Boolean(a.evt.isHighPriority)) {
        return Number(Boolean(b.evt.isHighPriority)) - Number(Boolean(a.evt.isHighPriority));
      }
      const timeA = a.evt.time || '99:99';
      const timeB = b.evt.time || '99:99';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      return a.evt.title.localeCompare(b.evt.title, 'es');
    });
};
