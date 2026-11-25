import React, { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, UserCheck, LogOut, Lock, AlertCircle } from 'lucide-react';
import type { AuthUserSession } from '../shared/attendanceDomain';
import {
  bootstrapInitialAdmin,
  fetchAuthStatus,
  loginBackendUser,
  logoutBackendSession,
  recoverAdminWithPasscode,
} from '../services/attendanceApiClient';

interface BackendAuthGateProps {
  currentUser: AuthUserSession | null;
  onAuthenticated: (user: AuthUserSession) => void;
  title?: string;
  subtitle?: string;
}

export const ROLE_LABELS: Record<AuthUserSession['role'], string> = {
  admin: 'Director / Administrador',
  preceptor: 'Preceptor / Operador',
  docente: 'Docente',
  tutor: 'Padre / Madre / Tutor',
};

export const BackendAuthGate: React.FC<BackendAuthGateProps> = ({
  currentUser,
  onAuthenticated,
  title = 'Acceso Institucional — Control QR y Tutores',
  subtitle = 'Inicie sesión con su cuenta de Director, Preceptor, Docente o Padre/Tutor para operar con base de datos segura y auditoría.',
}) => {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [requiresPasscode, setRequiresPasscode] = useState(false);
  const [adminPasscodeConfigured, setAdminPasscodeConfigured] = useState(false);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapPasscode, setBootstrapPasscode] = useState('');
  const [initialAdminPasscode, setInitialAdminPasscode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAuthStatus()
      .then((res) => {
        if (!active) return;
        setHasAdmin(res.hasAdmin);
        setRequiresPasscode(res.requiresBootstrapPasscode);
        setAdminPasscodeConfigured(
          Boolean(res.adminPasscodeConfigured ?? res.requiresBootstrapPasscode)
        );
      })
      .catch(() => {
        if (!active) return;
        setErrorMsg('No se pudo verificar el estado del servidor de asistencia.');
      })
      .finally(() => {
        if (active) setLoadingStatus(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  if (currentUser) {
    return (
      <div className="aero-glass-soft rounded-2xl px-4 py-3 border border-sky-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
            <UserCheck size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-slate-900 truncate">
              {currentUser.fullName}{' '}
              <span className="text-sky-700 font-bold">(@{currentUser.username})</span>
            </p>
            <p className="text-[11px] font-bold text-slate-600">
              Rol activo: {ROLE_LABELS[currentUser.role]}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void logoutBackendSession();
          }}
          className="px-3.5 py-2 min-h-[38px] rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-colors"
        >
          <LogOut size={14} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    );
  }

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const user = await bootstrapInitialAdmin({
        fullName,
        username,
        email,
        password,
        bootstrapPasscode: requiresPasscode ? bootstrapPasscode : undefined,
        initialAdminPasscode: !requiresPasscode ? initialAdminPasscode : undefined,
      });
      setHasAdmin(true);
      if (requiresPasscode || initialAdminPasscode.trim().length >= 8) {
        setAdminPasscodeConfigured(true);
      }
      setInitialAdminPasscode('');
      setBootstrapPasscode('');
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error configurando el administrador.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const user = recoveryMode
        ? await recoverAdminWithPasscode({
            username,
            newPassword: password,
            bootstrapPasscode,
          })
        : await loginBackendUser(username, password);
      setRecoveryMode(false);
      onAuthenticated(user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Credenciales inválidas.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="aero-glass rounded-3xl p-8 text-center text-sm font-bold text-sky-900">
        Conectando con el servicio institucional de asistencia...
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto aero-glass rounded-[28px] p-6 sm:p-8 border-2 border-white shadow-xl space-y-5">
      <div className="flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md">
          {hasAdmin ? <Lock size={22} /> : <KeyRound size={22} />}
        </div>
        <div>
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700 block">
            {hasAdmin ? 'Autenticación por Roles (RBAC)' : 'Primer Acceso Institucional'}
          </span>
          <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
            {hasAdmin ? title : 'Crear Cuenta de Administrador Principal'}
          </h3>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            {hasAdmin
              ? subtitle
              : 'Aún no hay usuarios registrados en la base de datos. Configure la cuenta inicial de Director/Administrador para administrar horarios, tutores, operadores y reportes.'}
          </p>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 text-xs font-bold flex items-start gap-2"
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!hasAdmin ? (
        <form onSubmit={handleBootstrapSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Nombre y Apellido del Responsable
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Dirección Escolar / Prof. Laura Gómez"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Usuario de Acceso
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. direccion"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Correo Institucional
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="direccion@escuela.edu.ar"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              Contraseña (mínimo 6 caracteres)
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
            />
          </div>
          {requiresPasscode ? (
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Código de Activación del Servidor
              </label>
              <input
                type="password"
                required
                value={bootstrapPasscode}
                onChange={(e) => setBootstrapPasscode(e.target.value)}
                placeholder="Código institucional provisto por el servidor"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Código Privado de Administrador (mínimo 8 caracteres)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={initialAdminPasscode}
                onChange={(e) => setInitialAdminPasscode(e.target.value)}
                placeholder="Defina una clave privada para recuperación administrativa"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Se almacena cifrado únicamente en el servidor para recuperación segura del acceso administrativo.
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full aero-btn-primary py-3 min-h-[44px] rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <ShieldCheck size={18} />
            <span>{submitting ? 'Configurando...' : 'Activar Administrador e Ingresar'}</span>
          </button>
        </form>
      ) : (
        <form onSubmit={handleLoginSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">Usuario</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuario de operador, director o padre/tutor"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-slate-700 mb-1">
              {recoveryMode ? 'Nueva Contraseña (mínimo 6 caracteres)' : 'Contraseña'}
            </label>
            <input
              type="password"
              required
              minLength={recoveryMode ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
            />
          </div>
          {recoveryMode && adminPasscodeConfigured && (
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Código Privado de Administrador
              </label>
              <input
                type="password"
                required
                value={bootstrapPasscode}
                onChange={(e) => setBootstrapPasscode(e.target.value)}
                placeholder="Ingrese el código privado de administrador"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-sm font-semibold outline-none focus:border-sky-500"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full aero-btn-primary py-3 min-h-[44px] rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <ShieldCheck size={18} />
            <span>
              {submitting
                ? 'Verificando...'
                : recoveryMode
                ? 'Actualizar Contraseña e Ingresar'
                : 'Iniciar Sesión'}
            </span>
          </button>
          {adminPasscodeConfigured && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setRecoveryMode((prev) => !prev);
                }}
                className="text-xs font-bold text-sky-700 hover:text-sky-900 underline"
              >
                {recoveryMode
                  ? 'Volver al inicio de sesión habitual'
                  : 'Recuperar acceso de administrador con código privado'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};
