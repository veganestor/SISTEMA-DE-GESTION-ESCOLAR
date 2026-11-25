import {
  CalendarEvent,
  CourseYear,
  DEFAULT_SCHOOL_INFO,
  IssuedCardRecord,
  SchoolInfo,
  Student,
  StudentEnrollmentStatus,
  StudentTrajectoryProfile,
  Teacher,
} from '../types';
import {
  calculateDropoutRateMetrics,
  ENROLLMENT_STATUS_LABELS,
} from './dropoutRateService';
import { getLocalTodayISO, slugifyFileName } from './storageService';

export interface AnnualMetricsCsvInput {
  students: Student[];
  teachers: Teacher[];
  exTeachers?: Teacher[];
  issuedCards?: IssuedCardRecord[];
  calendarEvents?: CalendarEvent[];
  academicTrajectories?: Record<string, StudentTrajectoryProfile>;
  schoolInfo?: SchoolInfo;
  exportDate?: Date;
}

export interface AnnualMetricsCsvResult {
  fileName: string;
  csvContent: string;
  rowCount: number;
  academicYear: number;
}

const ALL_COURSES: CourseYear[] = ['1', '2', '3', '4', '5', '6'];

const SEVERITY_LABELS: Record<'bajo' | 'moderado' | 'critico', string> = {
  bajo: 'Nivel Controlado',
  moderado: 'Atención Preventiva',
  critico: 'Alerta Crítica',
};

/**
 * Escapa un campo siguiendo RFC 4180 y protege textos contra inyección de fórmulas en hojas de cálculo.
 */
