import React, { useEffect, useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  Search,
  AlertTriangle,
  History,
} from 'lucide-react';
import type { CourseYear, SchoolInfo, Student } from '../types';
import type {
  AttendanceMovementRecord,
  AuditLogRecord,
  ShiftType,
} from '../shared/attendanceDomain';
import {
  fetchAuditLogs,
  fetchMovementsReport,
} from '../services/attendanceApiClient';
import {
  exportAttendanceMovementsToExcel,
  exportAttendanceMovementsToPDF,
} from '../services/attendanceReportsExport';
import { getLocalTodayISO } from '../services/storageService';

interface AttendanceReportsLogsPanelProps {
  students: Student[];
  schoolInfo: SchoolInfo;
  isAdmin?: boolean;
}

export const AttendanceReportsLogsPanel: React.FC<AttendanceReportsLogsPanelProps> = ({
  students,
  schoolInfo,
  isAdmin = false,
}) => {
  const [fromDate, setFromDate] = useState(() => getLocalTodayISO());
  const [toDate, setToDate] = useState(() => getLocalTodayISO());
  const [courseFilter, setCourseFilter] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('');
  const [shiftFilter, setShiftFilter] = useState<'' | ShiftType>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [studentFilter, setStudentFilter] = useState('');

  const [movements, setMovements] = useState<AttendanceMovementRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const [movRes, audRes] = await Promise.all([
        fetchMovementsReport({
          from: fromDate || undefined,
          to: toDate || undefined,
          course: courseFilter || undefined,
          division: divisionFilter || undefined,
          shift: shiftFilter || undefined,
          studentId: studentFilter || undefined,
          status: statusFilter || undefined,
        }),
        isAdmin ? fetchAuditLogs().catch(() => []) : Promise.resolve([]),
      ]);
      setMovements(movRes);
      setAuditLogs(audRes);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Error consultando reportes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAdmin]);

  return (
    <div className="space-y-6">
      {errorBanner && (
        <div className="px-4 py-3 rounded-2xl border text-xs font-bold flex items-center gap-2 bg-rose-50 border-rose-200 text-rose-900">
          <AlertTriangle size={16} />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Filtros y Botones de Exportación */}
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Reportes de Asistencia QR y Retiros
            </h3>
            <p className="text-xs text-slate-600">
              Filtre por fecha, alumno, curso, división, turno o estado y exporte en PDF o Excel oficial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                exportAttendanceMovementsToPDF(
                  movements,
                  schoolInfo,
                  `${fromDate || 'Inicio'} a ${toDate || 'Hoy'}`
                )
              }
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileDown size={15} />
              <span>Asistencia PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportAttendanceMovementsToExcel(movements)}
              className="aero-btn-emerald px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileSpreadsheet size={15} />
              <span>Exportar Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs items-end">
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              Curso
            </label>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            >
              <option value="">Todos</option>
              {(['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((c) => (
                <option key={c} value={c}>
                  {c}° Año
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              División
            </label>
            <input
              type="text"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              placeholder="Ej. A"
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              Turno
            </label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value as '' | ShiftType)}
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            >
              <option value="">Todos</option>
              <option value="manana">Mañana</option>
              <option value="tarde">Tarde</option>
              <option value="vespertino">Vespertino</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              Estado / Retiro
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            >
              <option value="">Todos</option>
              <option value="presente">Presente</option>
              <option value="tarde">Tarde</option>
              <option value="ausente">Ausente</option>
              <option value="habitual">Salida habitual</option>
              <option value="retiro_anticipado">Retiro anticipado</option>
              <option value="retiro_excepcional">Retiro excepcional</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
              Alumno
            </label>
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-bold"
            >
              <option value="">Todos</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="aero-btn-primary px-5 py-2 min-h-[38px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap"
          >
            <Search size={14} />
            <span>{loading ? 'Consultando...' : 'Aplicar Filtros'}</span>
          </button>
        </div>
      </div>

      {/* Tabla de Movimientos QR */}
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3">
        <h4 className="text-sm font-extrabold text-slate-900">
          Movimientos de Ingreso, Ausencias y Salidas ({movements.length})
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-sky-100 text-[10px] uppercase text-slate-500 text-left">
                <th className="py-2 pr-3">Fecha / Hora</th>
                <th className="py-2 pr-3">Estudiante</th>
                <th className="py-2 pr-3">Curso / Turno</th>
                <th className="py-2 pr-3">Operación</th>
                <th className="py-2 pr-3">Clasificación</th>
                <th className="py-2 pr-3">Retira / Motivo</th>
                <th className="py-2">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 font-mono tabular-nums whitespace-nowrap">
                    {m.attendanceDate} • {m.recordedTime}
                  </td>
                  <td className="py-2 pr-3 font-extrabold text-slate-900">
                    {m.studentName || m.studentId}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {m.course}° {m.division} ({m.shift})
                  </td>
                  <td className="py-2 pr-3 font-bold uppercase text-[11px]">
                    {m.movementKind === 'ingreso' ? 'INGRESO' : 'SALIDA'}
                  </td>
                  <td className="py-2 pr-3 font-extrabold uppercase text-[11px]">
                    {m.movementKind === 'ingreso' ? m.attendanceStatus : m.exitType}
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {m.movementKind === 'salida'
                      ? `${m.authorizedPersonName || ''}${
                          m.withdrawalReason ? ` — ${m.withdrawalReason}` : ''
                        }`
                      : m.observations || '-'}
                  </td>
                  <td className="py-2 text-slate-600">{m.operatorName}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 italic">
                    Sin movimientos registrados para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auditoría de acciones (solo Administrador) */}
      {isAdmin && auditLogs.length > 0 && (
        <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3">
          <div className="flex items-center gap-2">
            <History size={17} className="text-sky-600" />
            <h4 className="text-sm font-extrabold text-slate-900">
              Auditoría de Operaciones Recientes ({auditLogs.length})
            </h4>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-sky-100 text-xs">
            {auditLogs.slice(0, 30).map((a) => (
              <div key={a.id} className="py-2 flex flex-wrap justify-between gap-2">
                <div>
                  <span className="font-extrabold text-sky-950">{a.action}</span>{' '}
                  <span className="text-slate-600">
                    por {a.actorName} ({a.actorRole})
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {a.createdAt.slice(0, 19).replace('T', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
