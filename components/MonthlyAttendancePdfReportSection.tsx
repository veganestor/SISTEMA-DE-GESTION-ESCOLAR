import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  FileDown,
  FileText,
  Users,
} from 'lucide-react';
import { CourseYear, SchoolInfo, Student } from '../types';
import {
  buildMonthlyAttendanceReport,
  exportMonthlyAttendanceConsolidatedPDF,
  getCurrentYearMonthISO,
  MonthlyAttendanceReportData,
} from '../services/monthlyAttendanceReport';

const COURSE_OPTIONS: Array<{ value: CourseYear | 'all'; label: string }> = [
  { value: 'all', label: 'Todos los Cursos (Consolidado)' },
  { value: '1', label: '1° Año · Ciclo Básico' },
  { value: '2', label: '2° Año · Ciclo Básico' },
  { value: '3', label: '3° Año · Ciclo Básico' },
  { value: '4', label: '4° Año · Ciclo Orientado' },
  { value: '5', label: '5° Año · Ciclo Orientado' },
  { value: '6', label: '6° Año · Ciclo Orientado' },
];

export interface MonthlyAttendancePdfReportSectionProps {
  students: Student[];
  schoolInfo: SchoolInfo;
  onExportPDF?: (report: MonthlyAttendanceReportData, schoolInfo: SchoolInfo) => void;
  onInspectStudent?: (student: Student) => void;
  onNavigateToAttendance?: () => void;
}

