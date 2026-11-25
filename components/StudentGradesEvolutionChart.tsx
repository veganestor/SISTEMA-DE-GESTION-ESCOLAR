import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Student, SUBJECTS_BY_YEAR, SchoolInfo } from '../types';
import { TrendingUp, TrendingDown, Minus, LineChart as ChartIcon, CheckCircle2, AlertTriangle, Layers, BookOpen, Sparkles } from 'lucide-react';

interface StudentGradesEvolutionChartProps {
  student: Student;
  schoolInfo?: SchoolInfo;
}

// Paleta de colores distintivos para las materias
const SUBJECT_COLORS = [
  '#2563EB', // Blue 600
  '#7C3AED', // Violet 600
  '#059669', // Emerald 600
  '#D97706', // Amber 600
  '#DC2626', // Red 600
  '#0891B2', // Cyan 600
  '#DB2777', // Pink 600
  '#4F46E5', // Indigo 600
  '#65A30D', // Lime 600
  '#EA580C', // Orange 600
  '#9333EA', // Purple 600
  '#475569', // Slate 600
];

export const StudentGradesEvolutionChart: React.FC<StudentGradesEvolutionChartProps> = ({
  student,
  schoolInfo,
}) => {
  const subjects = useMemo(() => SUBJECTS_BY_YEAR[student.course] || [], [student.course]);

  // Modos de visualización: 'promedio' (evolución del promedio general), 'materia' (una materia específica), 'comparativo' (todas las materias)
  const [viewMode, setViewMode] = useState<'promedio' | 'materia' | 'comparativo'>('promedio');
  const [selectedSubject, setSelectedSubject] = useState<string>(subjects[0] || '');

  useEffect(() => {
    if (subjects.length > 0 && !subjects.includes(selectedSubject)) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  // Cálculo de promedios trimestrales generales
  const trimesterAverages = useMemo(() => {
    let sumT1 = 0, countT1 = 0;
    let sumT2 = 0, countT2 = 0;
    let sumT3 = 0, countT3 = 0;
    let sumFn = 0, countFn = 0;

    subjects.forEach((subj) => {
      const g = student.grades?.[subj];
      if (g) {
        if (typeof g.trimestre1 === 'number' && !isNaN(g.trimestre1)) {
          sumT1 += g.trimestre1;
          countT1++;
        }
        if (typeof g.trimestre2 === 'number' && !isNaN(g.trimestre2)) {
          sumT2 += g.trimestre2;
          countT2++;
        }
        if (typeof g.trimestre3 === 'number' && !isNaN(g.trimestre3)) {
          sumT3 += g.trimestre3;
          countT3++;
        }
        if (typeof g.final === 'number' && !isNaN(g.final)) {
          sumFn += g.final;
          countFn++;
        }
      }
    });

    const avgT1 = countT1 > 0 ? Number((sumT1 / countT1).toFixed(2)) : null;
    const avgT2 = countT2 > 0 ? Number((sumT2 / countT2).toFixed(2)) : null;
    const avgT3 = countT3 > 0 ? Number((sumT3 / countT3).toFixed(2)) : null;
    const avgFn = countFn > 0 ? Number((sumFn / countFn).toFixed(2)) : null;

    return { avgT1, avgT2, avgT3, avgFn, countT1, countT2, countT3, countFn };
  }, [student.grades, subjects]);

  // Tendencia de evolución entre 1° y último trimestre con datos
  const trendInfo = useMemo(() => {
    const { avgT1, avgT2, avgT3, avgFn } = trimesterAverages;
    const firstVal = avgT1;
    const lastVal = avgT3 ?? avgT2 ?? avgT1;

    if (firstVal === null || lastVal === null || firstVal === lastVal) {
      return { diff: 0, text: 'Rendimiento estable', icon: <Minus size={15} className="text-slate-500" />, color: 'text-slate-600 bg-slate-50 border-slate-200' };
    }

    const diff = Number((lastVal - firstVal).toFixed(2));
    if (diff > 0) {
      return {
        diff,
        text: `En alza (+${diff} pts)`,
        icon: <TrendingUp size={15} className="text-emerald-600" />,
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      };
    } else {
      return {
        diff,
        text: `En descenso (${diff} pts)`,
        icon: <TrendingDown size={15} className="text-rose-600" />,
        color: 'text-rose-700 bg-rose-50 border-rose-200',
      };
    }
  }, [trimesterAverages]);

  // Datos para el gráfico según el modo de vista
  const chartData = useMemo(() => {
    const labels = [
      { key: 'trimestre1', name: '1° Trimestre', short: '1° Trim' },
      { key: 'trimestre2', name: '2° Trimestre', short: '2° Trim' },
      { key: 'trimestre3', name: '3° Trimestre', short: '3° Trim' },
      { key: 'final', name: 'Nota Final', short: 'Final' },
    ];

    if (viewMode === 'promedio') {
      const { avgT1, avgT2, avgT3, avgFn } = trimesterAverages;
      return [
        { name: '1° Trimestre', corto: '1° Trim', promedio: avgT1 },
        { name: '2° Trimestre', corto: '2° Trim', promedio: avgT2 },
        { name: '3° Trimestre', corto: '3° Trim', promedio: avgT3 },
        { name: 'Nota Final', corto: 'Final', promedio: avgFn },
      ];
    }

    if (viewMode === 'materia') {
      const g = student.grades?.[selectedSubject] || {};
      return [
        { name: '1° Trimestre', corto: '1° Trim', calificacion: g.trimestre1 ?? null },
        { name: '2° Trimestre', corto: '2° Trim', calificacion: g.trimestre2 ?? null },
        { name: '3° Trimestre', corto: '3° Trim', calificacion: g.trimestre3 ?? null },
        { name: 'Nota Final', corto: 'Final', calificacion: g.final ?? null },
      ];
    }

    // Modo comparativo: todas las materias en cada columna de trimestre
    return labels.map((period) => {
      const row: Record<string, any> = {
        name: period.name,
        corto: period.short,
      };

      subjects.forEach((subj) => {
        const gradeObj = student.grades?.[subj];
        const val = gradeObj ? (gradeObj as any)[period.key] : null;
        row[subj] = typeof val === 'number' && !isNaN(val) ? val : null;
      });

      return row;
    });
  }, [viewMode, selectedSubject, trimesterAverages, student.grades, subjects]);

  // Total de materias aprobadas en nota final o en curso
  const subjectsWithGrades = useMemo(() => {
    return subjects.filter((s) => {
      const g = student.grades?.[s];
      return g && (g.trimestre1 !== undefined || g.trimestre2 !== undefined || g.trimestre3 !== undefined || g.final !== undefined);
    });
  }, [subjects, student.grades]);

  const hasAnyData = subjectsWithGrades.length > 0;

  return (
    <div className="aero-glass border border-white/90 rounded-3xl p-5 sm:p-7 shadow-md space-y-6">
      {/* Header del Gráfico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center font-black shrink-0">
              <ChartIcon size={20} />
            </div>
            <h4 className="text-xl font-black text-slate-800 tracking-tight">
              Evolución Trimestral de Calificaciones
            </h4>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Seguimiento de la trayectoria pedagógica y desempeño a lo largo de los trimestres del ciclo lectivo.
          </p>
        </div>

        {/* Badge de tendencia y selectores de modo */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          <span className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 ${trendInfo.color}`}>
            {trendInfo.icon}
            <span>{trendInfo.text}</span>
          </span>

          <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('promedio')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'promedio'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Promedio General
            </button>
            <button
              type="button"
              onClick={() => setViewMode('materia')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'materia'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Materia
            </button>
            <button
              type="button"
              onClick={() => setViewMode('comparativo')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'comparativo'
                  ? 'bg-blue-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Comparativo
            </button>
          </div>
        </div>
      </div>

      {/* Selector de materia en caso de modo individual */}
      {viewMode === 'materia' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <BookOpen size={16} className="text-blue-600" />
            <span>Seleccionar Espacio Curricular:</span>
          </div>
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          >
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tarjetas resumen métrico de promedios */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-2xl bg-blue-50/50 border border-blue-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">1° Trimestre</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-blue-900">
              {trimesterAverages.avgT1 !== null ? trimesterAverages.avgT1 : '-'}
            </span>
            <span className="text-[10px] text-blue-600 font-bold">/10</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            {trimesterAverages.countT1} materias calificadas
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">2° Trimestre</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-indigo-900">
              {trimesterAverages.avgT2 !== null ? trimesterAverages.avgT2 : '-'}
            </span>
            <span className="text-[10px] text-indigo-600 font-bold">/10</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            {trimesterAverages.countT2} materias calificadas
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">3° Trimestre</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-purple-900">
              {trimesterAverages.avgT3 !== null ? trimesterAverages.avgT3 : '-'}
            </span>
            <span className="text-[10px] text-purple-600 font-bold">/10</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1">
            {trimesterAverages.countT3} materias calificadas
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">Promedio Final</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-emerald-900">
              {trimesterAverages.avgFn !== null ? trimesterAverages.avgFn : '-'}
            </span>
            <span className="text-[10px] text-emerald-700 font-bold">/10</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
            {trimesterAverages.avgFn !== null && trimesterAverages.avgFn >= 6 ? (
              <>
                <CheckCircle2 size={11} /> Promovible
              </>
            ) : trimesterAverages.avgFn !== null ? (
              <>
                <AlertTriangle size={11} className="text-rose-500" /> A Coloquio
              </>
            ) : (
              'En curso'
            )}
          </span>
        </div>
      </div>

      {/* Gráfico de Líneas con Recharts */}
      <div className="h-72 sm:h-80 w-full pt-2">
        {hasAnyData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 15, right: 20, left: -20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 text-xs space-y-1.5 max-w-xs">
                        <p className="font-black text-amber-300 border-b border-slate-800 pb-1">{label}</p>
                        {payload.map((entry: any, index: number) => {
                          const val = entry.value;
                          if (val === null || val === undefined) return null;
                          const isApproved = val >= 6;
                          return (
                            <div key={`item-${index}`} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 font-bold truncate" style={{ color: entry.color }}>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="truncate">{entry.name}:</span>
                              </span>
                              <span className="font-black shrink-0 flex items-center gap-1">
                                <span>{val}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${isApproved ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                                  {isApproved ? 'Aprobado' : 'Aplazo'}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {/* Línea de referencia en nota 6 (Aprobación) */}
              <ReferenceLine
                y={6}
                stroke="#16a34a"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Aprobación (6)',
                  fill: '#16a34a',
                  fontSize: 10,
                  fontWeight: 'bold',
                  position: 'insideBottomRight',
                }}
              />

              {/* Renderizado de Líneas según el Modo de Vista */}
              {viewMode === 'promedio' && (
                <Line
                  type="monotone"
                  dataKey="promedio"
                  name="Promedio General"
                  stroke="#2563EB"
                  strokeWidth={3.5}
                  connectNulls
                  dot={{ r: 6, fill: '#2563EB', stroke: '#ffffff', strokeWidth: 2.5 }}
                  activeDot={{ r: 8, fill: '#1E3A8A', stroke: '#93C5FD', strokeWidth: 3 }}
                />
              )}

              {viewMode === 'materia' && (
                <Line
                  type="monotone"
                  dataKey="calificacion"
                  name={selectedSubject}
                  stroke="#7C3AED"
                  strokeWidth={3.5}
                  connectNulls
                  dot={{ r: 6, fill: '#7C3AED', stroke: '#ffffff', strokeWidth: 2.5 }}
                  activeDot={{ r: 8, fill: '#5B21B6', stroke: '#DDD6FE', strokeWidth: 3 }}
                />
              )}

              {viewMode === 'comparativo' &&
                subjects.map((subj, idx) => {
                  const color = SUBJECT_COLORS[idx % SUBJECT_COLORS.length];
                  return (
                    <Line
                      key={subj}
                      type="monotone"
                      dataKey={subj}
                      name={subj}
                      stroke={color}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3.5, fill: color }}
                      activeDot={{ r: 6 }}
                    />
                  );
                })}

              {viewMode === 'comparativo' && (
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  wrapperStyle={{
                    paddingTop: '16px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    maxHeight: '70px',
                    overflowY: 'auto',
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <ChartIcon size={32} className="opacity-30 mb-2" />
            <p className="text-xs font-bold uppercase tracking-wider">Sin calificaciones cargadas aún</p>
            <p className="text-[11px] text-slate-400 mt-1">Cargue notas en los trimestres para visualizar la curva de evolución.</p>
          </div>
        )}
      </div>

      {/* Pie descriptivo del gráfico */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-[11px] text-slate-500 font-medium">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
            Línea verde: Mínimo para aprobar (Nota 6)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
            Puntos: Promedio por trimestre
          </span>
        </div>
        <span className="text-slate-500 italic">
          Escala numérica vigente: 1 a 10 ({schoolInfo?.name || 'Institucional'})
        </span>
      </div>
    </div>
  );
};
