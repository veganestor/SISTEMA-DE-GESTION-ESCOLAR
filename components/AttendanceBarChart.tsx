import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Student, CourseYear, SchoolInfo } from '../types';
import { CheckCircle2, AlertTriangle, CalendarCheck2, TrendingUp, Award, ChevronRight, BarChart3, Filter } from 'lucide-react';

interface AttendanceBarChartProps {
  students: Student[];
  schoolInfo?: SchoolInfo;
  onNavigateToCourse?: (course: CourseYear) => void;
  onNavigateToAttendance?: () => void;
}

interface CourseAttendanceStat {
  course: CourseYear;
  name: string;
  fullName: string;
  cycle: 'Ciclo Básico' | 'Ciclo Orientado';
  studentsCount: number;
  totalRecords: number;
  presentCount: number;
  tardeCount: number;
  ausenteCount: number;
  attendanceRate: number; // e.g. 91.5
  purePresentRate: number;
  color: string;
  barColor: string;
  status: 'excelente' | 'regular' | 'alerta';
}

const COURSE_META: Record<CourseYear, { name: string; fullName: string; cycle: 'Ciclo Básico' | 'Ciclo Orientado'; baseColor: string }> = {
  '1': { name: '1° Año', fullName: '1° Año - Ciclo Básico', cycle: 'Ciclo Básico', baseColor: '#2563EB' },
  '2': { name: '2° Año', fullName: '2° Año - Ciclo Básico', cycle: 'Ciclo Básico', baseColor: '#0284C7' },
  '3': { name: '3° Año', fullName: '3° Año - Ciclo Básico', cycle: 'Ciclo Básico', baseColor: '#0D9488' },
  '4': { name: '4° Año', fullName: '4° Año - Orientado', cycle: 'Ciclo Orientado', baseColor: '#16A34A' },
  '5': { name: '5° Año', fullName: '5° Año - Orientado', cycle: 'Ciclo Orientado', baseColor: '#D97706' },
  '6': { name: '6° Año', fullName: '6° Año - Promoción', cycle: 'Ciclo Orientado', baseColor: '#9333EA' },
};

