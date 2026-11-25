import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CourseYear,
  DEFAULT_SCHOOL_INFO,
  SchoolInfo,
  Student,
} from '../types';
import { formatShortDateES } from './calendarUtils';

const COURSE_ORDER: CourseYear[] = ['1', '2', '3', '4', '5', '6'];

const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface MonthlyAbsenceDetail {
  date: string;
  formattedDate: string;
  justified: boolean;
  reason: string;
  source: 'manual' | 'qr';
  recordedAt?: string;
}

export interface StudentMonthlyAttendanceSummary {
  studentId: string;
  fullName: string;
  dni: string;
  course: CourseYear;
  division: string;
  presentes: number;
  tardes: number;
  ausentes: number;
  justificadas: number;
  injustificadas: number;
  totalRecords: number;
  effectivePresent: number;
  attendancePercentage: number | null;
  absences: MonthlyAbsenceDetail[];
}

export interface CourseMonthlyAttendanceGroup {
  course: CourseYear;
  courseLabel: string;
  cycleLabel: 'Ciclo Básico' | 'Ciclo Orientado';
  studentCount: number;
  studentsWithRecordsCount: number;
  totalRecords: number;
  totalPresentes: number;
  totalTardes: number;
  totalAusentes: number;
  totalJustificadas: number;
  totalInjustificadas: number;
  courseAttendancePercentage: number | null;
  rows: StudentMonthlyAttendanceSummary[];
}

export interface MonthlyAttendanceReportData {
  month: string; // YYYY-MM
  monthLabel: string;
  courseFilter: CourseYear | 'all';
  totalStudents: number;
  studentsWithRecordsCount: number;
  totalRecords: number;
  totalPresentes: number;
  totalTardes: number;
  totalAusentes: number;
  totalJustificadas: number;
  totalInjustificadas: number;
  overallAttendancePercentage: number | null;
  courses: CourseMonthlyAttendanceGroup[];
}

export const formatMonthYearLabelES = (monthYYYYMM: string): string => {
  const parts = (monthYYYYMM || '').split('-');
  if (parts.length !== 2) return monthYYYYMM;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return monthYYYYMM;
  }
  return `${MONTH_NAMES_ES[monthIdx]} ${year}`;
};

