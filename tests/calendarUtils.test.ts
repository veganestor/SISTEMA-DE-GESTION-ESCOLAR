import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_CALENDAR_EVENTS } from '../services/sampleData';
import {
  addCalendarMonthsClamped,
  getUpcomingCalendarEvents,
} from '../services/calendarUtils';
import { buildInternalNotifications } from '../services/internalNotificationsService';
import { CalendarEvent, SchoolInfo } from '../types';

const TEST_SCHOOL_INFO: SchoolInfo = {
  name: 'Escuela Secundaria de Prueba',
  address: 'Av. Principal 100',
  phone: '011-4000-0000',
  academicYear: 2026,
  isConfigured: true,
};

test('SAMPLE_CALENDAR_EVENTS inicia vacío sin recordatorios de prueba', () => {
  assert.deepEqual(SAMPLE_CALENDAR_EVENTS, []);
});

test('addCalendarMonthsClamped respeta límites de fin de mes (ej. 31 dic + 2 meses)', () => {
  const dec31NonLeap = new Date(2026, 11, 31); // 31 dic 2026 -> feb 2027 tiene 28 días
  const febNonLeap = addCalendarMonthsClamped(dec31NonLeap, 2);
  assert.equal(febNonLeap.getFullYear(), 2027);
  assert.equal(febNonLeap.getMonth(), 1);
  assert.equal(febNonLeap.getDate(), 28);

  const dec31Leap = new Date(2023, 11, 31); // 31 dic 2023 -> feb 2024 tiene 29 días
  const febLeap = addCalendarMonthsClamped(dec31Leap, 2);
  assert.equal(febLeap.getFullYear(), 2024);
  assert.equal(febLeap.getMonth(), 1);
  assert.equal(febLeap.getDate(), 29);
});

test('getUpcomingCalendarEvents muestra eventos desde hoy hasta exactamente 2 meses calendario posteriores', () => {
  const refDate = new Date(2026, 10, 23, 10, 30, 0); // 2026-11-23 -> límite 2027-01-23
  const events: CalendarEvent[] = [
    {
      id: 'past',
      title: 'Evento pasado',
      date: '2026-11-22',
      type: 'institucional',
      targetCourse: 'all',
    },
    {
      id: 'today',
      title: 'Acto hoy',
      date: '2026-11-23',
      time: '08:30',
      type: 'institucional',
      targetCourse: 'all',
    },
    {
      id: 'mid',
      title: 'Evaluación en 45 días',
      date: '2027-01-07',
      time: '10:00',
      type: 'examen',
      targetCourse: '3',
      isHighPriority: true,
    },
    {
      id: 'edge-2m',
      title: 'Reunión exactamente a 2 meses',
      date: '2027-01-23',
      type: 'reunion_padres',
      targetCourse: '1',
    },
    {
      id: 'after-2m',
      title: 'Evento fuera de ventana (2 meses + 1 día)',
      date: '2027-01-24',
      type: 'institucional',
      targetCourse: 'all',
    },
  ];

  const upcoming = getUpcomingCalendarEvents(events, 2, refDate);
  assert.deepEqual(
    upcoming.map((item) => item.evt.id),
    ['today', 'mid', 'edge-2m']
  );
  assert.equal(upcoming[0].diffDays, 0);
  assert.equal(upcoming[1].diffDays, 45);
  assert.equal(upcoming[2].diffDays, 61);
});

test('buildInternalNotifications no genera recordatorios con calendario vacío e incluye eventos nuevos dentro de 2 meses', () => {
  const refDate = new Date(2026, 10, 23, 9, 0, 0);
  const emptySummary = buildInternalNotifications({
    students: [],
    teachers: [],
    calendarEvents: SAMPLE_CALENDAR_EVENTS,
    disciplinaryRecords: [],
    issuedCards: [],
    academicTrajectories: {},
    schoolInfo: TEST_SCHOOL_INFO,
    lastBackupIso: new Date().toISOString(),
    referenceDate: refDate,
  });

  const emptyCalNotifs = emptySummary.active.filter(
    (n) => n.category === 'calendario'
  );
  assert.equal(emptyCalNotifs.length, 0);

  const populatedSummary = buildInternalNotifications({
    students: [],
    teachers: [],
    calendarEvents: [
      {
        id: 'new-evt-45d',
        title: 'Mesa de Examen Enero',
        date: '2027-01-07',
        time: '08:00',
        type: 'examen',
        targetCourse: '4',
      },
    ],
    disciplinaryRecords: [],
    issuedCards: [],
    academicTrajectories: {},
    schoolInfo: TEST_SCHOOL_INFO,
    lastBackupIso: new Date().toISOString(),
    referenceDate: refDate,
  });

  const populatedCalNotifs = populatedSummary.active.filter(
    (n) => n.category === 'calendario'
  );
  assert.equal(populatedCalNotifs.length, 1);
  assert.match(populatedCalNotifs[0].title, /Mesa de Examen Enero/);
  assert.equal(populatedCalNotifs[0].severity, 'informativa');
});