export const AttendanceBarChart: React.FC<AttendanceBarChartProps> = ({
  students,
  schoolInfo,
  onNavigateToCourse,
  onNavigateToAttendance,
}) => {
  const [filterCycle, setFilterCycle] = useState<'all' | 'basico' | 'orientado'>('all');
  const [hoveredCourse, setHoveredCourse] = useState<CourseYear | null>(null);

  // Compute attendance stats per course
  const attendanceStats: CourseAttendanceStat[] = useMemo(() => {
    return (['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((course) => {
      const meta = COURSE_META[course];
      const courseStudents = students.filter((s) => s.course === course);

      let totalRecords = 0;
      let presentCount = 0;
      let tardeCount = 0;
      let ausenteCount = 0;

      courseStudents.forEach((st) => {
        if (Array.isArray(st.attendance)) {
          st.attendance.forEach((att) => {
            totalRecords++;
            if (att.type === 'presente') presentCount++;
            else if (att.type === 'tarde') tardeCount++;
            else if (att.type === 'ausente') ausenteCount++;
          });
        }
      });

      // Cálculo de porcentaje de asistencia (tardes computan con factor 0.5 conforme a normativa escolar)
      const effectivePresent = presentCount + tardeCount * 0.5;
      const attendanceRate = totalRecords > 0 ? Number(((effectivePresent / totalRecords) * 100).toFixed(1)) : 0;
      const purePresentRate = totalRecords > 0 ? Number(((presentCount / totalRecords) * 100).toFixed(1)) : 0;

      let status: 'excelente' | 'regular' | 'alerta' = 'regular';
      let barColor = meta.baseColor;

      if (totalRecords > 0) {
        if (attendanceRate >= 90) {
          status = 'excelente';
        } else if (attendanceRate >= 80) {
          status = 'regular';
        } else {
          status = 'alerta';
          barColor = '#DC2626'; // Red for alert status
        }
      }

      return {
        course,
        name: meta.name,
        fullName: meta.fullName,
        cycle: meta.cycle,
        studentsCount: courseStudents.length,
        totalRecords,
        presentCount,
        tardeCount,
        ausenteCount,
        attendanceRate,
        purePresentRate,
        color: meta.baseColor,
        barColor,
        status,
      };
    });
  }, [students]);

  // Filtered dataset for rendering
  const filteredData = useMemo(() => {
    if (filterCycle === 'basico') {
      return attendanceStats.filter((c) => c.cycle === 'Ciclo Básico');
    }
    if (filterCycle === 'orientado') {
      return attendanceStats.filter((c) => c.cycle === 'Ciclo Orientado');
    }
    return attendanceStats;
  }, [attendanceStats, filterCycle]);

  // Overall school attendance percentage
  const overallMetrics = useMemo(() => {
    let totalAllRecords = 0;
    let totalAllPresent = 0;
    let totalAllTardes = 0;
    let totalAllAusentes = 0;

    attendanceStats.forEach((c) => {
      totalAllRecords += c.totalRecords;
      totalAllPresent += c.presentCount;
      totalAllTardes += c.tardeCount;
      totalAllAusentes += c.ausenteCount;
    });

    const institutionalRate =
      totalAllRecords > 0
        ? Number((((totalAllPresent + totalAllTardes * 0.5) / totalAllRecords) * 100).toFixed(1))
        : 0;

    const recordedCourses = attendanceStats.filter((c) => c.totalRecords > 0);
    const bestCourse =
      recordedCourses.length > 0
        ? [...recordedCourses].sort((a, b) => b.attendanceRate - a.attendanceRate)[0]
        : null;

    const lowestCourse =
      recordedCourses.length > 0
        ? [...recordedCourses].sort((a, b) => a.attendanceRate - b.attendanceRate)[0]
        : null;

    return {
      institutionalRate,
      totalAllRecords,
      bestCourse,
      lowestCourse,
    };
  }, [attendanceStats]);

  const hasAnyRecords = overallMetrics.totalAllRecords > 0;

  return (
    <div className="aero-glass rounded-[30px] p-6 md:p-8 shadow-lg border border-white/90 transition-all">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black shadow-inner">
            <BarChart3 size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                Comparativa de Asistencia Promedio
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Gráfico de Barras
              </span>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              Porcentaje de presentismo medio acumulado por cada año lectivo (1° a 6° año)
            </p>
          </div>
        </div>

        {/* Cycle filter buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-2xl self-start lg:self-center">
          <button
            onClick={() => setFilterCycle('all')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterCycle === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Todos los Cursos
          </button>
          <button
            onClick={() => setFilterCycle('basico')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterCycle === 'basico'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Ciclo Básico (1°-3°)
          </button>
          <button
            onClick={() => setFilterCycle('orientado')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
              filterCycle === 'orientado'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Ciclo Orientado (4°-6°)
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 pb-2">
        <div className="bg-gradient-to-br from-emerald-50 to-green-50/50 p-4 rounded-2xl border border-emerald-100 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Promedio Institucional
            </span>
            <CalendarCheck2 size={16} className="text-emerald-600" />
          </div>
          <p className="text-3xl font-black text-emerald-950">
            {overallMetrics.institutionalRate}%
          </p>
          <p className="text-xs text-emerald-700 font-medium mt-0.5">
            Meta institucional: &ge;80%
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-sky-50/50 p-4 rounded-2xl border border-blue-100 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
              Mayor Asistencia
            </span>
            <Award size={16} className="text-blue-600" />
          </div>
          <p className="text-3xl font-black text-blue-950">
            {overallMetrics.bestCourse ? `${overallMetrics.bestCourse.attendanceRate}%` : 'N/A'}
          </p>
          <p className="text-xs text-blue-700 font-medium mt-0.5">
            {overallMetrics.bestCourse ? overallMetrics.bestCourse.fullName : 'Sin registros'}
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 rounded-2xl border border-amber-100 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
              Menor Asistencia
            </span>
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <p className="text-3xl font-black text-amber-950">
            {overallMetrics.lowestCourse ? `${overallMetrics.lowestCourse.attendanceRate}%` : 'N/A'}
          </p>
          <p className="text-xs text-amber-700 font-medium mt-0.5">
            {overallMetrics.lowestCourse ? overallMetrics.lowestCourse.fullName : 'Sin registros'}
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 p-4 rounded-2xl border border-purple-100 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
              Jornadas Evaluadas
            </span>
            <TrendingUp size={16} className="text-purple-600" />
          </div>
          <p className="text-3xl font-black text-purple-950">
            {overallMetrics.totalAllRecords}
          </p>
          <p className="text-xs text-purple-700 font-medium mt-0.5">
            Registros totales computados
          </p>
        </div>
      </div>

      {!hasAnyRecords ? (
        /* Empty State */
        <div className="py-16 px-6 text-center flex flex-col items-center justify-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-4">
            <BarChart3 size={32} />
          </div>
          <h4 className="text-base font-bold text-gray-700 mb-1">Sin registros de asistencia</h4>
          <p className="text-xs text-gray-500 mb-5">
            No se han registrado asistencias en los cursos activos aún. Registre alumnos e ingrese asistencias manualmente o con código QR.
          </p>
          {onNavigateToAttendance && (
            <button
              type="button"
              onClick={onNavigateToAttendance}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-md transition-all active:scale-95"
            >
              Ir a Control de Asistencia
            </button>
          )}
        </div>
      ) : (
        /* Recharts Bar Chart */
        <div className="pt-6 space-y-6">
          <div className="w-full h-80 relative">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredData}
                margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
                barSize={44}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#475569', fontSize: 13, fontWeight: 700 }}
                  dy={10}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#64748B', fontSize: 12, fontWeight: 600 }}
                  tickFormatter={(val) => `${val}%`}
                  width={45}
                />
                <ReferenceLine
                  y={80}
                  stroke="#E11D48"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: 'Mínimo Regularidad (80%)',
                    position: 'top',
                    fill: '#E11D48',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(241, 245, 249, 0.6)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as CourseAttendanceStat;
                      return (
                        <div className="bg-gray-900 text-white p-4 rounded-2xl shadow-2xl text-xs space-y-2 min-w-[210px] border border-gray-700 animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                            <span className="font-extrabold text-sm">{data.fullName}</span>
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: `${data.color}33`,
                                color: data.color,
                              }}
                            >
                              {data.cycle === 'Ciclo Básico' ? 'CBC' : 'Orientado'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-gray-400 font-medium">Asistencia Promedio:</span>
                            <span
                              className="text-base font-black"
                              style={{ color: data.attendanceRate >= 80 ? '#4ADE80' : '#F87171' }}
                            >
                              {data.attendanceRate}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-800 text-center">
                            <div className="bg-gray-800/80 p-2 rounded-xl">
                              <span className="block text-[10px] text-gray-400 font-semibold">
                                Presentes
                              </span>
                              <span className="font-black text-emerald-400 text-sm">
                                {data.presentCount}
                              </span>
                            </div>
                            <div className="bg-gray-800/80 p-2 rounded-xl">
                              <span className="block text-[10px] text-gray-400 font-semibold">
                                Tardes
                              </span>
                              <span className="font-black text-amber-400 text-sm">
                                {data.tardeCount}
                              </span>
                            </div>
                            <div className="bg-gray-800/80 p-2 rounded-xl">
                              <span className="block text-[10px] text-gray-400 font-semibold">
                                Ausentes
                              </span>
                              <span className="font-black text-rose-400 text-sm">
                                {data.ausenteCount}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-1 text-gray-400">
                            <span>Total Evaluado:</span>
                            <span className="font-bold text-white">
                              {data.totalRecords} registros
                            </span>
                          </div>

                          <p className="text-[10px] text-gray-400 italic text-center pt-1">
                            Haz clic en la barra para ver alumnos del curso
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="attendanceRate"
                  radius={[10, 10, 4, 4]}
                  onMouseEnter={(_, index) => {
                    const item = filteredData[index];
                    if (item) setHoveredCourse(item.course);
                  }}
                  onMouseLeave={() => setHoveredCourse(null)}
                  onClick={(entry: any) => {
                    const course = entry?.course || entry?.payload?.course;
                    if (onNavigateToCourse && course) {
                      onNavigateToCourse(course);
                    }
                  }}
                  cursor="pointer"
                >
                  {filteredData.map((entry) => {
                    const isHovered = hoveredCourse === entry.course;
                    return (
                      <Cell
                        key={`bar-${entry.course}`}
                        fill={entry.barColor}
                        opacity={hoveredCourse && !isHovered ? 0.6 : 1}
                        style={{
                          transition: 'all 0.3s ease',
                          filter: isHovered
                            ? 'drop-shadow(0px 8px 16px rgba(0,0,0,0.25))'
                            : 'none',
                        }}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cards & Badges Table below the chart */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {filteredData.map((c) => {
              const isHovered = hoveredCourse === c.course;
              return (
                <div
                  key={c.course}
                  onMouseEnter={() => setHoveredCourse(c.course)}
                  onMouseLeave={() => setHoveredCourse(null)}
                  onClick={() => onNavigateToCourse && onNavigateToCourse(c.course)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isHovered
                      ? 'border-blue-600 shadow-md bg-blue-50/50 -translate-y-1'
                      : 'border-gray-100 hover:border-gray-200 bg-gray-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-gray-800">{c.name}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                  </div>
                  <div className="my-2">
                    <span
                      className="text-2xl font-black block"
                      style={{ color: c.attendanceRate >= 80 ? '#1E293B' : '#DC2626' }}
                    >
                      {c.attendanceRate}%
                    </span>
                    <span className="text-[11px] font-semibold text-gray-400 block">
                      {c.presentCount} de {c.totalRecords} pres.
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        c.attendanceRate >= 90
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.attendanceRate >= 80
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {c.attendanceRate >= 90
                        ? 'Excelente'
                        : c.attendanceRate >= 80
                        ? 'Regular'
                        : 'En Alerta'}
                    </span>
                    <ChevronRight size={14} className="text-gray-400" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Institutional note */}
          <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/80 text-xs text-gray-600 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              <span>
                <strong>Criterio de Evaluación:</strong> La regularidad escolar según el régimen provincial requiere al menos un <strong>80%</strong> de asistencia efectiva anual. Las llegadas tarde computan con media falta (0.5).
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Ciclo Lectivo {schoolInfo?.academicYear || new Date().getFullYear()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