export const escapeCsvField = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  let str = String(value);

  // Neutralizar prefijos peligrosos en texto libre (sin alterar números negativos legítimos)
  if (
    typeof value === 'string' &&
    (/^[=+@\t\r]/.test(str) || (/^-/.test(str) && Number.isNaN(Number(str))))
  ) {
    str = `'${str}`;
  }

  if (/[",\r\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatCsvRow = (fields: Array<string | number | null | undefined>): string =>
  fields.map(escapeCsvField).join(',');

const computeAttendanceStats = (targetStudents: Student[]) => {
  let totalRecords = 0;
  let presentCount = 0;
  let tardeCount = 0;
  let ausenteCount = 0;

  for (const st of targetStudents) {
    if (!Array.isArray(st.attendance)) continue;
    for (const rec of st.attendance) {
      totalRecords += 1;
      if (rec.type === 'presente') presentCount += 1;
      else if (rec.type === 'tarde') tardeCount += 1;
      else if (rec.type === 'ausente') ausenteCount += 1;
    }
  }

  const effectivePresent = presentCount + tardeCount * 0.5;
  const attendanceRate =
    totalRecords > 0 ? Number(((effectivePresent / totalRecords) * 100).toFixed(1)) : 0;

  return {
    totalRecords,
    presentCount,
    tardeCount,
    ausenteCount,
    attendanceRate,
  };
};

/**
 * Construye el archivo CSV consolidado de métricas anuales del Panel de Control
 * (población estudiantil, planta docente, asistencia, tasa de deserción y desglose por curso).
 * Incluye BOM UTF-8 para apertura correcta de acentos y "ñ" en Microsoft Excel y Google Sheets.
 */
export const buildAnnualMetricsCsv = ({
  students,
  teachers,
  exTeachers = [],
  issuedCards = [],
  calendarEvents = [],
  academicTrajectories = {},
  schoolInfo = DEFAULT_SCHOOL_INFO,
  exportDate = new Date(),
}: AnnualMetricsCsvInput): AnnualMetricsCsvResult => {
  const resolvedSchool: SchoolInfo = { ...DEFAULT_SCHOOL_INFO, ...schoolInfo };
  const academicYear = Number(resolvedSchool.academicYear) || exportDate.getFullYear();
  const exportDateISO = getLocalTodayISO(exportDate);
  const yearPrefix = `${academicYear}-`;

  const dropout = calculateDropoutRateMetrics(
    students,
    academicTrajectories,
    academicYear
  );
  const overallAttendance = computeAttendanceStats(students);

  const totalStudents = students.length;
  const cicloBasicoCount = students.filter((s) => Number(s.course) <= 3).length;
  const cicloOrientadoCount = students.filter((s) => Number(s.course) >= 4).length;

  const activeTeachersCount = teachers.length;
  const exTeachersCount = exTeachers.length;
  const studentTeacherRatio =
    activeTeachersCount > 0 ? (totalStudents / activeTeachersCount).toFixed(1) : 'N/A';

  const activeCardsCount = issuedCards.filter((c) => c.status === 'vigente').length;
  const cycleEventsCount = calendarEvents.filter((ev) =>
    (ev.date || '').startsWith(yearPrefix)
  ).length;
  const stableStudentsCount = Math.max(0, dropout.totalCohort - dropout.totalImpactedCount);

  const enrollmentStatusCounts: Record<StudentEnrollmentStatus, number> = {
    regular: 0,
    en_riesgo: 0,
    pase_saliente: 0,
    baja_abandono: 0,
    egresado: 0,
  };
  for (const st of students) {
    const key: StudentEnrollmentStatus = st.enrollmentStatus || 'regular';
    enrollmentStatusCounts[key] = (enrollmentStatusCounts[key] || 0) + 1;
  }

  const pctOfStudents = (count: number): string =>
    totalStudents > 0 ? `${((count / totalStudents) * 100).toFixed(1)}%` : '0.0%';

  const headers = [
    'Ciclo_Lectivo',
    'Fecha_Exportacion',
    'Seccion',
    'Indicador',
    'Valor',
    'Unidad',
    'Porcentaje',
    'Detalle',
  ];

  const rows: Array<Array<string | number>> = [];
  const pushRow = (
    section: string,
    indicator: string,
    value: string | number,
    unit: string,
    percentage: string,
    detail: string
  ) => {
    rows.push([
      academicYear,
      exportDateISO,
      section,
      indicator,
      value,
      unit,
      percentage,
      detail,
    ]);
  };

  // 1. Identificación Institucional
  pushRow(
    'Institucion',
    'Establecimiento Educativo',
    resolvedSchool.name || 'Sin especificar',
    'texto',
    '',
    `Tipo: ${resolvedSchool.institutionType || 'Establecimiento Educativo'}`
  );
  pushRow(
    'Institucion',
    'CUE / Identificador Oficial',
    resolvedSchool.cue || 'Sin registrar',
    'codigo',
    '',
    `Domicilio: ${resolvedSchool.address || 'Sin registrar'} | Tel: ${resolvedSchool.phone || 'Sin registrar'}`
  );

  // 2. Población Estudiantil
  pushRow(
    'Poblacion Estudiantil',
    'Alumnos Matriculados (Total)',
    totalStudents,
    'alumnos',
    totalStudents > 0 ? '100.0%' : '0.0%',
    `Ciclo Básico (1° a 3°): ${cicloBasicoCount} | Ciclo Orientado (4° a 6°): ${cicloOrientadoCount}`
  );
  pushRow(
    'Poblacion Estudiantil',
    'Matrícula Ciclo Básico (1° a 3° Año)',
    cicloBasicoCount,
    'alumnos',
    pctOfStudents(cicloBasicoCount),
    'Cursos 1°, 2° y 3° Año'
  );
  pushRow(
    'Poblacion Estudiantil',
    'Matrícula Ciclo Orientado (4° a 6° Año)',
    cicloOrientadoCount,
    'alumnos',
    pctOfStudents(cicloOrientadoCount),
    'Cursos 4°, 5° y 6° Año'
  );

  // 3. Población Docente y Gestión Administrativa
  pushRow(
    'Poblacion Docente',
    'Planta Funcional (Docentes en Ejercicio)',
    activeTeachersCount,
    'docentes',
    '',
    `Relación alumnos por docente: ${studentTeacherRatio}`
  );
  pushRow(
    'Poblacion Docente',
    'Historial Ex-Docentes / Desvinculaciones',
    exTeachersCount,
    'ex-docentes',
    '',
    'Personal docente trasladado o desvinculado'
  );
  pushRow(
    'Gestion Institucional',
    'Carnets Escolares y Docentes Vigentes',
    activeCardsCount,
    'carnets',
    '',
    `Total histórico emitido: ${issuedCards.length}`
  );
  pushRow(
    'Gestion Institucional',
    'Eventos Institucionales del Ciclo',
    cycleEventsCount,
    'eventos',
    '',
    `Total eventos en calendario: ${calendarEvents.length}`
  );

  // 4. Tasa de Deserción Escolar y Retención
  pushRow(
    'Tasa de Desercion',
    'Tasa de Deserción Escolar Anual',
    dropout.dropoutRate.toFixed(1),
    '%',
    `${dropout.dropoutRate.toFixed(1)}%`,
    `Nivel: ${SEVERITY_LABELS[dropout.severityLevel]} | ${dropout.totalImpactedCount} de ${dropout.totalCohort} alumnos (sin doble conteo)`
  );
  pushRow(
    'Tasa de Desercion',
    'Tasa de Retención Escolar',
    dropout.retentionRate.toFixed(1),
    '%',
    `${dropout.retentionRate.toFixed(1)}%`,
    `${stableStudentsCount} alumnos con permanencia estable`
  );
  pushRow(
    'Tasa de Desercion',
    'Alumnos Afectados (Únicos)',
    dropout.totalImpactedCount,
    'alumnos',
    `${dropout.dropoutRate.toFixed(1)}%`,
    `Con ambos factores: ${dropout.bothFactorsCount} | En seguimiento preventivo: ${dropout.atRiskMonitoringCount}`
  );
  pushRow(
    'Tasa de Desercion',
    `Inasistencia Acumulada Crónica (>= ${dropout.chronicThresholdPercent}%)`,
    dropout.chronicAbsenceCount,
    'alumnos',
    pctOfStudents(dropout.chronicAbsenceCount),
    `Solo inasistencia crónica: ${dropout.chronicOnlyCount} | Tardanza computada como 0.5 falta`
  );
  pushRow(
    'Tasa de Desercion',
    'Cambios en Estado de Matriculación',
    dropout.enrollmentChangeCount,
    'alumnos',
    pctOfStudents(dropout.enrollmentChangeCount),
    `Bajas/Abandonos: ${dropout.bajaAbandonoCount} | Pases salientes: ${dropout.paseSalienteCount}`
  );
  pushRow(
    'Tasa de Desercion',
    'Bajas / Abandonos Escolares',
    dropout.bajaAbandonoCount,
    'alumnos',
    pctOfStudents(dropout.bajaAbandonoCount),
    `Registrados en legajo o trayectoria del ciclo ${academicYear}`
  );
  pushRow(
    'Tasa de Desercion',
    'Pases Salientes a Otra Institución',
    dropout.paseSalienteCount,
    'alumnos',
    pctOfStudents(dropout.paseSalienteCount),
    `Registrados en legajo o trayectoria del ciclo ${academicYear}`
  );

  // 5. Asistencia Institucional
  pushRow(
    'Asistencia Anual',
    'Asistencia Promedio Institucional',
    overallAttendance.attendanceRate.toFixed(1),
    '%',
    `${overallAttendance.attendanceRate.toFixed(1)}%`,
    overallAttendance.totalRecords > 0
      ? `Registros: ${overallAttendance.totalRecords} (Presentes: ${overallAttendance.presentCount}, Tardes: ${overallAttendance.tardeCount}, Ausentes: ${overallAttendance.ausenteCount})`
      : 'Sin registros de asistencia cargados'
  );

  // 6. Estado de Matriculación (Distribución completa)
  (Object.keys(ENROLLMENT_STATUS_LABELS) as StudentEnrollmentStatus[]).forEach((statusKey) => {
    const count = enrollmentStatusCounts[statusKey];
    pushRow(
      'Estado de Matriculacion',
      ENROLLMENT_STATUS_LABELS[statusKey],
      count,
      'alumnos',
      pctOfStudents(count),
      'Distribución según estado de matriculación en legajo'
    );
  });

  // 7. Desglose Anual por Curso (1° a 6° Año)
  ALL_COURSES.forEach((course) => {
    const courseStudents = students.filter((s) => s.course === course);
    const courseAttendance = computeAttendanceStats(courseStudents);
    const courseDropout = dropout.byCourse.find((c) => c.course === course);
    const cycleLabel = Number(course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado';

    pushRow(
      'Desglose por Curso',
      `${course}° Año (${cycleLabel})`,
      courseStudents.length,
      'alumnos',
      pctOfStudents(courseStudents.length),
      `Asistencia prom.: ${
        courseAttendance.totalRecords > 0 ? `${courseAttendance.attendanceRate.toFixed(1)}%` : 'Sin registros'
      } | Deserción: ${(courseDropout?.rate ?? 0).toFixed(1)}% (${courseDropout?.impactedCount ?? 0} afectados: ${
        courseDropout?.chronicAbsenceCount ?? 0
      } crónicos, ${courseDropout?.enrollmentChangeCount ?? 0} cambio matrícula)`
    );
  });

  // 8. Nómina de Alumnos Incluidos en el Cálculo de Deserción (para trazabilidad administrativa)
  dropout.impactedStudents.forEach((item) => {
    const reasons: string[] = [];
    if (item.hasChronicAbsence) {
      reasons.push(
        `Inasistencia crónica ${item.absenceRate.toFixed(1)}% (${item.effectiveAbsences}/${item.totalAttendanceDays} jornadas)`
      );
    }
    if (item.hasEnrollmentChange && item.enrollmentChangeReason) {
      reasons.push(item.enrollmentChangeReason);
    }
    pushRow(
      'Detalle Alumnos Desercion',
      `${item.student.fullName} (${item.student.course}° Año)`,
      item.student.dni || 'Sin DNI',
      'DNI',
      `${item.absenceRate.toFixed(1)}%`,
      reasons.join(' | ')
    );
  });

  const csvLines = [formatCsvRow(headers), ...rows.map(formatCsvRow)];
  // BOM UTF-8 para compatibilidad directa con Excel en español
  const csvContent = `\uFEFF${csvLines.join('\r\n')}\r\n`;

  const schoolSlug = slugifyFileName(resolvedSchool.name || 'institucion', 'institucion');
  const fileName = `Metricas_Anuales_${schoolSlug}_Ciclo_${academicYear}_${exportDateISO}.csv`;

  return {
    fileName,
    csvContent,
    rowCount: rows.length,
    academicYear,
  };
};

/**
 * Genera y descarga el archivo CSV consolidado de métricas anuales en el navegador.
 */
export const exportAnnualMetricsCSV = (
  input: AnnualMetricsCsvInput
): AnnualMetricsCsvResult => {
  const result = buildAnnualMetricsCsv(input);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([result.csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return result;
};
