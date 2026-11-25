import {
  CourseYear,
  Student,
  StudentEnrollmentStatus,
  StudentTrajectoryProfile,
} from '../types';

export const CHRONIC_ABSENCE_THRESHOLD = 30; // >= 30% inasistencias efectivas acumuladas (crónica)

export const ENROLLMENT_STATUS_LABELS: Record<StudentEnrollmentStatus, string> = {
  regular: 'Regular (Activo)',
  en_riesgo: 'En riesgo / Seguimiento',
  pase_saliente: 'Pase a otra institución',
  baja_abandono: 'Baja / Abandono escolar',
  egresado: 'Egresado',
};

export interface DropoutImpactedStudent {
  student: Student;
  hasChronicAbsence: boolean;
  hasEnrollmentChange: boolean;
  absenceRate: number;
  effectiveAbsences: number;
  totalAttendanceDays: number;
  enrollmentChangeReason?: string;
  enrollmentChangeCategory?: 'baja_abandono' | 'pase_saliente';
}

export interface DropoutCourseBreakdown {
  course: CourseYear;
  totalStudents: number;
  impactedCount: number;
  chronicAbsenceCount: number;
  enrollmentChangeCount: number;
  rate: number;
}

export interface DropoutRateSummary {
  academicYear: number;
  chronicThresholdPercent: number;
  totalCohort: number;
  totalImpactedCount: number;
  chronicAbsenceCount: number;
  enrollmentChangeCount: number;
  bothFactorsCount: number;
  chronicOnlyCount: number;
  enrollmentOnlyCount: number;
  bajaAbandonoCount: number;
  paseSalienteCount: number;
  atRiskMonitoringCount: number;
  dropoutRate: number;
  retentionRate: number;
  severityLevel: 'bajo' | 'moderado' | 'critico';
  impactedStudents: DropoutImpactedStudent[];
  byCourse: DropoutCourseBreakdown[];
}

const DROPOUT_MOVEMENT_REGEX =
  /(?:^|[^a-záéíóúüñ])(baja|abandono|abandon[oó]|deserci[oó]n|desvinculaci[oó]n|dej[oó]\s+de\s+asistir)(?=$|[^a-záéíóúüñ])/i;

const ALL_COURSES: CourseYear[] = ['1', '2', '3', '4', '5', '6'];

/**
 * Calcula la Tasa de Deserción Escolar del ciclo lectivo combinando sin doble conteo:
 *  1) Estudiantes con inasistencias acumuladas crónicas (>= umbral efectivo, por defecto 30%, donde tardanza = 0.5).
 *  2) Estudiantes con cambios en el estado de matriculación durante el ciclo lectivo
 *     (baja/abandono, pase saliente o movimiento/condición equivalente en Trayectoria Académica).
 */
