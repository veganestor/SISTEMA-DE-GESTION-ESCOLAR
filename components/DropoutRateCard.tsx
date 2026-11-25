import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  ShieldAlert,
  TrendingDown,
  UserMinus,
  Users,
} from 'lucide-react';
import {
  CourseYear,
  DEFAULT_SCHOOL_INFO,
  SchoolInfo,
  Student,
  StudentTrajectoryProfile,
} from '../types';
import { calculateDropoutRateMetrics } from '../services/dropoutRateService';

interface DropoutRateCardProps {
  students: Student[];
  academicTrajectories?: Record<string, StudentTrajectoryProfile>;
  schoolInfo?: SchoolInfo;
  onInspectStudent?: (student: Student) => void;
  onNavigateToCourse?: (course: CourseYear) => void;
}

export const DropoutRateCard: React.FC<DropoutRateCardProps> = ({
  students,
  academicTrajectories = {},
  schoolInfo = DEFAULT_SCHOOL_INFO,
  onInspectStudent,
  onNavigateToCourse,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const metrics = useMemo(
    () =>
      calculateDropoutRateMetrics(
        students,
        academicTrajectories,
        schoolInfo.academicYear
      ),
    [students, academicTrajectories, schoolInfo.academicYear]
  );

  const theme = useMemo(() => {
    if (metrics.severityLevel === 'critico') {
      return {
        borderAccent: 'border-b-rose-500 border-rose-200/80',
        strokeColor: '#e11d48',
        trackColor: '#ffe4e6',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
        rateTextClass: 'text-rose-700',
        label: 'Alerta Crítica',
        icon: <ShieldAlert size={14} className="text-rose-600 shrink-0" />,
      };
    }
    if (metrics.severityLevel === 'moderado') {
      return {
        borderAccent: 'border-b-amber-500 border-amber-200/80',
        strokeColor: '#d97706',
        trackColor: '#fef3c7',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
        rateTextClass: 'text-amber-700',
        label: 'Atención Preventiva',
        icon: <AlertTriangle size={14} className="text-amber-600 shrink-0" />,
      };
    }
    return {
      borderAccent: 'border-b-emerald-500 border-emerald-200/80',
      strokeColor: '#059669',
      trackColor: '#d1fae5',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rateTextClass: 'text-emerald-700',
      label: 'Nivel Controlado',
      icon: <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />,
    };
  }, [metrics.severityLevel]);

  // Geometría del indicador circular SVG
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(100, Math.max(0, metrics.dropoutRate));
  const strokeDashoffset = circumference - (clampedPercent / 100) * circumference;

  // Proporciones de la barra segmentada
  const stableCount = Math.max(0, metrics.totalCohort - metrics.totalImpactedCount);
  const stablePct = metrics.totalCohort > 0 ? (stableCount / metrics.totalCohort) * 100 : 100;
  const chronicOnlyPct =
    metrics.totalCohort > 0 ? (metrics.chronicOnlyCount / metrics.totalCohort) * 100 : 0;
  const enrollmentOnlyPct =
    metrics.totalCohort > 0 ? (metrics.enrollmentOnlyCount / metrics.totalCohort) * 100 : 0;
  const bothPct =
    metrics.totalCohort > 0 ? (metrics.bothFactorsCount / metrics.totalCohort) * 100 : 0;

  return (
    <section
      aria-label="Tasa de Deserción Escolar"
      className={`aero-glass rounded-[30px] p-5 sm:p-7 border border-white/90 border-b-4 ${theme.borderAccent} shadow-lg space-y-5`}
    >
      {/* Cabecera y Gauge Principal */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Indicador Radial SVG */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 112 112"
              className="w-full h-full -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke={theme.trackColor}
                strokeWidth="10"
              />
              <circle
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke={theme.strokeColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span
                className={`text-2xl font-black tracking-tight tabular-nums leading-none ${theme.rateTextClass}`}
              >
                {metrics.dropoutRate.toFixed(1)}%
              </span>
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mt-1">
                Deserción
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-700">
                Ciclo Lectivo {metrics.academicYear}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border text-[10px] font-extrabold uppercase tracking-wider ${theme.badgeClass}`}
              >
                {theme.icon}
                <span>{theme.label}</span>
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingDown size={22} className={theme.rateTextClass} />
              <span>Tasa de Deserción Escolar</span>
            </h3>
            <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
              Calculada sobre la matrícula total (
              <strong className="text-slate-800 tabular-nums">{metrics.totalCohort}</strong>{' '}
              alumnos) combinando inasistencias acumuladas crónicas (≥{' '}
              {metrics.chronicThresholdPercent}%) y cambios en el estado de matriculación del ciclo
              (bajas, abandonos o pases salientes), sin doble conteo.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600 pt-0.5 tabular-nums">
              <span className="text-emerald-700">
                Retención escolar: <strong>{metrics.retentionRate.toFixed(1)}%</strong> (
                {stableCount} estables)
              </span>
              {metrics.atRiskMonitoringCount > 0 && (
                <span className="text-amber-700">
                  • {metrics.atRiskMonitoringCount} en seguimiento preventivo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sub-métricas clave */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <div className="bg-amber-50/85 border border-amber-200/90 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                Inasistencia Crónica
              </span>
              <Clock size={15} className="text-amber-600 shrink-0" />
            </div>
            <p className="text-2xl font-black text-amber-900 tabular-nums">
              {metrics.chronicAbsenceCount}
            </p>
            <p className="text-[11px] text-amber-800/90 font-semibold leading-tight">
              Alumnos con ≥ {metrics.chronicThresholdPercent}% faltas acumuladas
            </p>
          </div>

          <div className="bg-rose-50/85 border border-rose-200/90 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                Cambios Matriculación
              </span>
              <ArrowRightLeft size={15} className="text-rose-600 shrink-0" />
            </div>
            <p className="text-2xl font-black text-rose-900 tabular-nums">
              {metrics.enrollmentChangeCount}
            </p>
            <p className="text-[11px] text-rose-800/90 font-semibold leading-tight">
              {metrics.bajaAbandonoCount} baja(s)/abandono • {metrics.paseSalienteCount} pase(s)
            </p>
          </div>

          <div className="bg-sky-50/85 border border-sky-200/90 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
                Afectados (Únicos)
              </span>
              <UserMinus size={15} className="text-sky-600 shrink-0" />
            </div>
            <p className="text-2xl font-black text-sky-950 tabular-nums">
              {metrics.totalImpactedCount}
              <span className="text-sm font-bold text-slate-500"> / {metrics.totalCohort}</span>
            </p>
            <p className="text-[11px] text-sky-800/90 font-semibold leading-tight">
              {metrics.bothFactorsCount > 0
                ? `${metrics.bothFactorsCount} con ambos factores`
                : 'Sin superposición de factores'}
            </p>
          </div>
        </div>
      </div>

      {/* Barra visual de composición de matrícula */}
      <div className="space-y-2 pt-1 border-t border-sky-100">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
          <span>Composición de Permanencia vs. Riesgo / Desvinculación</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
              Estable ({stableCount})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
              Inasist. Crónica ({metrics.chronicOnlyCount})
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
              Cambio Matrícula ({metrics.enrollmentOnlyCount})
            </span>
            {metrics.bothFactorsCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-800 inline-block" />
                Ambos ({metrics.bothFactorsCount})
              </span>
            )}
          </div>
        </div>

        <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex border border-slate-200/80">
          {stablePct > 0 && (
            <div
              style={{ width: `${stablePct}%` }}
              className="bg-emerald-500 h-full transition-all duration-500"
              title={`Permanencia estable: ${stableCount} alumno(s)`}
            />
          )}
          {chronicOnlyPct > 0 && (
            <div
              style={{ width: `${chronicOnlyPct}%` }}
              className="bg-amber-500 h-full transition-all duration-500"
              title={`Solo inasistencia crónica: ${metrics.chronicOnlyCount} alumno(s)`}
            />
          )}
          {enrollmentOnlyPct > 0 && (
            <div
              style={{ width: `${enrollmentOnlyPct}%` }}
              className="bg-rose-500 h-full transition-all duration-500"
              title={`Solo cambio de matriculación: ${metrics.enrollmentOnlyCount} alumno(s)`}
            />
          )}
          {bothPct > 0 && (
            <div
              style={{ width: `${bothPct}%` }}
              className="bg-rose-800 h-full transition-all duration-500"
              title={`Inasistencia crónica + cambio de matriculación: ${metrics.bothFactorsCount} alumno(s)`}
            />
          )}
        </div>
      </div>

      {/* Distribución por curso + botón desplegable de detalle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-sky-100">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-extrabold text-slate-600 mr-1 inline-flex items-center gap-1">
            <Users size={13} className="text-sky-600" />
            <span>Por curso:</span>
          </span>
          {metrics.byCourse.map((c) => (
            <button
              key={c.course}
              type="button"
              onClick={() => onNavigateToCourse?.(c.course)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border tabular-nums transition-colors ${
                c.impactedCount > 0
                  ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                  : 'bg-white/90 text-slate-600 border-slate-200 hover:bg-sky-50'
              }`}
              title={`${c.course}° Año: ${c.impactedCount} de ${c.totalStudents} alumnos (${c.rate}%)`}
            >
              {c.course}°: {c.impactedCount}/{c.totalStudents}
            </button>
          ))}
        </div>

        {metrics.impactedStudents.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="px-3.5 py-2 min-h-[38px] rounded-xl bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors shrink-0"
          >
            <span>
              {showDetails
                ? 'Ocultar detalle'
                : `Ver alumnos incluidos (${metrics.impactedStudents.length})`}
            </span>
            {showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>

      {/* Detalle desplegable de estudiantes computados */}
      {showDetails && metrics.impactedStudents.length > 0 && (
        <div className="bg-white/85 border border-sky-100 rounded-2xl divide-y divide-slate-100 overflow-hidden animate-in fade-in duration-200">
          {metrics.impactedStudents.map((item) => (
            <div
              key={item.student.id}
              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-sky-50/40 transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                    {item.student.fullName}
                  </span>
                  <span className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                    {item.student.course}° Año
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  {item.hasChronicAbsence && (
                    <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md tabular-nums">
                      Inasistencia crónica: {item.absenceRate}% ({item.effectiveAbsences}/
                      {item.totalAttendanceDays} jornadas)
                    </span>
                  )}
                  {item.hasEnrollmentChange && item.enrollmentChangeReason && (
                    <span className="text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                      {item.enrollmentChangeReason}
                    </span>
                  )}
                </div>
              </div>

              {onInspectStudent && (
                <button
                  type="button"
                  onClick={() => onInspectStudent(item.student)}
                  className="px-3 py-2 min-h-[36px] rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                >
                  <ExternalLink size={13} />
                  <span>Abrir Legajo</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