export const MonthlyAttendancePdfReportSection: React.FC<MonthlyAttendancePdfReportSectionProps> = ({
  students,
  schoolInfo,
  onExportPDF = exportMonthlyAttendanceConsolidatedPDF,
  onInspectStudent,
  onNavigateToAttendance,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentYearMonthISO());
  const [selectedCourse, setSelectedCourse] = useState<CourseYear | 'all'>('all');
  const [onlyWithAbsences, setOnlyWithAbsences] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const report = useMemo(
    () => buildMonthlyAttendanceReport(students, selectedMonth, selectedCourse),
    [students, selectedMonth, selectedCourse]
  );

  const visibleCourses = useMemo(() => {
    if (!onlyWithAbsences) return report.courses;
    return report.courses
      .map((courseGroup) => ({
        ...courseGroup,
        rows: courseGroup.rows.filter((row) => row.ausentes > 0),
      }))
      .filter((courseGroup) => courseGroup.rows.length > 0);
  }, [report.courses, onlyWithAbsences]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFeedback({ type, message });
    timerRef.current = setTimeout(() => setFeedback(null), 4500);
  };

  const handleExportMonthlyPDF = () => {
    if (report.totalStudents === 0) {
      showFeedback(
        'error',
        selectedCourse === 'all'
          ? 'No hay alumnos matriculados para generar el reporte mensual.'
          : `No hay alumnos registrados en ${selectedCourse}° Año para generar el reporte.`
      );
      return;
    }

    try {
      onExportPDF(report, schoolInfo);
      showFeedback(
        'success',
        `Reporte PDF mensual consolidado de ${report.monthLabel} generado (${report.totalStudents} alumnos, ${report.totalAusentes} faltas detalladas).`
      );
    } catch {
      showFeedback(
        'error',
        'No se pudo generar el PDF consolidado de asistencia mensual. Intente nuevamente.'
      );
    }
  };

  const getPercentageToneClass = (pct: number | null) => {
    if (pct === null) return 'text-slate-500';
    if (pct >= 90) return 'text-emerald-700';
    if (pct >= 80) return 'text-amber-700';
    return 'text-rose-700';
  };

  const getPercentageStatusText = (pct: number | null) => {
    if (pct === null) return 'Sin registros';
    if (pct >= 90) return 'Óptima';
    if (pct >= 80) return 'Regular';
    return 'En riesgo';
  };

  return (
    <section
      aria-label="Reporte Mensual Consolidado de Asistencia PDF"
      className="aero-glass rounded-[28px] p-5 sm:p-6 border border-white/90 shadow-md space-y-5"
    >
      {/* Cabecera de Sección */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-sky-50 text-sky-700 border border-sky-200/90 shadow-sm shrink-0">
            <FileText size={20} />
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
              Consolidado Mensual de Asistencia · Formato PDF A4
            </p>
            <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Reporte Mensual Consolidado de Asistencia
            </h3>
            <p className="text-xs text-slate-600">
              Porcentaje de asistencia efectiva por alumno y curso, con detalle completo de faltas justificadas e injustificadas.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={report.totalStudents === 0}
          onClick={handleExportMonthlyPDF}
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-sky-700 hover:bg-sky-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
          title="Descargar reporte mensual consolidado en PDF con porcentajes por alumno y detalle de faltas"
        >
          <FileDown size={16} className="shrink-0" />
          <span>Exportar Reporte Mensual (PDF)</span>
        </button>
      </div>

      {/* Controles de Período, Curso y Vista */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end pt-1 border-t border-sky-100/80">
        <div className="lg:col-span-3">
          <label
            htmlFor="monthly-report-month"
            className="block text-[11px] font-bold text-slate-600 mb-1"
          >
            Mes y Año del Reporte
          </label>
          <div className="relative">
            <CalendarRange
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-700 pointer-events-none"
            />
            <input
              id="monthly-report-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value || getCurrentYearMonthISO())}
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl border border-sky-200 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 tabular-nums"
            />
          </div>
        </div>

        <div className="lg:col-span-4">
          <label
            htmlFor="monthly-report-course"
            className="block text-[11px] font-bold text-slate-600 mb-1"
          >
            Curso / Alcance
          </label>
          <select
            id="monthly-report-course"
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value as CourseYear | 'all')}
            className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-sky-200 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {COURSE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2 lg:col-span-5 flex flex-wrap items-center justify-between sm:justify-end gap-2">
          <div
            role="group"
            aria-label="Filtrar alumnos en vista previa"
            className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-slate-200"
          >
            <button
              type="button"
              onClick={() => setOnlyWithAbsences(false)}
              className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                !onlyWithAbsences
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos los alumnos
            </button>
            <button
              type="button"
              onClick={() => setOnlyWithAbsences(true)}
              className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                onlyWithAbsences
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Solo con faltas ({report.courses.reduce((acc, c) => acc + c.rows.filter((r) => r.ausentes > 0).length, 0)})
            </button>
          </div>

          {onNavigateToAttendance && (
            <button
              type="button"
              onClick={onNavigateToAttendance}
              className="px-3 py-2 min-h-[42px] rounded-xl border border-sky-200 bg-white hover:bg-sky-50 text-sky-900 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              Ir a Asistencia Diaria
            </button>
          )}
        </div>
      </div>

      {/* Feedback de Exportación */}
      {feedback && (
        <div
          role="status"
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Métricas Consolidadas del Período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        <div className="p-3.5 rounded-2xl bg-white/85 border border-sky-100">
          <p className="text-[11px] font-bold text-slate-500">Alumnos Evaluados</p>
          <p className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
            {report.totalStudents}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {report.studentsWithRecordsCount} con registros en {report.monthLabel}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/85 border border-sky-100">
          <p className="text-[11px] font-bold text-slate-500">Asistencia Consolidada</p>
          <p
            className={`text-2xl font-extrabold tabular-nums mt-0.5 ${getPercentageToneClass(
              report.overallAttendancePercentage
            )}`}
          >
            {report.overallAttendancePercentage !== null
              ? `${report.overallAttendancePercentage.toFixed(1)}%`
              : 'Sin datos'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {getPercentageStatusText(report.overallAttendancePercentage)} · {report.totalRecords} registros
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/85 border border-sky-100">
          <p className="text-[11px] font-bold text-slate-500">Presentes y Tardanzas</p>
          <p className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-0.5">
            {report.totalPresentes} <span className="text-base text-amber-700">/ {report.totalTardes}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Presentes totales / Llegadas tarde (0.5)
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-white/85 border border-sky-100">
          <p className="text-[11px] font-bold text-slate-500">Faltas Registradas</p>
          <p className="text-2xl font-extrabold text-rose-700 tabular-nums mt-0.5">
            {report.totalAusentes}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {report.totalJustificadas} justificadas · {report.totalInjustificadas} injustificadas
          </p>
        </div>
      </div>

      {/* Vista Previa Consolidada por Curso y Detalle de Faltas */}
      {visibleCourses.length > 0 ? (
        <div className="space-y-4">
          {visibleCourses.map((courseGroup) => (
            <div
              key={courseGroup.course}
              className="rounded-2xl border border-sky-200/80 bg-white/90 overflow-hidden"
            >
              {/* Encabezado de Curso */}
              <div className="px-4 py-3 bg-sky-50/90 border-b border-sky-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-extrabold text-slate-900 text-sm">
                    {courseGroup.courseLabel}
                  </span>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-semibold text-slate-600">{courseGroup.cycleLabel}</span>
                  <span className="text-slate-400" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-semibold text-slate-600 tabular-nums">
                    {courseGroup.studentCount} {courseGroup.studentCount === 1 ? 'alumno' : 'alumnos'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  <span className="text-slate-600 font-semibold">
                    Faltas: <strong className="text-rose-700">{courseGroup.totalAusentes}</strong>{' '}
                    <span className="text-slate-500">
                      ({courseGroup.totalJustificadas} just. / {courseGroup.totalInjustificadas} inj.)
                    </span>
                  </span>
                  <span className="text-slate-400" aria-hidden="true">
                    |
                  </span>
                  <span className="font-bold text-slate-700">
                    Asistencia del curso:{' '}
                    <strong className={getPercentageToneClass(courseGroup.courseAttendancePercentage)}>
                      {courseGroup.courseAttendancePercentage !== null
                        ? `${courseGroup.courseAttendancePercentage.toFixed(1)}%`
                        : 'Sin datos'}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Tabla por alumno */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 bg-slate-50/60">
                      <th className="py-2.5 px-3 text-left">Alumno</th>
                      <th className="py-2.5 px-3 text-left">DNI</th>
                      <th className="py-2.5 px-2 text-right">Reg.</th>
                      <th className="py-2.5 px-2 text-right">Pres.</th>
                      <th className="py-2.5 px-2 text-right">Tard.</th>
                      <th className="py-2.5 px-2 text-right">Faltas (J/I)</th>
                      <th className="py-2.5 px-3 text-right">% Asist.</th>
                      <th className="py-2.5 px-3 text-left">Detalle de Faltas Registradas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {courseGroup.rows.map((row) => {
                      const studentObj = students.find((s) => s.id === row.studentId);
                      return (
                        <tr key={row.studentId} className="hover:bg-sky-50/40 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {onInspectStudent && studentObj ? (
                              <button
                                type="button"
                                onClick={() => onInspectStudent(studentObj)}
                                className="text-left hover:text-sky-700 hover:underline focus-visible:outline-none focus-visible:underline"
                              >
                                {row.fullName}
                              </button>
                            ) : (
                              row.fullName
                            )}
                            {row.division !== '-' && (
                              <span className="text-slate-500 font-normal ml-1.5">
                                · Div. {row.division}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                            {row.dni}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                            {row.totalRecords}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-emerald-700 font-semibold">
                            {row.presentes}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums text-amber-700 font-semibold">
                            {row.tardes}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums">
                            <span className={row.ausentes > 0 ? 'font-bold text-rose-700' : 'text-slate-500'}>
                              {row.ausentes}
                            </span>{' '}
                            <span className="text-slate-400">
                              ({row.justificadas}/{row.injustificadas})
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-extrabold tabular-nums whitespace-nowrap ${getPercentageToneClass(
                              row.attendancePercentage
                            )}`}
                          >
                            {row.attendancePercentage !== null
                              ? `${row.attendancePercentage.toFixed(1)}%`
                              : 'Sin datos'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 max-w-md">
                            {row.totalRecords === 0 ? (
                              <span className="text-slate-400 italic">Sin registros en {report.monthLabel}</span>
                            ) : row.absences.length === 0 ? (
                              <span className="text-emerald-700 font-medium">Sin faltas registradas</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {row.absences.map((abs, idx) => (
                                  <li key={`${row.studentId}-${abs.date}-${idx}`} className="leading-snug">
                                    <span className="font-mono font-semibold text-slate-800 tabular-nums">
                                      {abs.formattedDate}
                                    </span>{' '}
                                    <span className="text-slate-400" aria-hidden="true">
                                      ·
                                    </span>{' '}
                                    <span
                                      className={
                                        abs.justified
                                          ? 'text-purple-700 font-semibold'
                                          : 'text-rose-700 font-semibold'
                                      }
                                    >
                                      {abs.justified ? 'Justificada' : 'Injustificada'}
                                    </span>
                                    {abs.reason ? (
                                      <span className="text-slate-600"> — {abs.reason}</span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 space-y-2">
          <Users size={28} className="mx-auto text-sky-400" />
          <p className="text-sm font-bold text-slate-800">
            {report.totalStudents === 0
              ? 'Aún no hay alumnos registrados para el alcance seleccionado'
              : onlyWithAbsences
              ? `No hay alumnos con faltas registradas en ${report.monthLabel}`
              : `No hay registros de asistencia en ${report.monthLabel}`}
          </p>
          <p className="text-xs text-slate-600 max-w-lg mx-auto">
            {report.totalStudents === 0
              ? 'Cuando cargues alumnos y registres su asistencia diaria o por QR, aquí verás el porcentaje consolidado por curso, el detalle de faltas y el botón de exportación en PDF.'
              : 'Puedes cambiar el mes, el curso seleccionado o mostrar todos los alumnos.'}
          </p>
        </div>
      )}
    </section>
  );
};
