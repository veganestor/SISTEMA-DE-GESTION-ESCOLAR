import {
  AcademicMovementRecord,
  AcademicMovementType,
  AcademicSubjectRecord,
  AcademicYearTrajectory,
  CourseYear,
  DEFAULT_COURSE_YEAR_WEIGHTS,
  DEFAULT_DISCIPLINARY_THRESHOLDS,
  DEFAULT_GRADING_PERIOD_WEIGHTS,
  DisciplinaryActuationStatus,
  DisciplinaryIncident,
  DisciplinarySanctionType,
  MeritOrderConfig,
  Student,
  StudentTrajectoryProfile,
  SUBJECTS_BY_YEAR,
  YearTrajectoryCondition,
} from '../types';
import { getLocalTodayISO } from './storageService';

export const SANCTION_TYPE_LABELS: Record<DisciplinarySanctionType, string> = {
  llamado_atencion_verbal: 'Llamado de atención verbal',
  llamado_atencion_escrito: 'Llamado de atención escrito',
  apercibimiento: 'Apercibimiento',
  acta_compromiso: 'Acta acuerdo / compromiso',
  suspension_temporal: 'Suspensión temporal',
  medida_reparadora: 'Medida educativa reparadora',
  otra_medida: 'Otra medida disciplinaria',
};

export const ACTUATION_STATUS_LABELS: Record<DisciplinaryActuationStatus, string> = {
  pendiente: 'Pendiente',
  resuelta: 'Resuelta',
  anulada: 'Anulada',
};

export const MOVEMENT_TYPE_LABELS: Record<AcademicMovementType, string> = {
  ingreso: 'Ingreso a la institución',
  promocion: 'Promoción de curso',
  repitencia: 'Repitencia de curso',
  cambio_curso: 'Cambio de curso',
  cambio_division: 'Cambio de división',
  pase_entrada: 'Pase recibido (ingreso desde otra escuela)',
  pase_salida: 'Pase emitido (egreso a otra escuela)',
  egreso: 'Egreso / Finalización de 6° Año',
  otra_situacion: 'Otra situación académica',
};

export const YEAR_CONDITION_LABELS: Record<YearTrajectoryCondition, string> = {
  en_curso: 'En curso',
  promovido: 'Promovido',
  promovido_con_pendientes: 'Promovido con pendientes',
  repitio: 'Repitió',
  pase: 'Con pase',
  egresado: 'Egresado',
};

