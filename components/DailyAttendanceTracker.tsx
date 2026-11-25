import React, { useState, useMemo, useEffect } from 'react';
import { Student, CourseYear, AttendanceRecord, SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';
import { getLocalTodayISO } from '../services/storageService';
import { formatLocalTimeHHMM, getQRAttendanceSummaryForDate } from '../services/attendanceService';
import { Calendar, CheckCircle2, Clock, XCircle, ShieldCheck, Users, Sparkles, Check, ChevronDown, Search, AlertTriangle, QrCode, FileText } from 'lucide-react';

interface DailyAttendanceTrackerProps {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  schoolInfo?: SchoolInfo;
  initialCourse?: CourseYear;
  initialDate?: string;
  onOpenQRScanner?: () => void;
  onOpenMonthlyReport?: () => void;
}

export const DailyAttendanceTracker: React.FC<DailyAttendanceTrackerProps> = ({
  students,
  setStudents,
  schoolInfo = DEFAULT_SCHOOL_INFO,
  initialCourse = '1',
  initialDate,
  onOpenQRScanner,
  onOpenMonthlyReport,
}) => {
  const [selectedCourse, setSelectedCourse] = useState<CourseYear>(initialCourse);
  const [selectedDate, setSelectedDate] = useState<string>(() => initialDate || getLocalTodayISO());
  const [searchTerm, setSearchTerm] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [justifyModal, setJustifyModal] = useState<{
    studentId: string;
    studentName: string;
    reason: string;
  } | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setSelectedCourse(initialCourse);
  }, [initialCourse]);

  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Alumnos del curso seleccionado
  const courseStudents = useMemo(() => {
    return students
      .filter((s) => s.course === selectedCourse)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, selectedCourse]);

  // Alumnos filtrados por búsqueda
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return courseStudents;
    const term = searchTerm.toLowerCase();
    return courseStudents.filter((s) =>
      s.fullName.toLowerCase().includes(term) || (s.dni && s.dni.includes(term))
    );
  }, [courseStudents, searchTerm]);

  // Obtener estado de asistencia para un alumno en la fecha seleccionada
  const getStudentStatus = (student: Student): AttendanceRecord | undefined => {
    return student.attendance.find((a) => a.date === selectedDate);
  };

  // Actualizar asistencia de un alumno individual
  const handleSetAttendance = (
    studentId: string,
    type: AttendanceRecord['type'],
    justified = false,
    reason?: string
  ) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id !== studentId) return s;

        const filtered = s.attendance.filter((a) => a.date !== selectedDate);
        const newRecord: AttendanceRecord = {
          date: selectedDate,
          type,
          justified,
          reason,
          source: 'manual',
          recordedAt: formatLocalTimeHHMM(),
        };

        return {
          ...s,
          attendance: [...filtered, newRecord],
        };
      })
    );

    showNotification('Asistencia actualizada');
  };

  // Alternar justificación de inasistencia (con modal en la app)
  const handleToggleJustified = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const current = getStudentStatus(student);
    if (!current || current.type !== 'ausente') return;

    if (!current.justified) {
      setJustifyModal({
        studentId,
        studentName: student.fullName,
        reason: current.reason || '',
      });
      return;
    }

    handleSetAttendance(studentId, 'ausente', false, current.reason);
  };

  const confirmJustifyAbsence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!justifyModal) return;
    handleSetAttendance(
      justifyModal.studentId,
      'ausente',
      true,
      justifyModal.reason.trim() || 'Justificada'
    );
    setJustifyModal(null);
  };

  // Marcar a todos los alumnos del curso como Presentes
  const handleMarkAllPresent = () => {
    if (courseStudents.length === 0) return;

    setStudents((prev) =>
      prev.map((s) => {
        if (s.course !== selectedCourse) return s;
        const filtered = s.attendance.filter((a) => a.date !== selectedDate);
        const newRecord: AttendanceRecord = {
          date: selectedDate,
          type: 'presente',
          source: 'manual',
          recordedAt: formatLocalTimeHHMM(),
        };
        return {
          ...s,
          attendance: [...filtered, newRecord],
        };
      })
    );

    showNotification(`Se marcaron ${courseStudents.length} alumnos como Presentes`);
  };

  // Limpiar registros del día seleccionado
  const handleClearDay = () => {
    setShowClearConfirm(true);
  };

  const confirmClearDay = () => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.course !== selectedCourse) return s;
        return {
          ...s,
          attendance: s.attendance.filter((a) => a.date !== selectedDate),
        };
      })
    );
    setShowClearConfirm(false);
    showNotification('Registros del día eliminados');
  };

  const showNotification = (msg: string) => {
    setSaveFeedback(msg);
    setTimeout(() => {
      setSaveFeedback(null);
    }, 2500);
  };

  // Estadísticas del día para el curso
  const stats = useMemo(() => {
    let presentes = 0;
    let tardes = 0;
    let ausentes = 0;
    let justificadas = 0;
    let sinRegistrar = 0;

    courseStudents.forEach((s) => {
      const rec = getStudentStatus(s);
      if (!rec) {
        sinRegistrar++;
      } else if (rec.type === 'presente') {
        presentes++;
      } else if (rec.type === 'tarde') {
        tardes++;
      } else if (rec.type === 'ausente') {
        ausentes++;
        if (rec.justified) justificadas++;
      }
    });

    const total = courseStudents.length;
    const computedTotal = presentes + tardes + ausentes;
    const effectivePresent = presentes + tardes * 0.5;
    const percent = computedTotal > 0 ? Math.round((effectivePresent / computedTotal) * 100) : 0;

    return {
      total,
      presentes,
      tardes,
      ausentes,
      justificadas,
      sinRegistrar,
      percent,
    };
  }, [courseStudents, selectedDate]);

  // Resumen de asistencias cargadas automáticamente vía escaneo QR para la fecha seleccionada
  const qrDateSummary = useMemo(
    () => getQRAttendanceSummaryForDate(students, selectedDate),
    [students, selectedDate]
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-sky-100/90 text-sky-900 border border-sky-200/80 text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Registro Diario
            </span>
            <span className="text-xs text-slate-600 font-semibold">
              {schoolInfo.name} • Ciclo Lectivo {schoolInfo.academicYear}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-[#0c2d48] tracking-tight">
            Control de Asistencia Diario
          </h2>
          <p className="text-sm text-slate-600 font-medium">
            Registre de forma rápida la asistencia diaria por curso y fecha
          </p>
        </div>

        {/* Feedback flotante */}
        {saveFeedback && (
          <div className="flex items-center gap-2 aero-btn-emerald text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg animate-in fade-in slide-in-from-top-2">
            <Check size={16} />
            <span>{saveFeedback}</span>
          </div>
        )}
      </div>

      {/* Controles de Selección: Curso y Fecha */}
      <div className="aero-glass p-4 sm:p-6 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Selector de Curso */}
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
              1. Seleccionar Año / Curso
            </label>
            <div className="relative">
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value as CourseYear)}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 outline-none font-black text-blue-900 text-base"
              >
                {(['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((y) => (
                  <option key={y} value={y}>
                    {y}° Año ({Number(y) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado'})
                  </option>
                ))}
              </select>
              <ChevronDown
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-blue-900 pointer-events-none"
                size={20}
              />
            </div>
          </div>

          {/* Selector de Fecha */}
          <div>
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-blue-600" />
              <span>2. Seleccionar Fecha</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-800 text-base"
            />
          </div>

          {/* Búsqueda rápida por nombre */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-[11px] font-black text-gray-500 uppercase tracking-wider mb-1.5">
              Filtrar Alumno
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar por apellido, nombre o DNI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              />
            </div>
          </div>
        </div>

        {/* Botones de acción masiva */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 font-medium">
            Fecha actual:{' '}
            <strong className="text-gray-900 font-bold">
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </strong>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenMonthlyReport && (
              <button
                type="button"
                onClick={onOpenMonthlyReport}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-all active:scale-95 whitespace-nowrap shrink-0"
                title="Abrir sección de Reporte Mensual Consolidado de Asistencia en PDF"
              >
                <FileText size={15} />
                <span>Reporte Mensual PDF</span>
              </button>
            )}
            {onOpenQRScanner && (
              <button
                type="button"
                onClick={onOpenQRScanner}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] aero-btn-aqua rounded-xl text-xs font-black transition-all active:scale-95"
                title="Abrir Lector QR para registrar asistencia escaneando carnets escolares"
              >
                <QrCode size={15} />
                <span>Asistencia por QR</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleMarkAllPresent}
              className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] aero-btn-emerald rounded-xl text-xs font-black transition-all active:scale-95"
              title="Marcar automáticamente a todos los alumnos del curso como Presentes en esta fecha"
            >
              <Sparkles size={15} />
              <span>Marcar Todos Presentes</span>
            </button>
            <button
              type="button"
              onClick={handleClearDay}
              className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-white/80 hover:bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all"
              title="Limpiar los registros del día para este curso"
            >
              <span>Limpiar Día</span>
            </button>
          </div>
        </div>

        {/* Resumen interactivo de asistencias registradas por QR en la fecha seleccionada */}
        {qrDateSummary.totalQrCount > 0 && (
          <div className="bg-sky-50/90 border border-sky-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 text-xs text-sky-950 font-bold">
              <QrCode size={16} className="text-sky-600 shrink-0" />
              <span>
                Registros automáticos por QR ({selectedDate}):{' '}
                <strong className="font-black">{qrDateSummary.totalQrCount}</strong>{' '}
                {qrDateSummary.totalQrCount === 1 ? 'alumno' : 'alumnos'}
                {qrDateSummary.presentCount > 0 ? ` • ${qrDateSummary.presentCount} presente(s)` : ''}
                {qrDateSummary.lateCount > 0 ? ` • ${qrDateSummary.lateCount} tardanza(s)` : ''}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {qrDateSummary.byCourse.map((item) => (
                <button
                  key={item.course}
                  type="button"
                  onClick={() => setSelectedCourse(item.course)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border transition-colors ${
                    selectedCourse === item.course
                      ? 'bg-sky-600 text-white border-sky-700'
                      : 'bg-white text-sky-800 border-sky-200 hover:bg-sky-100'
                  }`}
                >
                  {item.course}° Año ({item.count})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Resumen de Métricas del Día */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="aero-glass p-4 rounded-2xl text-center">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Matrícula</p>
          <p className="text-2xl font-black text-[#0c2d48]">{stats.total}</p>
          <span className="text-[10px] text-slate-500">Total alumnos</span>
        </div>

        <div className="aero-glass p-4 rounded-2xl border-emerald-200/80 text-center">
          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1">Presentes</p>
          <p className="text-2xl font-black text-emerald-700">{stats.presentes}</p>
          <span className="text-[10px] text-emerald-600 font-bold">Puntuales</span>
        </div>

        <div className="aero-glass p-4 rounded-2xl border-amber-200/80 text-center">
          <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Tardanzas</p>
          <p className="text-2xl font-black text-amber-600">{stats.tardes}</p>
          <span className="text-[10px] text-amber-600 font-bold">0.5 Asistencia</span>
        </div>

        <div className="aero-glass p-4 rounded-2xl border-rose-200/80 text-center">
          <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider mb-1">Ausentes</p>
          <p className="text-2xl font-black text-rose-600">{stats.ausentes}</p>
          <span className="text-[10px] text-rose-600 font-bold">{stats.justificadas} justificados</span>
        </div>

        <div className="aero-glass p-4 rounded-2xl border-sky-200/80 text-center">
          <p className="text-[10px] font-black text-sky-700 uppercase tracking-wider mb-1">Presentismo</p>
          <p className="text-2xl font-black text-sky-700">{stats.percent}%</p>
          <span className="text-[10px] text-sky-600 font-bold">Efectivo del día</span>
        </div>

        <div className="aero-glass p-4 rounded-2xl text-center">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Sin Cargar</p>
          <p className="text-2xl font-black text-slate-600">{stats.sinRegistrar}</p>
          <span className="text-[10px] text-slate-500">Pendientes</span>
        </div>
      </div>

      {/* Listado de Alumnos y Controles Táctiles */}
      <div className="aero-glass rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-900" />
            <h3 className="font-black text-gray-900 text-sm sm:text-base">
              Alumnos de {selectedCourse}° Año ({filteredStudents.length})
            </h3>
          </div>
          <span className="text-xs text-gray-400 font-medium hidden sm:inline">
            Toque o haga clic para cambiar el estado de cada estudiante
          </span>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filteredStudents.map((student, idx) => {
              const currentRecord = getStudentStatus(student);
              const currentType = currentRecord?.type;

              return (
                <div
                  key={student.id}
                  className="p-3 sm:p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  {/* Info Alumno */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-6 text-right shrink-0">
                      {idx + 1}.
                    </span>

                    {/* Foto o Inicial */}
                    {student.photo ? (
                      <img
                        src={student.photo}
                        alt={student.fullName}
                        className="w-10 h-10 rounded-full object-cover border border-blue-200 shadow-sm shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-900 font-black text-sm flex items-center justify-center shrink-0">
                        {student.fullName.charAt(0)}
                      </div>
                    )}

                    <div>
                      <h4 className="font-black text-sm text-gray-900 leading-tight">
                        {student.fullName}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span>
                          DNI: {student.dni || 'Sin DNI'} • {student.course}° Año
                        </span>
                        {currentRecord?.source === 'qr' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-extrabold">
                            <QrCode size={11} />
                            <span>
                              QR{currentRecord.recordedAt ? ` • ${currentRecord.recordedAt} hs` : ''}
                            </span>
                          </span>
                        )}
                        {currentRecord?.reason && (
                          <span className="text-amber-700 italic font-semibold">
                            (Motivo: {currentRecord.reason})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Botonera de Estado Táctil (Presente / Tardanza / Ausente) */}
                  <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto w-full sm:w-auto justify-end flex-wrap">
                    {/* Botón Presente */}
                    <button
                      type="button"
                      onClick={() => handleSetAttendance(student.id, 'presente')}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] rounded-xl text-xs font-black transition-all ${
                        currentType === 'presente'
                          ? 'bg-emerald-600 text-white shadow-md scale-[1.03]'
                          : 'bg-emerald-50/90 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                      title="Marcar Presente"
                    >
                      <CheckCircle2 size={15} />
                      <span>Presente</span>
                    </button>

                    {/* Botón Tarde */}
                    <button
                      type="button"
                      onClick={() => handleSetAttendance(student.id, 'tarde')}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] rounded-xl text-xs font-black transition-all ${
                        currentType === 'tarde'
                          ? 'bg-amber-500 text-white shadow-md scale-[1.03]'
                          : 'bg-amber-50/90 text-amber-800 hover:bg-amber-100 border border-amber-200'
                      }`}
                      title="Marcar Tardanza"
                    >
                      <Clock size={15} />
                      <span>Tarde</span>
                    </button>

                    {/* Botón Ausente */}
                    <button
                      type="button"
                      onClick={() => handleSetAttendance(student.id, 'ausente', false)}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 min-h-[44px] rounded-xl text-xs font-black transition-all ${
                        currentType === 'ausente'
                          ? 'bg-red-600 text-white shadow-md scale-[1.03]'
                          : 'bg-red-50/90 text-red-800 hover:bg-red-100 border border-red-200'
                      }`}
                      title="Marcar Ausente"
                    >
                      <XCircle size={15} />
                      <span>Ausente</span>
                    </button>

                    {/* Botón Justificar (solo si está ausente) */}
                    {currentType === 'ausente' && (
                      <button
                        type="button"
                        onClick={() => handleToggleJustified(student.id)}
                        className={`px-3 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-all border ${
                          currentRecord?.justified
                            ? 'bg-purple-100 border-purple-300 text-purple-900 shadow-sm'
                            : 'bg-white/80 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                        title={
                          currentRecord?.justified
                            ? 'Inasistencia justificada (clic para quitar justificación)'
                            : 'Justificar inasistencia con certificado'
                        }
                      >
                        <ShieldCheck size={14} className="inline mr-1" />
                        <span>{currentRecord?.justified ? 'Justificada' : 'Justificar'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 font-medium italic">
            No se encontraron alumnos para {selectedCourse}° Año con el filtro actual.
          </div>
        )}
      </div>

      {/* Modal en la app para Justificar Inasistencia */}
      {justifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <form
            onSubmit={confirmJustifyAbsence}
            className="aero-glass bg-white/95 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-sky-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-[#0c2d48]">Justificar Inasistencia</h3>
                <p className="text-xs text-slate-600 font-medium">{justifyModal.studentName} • {selectedDate}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Motivo / Documentación respaldatoria
              </label>
              <input
                type="text"
                autoFocus
                value={justifyModal.reason}
                onChange={(e) => setJustifyModal({ ...justifyModal, reason: e.target.value })}
                placeholder="Ej: Certificado médico, nota de tutor..."
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500 outline-none text-sm font-medium bg-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setJustifyModal(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 min-h-[44px] aero-btn-primary rounded-xl text-xs font-black"
              >
                Guardar Justificación
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal en la app para Limpiar Día */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="aero-glass bg-white/95 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle size={26} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-black text-[#0c2d48]">¿Limpiar registros del día?</h3>
              <p className="text-xs text-slate-600 font-medium">
                Se quitarán las marcas de asistencia del <strong>{selectedDate}</strong> para <strong>{selectedCourse}° Año</strong>.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmClearDay}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md"
              >
                Sí, limpiar día
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
