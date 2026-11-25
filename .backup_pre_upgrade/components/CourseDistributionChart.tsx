import React, { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Student, CourseYear } from '../types';
import { Users, GraduationCap, BookOpen, ChevronRight, Award, TrendingUp } from 'lucide-react';

interface CourseDistributionChartProps {
  students: Student[];
  onNavigateToCourse?: (course: CourseYear) => void;
  onLoadSampleData?: () => void;
}

interface CourseStat {
  course: CourseYear;
  name: string;
  shortName: string;
  cycle: 'Ciclo Básico' | 'Ciclo Orientado';
  value: number;
  percentage: number;
  color: string;
  borderColor: string;
  bgLight: string;
}

const COURSE_CONFIG: Record<
  CourseYear,
  {
    name: string;
    shortName: string;
    cycle: 'Ciclo Básico' | 'Ciclo Orientado';
    color: string;
    borderColor: string;
    bgLight: string;
  }
> = {
  '1': {
    name: '1° Año - Ciclo Básico',
    shortName: '1° Año',
    cycle: 'Ciclo Básico',
    color: '#2563EB', // Blue-600
    borderColor: '#93C5FD',
    bgLight: 'bg-blue-50',
  },
  '2': {
    name: '2° Año - Ciclo Básico',
    shortName: '2° Año',
    cycle: 'Ciclo Básico',
    color: '#0284C7', // Sky-600
    borderColor: '#7DD3FC',
    bgLight: 'bg-sky-50',
  },
  '3': {
    name: '3° Año - Ciclo Básico',
    shortName: '3° Año',
    cycle: 'Ciclo Básico',
    color: '#0D9488', // Teal-600
    borderColor: '#5EEAD4',
    bgLight: 'bg-teal-50',
  },
  '4': {
    name: '4° Año - Orientado (Agro)',
    shortName: '4° Año',
    cycle: 'Ciclo Orientado',
    color: '#16A34A', // Green-600
    borderColor: '#86EFAC',
    bgLight: 'bg-green-50',
  },
  '5': {
    name: '5° Año - Orientado (Agro)',
    shortName: '5° Año',
    cycle: 'Ciclo Orientado',
    color: '#D97706', // Amber-600
    borderColor: '#FCD34D',
    bgLight: 'bg-amber-50',
  },
  '6': {
    name: '6° Año - Promoción / Egresados',
    shortName: '6° Año',
    cycle: 'Ciclo Orientado',
    color: '#9333EA', // Purple-600
    borderColor: '#D8B4FE',
    bgLight: 'bg-purple-50',
  },
};

