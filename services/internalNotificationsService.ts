import {
  CalendarEvent,
  CourseYear,
  DisciplinaryIncident,
  IssuedCardRecord,
  SchoolInfo,
  Student,
  StudentTrajectoryProfile,
  Teacher,
} from '../types';
import { calculateDropoutRateMetrics } from './dropoutRateService';
import { getLocalTodayISO } from './storageService';
import { formatShortDateES, getUpcomingCalendarEvents, isValidISODate } from './calendarUtils';

export type InternalNotificationCategory =
  | 'calendario'
  | 'asistencia'
  | 'disciplina'
  | 'administracion'
  | 'comunidad';

export type InternalNotificationSeverity = 'critica' | 'advertencia' | 'informativa';

export type InternalNotificationActionTarget =
  | 'calendar'
  | 'attendance'
  | 'students'
  | 'teachers'
  | 'trajectory-merit'
  | 'student-cards'
  | 'backup'
  | 'student-detail'
  | 'teacher-detail';

export type BirthdayPersonRoleType = 'student' | 'teacher' | 'staff';

export interface BirthdayPersonItem {
  id: string;
  fullName: string;
  birthDate: string;
  age: number | null;
  personKind: BirthdayPersonRoleType;
  roleLabel: string;
  actionTarget: 'student-detail' | 'teacher-detail';
}

export interface InternalNotification {
  id: string;
  category: InternalNotificationCategory;
  severity: InternalNotificationSeverity;
  title: string;
  detail: string;
  metaParts: string[];
  actionLabel: string;
  actionTarget: InternalNotificationActionTarget;
  targetStudentId?: string;
  targetTeacherId?: string;
  createdAtLabel: string;
  priorityScore: number;
}

export interface InternalNotificationsInput {
  students: Student[];
  teachers?: Teacher[];
  calendarEvents: CalendarEvent[];
  disciplinaryRecords: DisciplinaryIncident[];
  issuedCards: IssuedCardRecord[];
  academicTrajectories: Record<string, StudentTrajectoryProfile>;
  schoolInfo: SchoolInfo;
  lastBackupIso: string | null;
  dismissedIds?: string[];
  referenceDate?: Date;
}

export interface InternalNotificationsSummary {
  all: InternalNotification[];
  active: InternalNotification[];
  dismissedCount: number;
  countsBySeverity: Record<InternalNotificationSeverity, number>;
  countsByCategory: Record<InternalNotificationCategory, number>;
  todaysBirthdays: BirthdayPersonItem[];
}

const COURSE_LABELS: Record<CourseYear, string> = {
  '1': '1° Año',
  '2': '2° Año',
  '3': '3° Año',
  '4': '4° Año',
  '5': '5° Año',
  '6': '6° Año',
};

const EVENT_TYPE_LABELS: Record<CalendarEvent['type'], string> = {
  institucional: 'Institucional',
  examen: 'Examen',
  reunion_padres: 'Reunión de Padres',
  feriado: 'Feriado',
};

const STAFF_ROLE_REGEX =
  /(preceptor|secretar|director|rector|vicedirector|auxiliar|bibliotec|bedel|administrativ|personal|tutor|psicop|asesor|porter)/i;

const calculateAgeOnDate = (birthDate: string, referenceDate: Date): number | null => {
  const parts = (birthDate || '').trim().split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day) || year < 1900) {
    return null;
  }
  let age = referenceDate.getFullYear() - year;
  const monthDiff = referenceDate.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < day)) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
};

const matchesMonthAndDay = (birthDate: string, referenceDate: Date): boolean => {
  const parts = (birthDate || '').trim().split('-');
  if (parts.length !== 3) return false;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return month === referenceDate.getMonth() + 1 && day === referenceDate.getDate();
};

