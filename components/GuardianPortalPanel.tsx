import React, { useEffect, useState } from 'react';
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import type { AuthUserSession, GuardianChildSnapshot } from '../shared/attendanceDomain';
import {
  fetchGuardianPortalChildren,
  fetchGuardians,
  type GuardianWithLinks,
} from '../services/attendanceApiClient';
import { getLocalTodayISO } from '../services/storageService';

interface GuardianPortalPanelProps {
  currentUser: AuthUserSession;
}

export const GuardianPortalPanel: React.FC<GuardianPortalPanelProps> = ({ currentUser }) => {
  const [children, setChildren] = useState<GuardianChildSnapshot[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [date, setDate] = useState<string>(() => getLocalTodayISO());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Admin preview selector when inspecting as admin/preceptor
  const [allGuardians, setAllGuardians] = useState<GuardianWithLinks[]>([]);
  const [previewGuardianId, setPreviewGuardianId] = useState<string>('');

  const isStaffPreview = currentUser.role === 'admin' || currentUser.role === 'preceptor';

  useEffect(() => {
    if (!isStaffPreview) return;
    fetchGuardians()
      .then((list) => {
        setAllGuardians(list);
        if (!previewGuardianId && list[0]) {
          setPreviewGuardianId(list[0].id);
        }
      })
      .catch(() => {});
  }, [isStaffPreview]);

  const loadChildren = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchGuardianPortalChildren(
        date,
        isStaffPreview ? previewGuardianId || undefined : undefined
      );
      setChildren(res.children);
      if (res.children.length > 0) {
        const stillExists = res.children.some((c) => c.studentId === selectedStudentId);
        if (!stillExists) {
          setSelectedStudentId(res.children[0].studentId);
        }
      } else {
        setSelectedStudentId('');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo cargar el portal familiar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isStaffPreview && !previewGuardianId && allGuardians.length === 0) {
      setLoading(false);
      return;
    }
    loadChildren();
  }, [date, previewGuardianId, currentUser.id]);

  const activeChild = children.find((c) => c.studentId === selectedStudentId) || children[0];

  return (
    <div className="space-y-6">
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700 block">
            Portal de Padres y Tutores
          </span>
          <h3 className="text-xl font-extrabold text-slate-900">
            Asistencia de mis hijos
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Consulte horarios de ingreso, puntualidad, salidas e historial de sus hijos vinculados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isStaffPreview && allGuardians.length > 0 && (
            <select
              value={previewGuardianId}
              onChange={(e) => setPreviewGuardianId(e.target.value)}
              className="px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
              title="Vista de verificación por tutor"
            >
              {allGuardians.map((g) => (
                <option key={g.id} value={g.id}>
                  Tutor: {g.fullName}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || getLocalTodayISO())}
            className="px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-4 text-xs font-bold flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Selector de Hijo cuando el tutor tiene 2+ alumnos vinculados */}
      {children.length > 1 && (
        <div className="aero-glass-soft rounded-2xl p-3 border border-sky-200 flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-sky-900 px-2 flex items-center gap-1.5">
            <Users size={15} />
            <span>Cambiar hijo ({children.length}):</span>
          </span>
          {children.map((child) => (
            <button
              key={child.studentId}
              type="button"
              onClick={() => setSelectedStudentId(child.studentId)}
              className={`px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                activeChild?.studentId === child.studentId
                  ? 'aero-btn-primary text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-sky-200 hover:bg-sky-50'
              }`}
            >
              {child.fullName} ({child.course}° {child.division})
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="aero-glass rounded-3xl p-8 text-center text-sm font-bold text-slate-600">
          Cargando información escolar...
        </div>
      ) : !activeChild ? (
        <div className="aero-glass rounded-3xl p-8 text-center text-sm font-bold text-slate-500">
          No se encontraron alumnos vinculados a este padre o tutor.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Estado de Hoy del Alumno */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <div className="lg:col-span-5 flex items-center gap-4">
              {activeChild.photo ? (
                <img
                  src={activeChild.photo}
                  alt={activeChild.fullName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-sky-300 shadow-sm shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-900 font-black text-2xl flex items-center justify-center shrink-0">
                  {activeChild.fullName.charAt(0)}
                </div>
              )}
              <div>
                <h4 className="text-lg font-extrabold text-slate-900">{activeChild.fullName}</h4>
                <p className="text-xs font-bold text-sky-800">
                  {activeChild.course}° Año División &ldquo;{activeChild.division || 'A'}&rdquo; • Vínculo:{' '}
                  {activeChild.relationship}
                </p>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {activeChild.authorizedPickup
                    ? 'Tutor autorizado para retiros escolares'
                    : 'Sin autorización de retiro anticipado'}
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white/90 rounded-2xl p-3 border border-sky-100">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                  Estado ({date})
                </span>
                <p className="text-sm font-extrabold mt-1 flex items-center gap-1">
                  {activeChild.todayStatus?.entryStatus === 'presente' && (
                    <>
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span className="text-emerald-800">PRESENTE</span>
                    </>
                  )}
                  {activeChild.todayStatus?.entryStatus === 'tarde' && (
                    <>
                      <Clock size={15} className="text-amber-600" />
                      <span className="text-amber-800">TARDE</span>
                    </>
                  )}
                  {activeChild.todayStatus?.entryStatus === 'ausente' && (
                    <>
                      <XCircle size={15} className="text-rose-600" />
                      <span className="text-rose-800">AUSENTE</span>
                    </>
                  )}
                  {!activeChild.todayStatus?.entryStatus && (
                    <span className="text-slate-500">Sin registro</span>
                  )}
                </p>
              </div>

              <div className="bg-white/90 rounded-2xl p-3 border border-sky-100">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                  Hora Ingreso
                </span>
                <p className="text-sm font-mono font-extrabold text-slate-900 mt-1 tabular-nums">
                  {activeChild.todayStatus?.entryTime
                    ? `${activeChild.todayStatus.entryTime} hs`
                    : '--:--'}
                </p>
              </div>

              <div className="bg-white/90 rounded-2xl p-3 border border-sky-100">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                  Hora Salida
                </span>
                <p className="text-sm font-mono font-extrabold text-slate-900 mt-1 tabular-nums">
                  {activeChild.todayStatus?.exitTime
                    ? `${activeChild.todayStatus.exitTime} hs`
                    : 'En curso'}
                </p>
              </div>

              <div className="bg-white/90 rounded-2xl p-3 border border-sky-100">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                  Asistencia Ciclo
                </span>
                <p className="text-sm font-extrabold text-sky-800 mt-1 tabular-nums">
                  {activeChild.stats.attendancePercent}%
                </p>
              </div>
            </div>

            {activeChild.todayStatus?.exitType === 'retiro_anticipado' && (
              <div className="lg:col-span-12 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs font-bold text-amber-950 flex items-center gap-2">
                <LogOut size={16} className="text-amber-700 shrink-0" />
                <span>
                  Retiro anticipado registrado a las {activeChild.todayStatus.exitTime} hs — Retirado por:{' '}
                  {activeChild.todayStatus.authorizedPersonName} (
                  {activeChild.todayStatus.withdrawalReason || 'Sin detalle'})
                </span>
              </div>
            )}
          </div>

          {/* Historial reciente de movimientos */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3">
            <h4 className="text-sm font-extrabold text-slate-900">
              Historial de Asistencias, Tardanzas, Ausencias y Retiros
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-sky-100 text-[10px] uppercase text-slate-500 text-left">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Hora</th>
                    <th className="py-2 pr-3">Movimiento</th>
                    <th className="py-2 pr-3">Detalle</th>
                    <th className="py-2">Retira / Observación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100">
                  {activeChild.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 font-mono tabular-nums">{m.attendanceDate}</td>
                      <td className="py-2 pr-3 font-mono font-bold tabular-nums">{m.recordedTime} hs</td>
                      <td className="py-2 pr-3 font-extrabold uppercase text-[11px]">
                        {m.movementKind === 'ingreso' ? 'Ingreso' : 'Salida'}
                      </td>
                      <td className="py-2 pr-3 font-bold uppercase text-[11px]">
                        {m.movementKind === 'ingreso' ? m.attendanceStatus : m.exitType}
                      </td>
                      <td className="py-2 text-slate-700">
                        {m.movementKind === 'salida'
                          ? `${m.authorizedPersonName || ''} ${
                              m.withdrawalReason ? `(${m.withdrawalReason})` : ''
                            }`.trim()
                          : m.observations || '-'}
                      </td>
                    </tr>
                  ))}
                  {activeChild.movements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-5 text-center text-slate-500 italic">
                        Sin movimientos registrados aún.
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