export const CourseDistributionChart: React.FC<CourseDistributionChartProps> = ({
  students,
  onNavigateToCourse,
  onLoadSampleData,
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const totalStudents = students.length;

  // Aggregate student count per course year
  const courseData: CourseStat[] = useMemo(() => {
    const counts: Record<CourseYear, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
      '6': 0,
    };

    students.forEach((s) => {
      if (counts[s.course] !== undefined) {
        counts[s.course]++;
      }
    });

    return (['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((course) => {
      const cfg = COURSE_CONFIG[course];
      const count = counts[course];
      const percentage = totalStudents > 0 ? (count / totalStudents) * 100 : 0;

      return {
        course,
        name: cfg.name,
        shortName: cfg.shortName,
        cycle: cfg.cycle,
        value: count,
        percentage: Number(percentage.toFixed(1)),
        color: cfg.color,
        borderColor: cfg.borderColor,
        bgLight: cfg.bgLight,
      };
    });
  }, [students, totalStudents]);

  // Secondary metrics
  const cicloBasicoCount = useMemo(
    () => courseData.filter((c) => c.cycle === 'Ciclo Básico').reduce((sum, c) => sum + c.value, 0),
    [courseData]
  );

  const cicloOrientadoCount = useMemo(
    () => courseData.filter((c) => c.cycle === 'Ciclo Orientado').reduce((sum, c) => sum + c.value, 0),
    [courseData]
  );

  const mostPopulatedCourse = useMemo(() => {
    if (totalStudents === 0) return null;
    return [...courseData].sort((a, b) => b.value - a.value)[0];
  }, [courseData, totalStudents]);

  // Course currently hovered or default total
  const activeCourse = activeIndex !== null ? courseData[activeIndex] : null;

  return (
    <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-xl border border-gray-100 transition-all">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shadow-inner">
            <Users size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                Distribución de Alumnos por Año Lectivo
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Gráfico de Anillos
              </span>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              Población estudiantil segmentada por curso (1° a 6° año de secundaria)
            </p>
          </div>
        </div>

        {/* Quick summary pill badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <span>Ciclo Básico (1°-3°): <strong>{cicloBasicoCount}</strong></span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-100 text-amber-900 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
            <span>Ciclo Orientado (4°-6°): <strong>{cicloOrientadoCount}</strong></span>
          </div>
        </div>
      </div>

      {totalStudents === 0 ? (
        /* Empty State */
        <div className="py-16 px-6 text-center flex flex-col items-center justify-center max-w-md mx-auto">
          <div className="w-20 h-20 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-4">
            <GraduationCap size={40} />
          </div>
          <h4 className="text-lg font-bold text-gray-700 mb-2">No hay alumnos registrados</h4>
          <p className="text-sm text-gray-500 mb-6">
            Para visualizar el gráfico de anillos y la distribución por año lectivo, ingrese alumnos o cargue los datos de muestra institucionales.
          </p>
          {onLoadSampleData && (
            <button
              onClick={onLoadSampleData}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-md transition-all active:scale-95"
            >
              Cargar Alumnos de Muestra
            </button>
          )}
        </div>
      ) : (
        /* Content with Donut Chart and Breakdown */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-6">
          {/* Donut Chart Ring Column (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <div className="relative w-full max-w-[320px] aspect-square flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as CourseStat;
                        return (
                          <div className="bg-gray-900 text-white p-3.5 rounded-2xl shadow-2xl text-xs space-y-1 min-w-[170px] border border-gray-700 animate-in fade-in zoom-in-95 duration-150">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: data.color }}
                              />
                              <span className="font-bold text-sm">{data.shortName}</span>
                            </div>
                            <p className="text-gray-300 text-[11px] font-medium">{data.cycle}</p>
                            <div className="pt-1.5 border-t border-gray-800 flex justify-between items-baseline">
                              <span className="text-gray-400">Matrícula:</span>
                              <span className="font-extrabold text-white text-sm">
                                {data.value} {data.value === 1 ? 'alumno' : 'alumnos'}
                              </span>
                            </div>
                            <div className="flex justify-between items-baseline">
                              <span className="text-gray-400">Porcentaje:</span>
                              <span className="font-black text-yellow-400 text-sm">
                                {data.percentage}%
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Pie
                    data={courseData}
                    cx="50%"
                    cy="50%"
                    innerRadius="65%"
                    outerRadius="88%"
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="shortName"
                    cornerRadius={6}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={(entry: any) => {
                      const course = entry?.course || entry?.payload?.course;
                      if (onNavigateToCourse && course) {
                        onNavigateToCourse(course);
                      }
                    }}
                    cursor="pointer"
                  >
                    {courseData.map((entry, index) => {
                      const isHovered = activeIndex === index;
                      return (
                        <Cell
                          key={`course-cell-${entry.course}`}
                          fill={entry.color}
                          stroke={isHovered ? '#1E293B' : '#FFFFFF'}
                          strokeWidth={isHovered ? 3 : 2}
                          style={{
                            transition: 'all 0.3s ease',
                            transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                            transformOrigin: 'center center',
                            filter: isHovered
                              ? 'drop-shadow(0px 8px 16px rgba(0,0,0,0.2))'
                              : 'drop-shadow(0px 2px 4px rgba(0,0,0,0.05))',
                          }}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut Label */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center select-none"
                style={{ zIndex: 1 }}
              >
                {activeCourse ? (
                  <div className="animate-in fade-in zoom-in duration-200">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
                      {activeCourse.shortName}
                    </span>
                    <span
                      className="text-3xl md:text-4xl font-black block"
                      style={{ color: activeCourse.color }}
                    >
                      {activeCourse.value}
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      {activeCourse.percentage}% del total
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 block">
                      Total
                    </span>
                    <span className="text-3xl md:text-4xl font-black text-gray-800 block">
                      {totalStudents}
                    </span>
                    <span className="text-xs font-semibold text-gray-500 block">
                      Alumnos
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-2 text-center font-medium italic">
              Pase el cursor sobre los sectores del anillo para inspeccionar cada curso
            </p>
          </div>

          {/* Breakdown Table & Progress Bars (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase text-gray-400 tracking-wider px-2">
              <span>Curso / Espacio Curricular</span>
              <span>Distribución Relativa</span>
              <span className="text-right">Cantidad</span>
            </div>

            <div className="space-y-2.5">
              {courseData.map((item, index) => {
                const isHovered = activeIndex === index;
                return (
                  <div
                    key={item.course}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onClick={() => onNavigateToCourse && onNavigateToCourse(item.course)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isHovered
                        ? 'border-blue-500 shadow-md bg-blue-50/40 translate-x-1'
                        : 'border-gray-100 hover:border-gray-200 bg-gray-50/50 hover:bg-gray-50'
                    }`}
                  >
                    {/* Left: Indicator & Name */}
                    <div className="flex items-center gap-3 min-w-[150px]">
                      <div
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 transition-transform"
                        style={{
                          backgroundColor: item.color,
                          transform: isHovered ? 'scale(1.25)' : 'scale(1)',
                        }}
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-gray-800">
                            {item.shortName}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">
                            ({item.cycle === 'Ciclo Básico' ? 'CBC' : 'Orientado'})
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-500 font-medium block">
                          {item.value} {item.value === 1 ? 'alumno' : 'alumnos'}
                        </span>
                      </div>
                    </div>

                    {/* Middle: Progress Bar */}
                    <div className="flex-1 max-w-xs hidden sm:block">
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-2.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>

                    {/* Right: Percentage & Button */}
                    <div className="flex items-center gap-3 text-right">
                      <div className="w-14">
                        <span className="text-sm font-black text-gray-800">
                          {item.percentage}%
                        </span>
                      </div>
                      {onNavigateToCourse && (
                        <button
                          type="button"
                          className="hidden md:flex items-center justify-center p-1.5 text-gray-400 hover:text-blue-700 hover:bg-white rounded-lg transition-colors"
                          title={`Ver alumnos de ${item.shortName}`}
                        >
                          <ChevronRight size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Highlights & Insights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
              <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-blue-900 uppercase tracking-wider">
                    Mayor Matrícula
                  </p>
                  <p className="text-sm font-black text-blue-950">
                    {mostPopulatedCourse ? (
                      <>
                        {mostPopulatedCourse.shortName} ({mostPopulatedCourse.value} alumnos -{' '}
                        {mostPopulatedCourse.percentage}%)
                      </>
                    ) : (
                      'Sin datos'
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
                  <Award size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">
                    Ciclo Lectivo
                  </p>
                  <p className="text-sm font-black text-purple-950">
                    6 Divisiones Académicas Activas
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
