import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import type { Student } from '../types';
import type { AuthUserSession, ShiftType } from '../shared/attendanceDomain';
import {
  createGuardian,
  deleteStudentGuardianLink,
  fetchGuardians,
  linkGuardianToStudent,
  updateStudentShift,
  type GuardianWithLinks,
} from '../services/attendanceApiClient';
import { UserManagementPanel } from './UserManagementPanel';

interface GuardiansAndUsersPanelProps {
  students: Student[];
  currentUser: AuthUserSession;
}

export const GuardiansAndUsersPanel: React.FC<GuardiansAndUsersPanelProps> = ({
  students,
  currentUser,
}) => {
  const canManageGuardians = currentUser.role === 'admin' || currentUser.role === 'preceptor';
  const isAdmin = currentUser.role === 'admin';

  const [guardians, setGuardians] = useState<GuardianWithLinks[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // New guardian form
  const [gName, setGName] = useState('');
  const [gDni, setGDni] = useState('');
  const [gPhone, setGPhone] = useState('');
  const [gEmail, setGEmail] = useState('');

  // Link guardian <-> student form
  const [linkStudentId, setLinkStudentId] = useState(students[0]?.id || '');
  const [linkGuardianId, setLinkGuardianId] = useState('');
  const [linkRel, setLinkRel] = useState('Madre / Padre');
  const [linkPrimary, setLinkPrimary] = useState(true);
  const [linkPickup, setLinkPickup] = useState(true);

  // Student shift assignment
  const [shiftStudentId, setShiftStudentId] = useState(students[0]?.id || '');
  const [shiftValue, setShiftValue] = useState<ShiftType>('manana');
  const [divValue, setDivValue] = useState('');

  const loadAll = async () => {
    try {
      const gList = await fetchGuardians();
      setGuardians(gList);
      if (!linkGuardianId && gList[0]) setLinkGuardianId(gList[0].id);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error cargando nómina de tutores.',
      });
    }
  };

  useEffect(() => {
    loadAll();
  }, [currentUser.id]);

  const handleCreateGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const created = await createGuardian({
        fullName: gName,
        dni: gDni,
        phone: gPhone,
        email: gEmail,
      });
      setGName('');
      setGDni('');
      setGPhone('');
      setGEmail('');
      setLinkGuardianId(created.id);
      await loadAll();
      setFeedback({ type: 'ok', text: `Tutor ${created.fullName} registrado correctamente.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error creando tutor.' });
    }
  };

  const handleLinkStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkStudentId || !linkGuardianId) return;
    setFeedback(null);
    try {
      await linkGuardianToStudent(linkStudentId, {
        guardianId: linkGuardianId,
        relationship: linkRel,
        isPrimary: linkPrimary,
        authorizedPickup: linkPickup,
      });
      await loadAll();
      setFeedback({ type: 'ok', text: 'Vínculo alumno-tutor actualizado correctamente.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error vinculando tutor.' });
    }
  };

  const handleAssignShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftStudentId) return;
    setFeedback(null);
    try {
      await updateStudentShift(shiftStudentId, shiftValue, divValue.trim() || undefined);
      setDivValue('');
      setFeedback({ type: 'ok', text: 'Turno y división del estudiante actualizados.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error guardando turno.' });
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Alta de Padre o Tutor y Vínculo con Alumnos */}
      {canManageGuardians && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form
            onSubmit={handleCreateGuardian}
            className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3.5"
          >
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-sky-600" />
              <h3 className="text-base font-extrabold text-slate-900">
                Registrar Padre, Madre o Tutor
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-extrabold text-slate-700 mb-1">Nombre y Apellido</label>
                <input
                  type="text"
                  required
                  value={gName}
                  onChange={(e) => setGName(e.target.value)}
                  placeholder="Ej. María Pérez"
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-semibold"
                />
              </div>
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">DNI</label>
                <input
                  type="text"
                  value={gDni}
                  onChange={(e) => setGDni(e.target.value)}
                  placeholder="30111222"
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={gPhone}
                  onChange={(e) => setGPhone(e.target.value)}
                  placeholder="+5493815550000"
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-extrabold text-slate-700 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                  placeholder="tutor@correo.com"
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-semibold"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full aero-btn-primary py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold whitespace-nowrap"
            >
              Guardar Tutor
            </button>
          </form>

          <form
            onSubmit={handleLinkStudent}
            className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3.5"
          >
            <div className="flex items-center gap-2">
              <Link2 size={18} className="text-teal-600" />
              <h3 className="text-base font-extrabold text-slate-900">
                Vincular Tutor a Alumno (Autorización de Retiro)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">Estudiante</label>
                <select
                  value={linkStudentId}
                  onChange={(e) => setLinkStudentId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-bold"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} ({s.course}° {s.division || 'A'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-extrabold text-slate-700 mb-1">Padre / Tutor</label>
                <select
                  value={linkGuardianId}
                  onChange={(e) => setLinkGuardianId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-bold"
                >
                  <option value="">Seleccione un tutor...</option>
                  {guardians.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.fullName} (DNI {g.dni || 'S/D'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-extrabold text-slate-700 mb-1">Parentesco / Rol</label>
                <input
                  type="text"
                  value={linkRel}
                  onChange={(e) => setLinkRel(e.target.value)}
                  placeholder="Madre / Padre / Tutor legal"
                  className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-700 bg-sky-50/70 p-3 rounded-2xl border border-sky-100">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={linkPickup}
                  onChange={(e) => setLinkPickup(e.target.checked)}
                />
                <span>Autorizado retirar</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={linkPrimary}
                  onChange={(e) => setLinkPrimary(e.target.checked)}
                />
                <span>Tutor principal</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={!linkGuardianId || !linkStudentId}
              className="w-full aero-btn-emerald py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold whitespace-nowrap disabled:opacity-50"
            >
              Vincular Tutor y Estudiante
            </button>
          </form>
        </div>
      )}

      {/* Turno y División del alumno */}
      {canManageGuardians && (
        <form
          onSubmit={handleAssignShift}
          className="aero-glass rounded-3xl p-5 border border-white/90 flex flex-wrap items-end gap-3"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
              Asignar Turno / División al Alumno
            </label>
            <select
              value={shiftStudentId}
              onChange={(e) => setShiftStudentId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.course}° {s.division || 'A'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
              Turno Escolar
            </label>
            <select
              value={shiftValue}
              onChange={(e) => setShiftValue(e.target.value as ShiftType)}
              className="px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
            >
              <option value="manana">Mañana</option>
              <option value="tarde">Tarde</option>
              <option value="vespertino">Vespertino</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
              División (opcional)
            </label>
            <input
              type="text"
              value={divValue}
              onChange={(e) => setDivValue(e.target.value)}
              placeholder="Ej. A"
              className="w-24 px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
            />
          </div>
          <button
            type="submit"
            className="aero-btn-aqua px-4 py-2 min-h-[38px] rounded-xl text-xs font-extrabold whitespace-nowrap"
          >
            Guardar Turno
          </button>
        </form>
      )}

      {/* Listado de tutores vinculados */}
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-sky-600" />
          <h3 className="text-base font-extrabold text-slate-900">
            Padres y Tutores Registrados ({guardians.length})
          </h3>
        </div>
        {guardians.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Todavía no hay padres/tutores registrados. Agregue el primero arriba para habilitar autorizaciones de retiro y el portal familiar.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {guardians.map((g) => (
              <div
                key={g.id}
                className="bg-white/90 border border-sky-100 rounded-2xl p-4 space-y-2 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">{g.fullName}</h4>
                    <p className="text-[11px] font-mono text-slate-600">
                      DNI: {g.dni || 'S/D'} • Tel: {g.phone || '-'} • {g.email || 'Sin email'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5 pt-1 border-t border-sky-100">
                  {g.linkedStudents.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Sin alumnos vinculados aún</p>
                  ) : (
                    g.linkedStudents.map((ls) => (
                      <div
                        key={ls.linkId}
                        className="flex items-center justify-between gap-2 text-xs bg-sky-50/70 px-2.5 py-1.5 rounded-xl"
                      >
                        <div className="min-w-0">
                          <span className="font-extrabold text-sky-950">{ls.studentName}</span>{' '}
                          <span className="text-slate-600">
                            ({ls.course}° {ls.division} • {ls.relationship})
                          </span>
                          <span className="block text-[10px] font-bold text-slate-500">
                            {ls.authorizedPickup ? 'Retiro Autorizado' : 'Vínculo Familiar (No retira)'}
                            {ls.isPrimary ? ' • Tutor principal' : ''}
                          </span>
                        </div>
                        {canManageGuardians && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteStudentGuardianLink(ls.linkId);
                              loadAll();
                            }}
                            className="p-1 text-rose-600 hover:bg-rose-100 rounded-lg shrink-0"
                            title="Desvincular alumno"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Administración de cuentas de usuario y acceso RBAC */}
      {isAdmin && (
        <UserManagementPanel currentUser={currentUser} guardians={guardians} />
      )}
    </div>
  );
};
