import React, { useState, useRef, useMemo } from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Hash,
  UserCheck,
  Upload,
  Trash2,
  ArrowRight,
  CheckCircle2,
  HardDrive,
  Sparkles,
  Calendar,
  Users,
  LogIn,
  AlertCircle,
} from 'lucide-react';
import { SchoolInfo, InstitutionType, InstitutionalUserProfile } from '../types';
import { compressImageFileToDataUrl } from '../services/storageService';
import {
  InitialSetupFieldKey,
  MAX_ACADEMIC_YEAR,
  MIN_ACADEMIC_YEAR,
  VALID_INSTITUTION_TYPES,
  sanitizeInitialSetupData,
  validateInitialSetupForm,
} from '../services/initialSetupValidation';

interface InitialSetupWizardProps {
  initialSchoolInfo: SchoolInfo;
  createdUsers: InstitutionalUserProfile[];
  onComplete: (configuredInfo: SchoolInfo) => void;
  onSelectExistingUser: (user: InstitutionalUserProfile) => void;
  exitNotice?: string | null;
}

export const InitialSetupWizard: React.FC<InitialSetupWizardProps> = ({
  initialSchoolInfo,
  createdUsers,
  onComplete,
  onSelectExistingUser,
  exitNotice,
}) => {
  const [formData, setFormData] = useState<SchoolInfo>({
    name: '',
    institutionType: undefined,
    institutionNumber: '',
    cue: '',
    address: '',
    locality: '',
    province: '',
    phone: '',
    email: '',
    principalName: '',
    academicYear: '',
    logo: undefined,
    isConfigured: false,
    installationId: initialSchoolInfo.installationId,
  });
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [touched, setTouched] = useState<Partial<Record<InitialSetupFieldKey, boolean>>>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const validation = useMemo(() => validateInitialSetupForm(formData), [formData]);

  const getFieldError = (field: InitialSetupFieldKey): string | undefined => {
    if (!hasAttemptedSubmit && !touched[field]) return undefined;
    return validation.errors[field];
  };

  const handleField = (field: keyof SchoolInfo, value: string | number | undefined) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errorMsg) setErrorMsg(null);
  };

  const handleBlur = (field: InitialSetupFieldKey) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const fieldInputClass = (field: InitialSetupFieldKey, extra = '') => {
    const hasErr = Boolean(getFieldError(field));
    return `w-full py-3 min-h-[44px] rounded-xl bg-white/90 border outline-none text-sm text-slate-900 transition-colors ${
      hasErr
        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-200'
        : 'border-sky-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-200'
    } ${extra}`;
  };

  const renderFieldError = (field: InitialSetupFieldKey) => {
    const err = getFieldError(field);
    if (!err) return null;
    return (
      <p
        id={`setup-error-${field}`}
        role="alert"
        className="mt-1.5 text-[11px] font-bold text-rose-700 flex items-center gap-1"
      >
        <AlertCircle size={12} className="shrink-0" />
        <span>{err}</span>
      </p>
    );
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingLogo(true);
    setErrorMsg(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 420, 0.9);
      handleField('logo', dataUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo cargar la imagen del escudo institucional.');
    } finally {
      setIsProcessingLogo(false);
      e.target.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    const currentValidation = validateInitialSetupForm(formData);
    if (!currentValidation.isValid) {
      const totalErrors = Object.keys(currentValidation.errors).length;
      setErrorMsg(
        totalErrors === 1
          ? 'Revise el campo marcado en rojo antes de completar la configuración inicial.'
          : `Complete y verifique los ${totalErrors} campos marcados en rojo antes de completar la configuración inicial.`
      );
      if (currentValidation.firstInvalidField && typeof document !== 'undefined') {
        const el = document.getElementById(`setup-${currentValidation.firstInvalidField}`);
        el?.focus();
      }
      return;
    }

    setErrorMsg(null);
    onComplete(sanitizeInitialSetupData(formData));
  };

  const handleEnterWithSelectedUser = () => {
    const chosen = createdUsers.find((user) => user.id === selectedUserId);
    if (!chosen) {
      setErrorMsg('Seleccione un usuario creado del menú desplegable para ingresar al sistema.');
      return;
    }
    onSelectExistingUser(chosen);
  };

  return (
    <div className="min-h-screen aero-canvas flex items-center justify-center p-4 sm:p-6 md:p-10">
      <div className="aero-glass rounded-[32px] max-w-4xl w-full overflow-hidden shadow-2xl border-2 border-white">
        {/* Cabecera Frutiger Aero */}
        <div className="aero-header text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/90 p-1.5 shadow-xl border border-white shrink-0 flex items-center justify-center overflow-hidden">
              {formData.logo ? (
                <img
                  src={formData.logo}
                  alt="Escudo institucional"
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <img
                  src="/aero-emblem.png"
                  alt="Emblema escolar"
                  className="w-full h-full object-cover rounded-xl"
                />
              )}
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-sky-100">
                <Sparkles size={14} className="text-emerald-300" />
                <span>Configuración Inicial del Establecimiento</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
                Bienvenido al Sistema de Gestión Escolar
              </h1>
              <p className="text-xs sm:text-sm text-sky-100/95 max-w-2xl">
                Personalice la identidad institucional una sola vez. El nombre, escudo y datos oficiales se aplicarán automáticamente en pantallas, boletines, reportes PDF, listados Excel y carnets con código QR.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 sm:p-8 space-y-6">
          {exitNotice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-2xl text-xs font-bold flex items-center gap-2.5">
              <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />
              <span>{exitNotice}</span>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-start gap-2.5"
            >
              <AlertCircle size={17} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Bloque Escudo / Logotipo */}
          <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-white border-2 border-sky-200 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
              {formData.logo ? (
                <img src={formData.logo} alt="Vista previa escudo" className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 size={32} className="text-sky-400" />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-sm font-extrabold text-slate-900">
                Logotipo o Escudo Institucional (Opcional)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Cargue una imagen desde su computadora o teléfono (PNG con fondo transparente, JPG o WebP).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                disabled={isProcessingLogo}
                onClick={() => logoInputRef.current?.click()}
                className="aero-btn-aqua px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-2"
              >
                <Upload size={15} />
                <span>{isProcessingLogo ? 'Procesando...' : formData.logo ? 'Cambiar Escudo' : 'Subir Escudo'}</span>
              </button>
              {formData.logo && (
                <button
                  type="button"
                  onClick={() => handleField('logo', undefined)}
                  className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center"
                  title="Quitar escudo"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Indicador de progreso de campos requeridos */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="font-semibold text-slate-600">
              Los campos marcados con <span className="text-rose-600 font-extrabold">*</span> son obligatorios para completar la configuración.
            </p>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold tabular-nums ${
                validation.isValid
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-sky-50 text-sky-900 border-sky-200'
              }`}
            >
              {validation.isValid && <CheckCircle2 size={13} className="text-emerald-600" />}
              <span>
                {validation.requiredValidCount} / {validation.requiredTotal} requeridos válidos
              </span>
            </span>
          </div>

          {/* Grilla de Datos Institucionales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="setup-name" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Nombre completo de la institución <span className="text-rose-600">*</span>
              </label>
              <input
                id="setup-name"
                type="text"
                required
                aria-invalid={Boolean(getFieldError('name'))}
                aria-describedby={getFieldError('name') ? 'setup-error-name' : undefined}
                value={formData.name}
                onChange={(e) => handleField('name', e.target.value)}
                onBlur={() => handleBlur('name')}
                className={fieldInputClass('name', 'px-4 font-bold')}
              />
              {renderFieldError('name')}
            </div>

            <div>
              <label htmlFor="setup-institutionType" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Tipo de institución <span className="text-rose-600">*</span>
              </label>
              <select
                id="setup-institutionType"
                required
                aria-invalid={Boolean(getFieldError('institutionType'))}
                aria-describedby={getFieldError('institutionType') ? 'setup-error-institutionType' : undefined}
                value={formData.institutionType || ''}
                onChange={(e) =>
                  handleField(
                    'institutionType',
                    e.target.value ? (e.target.value as InstitutionType) : undefined
                  )
                }
                onBlur={() => handleBlur('institutionType')}
                className={fieldInputClass('institutionType', 'px-4 font-semibold')}
              >
                <option value=""></option>
                {VALID_INSTITUTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              {renderFieldError('institutionType')}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="setup-institutionNumber" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  N° / Identificación
                </label>
                <div className="relative">
                  <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
                  <input
                    id="setup-institutionNumber"
                    type="text"
                    aria-invalid={Boolean(getFieldError('institutionNumber'))}
                    aria-describedby={
                      getFieldError('institutionNumber') ? 'setup-error-institutionNumber' : undefined
                    }
                    value={formData.institutionNumber || ''}
                    onChange={(e) => handleField('institutionNumber', e.target.value)}
                    onBlur={() => handleBlur('institutionNumber')}
                    className={fieldInputClass('institutionNumber', 'pl-9 pr-3 font-semibold')}
                  />
                </div>
                {renderFieldError('institutionNumber')}
              </div>
              <div>
                <label htmlFor="setup-cue" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  C.U.E.
                </label>
                <input
                  id="setup-cue"
                  type="text"
                  inputMode="numeric"
                  aria-invalid={Boolean(getFieldError('cue'))}
                  aria-describedby={getFieldError('cue') ? 'setup-error-cue' : undefined}
                  value={formData.cue || ''}
                  onChange={(e) => handleField('cue', e.target.value)}
                  onBlur={() => handleBlur('cue')}
                  className={fieldInputClass('cue', 'px-3 font-mono')}
                />
                {renderFieldError('cue')}
              </div>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="setup-address" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Dirección <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <MapPin size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
                <input
                  id="setup-address"
                  type="text"
                  required
                  aria-invalid={Boolean(getFieldError('address'))}
                  aria-describedby={getFieldError('address') ? 'setup-error-address' : undefined}
                  value={formData.address}
                  onChange={(e) => handleField('address', e.target.value)}
                  onBlur={() => handleBlur('address')}
                  className={fieldInputClass('address', 'pl-10 pr-4')}
                />
              </div>
              {renderFieldError('address')}
            </div>

            <div>
              <label htmlFor="setup-locality" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Localidad <span className="text-rose-600">*</span>
              </label>
              <input
                id="setup-locality"
                type="text"
                required
                aria-invalid={Boolean(getFieldError('locality'))}
                aria-describedby={getFieldError('locality') ? 'setup-error-locality' : undefined}
                value={formData.locality || ''}
                onChange={(e) => handleField('locality', e.target.value)}
                onBlur={() => handleBlur('locality')}
                className={fieldInputClass('locality', 'px-4')}
              />
              {renderFieldError('locality')}
            </div>

            <div>
              <label htmlFor="setup-province" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Provincia <span className="text-rose-600">*</span>
              </label>
              <input
                id="setup-province"
                type="text"
                required
                aria-invalid={Boolean(getFieldError('province'))}
                aria-describedby={getFieldError('province') ? 'setup-error-province' : undefined}
                value={formData.province || ''}
                onChange={(e) => handleField('province', e.target.value)}
                onBlur={() => handleBlur('province')}
                className={fieldInputClass('province', 'px-4')}
              />
              {renderFieldError('province')}
            </div>

            <div>
              <label htmlFor="setup-phone" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Teléfono de contacto <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
                <input
                  id="setup-phone"
                  type="tel"
                  required
                  aria-invalid={Boolean(getFieldError('phone'))}
                  aria-describedby={getFieldError('phone') ? 'setup-error-phone' : undefined}
                  value={formData.phone}
                  onChange={(e) => handleField('phone', e.target.value)}
                  onBlur={() => handleBlur('phone')}
                  className={fieldInputClass('phone', 'pl-10 pr-4')}
                />
              </div>
              {renderFieldError('phone')}
            </div>

            <div>
              <label htmlFor="setup-email" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Correo electrónico institucional <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
                <input
                  id="setup-email"
                  type="email"
                  required
                  aria-invalid={Boolean(getFieldError('email'))}
                  aria-describedby={getFieldError('email') ? 'setup-error-email' : undefined}
                  value={formData.email || ''}
                  onChange={(e) => handleField('email', e.target.value)}
                  onBlur={() => handleBlur('email')}
                  className={fieldInputClass('email', 'pl-10 pr-4')}
                />
              </div>
              {renderFieldError('email')}
            </div>

            <div>
              <label htmlFor="setup-principalName" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Director/a o responsable institucional <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <UserCheck size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
                <input
                  id="setup-principalName"
                  type="text"
                  required
                  aria-invalid={Boolean(getFieldError('principalName'))}
                  aria-describedby={getFieldError('principalName') ? 'setup-error-principalName' : undefined}
                  value={formData.principalName || ''}
                  onChange={(e) => handleField('principalName', e.target.value)}
                  onBlur={() => handleBlur('principalName')}
                  className={fieldInputClass('principalName', 'pl-10 pr-4')}
                />
              </div>
              {renderFieldError('principalName')}
            </div>

            <div>
              <label htmlFor="setup-academicYear" className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Ciclo Lectivo <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <Calendar size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
                <input
                  id="setup-academicYear"
                  type="number"
                  required
                  min={MIN_ACADEMIC_YEAR}
                  max={MAX_ACADEMIC_YEAR}
                  aria-invalid={Boolean(getFieldError('academicYear'))}
                  aria-describedby={getFieldError('academicYear') ? 'setup-error-academicYear' : undefined}
                  value={formData.academicYear}
                  onChange={(e) =>
                    handleField(
                      'academicYear',
                      e.target.value === '' ? '' : Number(e.target.value)
                    )
                  }
                  onBlur={() => handleBlur('academicYear')}
                  className={fieldInputClass('academicYear', 'pl-10 pr-4 font-bold tabular-nums')}
                />
              </div>
              {renderFieldError('academicYear')}
            </div>
          </div>

          {/* Nota transparente sobre persistencia local */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-950">
            <HardDrive size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold">Almacenamiento Local Independiente por Instalación</p>
              <p className="text-emerald-900/85 mt-0.5 leading-relaxed">
                Esta configuración se guarda localmente en este dispositivo sin modificar ni borrar registros previos de alumnos o docentes. En futuras versiones de escritorio para Windows, la capa de persistencia guarda los datos en la carpeta de perfil del usuario fuera del directorio de instalación. Podrá editar todos los campos en cualquier momento desde <strong>Configuración Institucional</strong>.
              </p>
            </div>
          </div>

          {/* Acceso mediante Usuarios Creados o Creación de Nuevo Usuario */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-3 border-t border-sky-100">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 min-w-[220px]">
                <Users
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-600 pointer-events-none"
                />
                <select
                  aria-label="Usuarios creados"
                  value={selectedUserId}
                  disabled={createdUsers.length === 0}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-xl bg-white/95 border border-sky-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {createdUsers.length === 0 ? (
                    <option value="">Usuarios creados (sin usuarios registrados)</option>
                  ) : (
                    <>
                      <option value="">
                        Usuarios creados ({createdUsers.length}) — Seleccione para ingresar
                      </option>
                      {createdUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.schoolInfo.name}
                          {user.schoolInfo.principalName ? ` — ${user.schoolInfo.principalName}` : ''}
                          {user.schoolInfo.academicYear ? ` (${user.schoolInfo.academicYear})` : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {createdUsers.length > 0 && (
                <button
                  type="button"
                  disabled={!selectedUserId}
                  onClick={handleEnterWithSelectedUser}
                  className="px-4 py-3 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.98] shrink-0"
                >
                  <LogIn size={15} />
                  <span>Ingresar</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              aria-disabled={!validation.isValid}
              className={`aero-btn-primary px-7 py-3 min-h-[48px] rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] shrink-0 transition-opacity ${
                validation.isValid ? 'opacity-100' : 'opacity-75'
              }`}
              title={
                validation.isValid
                  ? 'Guardar configuración inicial e ingresar al sistema'
                  : 'Complete todos los campos obligatorios (*) con datos válidos para continuar'
              }
            >
              <CheckCircle2 size={18} />
              <span>Guardar Configuración e Ingresar</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </form>

        {/* Leyenda inferior */}
        <div className="px-6 sm:px-8 py-3.5 bg-sky-50/70 border-t border-sky-100 text-center">
          <p className="text-[11px] sm:text-xs font-extrabold tracking-[0.14em] text-sky-900/85 uppercase">
            DISEÑADO POR NESTOR RAUL VEGA - 2027
          </p>
        </div>
      </div>
    </div>
  );
};