export const getCurrentYearMonthISO = (referenceDate: Date = new Date()): string => {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Construye el reporte consolidado de asistencia mensual por curso y alumno,
 * calculando porcentajes de asistencia efectiva (tardanza = 0.5) y detallando cada falta registrada.
 */
export const buildMonthlyAttendanceReport = (
  students: Student[],
  monthYYYYMM: string,
  courseFilter: CourseYear | 'all' = 'all'
): MonthlyAttendanceReportData => {
  const normalizedMonth = /^\d{4}-\d{2}$/.test(monthYYYYMM)
    ? monthYYYYMM
    : getCurrentYearMonthISO();
  const monthPrefix = `${normalizedMonth}-`;

  const targetCourses: CourseYear[] =
    courseFilter === 'all' ? COURSE_ORDER : [courseFilter];

  const courses: CourseMonthlyAttendanceGroup[] = [];

  let totalStudents = 0;
  let studentsWithRecordsCount = 0;
  let totalRecords = 0;
  let totalPresentes = 0;
  let totalTardes = 0;
  let totalAusentes = 0;
  let totalJustificadas = 0;
  let totalInjustificadas = 0;

  for (const course of targetCourses) {
    const courseStudents = students
      .filter((s) => s.course === course)
      .sort((a, b) => {
        const divA = (a.division || '').trim();
        const divB = (b.division || '').trim();
        const divCmp = divA.localeCompare(divB, 'es');
        if (divCmp !== 0) return divCmp;
        return a.fullName.localeCompare(b.fullName, 'es');
      });

    if (courseFilter === 'all' && courseStudents.length === 0) {
      continue;
    }

    let courseRecords = 0;
    let coursePresentes = 0;
    let courseTardes = 0;
    let courseAusentes = 0;
    let courseJustificadas = 0;
    let courseInjustificadas = 0;
    let courseStudentsWithRecords = 0;

    const rows: StudentMonthlyAttendanceSummary[] = courseStudents.map((student) => {
      const monthRecords = (Array.isArray(student.attendance) ? student.attendance : [])
        .filter((rec) => typeof rec.date === 'string' && rec.date.startsWith(monthPrefix))
        .sort((a, b) => a.date.localeCompare(b.date));

      let presentes = 0;
      let tardes = 0;
      let ausentes = 0;
      let justificadas = 0;
      const absences: MonthlyAbsenceDetail[] = [];

      for (const rec of monthRecords) {
        if (rec.type === 'presente') {
          presentes += 1;
        } else if (rec.type === 'tarde') {
          tardes += 1;
        } else if (rec.type === 'ausente') {
          ausentes += 1;
          const isJustified = Boolean(rec.justified);
          if (isJustified) {
            justificadas += 1;
          }
          absences.push({
            date: rec.date,
            formattedDate: formatShortDateES(rec.date),
            justified: isJustified,
            reason: (rec.reason || '').trim(),
            source: rec.source === 'qr' ? 'qr' : 'manual',
            recordedAt: rec.recordedAt,
          });
        }
      }

      const injustificadas = ausentes - justificadas;
      const studentTotal = presentes + tardes + ausentes;
      const effectivePresent = presentes + tardes * 0.5;
      const attendancePercentage =
        studentTotal > 0
          ? Number(((effectivePresent / studentTotal) * 100).toFixed(1))
          : null;

      if (studentTotal > 0) {
        courseStudentsWithRecords += 1;
      }

      courseRecords += studentTotal;
      coursePresentes += presentes;
      courseTardes += tardes;
      courseAusentes += ausentes;
      courseJustificadas += justificadas;
      courseInjustificadas += injustificadas;

      return {
        studentId: student.id,
        fullName: student.fullName,
        dni: student.dni || 'Sin DNI',
        course: student.course,
        division: student.division?.trim() || '-',
        presentes,
        tardes,
        ausentes,
        justificadas,
        injustificadas,
        totalRecords: studentTotal,
        effectivePresent,
        attendancePercentage,
        absences,
      };
    });

    const courseEffective = coursePresentes + courseTardes * 0.5;
    const courseAttendancePercentage =
      courseRecords > 0
        ? Number(((courseEffective / courseRecords) * 100).toFixed(1))
        : null;

    const cycleLabel: 'Ciclo Básico' | 'Ciclo Orientado' =
      Number(course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado';

    courses.push({
      course,
      courseLabel: `${course}° Año`,
      cycleLabel,
      studentCount: courseStudents.length,
      studentsWithRecordsCount: courseStudentsWithRecords,
      totalRecords: courseRecords,
      totalPresentes: coursePresentes,
      totalTardes: courseTardes,
      totalAusentes: courseAusentes,
      totalJustificadas: courseJustificadas,
      totalInjustificadas: courseInjustificadas,
      courseAttendancePercentage,
      rows,
    });

    totalStudents += courseStudents.length;
    studentsWithRecordsCount += courseStudentsWithRecords;
    totalRecords += courseRecords;
    totalPresentes += coursePresentes;
    totalTardes += courseTardes;
    totalAusentes += courseAusentes;
    totalJustificadas += courseJustificadas;
    totalInjustificadas += courseInjustificadas;
  }

  const overallEffective = totalPresentes + totalTardes * 0.5;
  const overallAttendancePercentage =
    totalRecords > 0
      ? Number(((overallEffective / totalRecords) * 100).toFixed(1))
      : null;

  return {
    month: normalizedMonth,
    monthLabel: formatMonthYearLabelES(normalizedMonth),
    courseFilter,
    totalStudents,
    studentsWithRecordsCount,
    totalRecords,
    totalPresentes,
    totalTardes,
    totalAusentes,
    totalJustificadas,
    totalInjustificadas,
    overallAttendancePercentage,
    courses,
  };
};

const drawHeaderLogoSafe = (
  doc: jsPDF,
  logo?: string,
  x = 14,
  y = 4.5,
  size = 17
) => {
  if (!logo || !logo.startsWith('data:image/')) return;
  try {
    const format = logo.includes('image/png') ? 'PNG' : 'JPEG';
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x - 1, y - 1, size + 2, size + 2, 2, 2, 'F');
    doc.addImage(logo, format, x, y, size, size, undefined, 'FAST');
  } catch {
    // Fallback silencioso si la imagen no puede incrustarse en jsPDF
  }
};

const formatAbsenceSummaryForRow = (row: StudentMonthlyAttendanceSummary): string => {
  if (row.totalRecords === 0) {
    return 'Sin registros cargados en el mes';
  }
  if (row.absences.length === 0) {
    return 'Sin faltas registradas';
  }
  return row.absences
    .map((abs) => {
      const cond = abs.justified ? 'Justificada' : 'Injustificada';
      return abs.reason
        ? `${abs.formattedDate} (${cond}: ${abs.reason})`
        : `${abs.formattedDate} (${cond})`;
    })
    .join('\n');
};

/**
 * Exporta un PDF oficial A4 apaisado con el reporte mensual consolidado de asistencia:
 * - Resumen por curso y general
 * - Tabla por curso con el porcentaje de asistencia de cada alumno y detalle de faltas
 * - Anexo cronológico completo de todas las faltas registradas en el período
 */
export const exportMonthlyAttendanceConsolidatedPDF = (
  report: MonthlyAttendanceReportData,
  schoolInfoInput: SchoolInfo = DEFAULT_SCHOOL_INFO
): void => {
  const schoolInfo: SchoolInfo = { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };
  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolAddress = schoolInfo.address || DEFAULT_SCHOOL_INFO.address;
  const schoolPhone = schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : '';
  const academicYear = schoolInfo.academicYear || new Date().getFullYear();

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2;
  const todayFormatted = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // ===================== ENCABEZADO INSTITUCIONAL =====================
  doc.setFillColor(3, 105, 161);
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setFillColor(20, 184, 166);
  doc.rect(0, 26, pageWidth, 2.2, 'F');

  drawHeaderLogoSafe(doc, schoolInfo.logo, marginX, 4.5, 17);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(224, 242, 254);
  const instExtra = [
    schoolInfo.institutionType,
    schoolInfo.institutionNumber ? `N° ${schoolInfo.institutionNumber}` : '',
    schoolInfo.cue ? `CUE: ${schoolInfo.cue}` : '',
  ]
    .filter(Boolean)
    .join(' • ');
  doc.text(
    `${schoolAddress}${schoolPhone}${instExtra ? ` • ${instExtra}` : ''}`,
    pageWidth / 2,
    15.8,
    { align: 'center' }
  );
  doc.text(
    `CICLO LECTIVO ${academicYear} • REPORTE MENSUAL CONSOLIDADO DE ASISTENCIA`,
    pageWidth / 2,
    21.2,
    { align: 'center' }
  );

  // ===================== TÍTULO Y MÉTRICAS DEL PERÍODO =====================
  let currentY = 34;
  const scopeLabel =
    report.courseFilter === 'all'
      ? 'Todos los Cursos (1° a 6° Año)'
      : `${report.courseFilter}° Año`;

  doc.setTextColor(12, 45, 72);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(
    `ASISTENCIA MENSUAL CONSOLIDADA — ${report.monthLabel.toUpperCase()}`,
    marginX,
    currentY
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Alcance: ${scopeLabel}   •   Emitido: ${todayFormatted}   •   Criterio: Presente = 1 | Tardanza = 0.5 | Ausente = 0`,
    pageWidth - marginX,
    currentY,
    { align: 'right' }
  );

  currentY += 5;
  const kpiGap = 4;
  const kpiWidth = (usableWidth - kpiGap * 4) / 5;
  const kpiCards = [
    {
      label: 'ALUMNOS EVALUADOS',
      value: `${report.totalStudents}`,
      sub: `${report.studentsWithRecordsCount} con registros`,
      bg: [241, 245, 249] as const,
      text: [15, 23, 42] as const,
    },
    {
      label: 'ASISTENCIA CONSOLIDADA',
      value:
        report.overallAttendancePercentage !== null
          ? `${report.overallAttendancePercentage.toFixed(1)}%`
          : 'S/D',
      sub: `${report.totalRecords} registros en el mes`,
      bg: [224, 242, 254] as const,
      text: [3, 105, 161] as const,
    },
    {
      label: 'PRESENTES / TARDANZAS',
      value: `${report.totalPresentes} / ${report.totalTardes}`,
      sub: 'Puntuales / Llegadas tarde',
      bg: [236, 253, 245] as const,
      text: [4, 120, 87] as const,
    },
    {
      label: 'FALTAS REGISTRADAS',
      value: `${report.totalAusentes}`,
      sub: 'Total inasistencias del mes',
      bg: [254, 242, 242] as const,
      text: [185, 28, 28] as const,
    },
    {
      label: 'JUSTIF. / INJUSTIF.',
      value: `${report.totalJustificadas} / ${report.totalInjustificadas}`,
      sub: 'Desglose de inasistencias',
      bg: [255, 251, 235] as const,
      text: [180, 83, 9] as const,
    },
  ];

  kpiCards.forEach((kpi, index) => {
    const x = marginX + index * (kpiWidth + kpiGap);
    doc.setFillColor(kpi.bg[0], kpi.bg[1], kpi.bg[2]);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, currentY, kpiWidth, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(kpi.label, x + 3, currentY + 4.8);

    doc.setFontSize(11);
    doc.setTextColor(kpi.text[0], kpi.text[1], kpi.text[2]);
    doc.text(kpi.value, x + 3, currentY + 10.6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 3, currentY + 14.3);
  });

  currentY += 22;

  // ===================== 1. RESUMEN CONSOLIDADO POR CURSO =====================
  if (report.courses.length > 1) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(12, 45, 72);
    doc.text('1. RESUMEN CONSOLIDADO POR CURSO', marginX, currentY);

    autoTable(doc, {
      startY: currentY + 2.5,
      head: [
        [
          'Curso',
          'Ciclo',
          'Alumnos',
          'Registros',
          'Presentes',
          'Tardanzas',
          'Faltas Tot.',
          'Justificadas',
          'Injustificadas',
          '% Asistencia',
        ],
      ],
      body: report.courses.map((c) => [
        c.courseLabel,
        c.cycleLabel,
        String(c.studentCount),
        String(c.totalRecords),
        String(c.totalPresentes),
        String(c.totalTardes),
        String(c.totalAusentes),
        String(c.totalJustificadas),
        String(c.totalInjustificadas),
        c.courseAttendancePercentage !== null
          ? `${c.courseAttendancePercentage.toFixed(1)}%`
          : 'Sin datos',
      ]),
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [12, 45, 72],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 26 },
        1: { halign: 'left', cellWidth: 36 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 22 },
        4: { halign: 'center', cellWidth: 22 },
        5: { halign: 'center', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
        7: { halign: 'center', cellWidth: 26 },
        8: { halign: 'center', cellWidth: 26 },
        9: { halign: 'center', cellWidth: 27, fontStyle: 'bold' },
      },
      margin: { left: marginX, right: marginX },
    });

    // @ts-ignore jsPDF autotable attaches lastAutoTable
    currentY = (doc.lastAutoTable?.finalY ?? currentY + 35) + 8;
  }

  // ===================== 2. PORCENTAJE DE ASISTENCIA POR ALUMNO Y CURSO =====================
  const sectionTitle =
    report.courses.length > 1
      ? '2. ASISTENCIA INDIVIDUAL POR CURSO Y DETALLE DE FALTAS'
      : '1. ASISTENCIA INDIVIDUAL DEL CURSO Y DETALLE DE FALTAS';

  if (currentY > pageHeight - 36) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(12, 45, 72);
  doc.text(sectionTitle, marginX, currentY);
  currentY += 4;

  const allAbsenceAnnexRows: string[][] = [];

  report.courses.forEach((courseGroup) => {
    if (currentY > pageHeight - 34) {
      doc.addPage();
      currentY = 16;
    }

    // Banda identificatoria del curso
    doc.setFillColor(224, 242, 254);
    doc.setDrawColor(125, 211, 252);
    doc.roundedRect(marginX, currentY, usableWidth, 8, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(12, 45, 72);
    doc.text(
      `${courseGroup.courseLabel.toUpperCase()} — ${courseGroup.cycleLabel.toUpperCase()}`,
      marginX + 3,
      currentY + 5.3
    );

    const coursePctText =
      courseGroup.courseAttendancePercentage !== null
        ? `${courseGroup.courseAttendancePercentage.toFixed(1)}%`
        : 'Sin registros';
    doc.setFontSize(8.2);
    doc.setTextColor(3, 105, 161);
    doc.text(
      `Alumnos: ${courseGroup.studentCount}   •   Faltas del curso: ${courseGroup.totalAusentes} (${courseGroup.totalJustificadas} just. / ${courseGroup.totalInjustificadas} inj.)   •   Asistencia curso: ${coursePctText}`,
      pageWidth - marginX - 3,
      currentY + 5.3,
      { align: 'right' }
    );

    currentY += 10;

    const studentRows =
      courseGroup.rows.length > 0
        ? courseGroup.rows.map((row, idx) => {
            row.absences.forEach((abs) => {
              allAbsenceAnnexRows.push([
                courseGroup.courseLabel,
                row.fullName,
                row.dni,
                abs.formattedDate,
                abs.justified ? 'Justificada' : 'Injustificada',
                abs.reason || 'Sin motivo informado',
                abs.source === 'qr'
                  ? `QR${abs.recordedAt ? ` (${abs.recordedAt} hs)` : ''}`
                  : 'Manual',
              ]);
            });

            return [
              String(idx + 1),
              row.fullName,
              row.dni,
              row.division,
              String(row.totalRecords),
              String(row.presentes),
              String(row.tardes),
              String(row.ausentes),
              `${row.justificadas} / ${row.injustificadas}`,
              row.attendancePercentage !== null
                ? `${row.attendancePercentage.toFixed(1)}%`
                : 'S/D',
              formatAbsenceSummaryForRow(row),
            ];
          })
        : [['-', 'No hay alumnos matriculados en este curso.', '-', '-', '0', '0', '0', '0', '0 / 0', '-', '-']];

    autoTable(doc, {
      startY: currentY,
      head: [
        [
          '#',
          'Alumno',
          'DNI',
          'Div.',
          'Reg.',
          'Pres.',
          'Tard.',
          'Faltas',
          'Just. / Inj.',
          '% Asist.',
          'Detalle de Faltas Registradas',
        ],
      ],
      body: studentRows,
      theme: 'grid',
      styles: {
        fontSize: 7.6,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        valign: 'middle',
      },
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 46, halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: 21, halign: 'center' },
        3: { cellWidth: 11, halign: 'center' },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 13, halign: 'center' },
        6: { cellWidth: 13, halign: 'center' },
        7: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        8: { cellWidth: 20, halign: 'center' },
        9: { cellWidth: 19, halign: 'center', fontStyle: 'bold' },
        10: { cellWidth: usableWidth - 177, halign: 'left' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 9) {
          const text = String(data.cell.raw || '');
          const numeric = parseFloat(text.replace('%', ''));
          if (!Number.isNaN(numeric)) {
            if (numeric >= 90) {
              data.cell.styles.textColor = [22, 163, 74];
            } else if (numeric >= 80) {
              data.cell.styles.textColor = [217, 119, 6];
            } else {
              data.cell.styles.textColor = [220, 38, 38];
            }
          }
        }
        if (data.section === 'body' && data.column.index === 7) {
          const absencesCount = Number(data.cell.raw);
          if (!Number.isNaN(absencesCount) && absencesCount > 0) {
            data.cell.styles.textColor = [185, 28, 28];
          }
        }
      },
      margin: { left: marginX, right: marginX },
    });

    // @ts-ignore jsPDF autotable attaches lastAutoTable
    currentY = (doc.lastAutoTable?.finalY ?? currentY + 25) + 7;
  });

  // ===================== 3. DETALLE CRONOLÓGICO DE FALTAS REGISTRADAS =====================
  if (allAbsenceAnnexRows.length > 0) {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(12, 45, 72);
    const annexNumber = report.courses.length > 1 ? '3' : '2';
    doc.text(
      `${annexNumber}. DETALLE COMPLETO DE FALTAS REGISTRADAS EN EL MES (${allAbsenceAnnexRows.length})`,
      marginX,
      currentY
    );

    autoTable(doc, {
      startY: currentY + 3,
      head: [
        [
          'Curso',
          'Alumno',
          'DNI',
          'Fecha de Falta',
          'Condición',
          'Motivo / Documentación',
          'Origen',
        ],
      ],
      body: allAbsenceAnnexRows,
      theme: 'grid',
      styles: {
        fontSize: 7.8,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 54, halign: 'left', fontStyle: 'bold' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 28, halign: 'center' },
        4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: usableWidth - 182, halign: 'left' },
        6: { cellWidth: 26, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const cond = String(data.cell.raw || '');
          data.cell.styles.textColor =
            cond === 'Justificada' ? [126, 34, 206] : [185, 28, 28];
        }
      },
      margin: { left: marginX, right: marginX },
    });

    // @ts-ignore jsPDF autotable attaches lastAutoTable
    currentY = (doc.lastAutoTable?.finalY ?? currentY + 25) + 10;
  }

  // ===================== FIRMAS Y PIE DE PÁGINA =====================
  if (currentY > pageHeight - 28) {
    doc.addPage();
    currentY = 20;
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(marginX + 12, currentY + 12, marginX + 82, currentY + 12);
  doc.line(pageWidth - marginX - 82, currentY + 12, pageWidth - marginX - 12, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('PRECEPTORÍA / RESPONSABLE DE ASISTENCIA', marginX + 47, currentY + 16.5, {
    align: 'center',
  });
  doc.text('DIRECCIÓN / SECRETARÍA', pageWidth - marginX - 47, currentY + 16.5, {
    align: 'center',
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${schoolName} • Reporte Mensual Consolidado de Asistencia (${report.monthLabel})`,
      marginX,
      pageHeight - 7
    );
    doc.text(`Página ${p} de ${totalPages}`, pageWidth - marginX, pageHeight - 7, {
      align: 'right',
    });
  }

  const courseSuffix =
    report.courseFilter === 'all' ? 'Todos_los_Cursos' : `${report.courseFilter}_Anio`;
  doc.save(`Reporte_Asistencia_Mensual_${report.month}_${courseSuffix}.pdf`);
};
