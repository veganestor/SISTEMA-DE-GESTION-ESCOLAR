import React, { useState, useMemo } from 'react';
import { Student, CourseYear } from '../types';
import { 
  AlertTriangle, ShieldAlert, FileDown, ExternalLink, 
  Search, Filter, CheckCircle2, User, ChevronRight,
  TrendingDown, Clock, XCircle
} from 'lucide-react';
import { generateStudentPDFReport } from '../services/utils';

interface EarlyWarningAlertsProps {
  students: Student[];
  onInspectStudent?: (student: Student) => void;
  onNavigateToCourse?: (course: CourseYear) => void;
}

interface AlertStudentItem {
  student: Student;
  totalRecords: number;
  presentes: number;
  tardes: number;
  ausentes: number;
  justificadas: number;
  effectiveAbsences: number; // ausentes + tardes * 0.5
  absenceRate: number; // % inasistencias
  attendanceRate: number; // % asistencia
  severity: 'critica' | 'moderada';
}

const COURSE_LABELS: Record<CourseYear, string> = {
  '1': '1° Año',
  '2': '2° Año',
  '3': '3° Año',
  '4': '4° Año',
  '5': '5° Año',
  '6': '6° Año',
};

export const EarlyWarningAlerts: React.FC<EarlyWarningAlertsProps> = ({
  students,
  onInspectStudent,
  onNavigateToCourse,
}) => {
  const [courseFilter, setCourseFilter] = useState<CourseYear | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Computar alumnos que superan el 20% de inasistencias acumuladas
  const alertStudents: AlertStudentItem[] = useMemo(() => {
    const list: AlertStudentItem[] = [];

    students.forEach((student) => {
      const records = Array.isArray(student.attendance) ? student.attendance : [];
      const totalRecords = records.length;

      // Solo evaluamos estudiantes con jornadas registradas
      if (totalRecords === 0) return;

      let presentes = 0;
      let tardes = 0;
      let ausentes = 0;
      let justificadas = 0;

      records.forEach((att) => {
        if (att.type === 'presente') presentes++;
        else if (att.type === 'tarde') tardes++;
        else if (att.type === 'ausente') {
          ausentes++;
          if (att.justified) justificadas++;
        }
      });

      // Cálculo de inasistencias efectivas: cada llegada tarde computa media inasistencia (0.5)
      const effectiveAbsences = ausentes + tardes * 0.5;
      const absenceRate = Number(((effectiveAbsences / totalRecords) * 100).toFixed(1));
      const attendanceRate = Number((((presentes + tardes * 0.5) / totalRecords) * 100).toFixed(1));

      // Umbral: más del 20% de inasistencias acumuladas
      if (absenceRate > 20.0) {
        list.push({
          student,
          totalRecords,
          presentes,
          tardes,
          ausentes,
          justificadas,
          effectiveAbsences,
          absenceRate,
          attendanceRate,
          severity: absenceRate >= 30.0 ? 'critica' : 'moderada',
        });
      }
    });

    // Ordenar de mayor a menor porcentaje de inasistencias
    return list.sort((a, b) => b.absenceRate - a.absenceRate);
  }, [students]);

  // Alumnos filtrados por búsqueda y curso
  const filteredAlerts = useMemo(() => {
    return alertStudents.filter((item) => {
      const matchesCourse = courseFilter === 'all' || item.student.course === courseFilter;
      const matchesSearch =
        item.student.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.student.dni.includes(searchTerm);
      return matchesCourse && matchesSearch;
    });
  }, [alertStudents, courseFilter, searchTerm]);

  // Métricas de resumen
  const cicloBasicoCount = useMemo(
    () => alertStudents.filter((a) => Number(a.student.course) <= 3).length,
    [alertStudents]
  );
  const cicloOrientadoCount = useMemo(
    () => alertStudents.filter((a) => Number(a.student.course) >= 4).length,
    [alertStudents]
  );
  const avgAbsenceRate = useMemo(() => {
    if (alertStudents.length === 0) return 0;
    const sum = alertStudents.reduce((acc, curr) => acc + curr.absenceRate, 0);
    return Number((sum / alertStudents.length).toFixed(1));
  }, [alertStudents]);

  return (
    <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-xl border border-rose-100 transition-all space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-rose-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center font-black shadow-inner relative">
            <ShieldAlert size={28} />
            {alertStudents.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 rounded-full border-2 border-white animate-pulse" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                Alerta Temprana de Asistencia
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
                Límite &gt; 20% Inasistencias
              </span>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              Estudiantes con riesgo pedagógico por superar el 20% de faltas (asistencia &lt; 80% requerida)
            </p>
          </div>
        </div>

        {/* Action Status Badge */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {alertStudents.length > 0 ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold">
              <AlertTriangle size={16} className="text-rose-600" />
              <span>{alertStudents.length} {alertStudents.length === 1 ? 'Alumno en Riesgo' : 'Alumnos en Riesgo'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>Sin Alertas Activas</span>
            </div>
          )}
        </div>
      </div>

      {alertStudents.length === 0 ? (
        /* Empty State: Sin alertas */
        <div className="py-12 px-6 text-center flex flex-col items-center justify-center max-w-lg mx-auto bg-emerald-50/40 rounded-3xl border border-emerald-100">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
            <CheckCircle2 size={36} />
          </div>
          <h4 className="text-lg font-black text-emerald-950 mb-1">
            ¡Excelente! Ningún alumno supera el 20% de inasistencias
          </h4>
          <p className="text-xs text-emerald-800 font-medium leading-relaxed max-w-sm">
            Todos los estudiantes matriculados que cuentan con asistencias registradas mantienen una regularidad igual o superior al 80% mínimo reglamentario.
          </p>
        </div>
      ) : (
        /* Active Alerts Container */
        <div className="space-y-6">
          {/* Key Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 block mb-1">
                Total en Riesgo
              </span>
              <p className="text-3xl font-black text-rose-950">{alertStudents.length}</p>
              <p className="text-xs text-rose-700 font-medium mt-0.5">
                Alumnos con &gt;20% inasistencias
              </p>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-1">
                Ciclo Básico (1°-3°)
              </span>
              <p className="text-3xl font-black text-amber-950">{cicloBasicoCount}</p>
              <p className="text-xs text-amber-700 font-medium mt-0.5">
                Alumnos en trayectorias iniciales
              </p>
            </div>

            <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-100">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800 block mb-1">
                Ciclo Orientado (4°-6°)
              </span>
              <p className="text-3xl font-black text-purple-950">{cicloOrientadoCount}</p>
              <p className="text-xs text-purple-700 font-medium mt-0.5">
                Alumnos en orientación técnica
              </p>
            </div>

            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600 block mb-1">
                Inasistencia Media
              </span>
              <p className="text-3xl font-black text-gray-900">{avgAbsenceRate}%</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Promedio del grupo en alerta
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Buscar por alumno o DNI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <span className="text-[10px] font-bold uppercase text-gray-400 mr-1 hidden md:inline">
                Filtrar Curso:
              </span>
              <button
                onClick={() => setCourseFilter('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  courseFilter === 'all'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todos ({alertStudents.length})
              </button>
              {(['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((yr) => {
                const count = alertStudents.filter((a) => a.student.course === yr).length;
                if (count === 0) return null;
                return (
                  <button
                    key={yr}
                    onClick={() => setCourseFilter(yr)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                      courseFilter === yr
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {yr}° Año ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alert Table */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-900 text-white uppercase text-[10px] font-black tracking-wider">
                  <tr>
                    <th className="p-4">Estudiante / DNI</th>
                    <th className="p-4">Curso</th>
                    <th className="p-4">Cómputo Inasistencias</th>
                    <th className="p-4">% Inasistencia / Regularidad</th>
                    <th className="p-4">Nivel de Riesgo</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAlerts.length > 0 ? (
                    filteredAlerts.map((item) => (
                      <tr
                        key={item.student.id}
                        className="hover:bg-rose-50/40 transition-colors group cursor-pointer"
                        onClick={() => onInspectStudent && onInspectStudent(item.student)}
                      >
                        {/* Student Name & DNI */}
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-black text-xs shrink-0">
                              {item.student.fullName.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-gray-900 group-hover:text-rose-700 transition-colors">
                                {item.student.fullName}
                              </p>
                              <p className="text-[11px] text-gray-500 font-medium">
                                DNI: {item.student.dni || 'Sin registrar'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Course */}
                        <td className="p-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-800">
                            {COURSE_LABELS[item.student.course]}
                          </span>
                        </td>

                        {/* Absences Breakdown */}
                        <td className="p-4">
                          <div className="space-y-0.5">
                            <span className="font-black text-rose-700 text-sm block">
                              {item.effectiveAbsences} faltas computadas
                            </span>
                            <span className="text-[11px] text-gray-500 block">
                              {item.ausentes} ausencias ({item.justificadas} just.) • {item.tardes} tardes
                            </span>
                            <span className="text-[10px] text-gray-400 block">
                              de {item.totalRecords} jornadas evaluadas
                            </span>
                          </div>
                        </td>

                        {/* Inasistencias % Progress Bar */}
                        <td className="p-4 min-w-[170px]">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-black text-rose-600">
                                {item.absenceRate}% Inasist.
                              </span>
                              <span className="text-[10px] font-bold text-gray-500">
                                ({item.attendanceRate}% Asist.)
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                              <div
                                className="h-2.5 rounded-full bg-rose-600 transition-all duration-500"
                                style={{ width: `${Math.min(100, item.absenceRate)}%` }}
                              />
                            </div>
                            <span className="text-[9px] font-semibold text-gray-400 block">
                              Exceso sobre el límite: +{(item.absenceRate - 20).toFixed(1)}%
                            </span>
                          </div>
                        </td>

                        {/* Severity Badge */}
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              item.severity === 'critica'
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                item.severity === 'critica' ? 'bg-red-600' : 'bg-amber-600'
                              }`}
                            />
                            {item.severity === 'critica' ? 'Riesgo Crítico' : 'Alerta Temprana'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right">
                          <div
                            className="flex items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => generateStudentPDFReport(item.student)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-bold text-xs transition-colors border border-rose-200"
                              title="Descargar informe oficial en PDF"
                            >
                              <FileDown size={14} />
                              <span className="hidden xl:inline">PDF</span>
                            </button>

                            {onInspectStudent && (
                              <button
                                type="button"
                                onClick={() => onInspectStudent(item.student)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95"
                                title="Abrir legajo y ficha del alumno"
                              >
                                <span>Ver Ficha</span>
                                <ChevronRight size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400 italic font-medium">
                        No se encontraron alumnos en alerta con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Intervention Protocol note */}
          <div className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 text-xs text-rose-900 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-600 shrink-0" />
              <span>
                <strong>Protocolo de Acompañamiento Escolar:</strong> Superar el 20% de inasistencias requiere intervención pedagógica inmediata, citación al tutor legal y notificación a Preceptoría para evitar la pérdida de regularidad.
              </span>
            </div>
            <span className="text-[10px] font-bold text-rose-700 uppercase tracking-widest shrink-0">
              Régimen Académico Tucumán
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