export function normalizeSubjectKey(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function normalizeDni(dni: string): string {
  return (dni || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function formatDecimalAverage(
  value: number | null | undefined,
  decimals: 2 | 3 | 4 = 2
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(decimals);
}

export function roundToDecimals(value: number, decimals: 2 | 3 | 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Deduplica las materias de un año lectivo evitando contar dos veces la misma materia.
 */
export function deduplicateYearSubjects(
  subjects: AcademicSubjectRecord[]
): AcademicSubjectRecord[] {
  const byKey = new Map<string, AcademicSubjectRecord>();
  for (const subj of subjects) {
    const key = normalizeSubjectKey(subj.subject);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...subj });
    } else {
      // Conservar la entrada más completa (con calificación definitiva si existe)
      const prevScore =
        (prev.isDefinitive ? 4 : 0) +
        (typeof prev.finalGrade === 'number' ? 2 : 0) +
        (typeof prev.trimestre3 === 'number' ? 1 : 0);
      const currScore =
        (subj.isDefinitive ? 4 : 0) +
        (typeof subj.finalGrade === 'number' ? 2 : 0) +
        (typeof subj.trimestre3 === 'number' ? 1 : 0);
      byKey.set(key, currScore >= prevScore ? { ...subj } : prev);
    }
  }
  return Array.from(byKey.values());
}

/**
 * Sincroniza un objeto de calificaciones vivas (`student.grades`) en una lista de materias de trayectoria,
 * evitando duplicados y manteniendo pesos/exclusiones ya configurados.
 */
export function buildSubjectsFromStudentGrades(
  student: Student,
  existingSubjects: AcademicSubjectRecord[] = [],
  passingGrade = 6,
  defaultDefinitive = false
): AcademicSubjectRecord[] {
  const planSubjects = SUBJECTS_BY_YEAR[student.course] || [];
  const existingMap = new Map<string, AcademicSubjectRecord>();
  for (const item of existingSubjects) {
    existingMap.set(normalizeSubjectKey(item.subject), item);
  }

  const orderedKeys: string[] = [];
  const labelByKey = new Map<string, string>();

  const registerKey = (label: string) => {
    const key = normalizeSubjectKey(label);
    if (!key) return;
    if (!labelByKey.has(key)) {
      orderedKeys.push(key);
      labelByKey.set(key, label);
    }
  };

  planSubjects.forEach(registerKey);
  Object.keys(student.grades || {}).forEach(registerKey);
  existingSubjects.forEach((s) => registerKey(s.subject));

  const merged: AcademicSubjectRecord[] = orderedKeys.map((key) => {
    const canonicalLabel = labelByKey.get(key) || key;
    const existing = existingMap.get(key);

    // Buscar nota viva coincidente en student.grades (con normalización segura)
    let liveGrade = student.grades?.[canonicalLabel];
    if (!liveGrade && student.grades) {
      for (const [gKey, gVal] of Object.entries(student.grades)) {
        if (normalizeSubjectKey(gKey) === key) {
          liveGrade = gVal;
          break;
        }
      }
    }

    const t1 = liveGrade?.trimestre1 ?? existing?.trimestre1;
    const t2 = liveGrade?.trimestre2 ?? existing?.trimestre2;
    const t3 = liveGrade?.trimestre3 ?? existing?.trimestre3;

    // Priorizar nota final viva si el alumno tiene una cargada en el boletín actual
    const finalGrade =
      typeof liveGrade?.final === 'number' && !Number.isNaN(liveGrade.final)
        ? liveGrade.final
        : existing?.finalGrade;

    const hasThreeTrimesters =
      typeof t1 === 'number' && typeof t2 === 'number' && typeof t3 === 'number';
    const isDefinitive =
      existing?.isDefinitive !== undefined
        ? existing.isDefinitive && typeof finalGrade === 'number'
        : defaultDefinitive && typeof finalGrade === 'number' && hasThreeTrimesters;

    let status: AcademicSubjectRecord['status'] = existing?.status || 'en_curso';
    if (existing?.excludeFromAverage || status === 'eximida') {
      status = 'eximida';
    } else if (typeof finalGrade === 'number') {
      if (finalGrade >= passingGrade) {
        status = 'aprobada';
      } else {
        status = isDefinitive ? 'pendiente' : 'desaprobada';
      }
    } else {
      status = 'en_curso';
    }

    return {
      subject: canonicalLabel,
      trimestre1: t1,
      trimestre2: t2,
      trimestre3: t3,
      finalGrade,
      isDefinitive,
      weight: existing?.weight ?? 1,
      status,
      excludeFromAverage: existing?.excludeFromAverage ?? false,
      notes: existing?.notes,
    };
  });

  return deduplicateYearSubjects(merged);
}

/**
 * Resuelve la trayectoria efectiva de un alumno combinando sus años históricos guardados
 * con sus calificaciones actuales vivas de `student.grades` sin alterar el registro original.
 */
export function resolveStudentTrajectory(
  student: Student,
  stored: StudentTrajectoryProfile | undefined,
  currentAcademicYear: number,
  passingGrade = 6
): StudentTrajectoryProfile {
  const courseNum = Number(student.course) || 1;
  const inferredEntryYear = Math.max(2015, currentAcademicYear - (courseNum - 1));

  if (!stored) {
    const liveSubjects = buildSubjectsFromStudentGrades(student, [], passingGrade, false);
    const pendingSubjects = liveSubjects
      .filter(
        (s) =>
          !s.excludeFromAverage &&
          (s.status === 'pendiente' ||
            (typeof s.finalGrade === 'number' && s.finalGrade < passingGrade))
      )
      .map((s) => s.subject);

    return {
      studentId: student.id,
      dni: student.dni || '',
      entryYear: inferredEntryYear,
      entryCourse: '1',
      years: [
        {
          id: `yr-${student.id}-${currentAcademicYear}-${student.course}`,
          academicYear: currentAcademicYear,
          course: student.course,
          division: student.division,
          isRepeatedYear: false,
          isClosed: false,
          condition: 'en_curso',
          subjects: liveSubjects,
          pendingSubjects,
          updatedAt: new Date().toISOString(),
        },
      ],
      movements: [
        {
          id: `mov-init-${student.id}`,
          date: `${inferredEntryYear}-03-01`,
          academicYear: inferredEntryYear,
          type: 'ingreso',
          toCourse: '1',
          description: `Registro inicial de trayectoria institucional (${student.course}° Año vigente en ciclo ${currentAcademicYear}).`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }

  // Sincronizar el año lectivo actual del curso vigente con las notas de `student.grades`
  let matchedCurrentYear = false;
  const mergedYears = stored.years.map((yr) => {
    if (yr.academicYear === currentAcademicYear && yr.course === student.course) {
      matchedCurrentYear = true;
      const syncedSubjects = buildSubjectsFromStudentGrades(
        student,
        yr.subjects,
        passingGrade,
        yr.isClosed
      );
      const pendingSet = new Set(yr.pendingSubjects || []);
      syncedSubjects.forEach((s) => {
        if (
          !s.excludeFromAverage &&
          typeof s.finalGrade === 'number' &&
          s.finalGrade >= passingGrade
        ) {
          pendingSet.delete(s.subject);
        }
      });

      return {
        ...yr,
        division: student.division ?? yr.division,
        subjects: syncedSubjects,
        pendingSubjects: Array.from(pendingSet),
      };
    }
    return {
      ...yr,
      subjects: deduplicateYearSubjects(yr.subjects || []),
    };
  });

  // Si el alumno cambió de curso o inició un nuevo ciclo sin registro todavía, agregar sin borrar años previos
  if (!matchedCurrentYear) {
    const liveSubjects = buildSubjectsFromStudentGrades(student, [], passingGrade, false);
    const pendingSubjects = liveSubjects
      .filter(
        (s) =>
          !s.excludeFromAverage &&
          (s.status === 'pendiente' ||
            (typeof s.finalGrade === 'number' && s.finalGrade < passingGrade))
      )
      .map((s) => s.subject);

    mergedYears.push({
      id: `yr-${student.id}-${currentAcademicYear}-${student.course}`,
      academicYear: currentAcademicYear,
      course: student.course,
      division: student.division,
      isRepeatedYear: mergedYears.some((y) => y.course === student.course),
      isClosed: false,
      condition: 'en_curso',
      subjects: liveSubjects,
      pendingSubjects,
      updatedAt: new Date().toISOString(),
    });
  }

  mergedYears.sort((a, b) => {
    if (a.academicYear !== b.academicYear) return a.academicYear - b.academicYear;
    return Number(a.course) - Number(b.course);
  });

  return {
    ...stored,
    studentId: student.id,
    dni: student.dni || stored.dni,
    years: mergedYears,
    movements: [...(stored.movements || [])].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export interface YearAverageSummary {
  yearId: string;
  academicYear: number;
  course: CourseYear;
  division?: string;
  isRepeatedYear: boolean;
  isClosed: boolean;
  condition: YearTrajectoryCondition;
  average: number | null;
  formattedAverage: string;
  isDefinitive: boolean;
  statusLabel: 'Definitivo' | 'Parcial' | 'Sin calificaciones';
  partialReason?: string;
  countedSubjects: number;
  totalApplicableSubjects: number;
  excludedSubjects: number;
  pendingCloseCount: number;
  approvedCount: number;
  disapprovedCount: number;
  pendingAccreditationCount: number;
  totalWeight: number;
}

export interface StudentDisciplinarySummary {
  structuredTotal: number;
  legacyNotesCount: number;
  activeCount: number; // pendiente + resuelta (excluye anuladas)
  pendingCount: number;
  resolvedCount: number;
  annulledCount: number;
  activeSanctionTypes: DisciplinarySanctionType[];
}

export interface StudentTrajectorySummary {
  studentId: string;
  yearSummaries: YearAverageSummary[];
  // 1. Promedio anual del curso vigente
  currentYearSummary: YearAverageSummary | null;
  // 2. Promedio general acumulado de toda la trayectoria
  cumulativeAverage: number | null;
  formattedCumulativeAverage: string;
  cumulativeIsDefinitive: boolean;
  cumulativeStatusLabel: 'Definitivo' | 'Parcial' | 'Sin calificaciones';
  cumulativeCountedSubjects: number;
  cumulativeCountedYears: number;
  cumulativeTotalWeight: number;
  // 3. Promedio final de trayectoria al completar 6° Año
  hasCompletedSixthYear: boolean;
  hasFull1To6Trajectory: boolean;
  finalSixthYearAverage: number | null;
  formattedFinalSixthYearAverage: string;
  finalSixthYearIsDefinitive: boolean;
  finalSixthYearStatusLabel: string;
  // Resumen de situación académica y pendientes
  distinctCoursesRecorded: CourseYear[];
  totalApprovedSubjects: number;
  totalDisapprovedSubjects: number;
  totalPendingSubjects: number;
  pendingSubjectsList: Array<{ course: CourseYear; academicYear: number; subject: string }>;
  hasRepeatedYears: boolean;
  repeatedCourses: CourseYear[];
  // Antecedentes disciplinarios (solo informativos respecto del promedio — nunca descuentan nota)
  disciplinary: StudentDisciplinarySummary;
}

/**
 * Calcula la calificación numérica efectiva de una materia aplicando las ponderaciones
 * matemáticas por período (1°/2°/3° trimestre y cierre final) si están habilitadas.
 * Si un año histórico solo conserva nota final sin desglose trimestral, utiliza `finalGrade`.
 */
export function computeEffectiveSubjectGrade(
  subj: AcademicSubjectRecord,
  config: MeritOrderConfig
): {
  grade: number | null;
  usedPeriodWeighting: boolean;
  isCompletePeriods: boolean;
} {
  const hasFinal = typeof subj.finalGrade === 'number' && !Number.isNaN(subj.finalGrade);
  const periodCfg = config.gradingPeriodWeights || DEFAULT_GRADING_PERIOD_WEIGHTS;

  if (!periodCfg.enabled) {
    return {
      grade: hasFinal ? (subj.finalGrade as number) : null,
      usedPeriodWeighting: false,
      isCompletePeriods: Boolean(subj.isDefinitive && hasFinal),
    };
  }

  const w1 = Math.max(0, Number(periodCfg.trimestre1) || 0);
  const w2 = Math.max(0, Number(periodCfg.trimestre2) || 0);
  const w3 = Math.max(0, Number(periodCfg.trimestre3) || 0);
  const wF = Math.max(0, Number(periodCfg.finalExamWeight) || 0);

  const hasT1 = typeof subj.trimestre1 === 'number' && !Number.isNaN(subj.trimestre1);
  const hasT2 = typeof subj.trimestre2 === 'number' && !Number.isNaN(subj.trimestre2);
  const hasT3 = typeof subj.trimestre3 === 'number' && !Number.isNaN(subj.trimestre3);

  // Si no hay notas trimestrales (ej. años históricos cerrados solo con nota final), respetar finalGrade
  if (!hasT1 && !hasT2 && !hasT3) {
    return {
      grade: hasFinal ? (subj.finalGrade as number) : null,
      usedPeriodWeighting: false,
      isCompletePeriods: Boolean(subj.isDefinitive && hasFinal),
    };
  }

  let weightedSum = 0;
  let activeWeight = 0;
  let requiredWeight = 0;

  if (w1 > 0) {
    requiredWeight += w1;
    if (hasT1) {
      weightedSum += (subj.trimestre1 as number) * w1;
      activeWeight += w1;
    }
  }
  if (w2 > 0) {
    requiredWeight += w2;
    if (hasT2) {
      weightedSum += (subj.trimestre2 as number) * w2;
      activeWeight += w2;
    }
  }
  if (w3 > 0) {
    requiredWeight += w3;
    if (hasT3) {
      weightedSum += (subj.trimestre3 as number) * w3;
      activeWeight += w3;
    }
  }
  if (wF > 0) {
    requiredWeight += wF;
    if (hasFinal) {
      weightedSum += (subj.finalGrade as number) * wF;
      activeWeight += wF;
    }
  }

  if (activeWeight > 0) {
    const isCompletePeriods =
      requiredWeight > 0 && Math.abs(activeWeight - requiredWeight) < 1e-6;
    return {
      grade: weightedSum / activeWeight,
      usedPeriodWeighting: true,
      isCompletePeriods,
    };
  }

  return {
    grade: hasFinal ? (subj.finalGrade as number) : null,
    usedPeriodWeighting: false,
    isCompletePeriods: Boolean(subj.isDefinitive && hasFinal),
  };
}

/**
 * Retorna el multiplicador configurado para un curso (1° a 6° Año) al calcular promedios acumulados.
 */
export function getCourseYearWeightMultiplier(
  course: CourseYear,
  config: MeritOrderConfig
): number {
  const yearCfg = config.courseYearWeights || DEFAULT_COURSE_YEAR_WEIGHTS;
  if (!yearCfg.enabled) return 1;
  const raw = Number(yearCfg.weights?.[course]);
  return !Number.isNaN(raw) && raw > 0 ? raw : 1;
}

/**
 * Calcula el promedio anual de un ciclo lectivo con precisión decimal y reglas estrictas
 * de exclusión de materias sin cierre, duplicadas o no correspondientes al período.
 */
export function calculateYearAverage(
  year: AcademicYearTrajectory,
  config: MeritOrderConfig
): YearAverageSummary {
  const uniqueSubjects = deduplicateYearSubjects(year.subjects || []);
  const passingGrade = config.passingGrade || 6;

  let excludedSubjects = 0;
  let totalApplicableSubjects = 0;
  let countedSubjects = 0;
  let pendingCloseCount = 0;
  let approvedCount = 0;
  let disapprovedCount = 0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const subj of uniqueSubjects) {
    if (subj.excludeFromAverage || subj.status === 'eximida') {
      excludedSubjects += 1;
      continue;
    }

    totalApplicableSubjects += 1;

    const effective = computeEffectiveSubjectGrade(subj, config);
    if (effective.grade === null) {
      pendingCloseCount += 1;
      continue;
    }

    const gradeVal = effective.grade;
    if (gradeVal >= passingGrade) {
      approvedCount += 1;
    } else {
      disapprovedCount += 1;
    }

    // Si falta cierre definitivo o períodos requeridos por la ponderación, no declarar definitivo
    const subjectDefinitive =
      subj.isDefinitive && (!effective.usedPeriodWeighting || effective.isCompletePeriods);
    if (!subjectDefinitive) {
      pendingCloseCount += 1;
    }

    const weight =
      config.calculationMode === 'weighted' &&
      typeof subj.weight === 'number' &&
      subj.weight > 0
        ? subj.weight
        : 1;

    weightedSum += gradeVal * weight;
    totalWeight += weight;
    countedSubjects += 1;
  }

  // Materias pendientes de acreditación declaradas o desaprobadas no aprobadas
  const pendingSet = new Set<string>();
  (year.pendingSubjects || []).forEach((p) => {
    if (p && p.trim()) pendingSet.add(normalizeSubjectKey(p));
  });
  uniqueSubjects.forEach((s) => {
    if (
      !s.excludeFromAverage &&
      s.status !== 'eximida' &&
      (s.status === 'pendiente' ||
        (typeof s.finalGrade === 'number' && s.finalGrade < passingGrade))
    ) {
      pendingSet.add(normalizeSubjectKey(s.subject));
    }
  });
  const pendingAccreditationCount = pendingSet.size;

  const average = countedSubjects > 0 && totalWeight > 0 ? weightedSum / totalWeight : null;

  const isDefinitive =
    year.isClosed &&
    countedSubjects > 0 &&
    pendingCloseCount === 0 &&
    totalApplicableSubjects > 0 &&
    countedSubjects === totalApplicableSubjects;

  let statusLabel: YearAverageSummary['statusLabel'] = 'Sin calificaciones';
  let partialReason: string | undefined;

  if (countedSubjects === 0) {
    statusLabel = 'Sin calificaciones';
    partialReason = 'Sin calificaciones registradas para el período';
  } else if (isDefinitive) {
    statusLabel = 'Definitivo';
  } else {
    statusLabel = 'Parcial';
    if (!year.isClosed) {
      partialReason =
        pendingCloseCount > 0
          ? `Ciclo lectivo abierto · ${pendingCloseCount} materia(s) sin cierre definitivo`
          : 'Ciclo lectivo aún abierto (pendiente de cierre oficial)';
    } else if (pendingCloseCount > 0) {
      partialReason = `${pendingCloseCount} materia(s) pendientes de calificación definitiva`;
    } else {
      partialReason = 'Existen calificaciones pendientes de cierre';
    }
  }

  return {
    yearId: year.id,
    academicYear: year.academicYear,
    course: year.course,
    division: year.division,
    isRepeatedYear: Boolean(year.isRepeatedYear || year.condition === 'repitio'),
    isClosed: year.isClosed,
    condition: year.condition,
    average,
    formattedAverage: formatDecimalAverage(average, config.decimalPlaces),
    isDefinitive,
    statusLabel,
    partialReason,
    countedSubjects,
    totalApplicableSubjects,
    excludedSubjects,
    pendingCloseCount,
    approvedCount,
    disapprovedCount,
    pendingAccreditationCount,
    totalWeight,
  };
}

/**
 * Calcula los tres niveles de promedio (anual por año, general acumulado, final de trayectoria 6° Año)
 * y el resumen disciplinario (sin descontar jamás puntos del promedio).
 */
export function calculateStudentTrajectorySummary(
  student: Student,
  trajectory: StudentTrajectoryProfile,
  allDisciplinaryRecords: DisciplinaryIncident[],
  config: MeritOrderConfig
): StudentTrajectorySummary {
  const yearSummaries = trajectory.years.map((yr) => calculateYearAverage(yr, config));

  // Promedio del curso vigente (el último año coincidente con student.course o el más reciente)
  const currentYearSummary =
    [...yearSummaries].reverse().find((ys) => ys.course === student.course) ||
    yearSummaries[yearSummaries.length - 1] ||
    null;

  // Acumulado general a partir de todas las materias computables de los años incluidos
  // (deduplicando dentro de cada año, sin duplicar materias y excluyendo no evaluadas/eximidas)
  let cumulativeWeightedSum = 0;
  let cumulativeTotalWeight = 0;
  let cumulativeCountedSubjects = 0;
  let cumulativeCountedYears = 0;
  let allIncludedYearsDefinitive = true;

  for (let i = 0; i < trajectory.years.length; i++) {
    const yr = trajectory.years[i];
    const yrSummary = yearSummaries[i];

    if (yrSummary.countedSubjects === 0) continue;
    if (!config.includePartialYearsInCumulative && !yrSummary.isDefinitive) {
      continue;
    }

    const uniqueSubjects = deduplicateYearSubjects(yr.subjects || []);
    const courseYearMultiplier = getCourseYearWeightMultiplier(yr.course, config);
    let yearContributed = false;

    for (const subj of uniqueSubjects) {
      if (subj.excludeFromAverage || subj.status === 'eximida') continue;

      const effective = computeEffectiveSubjectGrade(subj, config);
      if (effective.grade === null) continue;

      const subjectDefinitive =
        subj.isDefinitive && (!effective.usedPeriodWeighting || effective.isCompletePeriods);

      // Si no se incluyen años parciales, solo aceptar materias definitivas
      if (!config.includePartialYearsInCumulative && !subjectDefinitive) continue;

      const baseSubjectWeight =
        config.calculationMode === 'weighted' &&
        typeof subj.weight === 'number' &&
        subj.weight > 0
          ? subj.weight
          : 1;

      const totalSubjectWeight = baseSubjectWeight * courseYearMultiplier;

      cumulativeWeightedSum += effective.grade * totalSubjectWeight;
      cumulativeTotalWeight += totalSubjectWeight;
      cumulativeCountedSubjects += 1;
      yearContributed = true;
    }

    if (yearContributed) {
      cumulativeCountedYears += 1;
      if (!yrSummary.isDefinitive) {
        allIncludedYearsDefinitive = false;
      }
    }
  }

  // Si algún año de la trayectoria está sin cierre definitivo, el promedio acumulado no es definitivo
  const hasAnyOpenOrPendingYear = yearSummaries.some(
    (ys) => ys.countedSubjects > 0 && !ys.isDefinitive
  );

  const cumulativeAverage =
    cumulativeCountedSubjects > 0 && cumulativeTotalWeight > 0
      ? cumulativeWeightedSum / cumulativeTotalWeight
      : null;

  const cumulativeIsDefinitive =
    cumulativeAverage !== null &&
    cumulativeCountedYears > 0 &&
    allIncludedYearsDefinitive &&
    !hasAnyOpenOrPendingYear;

  const cumulativeStatusLabel: StudentTrajectorySummary['cumulativeStatusLabel'] =
    cumulativeAverage === null
      ? 'Sin calificaciones'
      : cumulativeIsDefinitive
      ? 'Definitivo'
      : 'Parcial';

  // Materias pendientes y estadísticas totales
  const pendingSubjectsList: Array<{ course: CourseYear; academicYear: number; subject: string }> =
    [];
  let totalApprovedSubjects = 0;
  let totalDisapprovedSubjects = 0;

  trajectory.years.forEach((yr, idx) => {
    const ys = yearSummaries[idx];
    totalApprovedSubjects += ys.approvedCount;
    totalDisapprovedSubjects += ys.disapprovedCount;

    const seenPending = new Set<string>();
    (yr.pendingSubjects || []).forEach((subjName) => {
      const key = normalizeSubjectKey(subjName);
      if (key && !seenPending.has(key)) {
        seenPending.add(key);
        pendingSubjectsList.push({
          course: yr.course,
          academicYear: yr.academicYear,
          subject: subjName,
        });
      }
    });

    deduplicateYearSubjects(yr.subjects || []).forEach((s) => {
      if (
        !s.excludeFromAverage &&
        s.status !== 'eximida' &&
        (s.status === 'pendiente' ||
          (typeof s.finalGrade === 'number' && s.finalGrade < (config.passingGrade || 6)))
      ) {
        const key = normalizeSubjectKey(s.subject);
        if (!seenPending.has(key)) {
          seenPending.add(key);
          pendingSubjectsList.push({
            course: yr.course,
            academicYear: yr.academicYear,
            subject: s.subject,
          });
        }
      }
    });
  });

  const distinctCoursesSet = new Set<CourseYear>(trajectory.years.map((y) => y.course));
  const distinctCoursesRecorded = (['1', '2', '3', '4', '5', '6'] as CourseYear[]).filter((c) =>
    distinctCoursesSet.has(c)
  );

  const hasFull1To6Trajectory = (['1', '2', '3', '4', '5', '6'] as CourseYear[]).every((c) =>
    distinctCoursesSet.has(c)
  );

  const repeatedCourses = Array.from(
    new Set(
      trajectory.years
        .filter((y) => y.isRepeatedYear || y.condition === 'repitio')
        .map((y) => y.course)
    )
  );
  const hasRepeatedYears =
    repeatedCourses.length > 0 ||
    trajectory.movements.some((m) => m.type === 'repitencia');

  // 3. Promedio final de trayectoria al completar 6° Año
  const sixthYearRecord = [...yearSummaries].reverse().find((ys) => ys.course === '6') || null;
  const hasCompletedSixthYear = Boolean(
    sixthYearRecord &&
      (sixthYearRecord.condition === 'egresado' ||
        (sixthYearRecord.isClosed && sixthYearRecord.countedSubjects > 0))
  );

  const finalSixthYearAverage = hasCompletedSixthYear ? cumulativeAverage : null;
  const finalSixthYearIsDefinitive = Boolean(
    hasCompletedSixthYear &&
      sixthYearRecord?.isDefinitive &&
      cumulativeIsDefinitive &&
      pendingSubjectsList.length === 0
  );

  let finalSixthYearStatusLabel = 'Pendiente de cursar/completar 6° Año';
  if (sixthYearRecord) {
    if (finalSixthYearIsDefinitive) {
      finalSixthYearStatusLabel = hasFull1To6Trajectory
        ? 'Definitivo (Trayectoria completa 1° a 6°)'
        : 'Definitivo (6° Año cerrado)';
    } else if (hasCompletedSixthYear) {
      finalSixthYearStatusLabel = 'Parcial (existen pendientes o ciclos abiertos)';
    } else {
      finalSixthYearStatusLabel = '6° Año en curso (sin cierre definitivo)';
    }
  }

  // Resumen de antecedentes disciplinarios (NUNCA modifica los promedios anteriores)
  const studentIncidents = allDisciplinaryRecords.filter((r) => r.studentId === student.id);
  const pendingCount = studentIncidents.filter((r) => r.status === 'pendiente').length;
  const resolvedCount = studentIncidents.filter((r) => r.status === 'resuelta').length;
  const annulledCount = studentIncidents.filter((r) => r.status === 'anulada').length;
  const activeIncidents = studentIncidents.filter((r) => r.status !== 'anulada');
  const activeSanctionTypes = Array.from(new Set(activeIncidents.map((r) => r.sanctionType)));

  return {
    studentId: student.id,
    yearSummaries,
    currentYearSummary,
    cumulativeAverage,
    formattedCumulativeAverage: formatDecimalAverage(cumulativeAverage, config.decimalPlaces),
    cumulativeIsDefinitive,
    cumulativeStatusLabel,
    cumulativeCountedSubjects,
    cumulativeCountedYears,
    cumulativeTotalWeight,
    hasCompletedSixthYear,
    hasFull1To6Trajectory,
    finalSixthYearAverage,
    formattedFinalSixthYearAverage: formatDecimalAverage(
      finalSixthYearAverage,
      config.decimalPlaces
    ),
    finalSixthYearIsDefinitive,
    finalSixthYearStatusLabel,
    distinctCoursesRecorded,
    totalApprovedSubjects,
    totalDisapprovedSubjects,
    totalPendingSubjects: pendingSubjectsList.length,
    pendingSubjectsList,
    hasRepeatedYears,
    repeatedCourses,
    disciplinary: {
      structuredTotal: studentIncidents.length,
      legacyNotesCount: (student.disciplinary || []).length,
      activeCount: activeIncidents.length,
      pendingCount,
      resolvedCount,
      annulledCount,
      activeSanctionTypes,
    },
  };
}

export interface EligibilityCheckItem {
  code: string;
  label: string;
  status: 'ok' | 'review' | 'failed';
  detail: string;
}

export type MeritRoleLabel = 'ABANDERADO/A' | 'PRIMER/A ESCOLTA' | 'SEGUNDO/A ESCOLTA' | null;

export interface StudentMeritEligibilityDetail {
  student: Student;
  trajectory: StudentTrajectoryProfile;
  summary: StudentTrajectorySummary;
  eligibilityStatus: 'elegible' | 'revision_institucional' | 'no_elegible';
  checks: EligibilityCheckItem[];
  trajectoryChecks: EligibilityCheckItem[];
  meetsTrajectoryRequirements: boolean;
  passedTrajectoryChecksCount: number;
  totalTrajectoryChecksCount: number;
  disciplinaryCheck: EligibilityCheckItem;
  activeDisciplinaryIncidents: DisciplinaryIncident[];
  pendingDisciplinaryIncidentsCount: number;
  hasActiveSanctionsForManualReview: boolean;
  manualReviewTriggerReasons: string[];
  roundedAverage: number | null;
  formattedAverage: string;
}

export interface MeritCandidateEvaluation extends StudentMeritEligibilityDetail {
  meritRank: number | null; // 1, 2, 3... (compartido si hay empate exacto)
  roleAssigned: MeritRoleLabel;
  isTied: boolean;
}

export interface MeritOrderEvaluationResult {
  evaluatedCount: number;
  eligibleCandidates: MeritCandidateEvaluation[];
  reviewCandidates: MeritCandidateEvaluation[];
  ineligibleCandidates: MeritCandidateEvaluation[];
  abanderadosGroup: MeritCandidateEvaluation[]; // Rank 1 (puede incluir >1 si hay empate)
  primerEscoltaGroup: MeritCandidateEvaluation[]; // Rank 2 (o vacío si empate absorbe puesto)
  segundoEscoltaGroup: MeritCandidateEvaluation[]; // Rank 3
  hasTopThreeTie: boolean;
  tiedRanks: number[];
  duplicateDniWarnings: Array<{ dni: string; studentNames: string[] }>;
}

/**
 * Evalúa el cumplimiento de los requisitos mínimos institucionales de trayectoria
 * y recopila las sanciones disciplinarias activas que requieren revisión manual
 * para un estudiante individual (sin descontar ni modificar su promedio).
 */
export function evaluateStudentMeritEligibility(
  student: Student,
  trajectory: StudentTrajectoryProfile,
  allDisciplinaryRecords: DisciplinaryIncident[],
  config: MeritOrderConfig,
  summaryOverride?: StudentTrajectorySummary
): StudentMeritEligibilityDetail {
  const summary =
    summaryOverride ||
    calculateStudentTrajectorySummary(student, trajectory, allDisciplinaryRecords, config);

  const trajectoryChecks: EligibilityCheckItem[] = [];

  // 1. Disponibilidad de calificaciones / promedio
  if (summary.cumulativeAverage === null) {
    trajectoryChecks.push({
      code: 'average_available',
      label: 'Calificaciones computables',
      status: 'failed',
      detail: 'No registra calificaciones finales computables.',
    });
  } else {
    trajectoryChecks.push({
      code: 'average_available',
      label: 'Calificaciones computables',
      status: 'ok',
      detail: `${summary.cumulativeCountedSubjects} calificación(es) en ${summary.cumulativeCountedYears} ciclo(s).`,
    });
  }

  // 2. Calificaciones definitivas
  if (config.requireDefinitiveAverage) {
    trajectoryChecks.push({
      code: 'definitive_grades',
      label: 'Calificaciones definitivas',
      status: summary.cumulativeIsDefinitive ? 'ok' : 'failed',
      detail: summary.cumulativeIsDefinitive
        ? 'Todos los ciclos computados cuentan con cierre definitivo.'
        : 'Promedio parcial: existen ciclos abiertos o materias sin cierre definitivo.',
    });
  } else {
    trajectoryChecks.push({
      code: 'definitive_grades',
      label: 'Calificaciones definitivas',
      status: 'ok',
      detail: summary.cumulativeIsDefinitive
        ? 'Promedio definitivo.'
        : 'Promedio parcial admitido según configuración vigente.',
    });
  }

  // 3. Trayectoria completa y años mínimos en la institución
  const expectedCoursesUpToCurrent = Array.from(
    { length: Number(student.course) || 1 },
    (_, i) => String(i + 1) as CourseYear
  );
  const hasAllExpectedCourses = expectedCoursesUpToCurrent.every((c) =>
    summary.distinctCoursesRecorded.includes(c)
  );

  if (config.requireCompleteTrajectory) {
    trajectoryChecks.push({
      code: 'complete_trajectory',
      label: 'Trayectoria académica completa',
      status: hasAllExpectedCourses ? 'ok' : 'failed',
      detail: hasAllExpectedCourses
        ? `Registra trayectoria completa (1° a ${student.course}° Año).`
        : `Faltan años históricos en la trayectoria (registrados: ${summary.distinctCoursesRecorded.join('°, ')}°).`,
    });
  } else {
    trajectoryChecks.push({
      code: 'complete_trajectory',
      label: 'Trayectoria registrada',
      status: 'ok',
      detail: `${summary.distinctCoursesRecorded.length} curso(s) registrados en trayectoria.`,
    });
  }

  if (config.minYearsInInstitution > 1) {
    const meetsMinYears = summary.distinctCoursesRecorded.length >= config.minYearsInInstitution;
    trajectoryChecks.push({
      code: 'min_years',
      label: `Antigüedad mínima (${config.minYearsInInstitution} años)`,
      status: meetsMinYears ? 'ok' : 'failed',
      detail: `${summary.distinctCoursesRecorded.length} año(s) registrados en la institución.`,
    });
  }

  // 4. Regularidad y materias pendientes
  if (config.requireNoPendingSubjects) {
    const allowed = Math.max(0, config.maxAllowedPendingSubjects || 0);
    const passesPending = summary.totalPendingSubjects <= allowed;
    trajectoryChecks.push({
      code: 'pending_subjects',
      label: 'Materias pendientes',
      status: passesPending ? 'ok' : 'failed',
      detail:
        summary.totalPendingSubjects === 0
          ? 'Sin materias pendientes ni desaprobadas.'
          : `${summary.totalPendingSubjects} materia(s) pendiente(s) (máximo permitido: ${allowed}).`,
    });
  } else {
    trajectoryChecks.push({
      code: 'pending_subjects',
      label: 'Materias pendientes',
      status: 'ok',
      detail:
        summary.totalPendingSubjects === 0
          ? 'Sin materias pendientes.'
          : `${summary.totalPendingSubjects} pendiente(s) (informativo según configuración).`,
    });
  }

  // 5. Repitencias (solo si la institución configuró restricción)
  if (!config.allowRepeatedYears) {
    trajectoryChecks.push({
      code: 'repeated_years',
      label: 'Trayectoria sin repitencias',
      status: summary.hasRepeatedYears ? 'failed' : 'ok',
      detail: summary.hasRepeatedYears
        ? `Registra repitencia en ${summary.repeatedCourses.map((c) => `${c}°`).join(', ')} Año.`
        : 'Sin repitencias registradas.',
    });
  }

  // 6. Antecedentes disciplinarios (NUNCA descuenta nota; aplica umbrales configurados para revisión manual o exclusión)
  const thresholds = {
    ...DEFAULT_DISCIPLINARY_THRESHOLDS,
    ...(config.disciplinaryThresholds || {}),
  };

  const studentIncidents = allDisciplinaryRecords
    .filter((r) => r.studentId === student.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Sanciones disciplinarias activas (no anuladas) ordenadas de la más reciente a la más antigua
  const activeDisciplinaryIncidents = studentIncidents.filter((r) => r.status !== 'anulada');
  const pendingDisciplinaryIncidentsCount = activeDisciplinaryIncidents.filter(
    (r) => r.status === 'pendiente'
  ).length;

  const relevantIncidents = config.ignoreAnnulledSanctions
    ? activeDisciplinaryIncidents
    : studentIncidents;

  // Ventana temporal configurable (0 = toda la trayectoria; N > 0 = últimos N ciclos lectivos)
  const referenceYear =
    trajectory.years.length > 0
      ? Math.max(...trajectory.years.map((y) => y.academicYear))
      : new Date().getFullYear();

  const windowCycles = Math.max(0, Math.floor(thresholds.manualReviewRecentYearsWindow || 0));
  const windowedIncidents =
    windowCycles > 0
      ? relevantIncidents.filter((inc) => inc.academicYear >= referenceYear - (windowCycles - 1))
      : relevantIncidents;

  const windowScopeLabel =
    windowCycles > 0
      ? windowCycles === 1
        ? `en el ciclo ${referenceYear}`
        : `en los últimos ${windowCycles} ciclos`
      : 'en la trayectoria';

  const minManualReviewCount = Math.max(1, Math.floor(thresholds.manualReviewMinActiveCount || 1));
  const minExclusionCount = Math.max(1, Math.floor(thresholds.exclusionMinSanctionCount || 1));
  const maxAccumulationEscalation = Math.max(
    0,
    Math.floor(thresholds.maxTotalActiveSanctionsBeforeEscalation || 0)
  );

  const pendingInWindow = windowedIncidents.filter((inc) => inc.status === 'pendiente');
  const matchingExcluded = windowedIncidents.filter((inc) =>
    config.excludedSanctionTypes.includes(inc.sanctionType)
  );

  const hitPendingTrigger =
    thresholds.alwaysReviewPendingActuations && pendingInWindow.length > 0;
  const hitManualReviewCount = windowedIncidents.length >= minManualReviewCount;
  const hitExclusionTypeThreshold =
    config.excludedSanctionTypes.length > 0 && matchingExcluded.length >= minExclusionCount;
  const hitPartialExclusionWarning =
    config.excludedSanctionTypes.length > 0 &&
    matchingExcluded.length > 0 &&
    matchingExcluded.length < minExclusionCount;
  const hitAccumulationThreshold =
    maxAccumulationEscalation > 0 && windowedIncidents.length >= maxAccumulationEscalation;

  const manualReviewTriggerReasons: string[] = [];
  if (hitPendingTrigger) {
    manualReviewTriggerReasons.push(
      `Registra ${pendingInWindow.length} actuación(es) en estado "Pendiente" ${windowScopeLabel}.`
    );
  }
  if (config.disciplinaryPolicy === 'review_active' && hitManualReviewCount) {
    manualReviewTriggerReasons.push(
      `Alcanza el umbral de revisión manual (${windowedIncidents.length} de ${minManualReviewCount} sanción/es activa/s ${windowScopeLabel}).`
    );
  }
  if (hitExclusionTypeThreshold) {
    manualReviewTriggerReasons.push(
      thresholds.exclusionTriggersManualReviewInsteadOfHardBlock
        ? `Alcanza el umbral disciplinario (${matchingExcluded.length} de ${minExclusionCount} sanción/es seleccionada/s ${windowScopeLabel}) — derivado a revisión manual obligatoria.`
        : `Alcanza el umbral de exclusión (${matchingExcluded.length} de ${minExclusionCount} sanción/es seleccionada/s ${windowScopeLabel}).`
    );
  } else if (
    config.disciplinaryPolicy === 'exclude_selected_types' &&
    hitPartialExclusionWarning
  ) {
    manualReviewTriggerReasons.push(
      `Alerta previa al umbral de exclusión (${matchingExcluded.length} de ${minExclusionCount} sanción/es del tipo seleccionado ${windowScopeLabel}).`
    );
  }
  if (hitAccumulationThreshold) {
    manualReviewTriggerReasons.push(
      `Alcanza el umbral por acumulación total (${windowedIncidents.length} de ${maxAccumulationEscalation} sanciones activas ${windowScopeLabel}).`
    );
  }

  let disciplinaryCheck: EligibilityCheckItem;
  if (config.disciplinaryPolicy === 'inform_only') {
    if (hitAccumulationThreshold) {
      disciplinaryCheck = {
        code: 'disciplinary',
        label: 'Antecedentes disciplinarios (umbral de acumulación)',
        status: 'review',
        detail: `${windowedIncidents.length} sanción(es) activa(s) ${windowScopeLabel} (supera el tope de ${maxAccumulationEscalation}) — derivada a revisión manual.`,
      };
    } else {
      disciplinaryCheck = {
        code: 'disciplinary',
        label: 'Antecedentes disciplinarios',
        status: 'ok',
        detail:
          relevantIncidents.length === 0
            ? 'Sin antecedentes disciplinarios activos.'
            : `${relevantIncidents.length} antecedente(s) registrado(s) — solo informativo, no excluye automáticamente.`,
      };
    }
  } else if (config.disciplinaryPolicy === 'review_active') {
    const triggersReview =
      hitManualReviewCount ||
      hitPendingTrigger ||
      hitExclusionTypeThreshold ||
      hitAccumulationThreshold;

    disciplinaryCheck = {
      code: 'disciplinary',
      label: 'Antecedentes disciplinarios',
      status: triggersReview ? 'review' : 'ok',
      detail:
        windowedIncidents.length === 0
          ? relevantIncidents.length > 0
            ? `Sin sanciones activas ${windowScopeLabel} (${relevantIncidents.length} fuera de ventana).`
            : 'Sin antecedentes disciplinarios activos.'
          : triggersReview
          ? manualReviewTriggerReasons[0] ||
            `${windowedIncidents.length} antecedente(s) activo(s) — requiere revisión manual del equipo directivo.`
          : `${windowedIncidents.length} antecedente(s) activo(s) ${windowScopeLabel} (por debajo del umbral de revisión de ${minManualReviewCount}).`,
    };
  } else {
    const triggersExclusionOrEscalation = hitExclusionTypeThreshold || hitAccumulationThreshold;
    const triggersManualReview =
      (triggersExclusionOrEscalation &&
        thresholds.exclusionTriggersManualReviewInsteadOfHardBlock) ||
      (!triggersExclusionOrEscalation && (hitPartialExclusionWarning || hitPendingTrigger));

    if (triggersExclusionOrEscalation && !thresholds.exclusionTriggersManualReviewInsteadOfHardBlock) {
      disciplinaryCheck = {
        code: 'disciplinary',
        label: 'Antecedentes disciplinarios (umbral institucional)',
        status: 'failed',
        detail:
          manualReviewTriggerReasons[0] ||
          `${matchingExcluded.length} actuación(es) alcanzada(s) por umbral institucional configurado.`,
      };
    } else if (triggersManualReview) {
      disciplinaryCheck = {
        code: 'disciplinary',
        label: 'Antecedentes disciplinarios (revisión manual)',
        status: 'review',
        detail:
          manualReviewTriggerReasons[0] ||
          `${windowedIncidents.length} actuación(es) activa(s) — requiere revisión manual de elegibilidad.`,
      };
    } else {
      disciplinaryCheck = {
        code: 'disciplinary',
        label: 'Antecedentes disciplinarios (criterio institucional)',
        status: 'ok',
        detail:
          relevantIncidents.length > 0
            ? `${relevantIncidents.length} antecedente(s) sin superar los umbrales configurados.`
            : 'Sin antecedentes disciplinarios activos.',
      };
    }
  }

  const checks: EligibilityCheckItem[] = [...trajectoryChecks, disciplinaryCheck];

  const passedTrajectoryChecksCount = trajectoryChecks.filter((c) => c.status === 'ok').length;
  const totalTrajectoryChecksCount = trajectoryChecks.length;
  const meetsTrajectoryRequirements = passedTrajectoryChecksCount === totalTrajectoryChecksCount;
  const hasActiveSanctionsForManualReview = activeDisciplinaryIncidents.length > 0;

  const hasFailure = checks.some((c) => c.status === 'failed');
  const hasReview = checks.some((c) => c.status === 'review');

  const eligibilityStatus: StudentMeritEligibilityDetail['eligibilityStatus'] = hasFailure
    ? 'no_elegible'
    : hasReview
    ? 'revision_institucional'
    : 'elegible';

  const roundedAverage =
    summary.cumulativeAverage !== null
      ? roundToDecimals(summary.cumulativeAverage, config.decimalPlaces)
      : null;

  return {
    student,
    trajectory,
    summary,
    eligibilityStatus,
    checks,
    trajectoryChecks,
    meetsTrajectoryRequirements,
    passedTrajectoryChecksCount,
    totalTrajectoryChecksCount,
    disciplinaryCheck,
    activeDisciplinaryIncidents,
    pendingDisciplinaryIncidentsCount,
    hasActiveSanctionsForManualReview,
    manualReviewTriggerReasons,
    roundedAverage,
    formattedAverage: formatDecimalAverage(summary.cumulativeAverage, config.decimalPlaces),
  };
}

/**
 * Evalúa el Orden de Mérito para Selección de Abanderados y Escoltas aplicando
 * únicamente los criterios institucionales configurados y SIN desempates ni exclusiones ocultas.
 */
export function evaluateMeritOrder(
  students: Student[],
  trajectoriesMap: Record<string, StudentTrajectoryProfile>,
  allDisciplinaryRecords: DisciplinaryIncident[],
  config: MeritOrderConfig,
  currentAcademicYear: number
): MeritOrderEvaluationResult {
  // Detectar posibles DNI duplicados sin alterar ni eliminar registros
  const dniBuckets = new Map<string, string[]>();
  students.forEach((s) => {
    const clean = normalizeDni(s.dni);
    if (!clean) return;
    const arr = dniBuckets.get(clean) || [];
    arr.push(`${s.fullName} (${s.course}° Año)`);
    dniBuckets.set(clean, arr);
  });
  const duplicateDniWarnings = Array.from(dniBuckets.entries())
    .filter(([, names]) => names.length > 1)
    .map(([dni, studentNames]) => ({ dni, studentNames }));

  const targetSet = new Set(config.targetCourses);
  const candidatesPool = students.filter((s) =>
    targetSet.size === 0 ? true : targetSet.has(s.course)
  );

  const evaluations: MeritCandidateEvaluation[] = candidatesPool.map((student) => {
    const trajectory = resolveStudentTrajectory(
      student,
      trajectoriesMap[student.id],
      currentAcademicYear,
      config.passingGrade
    );
    const detail = evaluateStudentMeritEligibility(
      student,
      trajectory,
      allDisciplinaryRecords,
      config
    );

    return {
      ...detail,
      meritRank: null,
      roleAssigned: null,
      isTied: false,
    };
  });

  // Ordenar elegibles por promedio configurado descendente (sin desempate arbitrario oculto)
  const sortByAverageDesc = (a: MeritCandidateEvaluation, b: MeritCandidateEvaluation) => {
    const avgA = a.roundedAverage ?? -1;
    const avgB = b.roundedAverage ?? -1;
    if (avgB !== avgA) return avgB - avgA;
    // Comparar precisión completa solo para saber si es estrictamente igual o difiere en decimales siguientes
    const rawA = a.summary.cumulativeAverage ?? -1;
    const rawB = b.summary.cumulativeAverage ?? -1;
    if (Math.abs(rawB - rawA) > 1e-9) return rawB - rawA;
    return a.student.fullName.localeCompare(b.student.fullName, 'es-AR');
  };

  const eligibleCandidates = evaluations
    .filter((e) => e.eligibilityStatus === 'elegible')
    .sort(sortByAverageDesc);
  const reviewCandidates = evaluations
    .filter((e) => e.eligibilityStatus === 'revision_institucional')
    .sort(sortByAverageDesc);
  const ineligibleCandidates = evaluations
    .filter((e) => e.eligibilityStatus === 'no_elegible')
    .sort(sortByAverageDesc);

  // Asignar posiciones con detección explícita de empates (competition ranking: 1, 1, 3...)
  // Sin desempates automáticos impuestos
  const tiedRanksSet = new Set<number>();

  for (let i = 0; i < eligibleCandidates.length; i++) {
    const curr = eligibleCandidates[i];
    if (i === 0) {
      curr.meritRank = 1;
    } else {
      const prev = eligibleCandidates[i - 1];
      const sameDisplayedAvg =
        curr.roundedAverage !== null &&
        prev.roundedAverage !== null &&
        Math.abs(curr.roundedAverage - prev.roundedAverage) < 1e-9;

      if (sameDisplayedAvg) {
        curr.meritRank = prev.meritRank;
        curr.isTied = true;
        prev.isTied = true;
        if (curr.meritRank !== null) {
          tiedRanksSet.add(curr.meritRank);
        }
      } else {
        curr.meritRank = i + 1;
      }
    }

    if (curr.meritRank === 1) {
      curr.roleAssigned = 'ABANDERADO/A';
    } else if (curr.meritRank === 2) {
      curr.roleAssigned = 'PRIMER/A ESCOLTA';
    } else if (curr.meritRank === 3) {
      curr.roleAssigned = 'SEGUNDO/A ESCOLTA';
    }
  }

  const abanderadosGroup = eligibleCandidates.filter((c) => c.meritRank === 1);
  const primerEscoltaGroup = eligibleCandidates.filter((c) => c.meritRank === 2);
  const segundoEscoltaGroup = eligibleCandidates.filter((c) => c.meritRank === 3);

  const tiedRanks = Array.from(tiedRanksSet).sort((a, b) => a - b);
  const hasTopThreeTie = tiedRanks.some((r) => r <= 3);

  return {
    evaluatedCount: evaluations.length,
    eligibleCandidates,
    reviewCandidates,
    ineligibleCandidates,
    abanderadosGroup,
    primerEscoltaGroup,
    segundoEscoltaGroup,
    hasTopThreeTie,
    tiedRanks,
    duplicateDniWarnings,
  };
}

/**
 * Construye trayectorias históricas de demostración (1° a 6° Año) de forma reversible
 * utilizando únicamente los estudiantes ya registrados en 5° y 6° Año, sin modificar `students`.
 */
export function buildDemoTrajectoriesForExistingSeniorStudents(
  students: Student[],
  existingTrajectories: Record<string, StudentTrajectoryProfile>,
  currentAcademicYear: number
): Record<string, StudentTrajectoryProfile> {
  const nextMap: Record<string, StudentTrajectoryProfile> = { ...existingTrajectories };

  // Perfiles de rendimiento realistas para alumnos de 5° y 6° existentes
  const seniorStudents = students.filter((s) => s.course === '6' || s.course === '5');

  seniorStudents.forEach((student, idx) => {
    const targetCourseNum = Number(student.course);
    const entryYear = currentAcademicYear - (targetCourseNum - 1);
    // Base determinística de promedio por alumno (9.4, 9.1, 8.85, 8.4, 7.9...)
    const baseGrades = [9.5, 9.15, 8.8, 8.35, 7.85];
    const base = baseGrades[idx % baseGrades.length];

    const years: AcademicYearTrajectory[] = [];
    const movements: AcademicMovementRecord[] = [
      {
        id: `mov-demo-in-${student.id}`,
        date: `${entryYear}-03-02`,
        academicYear: entryYear,
        type: 'ingreso',
        toCourse: '1',
        description: `Ingreso a 1° Año — Ciclo Lectivo ${entryYear}.`,
        authority: 'Secretaría Escolar',
      },
    ];

    for (let c = 1; c <= targetCourseNum; c++) {
      const courseKey = String(c) as CourseYear;
      const yearNum = entryYear + (c - 1);
      const subjectNames = SUBJECTS_BY_YEAR[courseKey] || [];

      const subjects: AcademicSubjectRecord[] = subjectNames.map((subj, sIdx) => {
        // Respetar nota real si ya existe en el curso vigente del alumno
        const live = c === targetCourseNum ? student.grades?.[subj] : undefined;
        const offset = ((sIdx + idx) % 3) - 1; // -1, 0, +1
        const computedFinal =
          typeof live?.final === 'number'
            ? live.final
            : Math.min(10, Math.max(6, Math.round(base + offset * 0.6)));
        const t1 = live?.trimestre1 ?? Math.max(6, Math.min(10, computedFinal - (sIdx % 2 === 0 ? 0 : 1)));
        const t2 = live?.trimestre2 ?? computedFinal;
        const t3 = live?.trimestre3 ?? Math.min(10, computedFinal + (sIdx % 3 === 0 ? 1 : 0));

        return {
          subject: subj,
          trimestre1: t1,
          trimestre2: t2,
          trimestre3: t3,
          finalGrade: computedFinal,
          isDefinitive: true,
          weight: 1,
          status: computedFinal >= 6 ? 'aprobada' : 'pendiente',
          excludeFromAverage: false,
        };
      });

      const isSixth = c === 6;
      years.push({
        id: `yr-demo-${student.id}-${yearNum}-${courseKey}`,
        academicYear: yearNum,
        course: courseKey,
        division: student.division || 'Única',
        isRepeatedYear: false,
        isClosed: true,
        condition: isSixth ? 'egresado' : 'promovido',
        subjects,
        pendingSubjects: [],
        observations: `Trayectoria histórica ${courseKey}° Año (ciclo ${yearNum}) cerrada.`,
        updatedAt: new Date().toISOString(),
      });

      if (c > 1) {
        movements.push({
          id: `mov-demo-prom-${student.id}-${c}`,
          date: `${yearNum}-03-01`,
          academicYear: yearNum,
          type: 'promocion',
          fromCourse: String(c - 1) as CourseYear,
          toCourse: courseKey,
          description: `Promoción regular de ${c - 1}° a ${c}° Año.`,
          authority: 'Dirección Escolar',
        });
      }
    }

    nextMap[student.id] = {
      studentId: student.id,
      dni: student.dni || '',
      entryYear,
      entryCourse: '1',
      years,
      movements,
      updatedAt: new Date().toISOString(),
    };
  });

  return nextMap;
}

/**
 * Crea un registro de año lectivo vacío listo para editar con todas las materias oficiales del curso.
 */
export function createBlankAcademicYear(
  studentId: string,
  academicYear: number,
  course: CourseYear,
  division?: string,
  isRepeatedYear = false
): AcademicYearTrajectory {
  const subjects: AcademicSubjectRecord[] = (SUBJECTS_BY_YEAR[course] || []).map((subject) => ({
    subject,
    isDefinitive: false,
    weight: 1,
    status: 'en_curso',
    excludeFromAverage: false,
  }));

  return {
    id: `yr-${studentId}-${academicYear}-${course}-${Math.random().toString(36).slice(2, 6)}`,
    academicYear,
    course,
    division,
    isRepeatedYear,
    isClosed: false,
    condition: isRepeatedYear ? 'repitio' : 'en_curso',
    subjects,
    pendingSubjects: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convierte notas disciplinarias heredadas (`student.disciplinary: string[]`) en registros estructurados
 * de forma no destructiva (conservando intacto `student.disciplinary`).
 */
export function migrateLegacyDisciplinaryToStructured(
  student: Student,
  existingIncidents: DisciplinaryIncident[],
  currentAcademicYear: number
): DisciplinaryIncident[] {
  const legacyList = student.disciplinary || [];
  if (legacyList.length === 0) return [];

  const existingReasons = new Set(
    existingIncidents
      .filter((i) => i.studentId === student.id && i.migratedFromLegacy)
      .map((i) => `${i.reason}::${i.description}`)
  );

  const migrated: DisciplinaryIncident[] = [];
  legacyList.forEach((rawText, idx) => {
    const clean = (rawText || '').trim();
    if (!clean) return;
    const key = `Llamado de atención (registro previo)::${clean}`;
    if (existingReasons.has(key)) return;

    migrated.push({
      id: `disc-mig-${student.id}-${Date.now()}-${idx}`,
      studentId: student.id,
      date: getLocalTodayISO(),
      academicYear: currentAcademicYear,
      course: student.course,
      sanctionType: 'llamado_atencion_escrito',
      reason: 'Llamado de atención (registro previo)',
      description: clean,
      authority: 'Registro histórico del legajo',
      status: 'resuelta',
      migratedFromLegacy: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return migrated;
}