export const classifyTeacherOrStaffRole = (
  teacher: Teacher
): { personKind: 'teacher' | 'staff'; roleLabel: string } => {
  const trimmedRole = (teacher.role || '').trim();
  if (trimmedRole && STAFF_ROLE_REGEX.test(trimmedRole)) {
    return {
      personKind: 'staff',
      roleLabel: trimmedRole,
    };
  }
  return {
    personKind: 'teacher',
    roleLabel: trimmedRole || 'Docente',
  };
};

export const getTodaysBirthdayPeople = (
  students: Student[],
  teachers: Teacher[] = [],
  referenceDate: Date = new Date()
): BirthdayPersonItem[] => {
  const celebrants: BirthdayPersonItem[] = [];

  students.forEach((student) => {
    if (!matchesMonthAndDay(student.birthDate, referenceDate)) return;
    const divisionText = student.division ? ` "${student.division}"` : '';
    celebrants.push({
      id: student.id,
      fullName: student.fullName,
      birthDate: student.birthDate,
      age: calculateAgeOnDate(student.birthDate, referenceDate),
      personKind: 'student',
      roleLabel: `Alumno · ${COURSE_LABELS[student.course]}${divisionText}`,
      actionTarget: 'student-detail',
    });
  });

  teachers.forEach((teacher) => {
    if (!matchesMonthAndDay(teacher.birthDate, referenceDate)) return;
    const classified = classifyTeacherOrStaffRole(teacher);
    celebrants.push({
      id: teacher.id,
      fullName: teacher.fullName,
      birthDate: teacher.birthDate,
      age: calculateAgeOnDate(teacher.birthDate, referenceDate),
      personKind: classified.personKind,
      roleLabel:
        classified.personKind === 'staff'
          ? `Personal · ${classified.roleLabel}`
          : classified.roleLabel,
      actionTarget: 'teacher-detail',
    });
  });

  const orderWeight: Record<BirthdayPersonRoleType, number> = {
    student: 0,
    teacher: 1,
    staff: 2,
  };

  return celebrants.sort((a, b) => {
    if (orderWeight[a.personKind] !== orderWeight[b.personKind]) {
      return orderWeight[a.personKind] - orderWeight[b.personKind];
    }
    return a.fullName.localeCompare(b.fullName, 'es');
  });
};

