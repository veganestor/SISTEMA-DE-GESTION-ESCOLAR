import React, { useEffect, useState } from 'react';
import { QrCode, Users, ShieldCheck, AlertCircle } from 'lucide-react';
import type { Student } from '../types';
import type { AttendanceMovementRecord, StudentGuardianLink } from '../shared/attendanceDomain';
import {
  fetchStudentBackendAttendance,
  fetchStudentGuardians,
  getInMemorySession,
} from '../services/attendanceApiClient';

interface StudentQRAttendanceSectionProps {
  student: Student;
}

export const StudentQRAttendanceSection: React.FC<StudentQRAttendanceSectionProps> = ({
  student,
}) => {
  const session = getInMemorySession();
  const [movements, setMovements] = useState<AttendanceMovementRecord[]>([]);
  const [guardians, setGuardians] = useState<StudentGuardianLink[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session.token) return;
    let active = true;
    setLoading(true);
    Promise.all([
      fetchStudentBackendAttendance(student.id),
      fetchStudentGuardians(student.id),
    ])
      .then(([attRes, grdRes]) => {
        if (!active) return;
        setMovements(attRes.movements || []);
        setGuardians(grdRes || []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [student.id, session.token]);

  const totalDays = student.attendance?.length || 0;
  const presentDays = (student.attendance || []).filter((a) => a.type === 'presente').length;
  const lateDays = (student.attendance || []).filter((a) => a.type === 'tarde').length;
  const absentDays = (student.attendance || []).filter((a) => a.type === 'ausente').length;
  const attendancePct =
    totalDays > 0 ? Math.round(((presentDays + lateDays * 0.5) / totalDays) * 100) : 100;

  return (
    <div className="space-y-6 pt-6 border-t border-sky-200/80 no-print">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <QrCode size={22} className="text-sky-600" />
          <div>
            <h4 className="text-lg font-black text-blue-900 uppercase tracking-tight">
              Historial QR, Retiros y Tutores Autorizados
            </h4>
            <p className="text-xs text-slate-600">
              Porcentaje de asistencia: <strong className="tabular-nums">{attendancePct}%</strong> · Total inasistencias:{' '}
              <strong className="tabular-nums">{absentDays}</strong> · Tardanzas:{' '}
              <strong className="tabular-nums">{lateDays}</strong>
            </p>
          </div>
        </div>
      </div>

      {!session.token ? (
        <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 text-xs font-bold text-sky-900 flex items-center gap-2">
          <AlertCircle size={16} className="text-sky-600 shrink-0" />
          <span>
            Inicie sesión en &ldquo;Tomar asistencia QR&rdquo; (Director / Preceptor / Docente) para visualizar los movimientos QR en tiempo real y los tutores vinculados desde la base de datos.
          </span>
        </div>
      ) : loading ? (
        <div className="text-xs font-bold text-slate-500 py-4">
          Cargando movimientos QR y tutores vinculados...
        </div>
      ) : (
        <div className="space-y-5">
          {/* Tutores vinculados y autorización de retiro */}
          <div className="bg-white border border-sky-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-sky-600" />
              <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Padres y Tutores Vinculados ({guardians.length})
              </h5>
            </div>
            {guardians.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Este alumno aún no tiene tutores vinculados en el módulo &ldquo;Tutores y Usuarios&rdquo;.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {guardians.map((g) => (
                  <div
                    key={g.id}
                    className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 text-xs flex items-start justify-between gap-2"
                  >
                    <div>
                      <p className="font-extrabold text-slate-900">
                        {g.guardian?.fullName}{' '}
                        <span className="text-sky-800 font-bold">({g.relationship})</span>
                      </p>
                      <p className="text-[11px] font-mono text-slate-600">
                        DNI {g.guardian?.dni || 'S/D'} • Tel: {g.guardian?.phone || '-'} •{' '}
                        {g.guardian?.email || 'Sin email'}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-700 mt-0.5 flex items-center gap-1">
                        <ShieldCheck size={12} />
                        <span>
                          {g.authorizedPickup
                            ? 'Autorizado para retiro anticipado'
                            : 'Sin autorización de retiro'}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Movimientos QR */}
          <div className="bg-white border border-sky-200 rounded-2xl p-4 space-y-2.5">
            <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
              Registros QR de Ingreso, Ausencias y Retiros ({movements.length})
            </h5>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-sky-100 text-[10px] uppercase text-slate-500 text-left">
                    <th className="py-2 pr-3">Fecha / Hora</th>
                    <th className="py-2 pr-3">Movimiento</th>
                    <th className="py-2 pr-3">Estado / Tipo</th>
                    <th className="py-2 pr-3">Retirado por / Motivo</th>
                    <th className="py-2">Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {m.attendanceDate} • {m.recordedTime} hs
                      </td>
                      <td className="py-2 pr-3 font-bold uppercase text-[11px]">
                        {m.movementKind}
                      </td>
                      <td className="py-2 pr-3 font-extrabold uppercase text-[11px]">
                        {m.movementKind === 'ingreso' ? m.attendanceStatus : m.exitType}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        {m.movementKind === 'salida'
                          ? `${m.authorizedPersonName || ''} ${
                              m.withdrawalReason ? `(${m.withdrawalReason})` : ''
                            }`.trim()
                          : m.observations || '-'}
                      </td>
                      <td className="py-2 text-slate-600">{m.operatorName}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                        Sin escaneos QR registrados aún para este alumno.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
