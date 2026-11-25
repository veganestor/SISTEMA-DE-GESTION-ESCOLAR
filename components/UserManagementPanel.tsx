import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react';
import type { AuthUserSession, UserRole } from '../shared/attendanceDomain';
import {
  createBackendUser,
  fetchGuardians,
  fetchUsersList,
  getInMemorySession,
  toggleUserActiveStatus,
  type GuardianWithLinks,
} from '../services/attendanceApiClient';

export type ManagedUserRecord = AuthUserSession & {
  guardianName?: string;
  isActive: boolean;
  createdAt: string;
};

export interface UserManagementPanelProps {
  currentUser?: AuthUserSession | null;
  guardians?: GuardianWithLinks[];
  onUsersChanged?: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  preceptor: 'Preceptor / Operador',
  docente: 'Docente',
  tutor: 'Padre / Tutor',
};

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  currentUser,
  guardians: externalGuardians,
  onUsersChanged,
}) => {
  const effectiveUser = currentUser ?? getInMemorySession();
  const isAdmin = effectiveUser?.role === 'admin';

  const [users, setUsers] = useState<ManagedUserRecord[]>([]);
  const [guardians, setGuardians] = useState<GuardianWithLinks[]>(externalGuardians ?? []);
  const [loading, setLoading] = useState<boolean>(Boolean(isAdmin));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Create form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('preceptor');
  const [guardianId, setGuardianId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (externalGuardians) {
      setGuardians(externalGuardians);
      if (!guardianId && externalGuardians[0]) {
        setGuardianId(externalGuardians[0].id);
      }
    }
  }, [externalGuardians, guardianId]);

  const loadUsersAndGuardians = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [usersList, guardiansList] = await Promise.all([
        fetchUsersList(),
        externalGuardians ? Promise.resolve(externalGuardians) : fetchGuardians(),
      ]);
      setUsers(usersList);
      if (!externalGuardians) {
        setGuardians(guardiansList);
        if (!guardianId && guardiansList[0]) {
          setGuardianId(guardiansList[0].id);
        }
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'No se pudo cargar la nómina de usuarios.'
      );
    } finally {
      setLoading(false);
    }
  }, [isAdmin, externalGuardians, guardianId]);

  useEffect(() => {
    loadUsersAndGuardians();
  }, [loadUsersAndGuardians]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'inactive' && u.isActive) return false;
      if (q) {
        const hay = `${u.fullName} ${u.username} ${u.email || ''} ${u.guardianName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, searchTerm, roleFilter, statusFilter]);

  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users]);
  const inactiveCount = users.length - activeCount;

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || submitting) return;
    setFeedback(null);

    const cleanFullName = fullName.trim();
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim();

    if (cleanFullName.length < 3 || cleanUsername.length < 3 || password.length < 6) {
      setFeedback({
        type: 'err',
        text: 'Complete nombre completo (mín. 3), usuario (mín. 3) y contraseña (mín. 6 caracteres).',
      });
      return;
    }

    if (role === 'tutor' && !guardianId) {
      setFeedback({
        type: 'err',
        text: 'Debe seleccionar un padre o tutor vinculado para las cuentas con rol Tutor.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await createBackendUser({
        fullName: cleanFullName,
        username: cleanUsername,
        email: cleanEmail,
        password,
        role,
        guardianId: role === 'tutor' ? guardianId : null,
      });

      setFullName('');
      setUsername('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      await loadUsersAndGuardians();
      onUsersChanged?.();
      setFeedback({
        type: 'ok',
        text: `Cuenta "${cleanUsername}" (${ROLE_LABELS[role]}) creada correctamente.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo crear la cuenta de usuario.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: ManagedUserRecord) => {
    if (!isAdmin || togglingUserId) return;
    if (effectiveUser && user.id === effectiveUser.id && user.isActive) {
      setFeedback({
        type: 'err',
        text: 'No puede desactivar su propia sesión de administrador activa.',
      });
      return;
    }

    setFeedback(null);
    setTogglingUserId(user.id);
    const nextActive = !user.isActive;
    try {
      await toggleUserActiveStatus(user.id, nextActive);
      setUsers((prev) =>
        prev.map((item) => (item.id === user.id ? { ...item, isActive: nextActive } : item))
      );
      onUsersChanged?.();
      setFeedback({
        type: 'ok',
        text: nextActive
          ? `Usuario "${user.username}" reactivado.`
          : `Usuario "${user.username}" desactivado.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudo actualizar el estado del usuario.',
      });
    } finally {
      setTogglingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="aero-glass rounded-3xl p-6 border border-white/90 flex items-start gap-3">
        <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="text-sm font-extrabold text-slate-900">
            Acceso exclusivo de Administración
          </h3>
          <p className="text-xs text-slate-600">
            Solo los usuarios con rol Administrador pueden consultar la nómina de cuentas, crear nuevos accesos o modificar estados activos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-6">
      {/* Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-sky-100">
        <div className="flex items-start gap-2.5">
          <Shield size={20} className="text-sky-700 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Gestión de Usuarios y Roles Institucionales
            </h3>
            <p className="text-xs text-slate-600">
              <span className="tabular-nums font-bold text-slate-800">{users.length}</span> cuentas registradas
              {' · '}
              <span className="tabular-nums font-bold text-emerald-700">{activeCount}</span> activas
              {' · '}
              <span className="tabular-nums font-bold text-slate-600">{inactiveCount}</span> inactivas
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadUsersAndGuardians}
          disabled={loading}
          className="px-3.5 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white hover:bg-sky-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Actualizar listado</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`px-4 py-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 size={16} className="shrink-0" />
          ) : (
            <AlertTriangle size={16} className="shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Create New Account Form */}
      <form
        onSubmit={handleCreateAccount}
        className="space-y-3 pb-5 border-b border-sky-100"
        aria-label="Crear nueva cuenta de usuario"
      >
        <div className="flex items-center gap-2">
          <UserPlus size={16} className="text-sky-700" />
          <h4 className="text-sm font-extrabold text-slate-900">Nueva Cuenta de Acceso</h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
          <div>
            <label
              htmlFor="ump-fullname"
              className="block font-bold text-slate-700 mb-1"
            >
              Nombre completo
            </label>
            <input
              id="ump-fullname"
              type="text"
              required
              minLength={3}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Preceptoría Mañana"
              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white font-semibold text-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="ump-username"
              className="block font-bold text-slate-700 mb-1"
            >
              Usuario
            </label>
            <input
              id="ump-username"
              type="text"
              required
              minLength={3}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ej. preceptor_tm"
              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white font-mono font-bold text-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="ump-password"
              className="block font-bold text-slate-700 mb-1"
            >
              Contraseña
            </label>
            <div className="relative">
              <input
                id="ump-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mín. 6 caracteres"
                className="w-full pl-3 pr-9 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white font-semibold text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800"
                title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ump-role" className="block font-bold text-slate-700 mb-1">
              Rol asignado
            </label>
            <select
              id="ump-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white font-bold text-slate-900"
            >
              <option value="preceptor">Preceptor / Operador</option>
              <option value="docente">Docente</option>
              <option value="tutor">Padre / Tutor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          {role === 'tutor' ? (
            <div>
              <label
                htmlFor="ump-guardian"
                className="block font-bold text-slate-700 mb-1"
              >
                Tutor vinculado
              </label>
              <select
                id="ump-guardian"
                required
                value={guardianId}
                onChange={(e) => setGuardianId(e.target.value)}
                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white font-bold text-slate-900"
              >
                <option value="">Seleccione tutor...</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label
                htmlFor="ump-email"
                className="block font-bold text-slate-700 mb-1"
              >
                Correo electrónico
              </label>
              <input
                id="ump-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="opcional@escuela.edu.ar"
                className="w-full px-3 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white font-semibold text-slate-900"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="aero-btn-primary px-4 py-2 min-h-[40px] rounded-xl font-extrabold whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {submitting ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </div>
      </form>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre, usuario o email..."
            className="w-full pl-9 pr-3 py-2 min-h-[40px] rounded-xl border border-sky-200 bg-white text-xs font-semibold text-slate-900"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-sky-50 border border-sky-100 rounded-xl">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'admin', label: 'Admin' },
                { id: 'preceptor', label: 'Preceptor' },
                { id: 'docente', label: 'Docente' },
                { id: 'tutor', label: 'Tutor' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRoleFilter(opt.id)}
                className={`px-3 py-1.5 min-h-[32px] rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                  roleFilter === opt.id
                    ? 'bg-white text-sky-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-sky-50 border border-sky-100 rounded-xl">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'active', label: 'Activos' },
                { id: 'inactive', label: 'Inactivos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-3 py-1.5 min-h-[32px] rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                  statusFilter === opt.id
                    ? 'bg-white text-sky-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Users Data Table */}
      {loadError ? (
        <div className="px-4 py-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadUsersAndGuardians}
            className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-800 hover:bg-rose-100 whitespace-nowrap"
          >
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2 py-2" aria-busy="true" aria-label="Cargando usuarios">
          {[0, 1, 2].map((rowIdx) => (
            <div
              key={rowIdx}
              className="h-11 rounded-xl bg-sky-100/60 animate-pulse"
            />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-sky-200 rounded-2xl space-y-1.5">
          <p className="text-sm font-bold text-slate-700">
            No se encontraron cuentas con los criterios seleccionados
          </p>
          <p className="text-xs text-slate-500">
            Ajuste los filtros de búsqueda o cree una nueva cuenta mediante el formulario superior.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-sky-100 text-slate-500 text-[11px] font-bold text-left">
                <th className="py-2.5 pr-3">Nombre y contacto</th>
                <th className="py-2.5 pr-3">Usuario</th>
                <th className="py-2.5 pr-3">Rol</th>
                <th className="py-2.5 pr-3">Alta</th>
                <th className="py-2.5 pr-3">Estado</th>
                <th className="py-2.5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-100">
              {filteredUsers.map((u) => {
                const isSelf = Boolean(effectiveUser && u.id === effectiveUser.id);
                const isBusy = togglingUserId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-sky-50/50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <div className="font-extrabold text-slate-900">{u.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {u.email || 'Sin email'}
                        {u.guardianName ? ` · Tutor: ${u.guardianName}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono font-bold text-sky-900 whitespace-nowrap">
                      {u.username}
                    </td>
                    <td className="py-2.5 pr-3 font-semibold text-slate-700 whitespace-nowrap">
                      {ROLE_LABELS[u.role] || u.role}
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {u.createdAt ? u.createdAt.slice(0, 10) : '-'}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {u.isActive ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                          <UserCheck size={14} />
                          <span>Activo</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                          <UserX size={14} />
                          <span>Inactivo</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {isSelf ? (
                        <span className="text-[11px] font-semibold text-slate-400">
                          Sesión actual
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleStatus(u)}
                          className={`px-3 py-1.5 min-h-[34px] rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50 ${
                            u.isActive
                              ? 'border-rose-200 bg-white hover:bg-rose-50 text-rose-700'
                              : 'border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {isBusy
                            ? 'Actualizando...'
                            : u.isActive
                              ? 'Desactivar'
                              : 'Reactivar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
