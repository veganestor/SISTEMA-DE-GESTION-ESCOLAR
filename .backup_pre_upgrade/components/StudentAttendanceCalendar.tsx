import React, { useState, useMemo } from 'react';
import { Student, AttendanceRecord } from '../types';
import { 
  Calendar, ChevronLeft, ChevronRight, CheckCircle2, 
  XCircle, Clock, Info, Plus, Trash2, Check, AlertCircle, Sparkles
} from 'lucide-react';

interface StudentAttendanceCalendarProps {
  student: Student;
  onUpdateAttendance: (attendance: AttendanceRecord[]) => void;
  isEditing?: boolean;
}

export const StudentAttendanceCalendar: React.FC<StudentAttendanceCalendarProps> = ({
  student,
  onUpdateAttendance,
  isEditing = false,
}) => {
  // Inicializar en el mes con registros más recientes del alumno o fecha actual
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (student.attendance && student.attendance.length > 0) {
      const last = student.attendance[student.attendance.length - 1];
      const parts = last.date.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
      }
    }
    return new Date();
  });

  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [modalReason, setModalReason] = useState<string>('');
  const [modalJustified, setModalJustified] = useState<boolean>(false);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth(); // 0 - 11

  // Navegación de mes
  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleGoToToday = () => {
    setCurrentDate(new Date());
  };

  // Días del mes formateados (Semana empezando en Lunes)
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const days: (string | null)[] = [];
    // Ajustar offset para semana Lunes (0) a Domingo (6)
    // getDay() devuelve 0=Dom, 1=Lun, ..., 6=Sáb
    const startOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    for (let i = 0; i < startOffset; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push(dateStr);
    }

    return days;
  }, [currentYear, currentMonth]);

  // Mapa de asistencias por fecha
  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    if (Array.isArray(student.attendance)) {
      student.attendance.forEach((att) => {
        map.set(att.date, att);
      });
    }
    return map;
  }, [student.attendance]);

  // Estadísticas del mes visible
  const monthStats = useMemo(() => {
    let presentes = 0;
    let ausentes = 0;
    let tardes = 0;
    let justificadas = 0;
    let total = 0;

    const monthRecords: AttendanceRecord[] = [];

    calendarDays.forEach((dateStr) => {
      if (!dateStr) return;
      const rec = attendanceMap.get(dateStr);
      if (rec) {
        total++;
        monthRecords.push(rec);
        if (rec.type === 'presente') presentes++;
        else if (rec.type === 'ausente') {
          ausentes++;
          if (rec.justified) justificadas++;
        } else if (rec.type === 'tarde') {
          tardes++;
        }
      }
    });

    const effectivePresent = presentes + tardes * 0.5;
    const percentage = total > 0 ? Number(((effectivePresent / total) * 100).toFixed(1)) : 100;

    return {
      presentes,
      ausentes,
      tardes,
      justificadas,
      total,
      percentage,
      monthRecords,
    };
  }, [calendarDays, attendanceMap]);

  // Asistencia de la fecha seleccionada
  const selectedRecord = selectedDateStr ? attendanceMap.get(selectedDateStr) : null;

  // Registrar o cambiar asistencia en una fecha específica
  const handleSetAttendance = (
    dateStr: string,
    type: AttendanceRecord['type'],
    justified = false,
    reason?: string
  ) => {
    const existing = student.attendance || [];
    const index = existing.findIndex((a) => a.date === dateStr);
    let updated: AttendanceRecord[];

    if (index >= 0) {
      updated = [...existing];
      updated[index] = {
        date: dateStr,
        type,
        justified,
        reason: reason || existing[index].reason,
      };
    } else {
      updated = [
        ...existing,
        {
          date: dateStr,
          type,
          justified,
          reason,
        },
      ];
    }

    onUpdateAttendance(updated);
  };

  // Quitar registro de una fecha
  const handleRemoveAttendance = (dateStr: string) => {
    const existing = student.attendance || [];
    const updated = existing.filter((a) => a.date !== dateStr);
    onUpdateAttendance(updated);
  };

  const monthName = currentDate.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Encabezado y Navegador Mensual */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black shadow-inner">
            <Calendar size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">
                Historial Mensual de Asistencia
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Seguimiento Individual
              </span>
            </div>
            <p className="text-sm text-gray-500 font-medium mt-0.5">
              Control de presencias, ausencias y tardanzas por cada jornada del mes
            </p>
          </div>
        </div>

        {/* Selector de Mes */}
        <div className="flex items-center gap-2 self-start lg:self-auto bg-gray-50 p-1.5 rounded-2xl border border-gray-200">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-2 text-gray-600 hover:text-blue-900 hover:bg-white rounded-xl transition-all"
            title="Mes anterior"
          >
            <ChevronLeft size={20} />
          </button>

          <span className="text-sm font-black text-blue-950 uppercase tracking-wider px-4 min-w-[160px] text-center">
            {monthName}
          </span>

          <button
            type="button"
            onClick={handleNextMonth}
            className="p-2 text-gray-600 hover:text-blue-900 hover:bg-white rounded-xl transition-all"
            title="Mes siguiente"
          >
            <ChevronRight size={20} />
          </button>

          <button
            type="button"
            onClick={handleGoToToday}
            className="ml-2 px-3 py-1.5 bg-white text-gray-700 hover:text-blue-700 font-bold text-xs rounded-xl border border-gray-200 shadow-sm transition-all"
          >
            Hoy
          </button>
        </div>
      </div>

      {/* Barra de Estadísticas del Mes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center border-b-4 border-b-gray-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
            Jornadas Registradas
          </span>
          <span className="text-3xl font-black text-gray-900 block">{monthStats.total}</span>
          <span className="text-[11px] text-gray-500 font-medium">días computados</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center border-b-4 border-b-blue-600">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block mb-1">
            Presentes
          </span>
          <span className="text-3xl font-black text-blue-700 block">{monthStats.presentes}</span>
          <span className="text-[11px] text-blue-600 font-medium">
            {monthStats.total > 0
              ? `${((monthStats.presentes / monthStats.total) * 100).toFixed(0)}% del mes`
              : '0%'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center border-b-4 border-b-amber-500">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">
            Tardanzas
          </span>
          <span className="text-3xl font-black text-amber-600 block">{monthStats.tardes}</span>
          <span className="text-[11px] text-amber-700 font-medium">media falta c/u</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center border-b-4 border-b-red-600">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 block mb-1">
            Inasistencias
          </span>
          <span className="text-3xl font-black text-red-600 block">{monthStats.ausentes}</span>
          <span className="text-[11px] text-red-700 font-medium">
            {monthStats.justificadas} justificadas
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center col-span-2 sm:col-span-1 border-b-4 border-b-purple-600">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block mb-1">
            % Asistencia Mes
          </span>
          <span
            className="text-3xl font-black block"
            style={{
              color: monthStats.percentage >= 80 ? '#1E3A8A' : '#DC2626',
            }}
          >
            {monthStats.percentage}%
          </span>
          <span
            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full inline-block mt-0.5 ${
              monthStats.percentage >= 80
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-rose-100 text-rose-800'
            }`}
          >
            {monthStats.percentage >= 80 ? 'Regular' : 'En Riesgo'}
          </span>
        </div>
      </div>

      {/* Clave / Leyenda Visual */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50/80 p-3.5 rounded-2xl border border-gray-200 text-xs">
        <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">
          Referencias de asistencia:
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold">
              ✓
            </span>
            <span className="font-semibold text-gray-700">Presente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-amber-500 flex items-center justify-center text-white text-[9px] font-bold">
              ⏱
            </span>
            <span className="font-semibold text-gray-700">Tardanza</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-red-600 flex items-center justify-center text-white text-[9px] font-bold">
              ✕
            </span>
            <span className="font-semibold text-gray-700">Ausente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-md bg-gray-200 border border-gray-300"></span>
            <span className="font-semibold text-gray-500">Sin registro / No lectivo</span>
          </div>
        </div>
      </div>

      {/* Grid del Calendario + Panel de Detalle */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Grilla del Calendario (8 o 12 columnas) */}
        <div className={`${selectedDateStr ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white rounded-3xl p-5 md:p-6 border border-gray-100 shadow-sm transition-all`}>
          {/* Días de la Semana */}
          <div className="grid grid-cols-7 gap-2 mb-3">
            {[
              { label: 'LUN', full: 'Lunes' },
              { label: 'MAR', full: 'Martes' },
              { label: 'MIÉ', full: 'Miércoles' },
              { label: 'JUE', full: 'Jueves' },
              { label: 'VIE', full: 'Viernes' },
              { label: 'SÁB', full: 'Sábado', weekend: true },
              { label: 'DOM', full: 'Domingo', weekend: true },
            ].map((col) => (
              <div
                key={col.label}
                className={`text-center py-2 text-[11px] font-black tracking-wider uppercase rounded-xl ${
                  col.weekend ? 'text-gray-300 bg-gray-50/50' : 'text-blue-900 bg-blue-50/40'
                }`}
              >
                {col.label}
              </div>
            ))}
          </div>

          {/* Celdas de Días */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((dateStr, idx) => {
              if (!dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="min-h-[70px] md:min-h-[85px] rounded-2xl bg-gray-50/30 border border-dashed border-gray-100"
                  />
                );
              }

              const att = attendanceMap.get(dateStr);
              const dayNum = parseInt(dateStr.split('-')[2], 10);
              const dayOfWeek = (idx % 7); // 5=Sab, 6=Dom
              const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
              const isSelected = selectedDateStr === dateStr;
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              let cellStyle = 'bg-white border-gray-100 text-gray-700 hover:border-blue-300';
              if (att?.type === 'presente') {
                cellStyle = 'bg-blue-50/80 border-blue-200 text-blue-900';
              } else if (att?.type === 'ausente') {
                cellStyle = 'bg-red-50/90 border-red-200 text-red-900';
              } else if (att?.type === 'tarde') {
                cellStyle = 'bg-amber-50/90 border-amber-200 text-amber-900';
              } else if (isWeekend) {
                cellStyle = 'bg-gray-50/40 border-gray-100 text-gray-400';
              }

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDateStr(dateStr)}
                  className={`min-h-[72px] md:min-h-[88px] p-2 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative group ${cellStyle} ${
                    isSelected ? 'ring-4 ring-blue-500/20 border-blue-600 shadow-md scale-[1.02]' : ''
                  }`}
                >
                  {/* Top: Day number + Today flag */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs md:text-sm font-black ${
                        isSelected ? 'text-blue-700' : isToday ? 'text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {isToday && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-md bg-blue-600 text-white">
                        Hoy
                      </span>
                    )}
                  </div>

                  {/* Middle / Bottom: Attendance pill */}
                  {att ? (
                    <div className="mt-1">
                      {att.type === 'presente' && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-blue-600 text-white text-[10px] font-black leading-tight shadow-sm">
                          <CheckCircle2 size={12} className="shrink-0" />
                          <span className="truncate">Presente</span>
                        </div>
                      )}
                      {att.type === 'ausente' && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-red-600 text-white text-[10px] font-black leading-tight shadow-sm">
                          <XCircle size={12} className="shrink-0" />
                          <span className="truncate">
                            Ausente {att.justified ? '✓' : ''}
                          </span>
                        </div>
                      )}
                      {att.type === 'tarde' && (
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-amber-500 text-white text-[10px] font-black leading-tight shadow-sm">
                          <Clock size={12} className="shrink-0" />
                          <span className="truncate">Tardanza</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-300 font-medium italic opacity-0 group-hover:opacity-100 transition-opacity">
                      {isWeekend ? 'No lectivo' : '+ Registrar'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel de Detalle y Registro de la Fecha Seleccionada */}
        {selectedDateStr && (
          <div className="lg:col-span-4 bg-gray-900 text-white rounded-3xl p-6 shadow-xl animate-in slide-in-from-right-4 duration-200 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 block">
                  Jornada Seleccionada
                </span>
                <h4 className="text-lg font-black text-white capitalize mt-0.5">
                  {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('es-AR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDateStr(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Estado actual */}
            <div className="bg-gray-800/80 p-4 rounded-2xl border border-gray-700/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                Estado Registrado
              </span>
              {selectedRecord ? (
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      selectedRecord.type === 'presente'
                        ? 'bg-blue-600 text-white'
                        : selectedRecord.type === 'ausente'
                        ? 'bg-red-600 text-white'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    {selectedRecord.type === 'presente' ? (
                      <CheckCircle2 size={22} />
                    ) : selectedRecord.type === 'ausente' ? (
                      <XCircle size={22} />
                    ) : (
                      <Clock size={22} />
                    )}
                  </div>
                  <div>
                    <span className="text-base font-black uppercase block">
                      {selectedRecord.type}
                    </span>
                    <span className="text-xs text-gray-300">
                      {selectedRecord.justified
                        ? 'Inasistencia con Certificado'
                        : selectedRecord.reason || 'Sin observaciones'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-400 italic">
                  Sin registro cargado para este día.
                </p>
              )}
            </div>

            {/* Acciones Rápidas para Editar/Cargar Asistencia */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                Actualizar Condición del Día:
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSetAttendance(selectedDateStr, 'presente')}
                  className={`py-2 px-3 rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 ${
                    selectedRecord?.type === 'presente'
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                      : 'bg-gray-800 hover:bg-gray-700 text-blue-300'
                  }`}
                >
                  <Check size={14} /> Presente
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const r = prompt('Motivo de tardanza (opcional):') || undefined;
                    handleSetAttendance(selectedDateStr, 'tarde', false, r);
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 ${
                    selectedRecord?.type === 'tarde'
                      ? 'bg-amber-500 text-white ring-2 ring-amber-300'
                      : 'bg-gray-800 hover:bg-gray-700 text-amber-300'
                  }`}
                >
                  <Clock size={14} /> Tardanza
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const justified = confirm('¿La inasistencia cuenta con certificado médico o justificativo legal?');
                    const r = prompt('Motivo de inasistencia (opcional):') || undefined;
                    handleSetAttendance(selectedDateStr, 'ausente', justified, r);
                  }}
                  className={`py-2 px-3 rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center gap-1 ${
                    selectedRecord?.type === 'ausente'
                      ? 'bg-red-600 text-white ring-2 ring-red-400'
                      : 'bg-gray-800 hover:bg-gray-700 text-red-300'
                  }`}
                >
                  <XCircle size={14} /> Ausente
                </button>
              </div>

              {selectedRecord && (
                <button
                  type="button"
                  onClick={() => handleRemoveAttendance(selectedDateStr)}
                  className="w-full py-2 px-3 mt-2 bg-gray-800/80 hover:bg-red-900/40 text-gray-400 hover:text-red-300 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={13} /> Quitar Registro de esta Fecha
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Historial Cronológico de Novedades del Mes */}
      <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h4 className="text-base font-black text-gray-900 uppercase tracking-tight flex items-center gap-2">
            <span>Historial Cronológico de Novedades ({monthName})</span>
          </h4>
          <span className="text-xs font-bold text-gray-400">
            {monthStats.monthRecords.length} {monthStats.monthRecords.length === 1 ? 'evento registrado' : 'eventos registrados'}
          </span>
        </div>

        {monthStats.monthRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-400 uppercase text-[10px] font-black tracking-wider">
                <tr>
                  <th className="p-3 rounded-l-xl">Fecha</th>
                  <th className="p-3">Condición</th>
                  <th className="p-3">Detalle / Justificación</th>
                  <th className="p-3 text-right rounded-r-xl">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthStats.monthRecords.map((rec) => (
                  <tr key={rec.date} className="hover:bg-gray-50/60 transition-colors">
                    <td className="p-3 font-bold text-gray-800">
                      {new Date(rec.date + 'T00:00:00').toLocaleDateString('es-AR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                          rec.type === 'presente'
                            ? 'bg-blue-100 text-blue-800'
                            : rec.type === 'ausente'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rec.type === 'presente' && <CheckCircle2 size={12} />}
                        {rec.type === 'ausente' && <XCircle size={12} />}
                        {rec.type === 'tarde' && <Clock size={12} />}
                        {rec.type}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600">
                      {rec.justified ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          Certificado Médico / Trámite
                        </span>
                      ) : (
                        <span>{rec.reason || 'Sin observaciones'}</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedDateStr(rec.date)}
                        className="text-blue-600 hover:text-blue-800 font-bold hover:underline"
                      >
                        Ver en Calendario
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-gray-400 italic text-xs">
            No se han registrado asistencias en {monthName}.
          </div>
        )}
      </div>
    </div>
  );
};