export const calculateDropoutRateMetrics = (
  students: Student[],
  academicTrajectories: Record<string, StudentTrajectoryProfile> = {},
  academicYearInput?: number | string,
  chronicThresholdPercent = CHRONIC_ABSENCE_THRESHOLD
): DropoutRateSummary => {
  const academicYear = Number(academicYearInput) || new Date().getFullYear();
  const yearPrefix = `${academicYear}-`;

  const courseTotals = new Map<CourseYear, number>();
  const courseImpacted = new Map<CourseYear, number>();
  const courseChronic = new Map<CourseYear, number>();
  const courseEnrollment = new Map<CourseYear, number>();

  ALL_COURSES.forEach((c) => {
    courseTotals.set(c, 0);
    courseImpacted.set(c, 0);
    courseChronic.set(c, 0);
    courseEnrollment.set(c, 0);
  });

  const impactedStudents: DropoutImpactedStudent[] = [];
  let chronicAbsenceCount = 0;
  let enrollmentChangeCount = 0;
  let bothFactorsCount = 0;
  let chronicOnlyCount = 0;
  let enrollmentOnlyCount = 0;
  let bajaAbandonoCount = 0;
  let paseSalienteCount = 0;
  let atRiskMonitoringCount = 0;

  for (const student of students) {
    courseTotals.set(student.course, (courseTotals.get(student.course) || 0) + 1);

    if (student.enrollmentStatus === 'en_riesgo') {
      atRiskMonitoringCount += 1;
    }

    // 1. Inasistencias acumuladas crónicas (prioriza registros del ciclo actual; si no existen aún, usa historial registrado)
    const allRecords = Array.isArray(student.attendance) ? student.attendance : [];
    const cycleRecords = allRecords.filter((rec) => (rec.date || '').startsWith(yearPrefix));
    const recordsToEvaluate = cycleRecords.length > 0 ? cycleRecords : allRecords;
    const totalAttendanceDays = recordsToEvaluate.length;

    let ausentes = 0;
    let tardes = 0;
    for (const rec of recordsToEvaluate) {
      if (rec.type === 'ausente') ausentes += 1;
      else if (rec.type === 'tarde') tardes += 1;
    }

    const effectiveAbsences = ausentes + tardes * 0.5;
    const absenceRate =
      totalAttendanceDays > 0
        ? Number(((effectiveAbsences / totalAttendanceDays) * 100).toFixed(1))
        : 0;
    const hasChronicAbsence =
      totalAttendanceDays > 0 &&
      student.enrollmentStatus !== 'egresado' &&
      absenceRate >= chronicThresholdPercent;

    // 2. Cambios en el estado de matriculación durante el ciclo lectivo
    let hasEnrollmentChange = false;
    let enrollmentChangeReason: string | undefined;
    let enrollmentChangeCategory: 'baja_abandono' | 'pase_saliente' | undefined;

    if (student.enrollmentStatus === 'baja_abandono') {
      hasEnrollmentChange = true;
      enrollmentChangeCategory = 'baja_abandono';
      enrollmentChangeReason = student.enrollmentStatusDate
        ? `Baja / Abandono registrado (${student.enrollmentStatusDate})`
        : 'Estado de matriculación: Baja / Abandono';
    } else if (student.enrollmentStatus === 'pase_saliente') {
      hasEnrollmentChange = true;
      enrollmentChangeCategory = 'pase_saliente';
      enrollmentChangeReason = student.enrollmentStatusDate
        ? `Pase a otra institución (${student.enrollmentStatusDate})`
        : 'Estado de matriculación: Pase saliente';
    }

    // Revisar también Trayectoria Académica (movimientos de salida o condición 'pase' en el ciclo lectivo)
    if (!hasEnrollmentChange && student.enrollmentStatus !== 'egresado') {
      const profile = academicTrajectories[student.id];
      if (profile) {
        const cycleMovements = (profile.movements || []).filter(
          (m) => Number(m.academicYear) === academicYear || (m.date || '').startsWith(yearPrefix)
        );
        const dropoutMovement = cycleMovements.find(
          (m) =>
            m.type === 'otra_situacion' &&
            DROPOUT_MOVEMENT_REGEX.test(`${m.description || ''} ${m.resolutionRef || ''}`)
        );
        const transferOutMovement = cycleMovements.find((m) => m.type === 'pase_salida');

        if (dropoutMovement) {
          hasEnrollmentChange = true;
          enrollmentChangeCategory = 'baja_abandono';
          enrollmentChangeReason = `Desvinculación en trayectoria (${dropoutMovement.date})`;
        } else if (transferOutMovement) {
          hasEnrollmentChange = true;
          enrollmentChangeCategory = 'pase_saliente';
          enrollmentChangeReason = `Pase emitido en ciclo ${academicYear} (${transferOutMovement.date})`;
        } else {
          const cycleYearRecord = (profile.years || []).find(
            (y) => Number(y.academicYear) === academicYear && y.condition === 'pase'
          );
          if (cycleYearRecord) {
            hasEnrollmentChange = true;
            enrollmentChangeCategory = 'pase_saliente';
            enrollmentChangeReason = `Condición de ciclo ${academicYear}: Con pase`;
          }
        }
      }
    }

    if (hasChronicAbsence) {
      chronicAbsenceCount += 1;
      courseChronic.set(student.course, (courseChronic.get(student.course) || 0) + 1);
    }

    if (hasEnrollmentChange) {
      enrollmentChangeCount += 1;
      courseEnrollment.set(student.course, (courseEnrollment.get(student.course) || 0) + 1);
      if (enrollmentChangeCategory === 'baja_abandono') bajaAbandonoCount += 1;
      else if (enrollmentChangeCategory === 'pase_saliente') paseSalienteCount += 1;
    }

    if (hasChronicAbsence || hasEnrollmentChange) {
      if (hasChronicAbsence && hasEnrollmentChange) bothFactorsCount += 1;
      else if (hasChronicAbsence) chronicOnlyCount += 1;
      else enrollmentOnlyCount += 1;

      courseImpacted.set(student.course, (courseImpacted.get(student.course) || 0) + 1);
      impactedStudents.push({
        student,
        hasChronicAbsence,
        hasEnrollmentChange,
        absenceRate,
        effectiveAbsences,
        totalAttendanceDays,
        enrollmentChangeReason,
        enrollmentChangeCategory,
      });
    }
  }

  // Ordenar: primero ambos factores, luego baja/pase, luego mayor porcentaje de inasistencias
  impactedStudents.sort((a, b) => {
    const scoreA = (a.hasEnrollmentChange ? 2 : 0) + (a.hasChronicAbsence ? 1 : 0);
    const scoreB = (b.hasEnrollmentChange ? 2 : 0) + (b.hasChronicAbsence ? 1 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (b.absenceRate !== a.absenceRate) return b.absenceRate - a.absenceRate;
    return a.student.fullName.localeCompare(b.student.fullName, 'es');
  });

  const totalCohort = students.length;
  const totalImpactedCount = impactedStudents.length;
  const dropoutRate =
    totalCohort > 0 ? Number(((totalImpactedCount / totalCohort) * 100).toFixed(1)) : 0;
  const retentionRate =
    totalCohort > 0 ? Number(Math.max(0, 100 - dropoutRate).toFixed(1)) : 100;

  const severityLevel: DropoutRateSummary['severityLevel'] =
    dropoutRate >= 15 ? 'critico' : dropoutRate >= 5 ? 'moderado' : 'bajo';

  const byCourse: DropoutCourseBreakdown[] = ALL_COURSES.map((course) => {
    const total = courseTotals.get(course) || 0;
    const impacted = courseImpacted.get(course) || 0;
    return {
      course,
      totalStudents: total,
      impactedCount: impacted,
      chronicAbsenceCount: courseChronic.get(course) || 0,
      enrollmentChangeCount: courseEnrollment.get(course) || 0,
      rate: total > 0 ? Number(((impacted / total) * 100).toFixed(1)) : 0,
    };
  });

  return {
    academicYear,
    chronicThresholdPercent,
    totalCohort,
    totalImpactedCount,
    chronicAbsenceCount,
    enrollmentChangeCount,
    bothFactorsCount,
    chronicOnlyCount,
    enrollmentOnlyCount,
    bajaAbandonoCount,
    paseSalienteCount,
    atRiskMonitoringCount,
    dropoutRate,
    retentionRate,
    severityLevel,
    impactedStudents,
    byCourse,
  };
};
