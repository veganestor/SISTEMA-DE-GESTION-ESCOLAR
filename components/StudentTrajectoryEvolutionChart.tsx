import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CourseYear, MeritOrderConfig, SchoolInfo, Student } from '../types';
import {
  StudentTrajectorySummary,
  YEAR_CONDITION_LABELS,
  YearAverageSummary,
  formatDecimalAverage,
  roundToDecimals,
} from '../services/trajectoryService';
import {
  Award,
  LineChart as LineChartIcon,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

interface StudentTrajectoryEvolutionChartProps {
  student: Student;
  summary: StudentTrajectorySummary;
  meritConfig: MeritOrderConfig;
  schoolInfo?: SchoolInfo;
  variant?: 'full' | 'compact';
  selectedYearId?: string;
  onSelectYear?: (yearId: string) => void;
  className?: string;
}

interface TrajectoryChartPoint {
  key: string;
  yearId: string | null;
  course: CourseYear;
  xLabel: string;
  fullTitle: string;
  academicYear: number | null;
  annualAverage: number | null;
  formattedAnnualAverage: string;
  runningCumulativeAverage: number | null;
  formattedRunningCumulative: string;
  isDefinitive: boolean;
  isRepeatedYear: boolean;
  statusLabel: string;
  conditionLabel: string;
  countedSubjects: number;
  totalApplicableSubjects: number;
  pendingAccreditationCount: number;
  hasRecord: boolean;
}

const ALL_COURSES: CourseYear[] = ['1', '2', '3', '4', '5', '6'];

export const StudentTrajectoryEvolutionChart: React.FC<
  StudentTrajectoryEvolutionChartProps
> = ({
  student,
  summary,
  meritConfig,
  schoolInfo,
  variant = 'full',
  selectedYearId,
  onSelectYear,
  className = '',
}) => {
  const [showRunningCumulative, setShowRunningCumulative] = useState(true);

  const decimals = meritConfig.decimalPlaces ?? 2;
  const passingGrade = meritConfig.passingGrade || 6;

  // Construir serie cronológica completa de 1° a 6° Año (preservando años repetidos si existen)
  const chartData: TrajectoryChartPoint[] = useMemo(() => {
    const groupedByCourse = new Map<CourseYear, YearAverageSummary[]>();
    ALL_COURSES.forEach((c) => groupedByCourse.set(c, []));

    const sortedSummaries = [...summary.yearSummaries].sort((a, b) => {
      if (a.academicYear !== b.academicYear) return a.academicYear - b.academicYear;
      return Number(a.course) - Number(b.course);
    });

    sortedSummaries.forEach((ys) => {
      const list = groupedByCourse.get(ys.course) || [];
      list.push(ys);
      groupedByCourse.set(ys.course, list);
    });

    const points: TrajectoryChartPoint[] = [];
    let runningWeightedSum = 0;
    let runningWeightTotal = 0;

    ALL_COURSES.forEach((course) => {
      const records = groupedByCourse.get(course) || [];

      if (records.length === 0) {
        points.push({
          key: `empty-${course}`,
          yearId: null,
          course,
          xLabel: `${course}° Año`,
          fullTitle: `${course}° Año · Sin ciclo registrado`,
          academicYear: null,
          annualAverage: null,
          formattedAnnualAverage: '—',
          runningCumulativeAverage: null,
          formattedRunningCumulative: '—',
          isDefinitive: false,
          isRepeatedYear: false,
          statusLabel: 'Sin registro',
          conditionLabel: 'Aún sin cursar o sin cargar',
          countedSubjects: 0,
          totalApplicableSubjects: 0,
          pendingAccreditationCount: 0,
          hasRecord: false,
        });
        return;
      }

      const hasMultipleSameCourse = records.length > 1;

      records.forEach((ys) => {
        const hasAvg = ys.average !== null && !Number.isNaN(ys.average);
        const roundedAnnual = hasAvg ? roundToDecimals(ys.average as number, decimals) : null;

        let runningAvg: number | null = null;
        if (hasAvg && ys.totalWeight > 0) {
          const canInclude = meritConfig.includePartialYearsInCumulative || ys.isDefinitive;
          if (canInclude) {
            runningWeightedSum += (ys.average as number) * ys.totalWeight;
            runningWeightTotal += ys.totalWeight;
          }
        }
        if (runningWeightTotal > 0 && hasAvg) {
          runningAvg = roundToDecimals(runningWeightedSum / runningWeightTotal, decimals);
        }

        const xLabel = hasMultipleSameCourse
          ? `${ys.course}° (${ys.academicYear}${ys.isRepeatedYear ? ' · Rep' : ''})`
          : `${ys.course}° Año`;

        points.push({
          key: ys.yearId,
          yearId: ys.yearId,
          course: ys.course,
          xLabel,
          fullTitle: `${ys.course}° Año · Ciclo ${ys.academicYear}${
            ys.isRepeatedYear ? ' (Repitencia)' : ''
          }`,
          academicYear: ys.academicYear,
          annualAverage: roundedAnnual,
          formattedAnnualAverage: ys.formattedAverage,
          runningCumulativeAverage: runningAvg,
          formattedRunningCumulative: formatDecimalAverage(
            runningWeightTotal > 0 && hasAvg ? runningWeightedSum / runningWeightTotal : null,
            decimals
          ),
          isDefinitive: ys.isDefinitive,
          isRepeatedYear: ys.isRepeatedYear,
          statusLabel: ys.statusLabel,
          conditionLabel: YEAR_CONDITION_LABELS[ys.condition] || ys.condition,
          countedSubjects: ys.countedSubjects,
          totalApplicableSubjects: ys.totalApplicableSubjects,
          pendingAccreditationCount: ys.pendingAccreditationCount,
          hasRecord: true,
        });
      });
    });

    return points;
  }, [summary.yearSummaries, decimals, meritConfig.includePartialYearsInCumulative]);

  const pointsWithAverage = useMemo(
    () => chartData.filter((p) => p.annualAverage !== null),
    [chartData]
  );

  const stats = useMemo(() => {
    if (pointsWithAverage.length === 0) {
      return {
        hasData: false,
        best: null as TrajectoryChartPoint | null,
        lowest: null as TrajectoryChartPoint | null,
        delta: null as number | null,
        trendLabel: 'Sin calificaciones computables',
        trendTone: 'neutral' as 'up' | 'down' | 'flat' | 'neutral',
      };
    }

    let best = pointsWithAverage[0];
    let lowest = pointsWithAverage[0];
    pointsWithAverage.forEach((p) => {
      if ((p.annualAverage ?? -1) > (best.annualAverage ?? -1)) best = p;
      if ((p.annualAverage ?? 11) < (lowest.annualAverage ?? 11)) lowest = p;
    });

    if (pointsWithAverage.length === 1) {
      return {
        hasData: true,
        best,
        lowest,
        delta: 0,
        trendLabel: '1 ciclo lectivo evaluado',
        trendTone: 'neutral' as const,
      };
    }

    const firstVal = pointsWithAverage[0].annualAverage as number;
    const lastVal = pointsWithAverage[pointsWithAverage.length - 1].annualAverage as number;
    const diff = roundToDecimals(lastVal - firstVal, decimals);
    const formattedDiff = Math.abs(diff).toFixed(decimals).replace('.', ',');

    if (diff > 0.0001) {
      return {
        hasData: true,
        best,
        lowest,
        delta: diff,
        trendLabel: `Evolución positiva (+${formattedDiff} pts)`,
        trendTone: 'up' as const,
      };
    }
    if (diff < -0.0001) {
      return {
        hasData: true,
        best,
        lowest,
        delta: diff,
        trendLabel: `Descenso respecto al inicio (-${formattedDiff} pts)`,
        trendTone: 'down' as const,
      };
    }
    return {
      hasData: true,
      best,
      lowest,
      delta: 0,
      trendLabel: 'Promedio estable',
      trendTone: 'flat' as const,
    };
  }, [pointsWithAverage, decimals]);

  const cumulativeReferenceValue =
    summary.cumulativeAverage !== null
      ? roundToDecimals(summary.cumulativeAverage, decimals)
      : null;

  const renderAnnualDot = (dotProps: any) => {
    const { cx, cy, payload } = dotProps;
    if (
      typeof cx !== 'number' ||
      typeof cy !== 'number' ||
      payload?.annualAverage === null ||
      payload?.annualAverage === undefined
    ) {
      return <g key={`empty-dot-${payload?.key || cx}`} />;
    }

    const isSelected = Boolean(selectedYearId && payload.yearId === selectedYearId);
    const isDefinitive = Boolean(payload.isDefinitive);
    const isBelowPassing = payload.annualAverage < passingGrade;

    const fill = isBelowPassing
      ? '#e11d48'
      : isDefinitive
      ? '#0284c7'
      : '#f59e0b';

    const radius = isSelected ? 7.5 : variant === 'compact' ? 5 : 6;

    return (
      <g
        key={`dot-${payload.key}`}
        className={onSelectYear && payload.yearId ? 'cursor-pointer' : undefined}
        onClick={() => {
          if (onSelectYear && payload.yearId) {
            onSelectYear(payload.yearId);
          }
        }}
      >
        {isSelected && (
          <circle cx={cx} cy={cy} r={radius + 4} fill="rgba(2, 132, 199, 0.2)" />
        )}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill={fill}
          stroke="#ffffff"
          strokeWidth={2.5}
        />
      </g>
    );
  };

  const renderActiveDot = (dotProps: any) => {
    const { cx, cy, payload } = dotProps;
    if (
      typeof cx !== 'number' ||
      typeof cy !== 'number' ||
      payload?.annualAverage === null ||
      payload?.annualAverage === undefined
    ) {
      return <g />;
    }
    const isBelowPassing = payload.annualAverage < passingGrade;
    const isDefinitive = Boolean(payload.isDefinitive);
    const fill = isBelowPassing
      ? '#be123c'
      : isDefinitive
      ? '#0369a1'
      : '#d97706';

    return (
      <circle
        cx={cx}
        cy={cy}
        r={variant === 'compact' ? 7 : 8}
        fill={fill}
        stroke="#bae6fd"
        strokeWidth={3}
        className={onSelectYear && payload.yearId ? 'cursor-pointer' : undefined}
        onClick={() => {
          if (onSelectYear && payload.yearId) {
            onSelectYear(payload.yearId);
          }
        }}
      />
    );
  };

  const isCompact = variant === 'compact';

  return (
    <div
      className={`rounded-2xl border ${
        isCompact
          ? 'bg-sky-50/45 border-sky-200/80 p-4 space-y-3.5'
          : 'aero-glass border-white/90 p-5 sm:p-6 space-y-4'
      } ${className}`}
    >
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0 ${
              isCompact ? 'w-8 h-8' : 'w-10 h-10'
            }`}
          >
            <LineChartIcon size={isCompact ? 16 : 20} />
          </div>
          <div className="min-w-0">
            <h4
              className={`font-extrabold text-[#0c2d48] tracking-tight ${
                isCompact ? 'text-sm' : 'text-base sm:text-lg'
              }`}
            >
              Evolución de Promedios Anuales (1.º a 6.º Año)
            </h4>
            <p className="text-[11px] sm:text-xs text-slate-600 leading-snug">
              Curva histórica de {student.fullName} · Cálculo{' '}
              {meritConfig.calculationMode === 'weighted' ? 'ponderado' : 'simple'} ({decimals}{' '}
              dec.)
              {onSelectYear ? ' · Haga clic en un punto para inspeccionar ese ciclo.' : '.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Indicador de tendencia */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold tabular-nums ${
              stats.trendTone === 'up'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : stats.trendTone === 'down'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            {stats.trendTone === 'up' ? (
              <TrendingUp size={13} className="text-emerald-600 shrink-0" />
            ) : stats.trendTone === 'down' ? (
              <TrendingDown size={13} className="text-rose-600 shrink-0" />
            ) : (
              <Minus size={13} className="text-slate-500 shrink-0" />
            )}
            <span>{stats.trendLabel}</span>
          </span>

          {/* Control para mostrar/ocultar curva acumulada progresiva */}
          {pointsWithAverage.length >= 2 && (
            <button
              type="button"
              onClick={() => setShowRunningCumulative((v) => !v)}
              className={`px-2.5 py-1 min-h-[30px] rounded-lg border text-[11px] font-bold transition-colors ${
                showRunningCumulative
                  ? 'bg-teal-50 border-teal-300 text-teal-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {showRunningCumulative ? 'Ocultar acumulado' : 'Ver acumulado'}
            </button>
          )}
        </div>
      </div>

      {/* Mini tarjetas métricas (en vista completa) */}
      {!isCompact && stats.hasData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-white/90 border border-sky-100 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 block">
              Mejor Promedio Anual
            </span>
            <p className="text-lg font-black text-[#0c2d48] tabular-nums mt-0.5">
              {stats.best?.formattedAnnualAverage || '—'}
            </p>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {stats.best
                ? `${stats.best.course}° Año (${stats.best.academicYear})`
                : '—'}
            </span>
          </div>

          <div className="bg-white/90 border border-sky-100 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 block">
              Mínimo Anual Registrado
            </span>
            <p className="text-lg font-black text-slate-800 tabular-nums mt-0.5">
              {stats.lowest?.formattedAnnualAverage || '—'}
            </p>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {stats.lowest
                ? `${stats.lowest.course}° Año (${stats.lowest.academicYear})`
                : '—'}
            </span>
          </div>

          <div className="bg-white/90 border border-teal-100 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 block">
              Promedio Acumulado
            </span>
            <p className="text-lg font-black text-teal-800 tabular-nums mt-0.5">
              {summary.formattedCumulativeAverage}
            </p>
            <span className="text-[11px] text-slate-500">
              {summary.cumulativeStatusLabel}
            </span>
          </div>

          <div className="bg-white/90 border border-sky-100 rounded-xl px-3.5 py-2.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">
              Cobertura 1.º–6.º Año
            </span>
            <p className="text-lg font-black text-emerald-800 tabular-nums mt-0.5">
              {summary.distinctCoursesRecorded.length} / 6 años
            </p>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {pointsWithAverage.length} ciclo(s) con promedio
            </span>
          </div>
        </div>
      )}

      {/* Gráfico Recharts */}
      <div className={`w-full min-w-0 ${isCompact ? 'h-56 sm:h-60' : 'h-64 sm:h-72'}`}>
        {stats.hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 14, right: 20, left: -16, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="xLabel"
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}
                interval={0}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
              />
              <Tooltip
                cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const pt = payload[0]?.payload as TrajectoryChartPoint | undefined;
                  if (!pt) return null;

                  return (
                    <div className="bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl border border-slate-700 text-xs space-y-1.5 max-w-[260px]">
                      <div className="border-b border-slate-700/80 pb-1.5">
                        <p className="font-black text-sky-300 leading-snug">{pt.fullTitle}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {pt.conditionLabel}
                        </p>
                      </div>

                      {pt.annualAverage !== null ? (
                        <>
                          <div className="flex items-center justify-between gap-4 tabular-nums">
                            <span className="text-slate-300 font-semibold">Promedio anual:</span>
                            <span className="font-black text-sm text-white flex items-center gap-1.5">
                              <span>{pt.formattedAnnualAverage}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                                  pt.isDefinitive
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                    : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                                }`}
                              >
                                {pt.statusLabel}
                              </span>
                            </span>
                          </div>

                          {showRunningCumulative && pt.runningCumulativeAverage !== null && (
                            <div className="flex items-center justify-between gap-4 tabular-nums">
                              <span className="text-teal-300 font-semibold">
                                Acumulado hasta aquí:
                              </span>
                              <span className="font-extrabold text-teal-200">
                                {pt.formattedRunningCumulative}
                              </span>
                            </div>
                          )}

                          <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-3 text-[11px] text-slate-300 tabular-nums">
                            <span>
                              Computadas: <strong>{pt.countedSubjects}</strong>/
                              {pt.totalApplicableSubjects}
                            </span>
                            <span
                              className={
                                pt.pendingAccreditationCount > 0
                                  ? 'text-amber-300 font-extrabold'
                                  : 'text-emerald-300 font-bold'
                              }
                            >
                              Pend.: {pt.pendingAccreditationCount}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          {pt.hasRecord
                            ? 'Ciclo registrado sin calificaciones finales computables todavía.'
                            : 'Curso aún sin calificaciones registradas en la trayectoria.'}
                        </p>
                      )}
                    </div>
                  );
                }}
              />

              {/* Línea de referencia: mínimo de aprobación */}
              <ReferenceLine
                y={passingGrade}
                stroke="#16a34a"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Aprobación (${passingGrade})`,
                  fill: '#15803d',
                  fontSize: 10,
                  fontWeight: 700,
                  position: 'insideBottomRight',
                }}
              />

              {/* Línea de referencia: promedio general acumulado */}
              {cumulativeReferenceValue !== null && (
                <ReferenceLine
                  y={cumulativeReferenceValue}
                  stroke="#0d9488"
                  strokeDasharray="2 4"
                  strokeWidth={1.25}
                  label={{
                    value: `Acum. ${summary.formattedCumulativeAverage}`,
                    fill: '#0f766e',
                    fontSize: 10,
                    fontWeight: 700,
                    position: 'insideTopRight',
                  }}
                />
              )}

              {/* Curva opcional: Promedio Acumulado Progresivo */}
              {showRunningCumulative && pointsWithAverage.length >= 2 && (
                <Line
                  type="monotone"
                  dataKey="runningCumulativeAverage"
                  name="Acumulado progresivo"
                  stroke="#0d9488"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  connectNulls
                  dot={{ r: 3, fill: '#0d9488', stroke: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 5, fill: '#0f766e', stroke: '#ccfbf1', strokeWidth: 2 }}
                />
              )}

              {/* Curva principal: Promedio Anual de 1° a 6° Año */}
              <Line
                type="monotone"
                dataKey="annualAverage"
                name="Promedio Anual"
                stroke="#0284c7"
                strokeWidth={3}
                connectNulls
                dot={renderAnnualDot}
                activeDot={renderActiveDot}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 bg-white/75 rounded-xl border border-dashed border-sky-200 text-slate-500">
            <Award size={28} className="text-sky-300 mb-2" />
            <p className="text-xs font-extrabold text-slate-700">
              Sin promedios anuales computables todavía
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 max-w-sm">
              Cargue calificaciones finales por año lectivo (1.º a 6.º Año) para visualizar la curva
              histórica de evolución académica.
            </p>
          </div>
        )}
      </div>

      {/* Leyenda clara y accesible */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-sky-100/90 text-[11px] text-slate-600">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
            Promedio anual definitivo
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            Promedio anual parcial
          </span>
          {showRunningCumulative && pointsWithAverage.length >= 2 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-teal-600 inline-block" />
              Acumulado progresivo
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed border-emerald-600 inline-block" />
            Mínimo aprobación ({passingGrade})
          </span>
        </div>
        <span className="text-[10px] text-slate-500 tabular-nums">
          Escala 1–10 · {schoolInfo?.name || 'Trayectoria Escolar'}
        </span>
      </div>
    </div>
  );
};
