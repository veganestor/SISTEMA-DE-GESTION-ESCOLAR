import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  FileDown,
  Printer,
  CheckCircle2,
  Users,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { CourseYear, SchoolInfo, Student } from '../types';
import { exportStudentsListPDF } from '../services/pdfExport';

const COURSE_YEARS: CourseYear[] = ['1', '2', '3', '4', '5', '6'];

interface QuickActionsPDFSectionProps {
  students: Student[];
  schoolInfo: SchoolInfo;
  onExportStudentsPDF?: (
    courseStudents: Student[],
    courseYear: CourseYear | 'all',
    schoolInfo: SchoolInfo
  ) => void;
}

export const QuickActionsPDFSection: React.FC<QuickActionsPDFSectionProps> = ({
  students,
  schoolInfo,
  onExportStudentsPDF = exportStudentsListPDF,
}) => {
  const [lastGeneratedKey, setLastGeneratedKey] = useState<CourseYear | 'all' | null>(null);
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

  const studentsByCourse = useMemo(() => {
    const grouped: Record<CourseYear, Student[]> = {
      '1': [],
      '2': [],
      '3': [],
      '4': [],
      '5': [],
      '6': [],
    };
    students.forEach((student) => {
      if (grouped[student.course]) {
        grouped[student.course].push(student);
      }
    });
    COURSE_YEARS.forEach((course) => {
      grouped[course].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
    });
    return grouped;
  }, [students]);

  const sortedAllStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const courseDiff = Number(a.course) - Number(b.course);
      if (courseDiff !== 0) return courseDiff;
      return a.fullName.localeCompare(b.fullName, 'es');
    });
  }, [students]);

  const showFeedback = (type: 'success' | 'error', message: string, key: CourseYear | 'all' | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFeedback({ type, message });
    setLastGeneratedKey(key);
    timerRef.current = setTimeout(() => {
      setFeedback(null);
      setLastGeneratedKey(null);
    }, 3600);
  };

  const handleGenerateCoursePDF = (course: CourseYear) => {
    const courseStudents = studentsByCourse[course];
    if (courseStudents.length === 0) {
      showFeedback('error', `No hay alumnos registrados en ${course}° Año para imprimir.`, null);
      return;
    }
    try {
      onExportStudentsPDF(courseStudents, course, schoolInfo);
      showFeedback(
        'success',
        `Planilla PDF de ${course}° Año (${courseStudents.length} ${courseStudents.length === 1 ? 'alumno' : 'alumnos'}) generada correctamente.`,
        course
      );
    } catch {
      showFeedback('error', `No se pudo generar el PDF de ${course}° Año. Intente nuevamente.`, null);
    }
  };

  const handleGenerateAllPDF = () => {
    if (sortedAllStudents.length === 0) {
      showFeedback('error', 'No hay alumnos cargados en la matrícula para generar la nómina general.', null);
      return;
    }
    try {
      onExportStudentsPDF(sortedAllStudents, 'all', schoolInfo);
      showFeedback(
        'success',
        `Nómina General PDF (${sortedAllStudents.length} alumnos) generada correctamente.`,
        'all'
      );
    } catch {
      showFeedback('error', 'No se pudo generar la Nómina General en PDF. Intente nuevamente.', null);
    }
  };

  return (
    <section
      aria-label="Acciones Rápidas"
      className="aero-glass rounded-[28px] p-5 sm:p-6 border border-white/90 shadow-md space-y-4"
    >
      {/* Cabecera de sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/90 shadow-sm shrink-0">
            <Zap size={20} />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-700 block">
              Impresión Oficial de Planillas PDF
            </span>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
              Acciones Rápidas
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Genere el listado oficial de alumnos en formato PDF por curso con un solo clic, listo para imprimir y firmar.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={sortedAllStudents.length === 0}
          onClick={handleGenerateAllPDF}
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-rose-700 hover:bg-rose-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] shrink-0"
          title="Descargar Nómina General de todos los cursos en PDF"
        >
          {lastGeneratedKey === 'all' ? <CheckCircle2 size={15} /> : <Printer size={15} />}
          <span>Nómina General PDF ({sortedAllStudents.length})</span>
        </button>
      </div>

      {/* Feedback de generación */}
      {feedback && (
        <div
          role="status"
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 ${
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

      {/* Grilla de botones de 1 clic por curso (1° a 6° Año) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {COURSE_YEARS.map((course) => {
          const count = studentsByCourse[course].length;
          const isDisabled = count === 0;
          const isJustGenerated = lastGeneratedKey === course;
          const cycleLabel = Number(course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado';

          return (
            <button
              key={course}
              type="button"
              disabled={isDisabled}
              onClick={() => handleGenerateCoursePDF(course)}
              title={
                isDisabled
                  ? `No hay alumnos registrados en ${course}° Año`
                  : `Generar PDF del listado de alumnos de ${course}° Año (${count})`
              }
              className={`group text-left p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 min-h-[108px] ${
                isDisabled
                  ? 'bg-slate-50/80 border-slate-200/80 text-slate-400 cursor-not-allowed'
                  : isJustGenerated
                  ? 'bg-emerald-50/95 border-emerald-300 shadow-sm'
                  : 'bg-white/90 hover:bg-rose-50/70 border-sky-200/90 hover:border-rose-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p
                    className={`text-sm font-extrabold leading-tight ${
                      isDisabled ? 'text-slate-400' : 'text-slate-900'
                    }`}
                  >
                    {course}° Año
                  </p>
                  <p
                    className={`text-[10px] font-semibold mt-0.5 ${
                      isDisabled ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {cycleLabel}
                  </p>
                </div>
                <span
                  className={`p-1.5 rounded-xl border shrink-0 transition-colors ${
                    isDisabled
                      ? 'bg-slate-100 border-slate-200 text-slate-400'
                      : isJustGenerated
                      ? 'bg-emerald-600 border-emerald-700 text-white'
                      : 'bg-rose-50 border-rose-200 text-rose-600 group-hover:bg-rose-600 group-hover:text-white group-hover:border-rose-700'
                  }`}
                >
                  {isJustGenerated ? <CheckCircle2 size={15} /> : <FileDown size={15} />}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-slate-100">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold tabular-nums ${
                    isDisabled ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  <Users size={12} />
                  <span>{count}</span>
                </span>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider ${
                    isDisabled
                      ? 'text-slate-400'
                      : isJustGenerated
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {isDisabled ? 'Sin alumnos' : isJustGenerated ? 'PDF Listo' : 'PDF 1 Clic'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