const parseLocalMidnight = (isoDate: string): Date | null => {
  if (!isValidISODate(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const diffLocalCalendarDays = (targetIso: string, referenceIso: string): number | null => {
  const target = parseLocalMidnight(targetIso);
  const reference = parseLocalMidnight(referenceIso);
  if (!target || !reference) return null;
  return Math.round((target.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24));
};

export const getCategoryLabelES = (category: InternalNotificationCategory): string => {
  switch (category) {
    case 'calendario':
      return 'Calendario';
    case 'asistencia':
      return 'Asistencia';
    case 'disciplina':
      return 'Convivencia';
    case 'administracion':
      return 'Administración';
    case 'comunidad':
      return 'Comunidad';
  }
};

export const getSeverityLabelES = (severity: InternalNotificationSeverity): string => {
  switch (severity) {
    case 'critica':
      return 'Prioridad alta';
    case 'advertencia':
      return 'Atención';
    case 'informativa':
      return 'Informativa';
  }
};

/**
 * Genera el listado determinístico de notificaciones internas del Panel de Control
 * a partir del estado real de alumnos, docentes, personal, calendario, disciplina, carnets y copias de seguridad.
 * No utiliza Push API, Notification API ni procesos en segundo plano.
 */
export const buildInternalNotifications = (
  input: InternalNotificationsInput
): InternalNotificationsSummary => {
  const {
    students,
    teachers = [],
    calendarEvents,
    disciplinaryRecords,
    issuedCards,
    academicTrajectories,
    schoolInfo,
    lastBackupIso,
    dismissedIds = [],
    referenceDate = new Date(),
  } = input;

  const todayISO = getLocalTodayISO(referenceDate);
  const notifications: InternalNotification[] = [];

  // 1. Calendario escolar: eventos de hoy y próximos 2 meses
  const upcomingEvents = getUpcomingCalendarEvents(calendarEvents, 2, referenceDate);

  upcomingEvents.forEach(({ evt: event, diffDays }) => {
    const dayLabel =
      diffDays === 0 ? 'Hoy' : diffDays === 1 ? 'Mañana' : `En ${diffDays} días`;
    const severity: InternalNotificationSeverity =
      diffDays === 0 && (event.isHighPriority || event.type === 'examen')
        ? 'critica'
        : diffDays <= 7 || event.isHighPriority
        ? 'advertencia'
        : 'informativa';

    const courseScope =
      event.targetCourse === 'all' ? 'Toda la institución' : COURSE_LABELS[event.targetCourse];

    const metaParts = [
      'Calendario',
      EVENT_TYPE_LABELS[event.type],
      `${dayLabel} (${formatShortDateES(event.date)})`,
      event.time ? `${event.time} hs` : 'Todo el día',
      courseScope,
    ];

    notifications.push({
      id: `cal-${event.id}-${event.date}`,
      category: 'calendario',
      severity,
      title:
        diffDays === 0
          ? `Actividad hoy: ${event.title}`
          : `Próximo evento (${dayLabel.toLowerCase()}): ${event.title}`,
      detail:
        event.description?.trim() ||
        `${EVENT_TYPE_LABELS[event.type]} programado${event.location ? ` en ${event.location}` : ''}.`,
      metaParts,
      actionLabel: 'Ver calendario',
      actionTarget: 'calendar',
      createdAtLabel: dayLabel,
      priorityScore:
        (severity === 'critica' ? 300 : severity === 'advertencia' ? 200 : 100) +
        Math.max(0, 65 - diffDays) +
        (event.isHighPriority ? 20 : 0),
    });
  });

  // 2. Asistencia y tasa de deserción (inasistencias crónicas / bajas / riesgo)
  const dropoutSummary = calculateDropoutRateMetrics(
    students,
    academicTrajectories,
    schoolInfo.academicYear
  );

  if (dropoutSummary.totalImpactedCount > 0) {
    const singleImpacted =
      dropoutSummary.impactedStudents.length === 1
        ? dropoutSummary.impactedStudents[0].student
        : undefined;
    const isCritical =
      dropoutSummary.severityLevel === 'critico' ||
      dropoutSummary.bajaAbandonoCount > 0 ||
      dropoutSummary.chronicAbsenceCount > 0;

    const factorSegments: string[] = [];
    if (dropoutSummary.chronicAbsenceCount > 0) {
      factorSegments.push(
        `${dropoutSummary.chronicAbsenceCount} con inasistencia crónica (≥${dropoutSummary.chronicThresholdPercent}%)`
      );
    }
    if (dropoutSummary.bajaAbandonoCount > 0) {
      factorSegments.push(`${dropoutSummary.bajaAbandonoCount} con baja o abandono`);
    }
    if (dropoutSummary.paseSalienteCount > 0) {
      factorSegments.push(`${dropoutSummary.paseSalienteCount} con pase saliente`);
    }

    notifications.push({
      id: `att-dropout-${dropoutSummary.academicYear}-${dropoutSummary.totalImpactedCount}-${dropoutSummary.chronicAbsenceCount}-${dropoutSummary.enrollmentChangeCount}`,
      category: 'asistencia',
      severity: isCritical ? 'critica' : 'advertencia',
      title:
        dropoutSummary.totalImpactedCount === 1
          ? `1 estudiante con alerta de deserción o inasistencia crónica`
          : `${dropoutSummary.totalImpactedCount} estudiantes impactan la tasa de deserción (${dropoutSummary.dropoutRate}%)`,
      detail: factorSegments.join(' · ') || 'Requiere seguimiento de trayectoria y comunicación con tutores.',
      metaParts: [
        'Asistencia y Deserción',
        `Ciclo ${dropoutSummary.academicYear}`,
        `Tasa ${dropoutSummary.dropoutRate}%`,
        `${dropoutSummary.totalImpactedCount}/${dropoutSummary.totalCohort} alumnos`,
      ],
      actionLabel: singleImpacted ? 'Ver legajo' : 'Revisar asistencia',
      actionTarget: singleImpacted ? 'student-detail' : 'attendance',
      targetStudentId: singleImpacted?.id,
      createdAtLabel: 'Ciclo lectivo actual',
      priorityScore: isCritical ? 340 : 240,
    });
  }

  // Alerta preventiva (>20% y <30% inasistencias efectivas) sin duplicar estudiantes ya incluidos en crónica
  const impactedIds = new Set(dropoutSummary.impactedStudents.map((item) => item.student.id));
  const moderateAbsenceStudents = students.filter((student) => {
    if (impactedIds.has(student.id) || student.enrollmentStatus === 'egresado') return false;
    const records = Array.isArray(student.attendance) ? student.attendance : [];
    if (records.length === 0) return false;
    let ausentes = 0;
    let tardes = 0;
    for (const rec of records) {
      if (rec.type === 'ausente') ausentes += 1;
      else if (rec.type === 'tarde') tardes += 1;
    }
    const rate = ((ausentes + tardes * 0.5) / records.length) * 100;
    return rate > 20 && rate < dropoutSummary.chronicThresholdPercent;
  });

  if (moderateAbsenceStudents.length > 0) {
    const singleModerate =
      moderateAbsenceStudents.length === 1 ? moderateAbsenceStudents[0] : undefined;
    notifications.push({
      id: `att-early-${moderateAbsenceStudents.length}-${moderateAbsenceStudents.map((s) => s.id).slice(0, 3).join('-')}`,
      category: 'asistencia',
      severity: 'advertencia',
      title:
        moderateAbsenceStudents.length === 1
          ? `Alerta temprana de asistencia: ${moderateAbsenceStudents[0].fullName}`
          : `${moderateAbsenceStudents.length} alumnos superaron el 20% de inasistencias`,
      detail:
        'Mantienen entre 20% y 30% de faltas acumuladas; se recomienda prevención antes de alcanzar umbral crítico.',
      metaParts: [
        'Alerta Temprana',
        singleModerate ? COURSE_LABELS[singleModerate.course] : 'Varios cursos',
        'Umbral > 20%',
      ],
      actionLabel: singleModerate ? 'Ver ficha' : 'Ir a asistencia',
      actionTarget: singleModerate ? 'student-detail' : 'attendance',
      targetStudentId: singleModerate?.id,
      createdAtLabel: 'Seguimiento preventivo',
      priorityScore: 225,
    });
  }

  if (dropoutSummary.atRiskMonitoringCount > 0) {
    notifications.push({
      id: `att-risk-status-${dropoutSummary.atRiskMonitoringCount}`,
      category: 'asistencia',
      severity: 'advertencia',
      title:
        dropoutSummary.atRiskMonitoringCount === 1
          ? '1 estudiante en estado "En riesgo / Seguimiento"'
          : `${dropoutSummary.atRiskMonitoringCount} estudiantes en estado "En riesgo / Seguimiento"`,
      detail: 'Alumnos marcados en seguimiento especial de matriculación que requieren acompañamiento periódico.',
      metaParts: ['Matriculación', `Ciclo ${dropoutSummary.academicYear}`, 'Estado activo'],
      actionLabel: 'Ver alumnos',
      actionTarget: 'students',
      createdAtLabel: 'Seguimiento activo',
      priorityScore: 210,
    });
  }

  // 3. Actuaciones disciplinarias pendientes de resolución
  const pendingDisciplinary = disciplinaryRecords.filter((rec) => rec.status === 'pendiente');
  if (pendingDisciplinary.length > 0) {
    const isHigh = pendingDisciplinary.length >= 3;
    const latest = [...pendingDisciplinary].sort((a, b) => b.date.localeCompare(a.date))[0];
    notifications.push({
      id: `disc-pending-${pendingDisciplinary.length}-${latest.id}`,
      category: 'disciplina',
      severity: isHigh ? 'critica' : 'advertencia',
      title:
        pendingDisciplinary.length === 1
          ? '1 actuación disciplinaria pendiente de resolución'
          : `${pendingDisciplinary.length} actuaciones disciplinarias pendientes de resolución`,
      detail: `Último registro del ${formatShortDateES(latest.date)}: ${latest.reason}.`,
      metaParts: [
        'Convivencia',
        `${pendingDisciplinary.length} pendiente${pendingDisciplinary.length === 1 ? '' : 's'}`,
        COURSE_LABELS[latest.course],
      ],
      actionLabel: 'Revisar actuaciones',
      actionTarget: 'trajectory-merit',
      createdAtLabel: formatShortDateES(latest.date),
      priorityScore: isHigh ? 295 : 215,
    });
  }

  // 4. Respaldo local (.JSON) y carnets próximos a vencer
  let backupDaysPassed: number | null = null;
  if (lastBackupIso) {
    const parsedBackupDate = new Date(lastBackupIso);
    if (!Number.isNaN(parsedBackupDate.getTime())) {
      backupDaysPassed = Math.max(
        0,
        Math.floor((referenceDate.getTime() - parsedBackupDate.getTime()) / (1000 * 60 * 60 * 24))
      );
    }
  }

  if (backupDaysPassed === null) {
    notifications.push({
      id: 'admin-backup-missing',
      category: 'administracion',
      severity: 'advertencia',
      title: 'Sin copia de seguridad local (.JSON) registrada',
      detail:
        'Aún no se descargó un respaldo completo en este equipo. Se recomienda exportar una copia preventiva.',
      metaParts: ['Respaldo Local', 'Sin copias previas', `${students.length} alumnos`],
      actionLabel: 'Crear backup (.JSON)',
      actionTarget: 'backup',
      createdAtLabel: 'Recomendación preventiva',
      priorityScore: 205,
    });
  } else if (backupDaysPassed > 7) {
    notifications.push({
      id: `admin-backup-stale-${lastBackupIso.slice(0, 10)}`,
      category: 'administracion',
      severity: 'advertencia',
      title: `Copia de seguridad desactualizada (hace ${backupDaysPassed} días)`,
      detail:
        'Superó el período recomendado de 7 días sin respaldar cambios de notas, asistencias y legajos.',
      metaParts: ['Respaldo Local', `Hace ${backupDaysPassed} días`, 'Sugerido cada 7 días'],
      actionLabel: 'Actualizar backup',
      actionTarget: 'backup',
      createdAtLabel: `Hace ${backupDaysPassed} días`,
      priorityScore: 195,
    });
  }

  const activeCards = issuedCards.filter((card) => card.status === 'vigente');
  let expiredCardsCount = 0;
  let expiringSoonCardsCount = 0;
  activeCards.forEach((card) => {
    const diff = diffLocalCalendarDays(card.validUntil, todayISO);
    if (diff === null) return;
    if (diff < 0) expiredCardsCount += 1;
    else if (diff <= 30) expiringSoonCardsCount += 1;
  });

  if (expiredCardsCount > 0 || expiringSoonCardsCount > 0) {
    const parts: string[] = [];
    if (expiredCardsCount > 0) {
      parts.push(`${expiredCardsCount} vencido${expiredCardsCount === 1 ? '' : 's'}`);
    }
    if (expiringSoonCardsCount > 0) {
      parts.push(`${expiringSoonCardsCount} por vencer en ≤30 días`);
    }
    notifications.push({
      id: `admin-cards-${expiredCardsCount}-${expiringSoonCardsCount}-${todayISO.slice(0, 7)}`,
      category: 'administracion',
      severity: expiredCardsCount > 0 ? 'advertencia' : 'informativa',
      title: `Vigencia de carnets QR: ${parts.join(' y ')}`,
      detail:
        'Revisa las credenciales emitidas para renovar fechas de vigencia antes del próximo control de acceso.',
      metaParts: ['Carnets QR', `${activeCards.length} vigentes`, parts.join(' · ')],
      actionLabel: 'Gestionar carnets',
      actionTarget: 'student-cards',
      createdAtLabel: 'Control de vigencia',
      priorityScore: expiredCardsCount > 0 ? 190 : 120,
    });
  }

  // 5. Cumpleaños del día (alumnos, docentes y personal)
  const todaysBirthdays = getTodaysBirthdayPeople(students, teachers, referenceDate);

  if (todaysBirthdays.length > 0) {
    const singleCelebrant = todaysBirthdays.length === 1 ? todaysBirthdays[0] : undefined;
    const onlyTeachersOrStaff = todaysBirthdays.every(
      (person) => person.actionTarget === 'teacher-detail'
    );
    const defaultTarget: InternalNotificationActionTarget = singleCelebrant
      ? singleCelebrant.actionTarget
      : onlyTeachersOrStaff
      ? 'teachers'
      : 'students';

    notifications.push({
      id: `comm-bday-${todayISO}-${todaysBirthdays.map((p) => `${p.personKind}-${p.id}`).join('-')}`,
      category: 'comunidad',
      severity: 'informativa',
      title: singleCelebrant
        ? `Cumpleaños hoy: ${singleCelebrant.fullName}`
        : `${todaysBirthdays.length} cumpleaños hoy en la comunidad educativa`,
      detail: todaysBirthdays
        .map((p) => `${p.fullName} (${p.roleLabel}${p.age !== null ? ` · ${p.age} años` : ''})`)
        .join(' · '),
      metaParts: [
        'Comunidad Escolar',
        `Hoy ${formatShortDateES(todayISO)}`,
        `${todaysBirthdays.length} ${todaysBirthdays.length === 1 ? 'persona' : 'personas'}`,
      ],
      actionLabel: singleCelebrant
        ? singleCelebrant.actionTarget === 'student-detail'
          ? 'Ver legajo'
          : 'Ver perfil'
        : onlyTeachersOrStaff
        ? 'Ver personal'
        : 'Ver alumnos',
      actionTarget: defaultTarget,
      targetStudentId:
        singleCelebrant?.actionTarget === 'student-detail' ? singleCelebrant.id : undefined,
      targetTeacherId:
        singleCelebrant?.actionTarget === 'teacher-detail' ? singleCelebrant.id : undefined,
      createdAtLabel: 'Hoy',
      priorityScore: 165,
    });
  }

  // Ordenar por prioridad descendente
  const sortedAll = [...notifications].sort((a, b) => b.priorityScore - a.priorityScore);
  const dismissedSet = new Set(dismissedIds);
  const active = sortedAll.filter((n) => !dismissedSet.has(n.id));
  const dismissedCount = sortedAll.length - active.length;

  const countsBySeverity: Record<InternalNotificationSeverity, number> = {
    critica: 0,
    advertencia: 0,
    informativa: 0,
  };
  const countsByCategory: Record<InternalNotificationCategory, number> = {
    calendario: 0,
    asistencia: 0,
    disciplina: 0,
    administracion: 0,
    comunidad: 0,
  };

  active.forEach((n) => {
    countsBySeverity[n.severity] += 1;
    countsByCategory[n.category] += 1;
  });

  return {
    all: sortedAll,
    active,
    dismissedCount,
    countsBySeverity,
    countsByCategory,
    todaysBirthdays,
  };
};

export const filterInternalNotificationsByCategory = (
  notifications: InternalNotification[],
  category: InternalNotificationCategory | 'all'
): InternalNotification[] => {
  if (category === 'all') return notifications;
  return notifications.filter((n) => n.category === category);
};
