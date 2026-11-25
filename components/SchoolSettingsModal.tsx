import React, { useState, useEffect, useRef } from 'react';
import { SchoolInfo, DEFAULT_SCHOOL_INFO, InstitutionType } from '../types';
import { compressImageFileToDataUrl } from '../services/storageService';
import {
  Building2,
  MapPin,
  Phone,
  Calendar,
  Mail,
  Hash,
  FileText,
  Check,
  X,
  RotateCcw,
  Save,
  Eye,
  ShieldCheck,
  Sparkles,
  Upload,
  Trash2,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';

const INSTITUTION_TYPES: InstitutionType[] = [
  'Jardín de Infantes',
  'Escuela Primaria',
  'Escuela Secundaria',
  'Escuela Técnica / Agrotécnica',
  'Instituto Superior',
  'Otra Institución',
];

interface SchoolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolInfo: SchoolInfo;
  onSave: (updated: SchoolInfo) => void;
  embedded?: boolean;
}

const createEmptySchoolFormData = (installationId?: string): SchoolInfo => ({
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
  installationId,
});

const isPreloadedSampleSchoolInfo = (info: SchoolInfo): boolean => {
  if (!info.isConfigured) return true;
  if (info.updatedAt) return false;
  return (
    info.name === DEFAULT_SCHOOL_INFO.name &&
    info.address === DEFAULT_SCHOOL_INFO.address &&
    info.phone === DEFAULT_SCHOOL_INFO.phone &&
    (info.cue || '') === (DEFAULT_SCHOOL_INFO.cue || '') &&
    (info.email || '') === (DEFAULT_SCHOOL_INFO.email || '')
  );
};

const buildInitialFormData = (info: SchoolInfo): SchoolInfo => {
  if (isPreloadedSampleSchoolInfo(info)) {
    return createEmptySchoolFormData(info.installationId);
  }
  return {
    ...createEmptySchoolFormData(info.installationId),
    ...info,
    name: info.name ?? '',
    institutionNumber: info.institutionNumber ?? '',
    cue: info.cue ?? '',
    address: info.address ?? '',
    locality: info.locality ?? '',
    province: info.province ?? '',
    phone: info.phone ?? '',
    email: info.email ?? '',
    principalName: info.principalName ?? '',
    academicYear: info.academicYear ?? '',
  };
};

export const SchoolSettingsModal: React.FC<SchoolSettingsModalProps> = ({
  isOpen,
  onClose,
  schoolInfo,
  onSave,
  embedded = false,
}) => {
  const [formData, setFormData] = useState<SchoolInfo>(() => buildInitialFormData(schoolInfo));
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen || embedded) {
      setFormData(buildInitialFormData(schoolInfo));
      setShowSavedFeedback(false);
      setErrorMessage(null);
      setShowConfirmSaveModal(false);
      setShowResetConfirm(false);
    }
  }, [isOpen, embedded, schoolInfo]);

  if (!embedded && !isOpen) return null;

  const handleChange = (field: keyof SchoolInfo, value: string | number | undefined) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (errorMessage) setErrorMessage(null);
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingLogo(true);
    setErrorMessage(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 420, 0.9);
      handleChange('logo', dataUrl);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al procesar el escudo institucional.');
    } finally {
      setIsProcessingLogo(false);
      e.target.value = '';
    }
  };

  const hasImportantChanges =
    formData.name.trim() !== schoolInfo.name.trim() ||
    String(formData.academicYear) !== String(schoolInfo.academicYear) ||
    formData.logo !== schoolInfo.logo ||
    (formData.cue || '') !== (schoolInfo.cue || '') ||
    (formData.institutionType || '') !== (schoolInfo.institutionType || '');

  const commitSave = () => {
    const parsedYear =
      formData.academicYear !== '' && !Number.isNaN(Number(formData.academicYear))
        ? Number(formData.academicYear)
        : new Date().getFullYear();

    const cleanPayload: SchoolInfo = {
      ...formData,
      name: formData.name.trim(),
      academicYear: parsedYear,
      isConfigured: true,
      updatedAt: new Date().toISOString(),
    };
    onSave(cleanPayload);
    setShowConfirmSaveModal(false);
    setShowSavedFeedback(true);
    setTimeout(() => {
      setShowSavedFeedback(false);
      if (!embedded) onClose();
    }, 1500);
  };

  const handleRequestSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage('El nombre de la institución no puede estar vacío.');
      return;
    }
    if (hasImportantChanges) {
      setShowConfirmSaveModal(true);
    } else {
      commitSave();
    }
  };

  const handleConfirmResetDefaults = () => {
    setFormData(createEmptySchoolFormData(schoolInfo.installationId));
    setShowResetConfirm(false);
  };

  const cardBody = (
    <div
      className={`aero-glass rounded-[28px] overflow-hidden border-2 border-white flex flex-col ${
        embedded ? 'w-full max-w-5xl mx-auto shadow-xl' : 'max-w-3xl w-full my-6 shadow-2xl'
      }`}
    >
      {/* Header Frutiger Aero */}
      <div className="aero-header text-white p-6 relative">
        {!embedded && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-sky-100 hover:text-white bg-white/15 hover:bg-white/25 p-2 rounded-full transition-all"
            aria-label="Cerrar configuración"
          >
            <X size={20} />
          </button>
        )}

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white/95 rounded-2xl shadow-lg flex items-center justify-center overflow-hidden p-1 shrink-0 border border-white">
            {formData.logo ? (
              <img src={formData.logo} alt="Escudo" className="w-full h-full object-contain" />
            ) : (
              <Building2 size={28} className="text-sky-600" />
            )}
          </div>
          <div>
            <span className="text-[11px] uppercase font-extrabold tracking-widest text-sky-100 block">
              Identidad Institucional Compartida
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              Configuración Institucional
            </h2>
            <p className="text-xs text-sky-100/90 mt-0.5">
              Personalice el nombre, escudo y datos oficiales utilizados automáticamente en todo el sistema, impresiones, reportes PDF, Excel y carnets QR.
            </p>
          </div>
        </div>

        {/* Pestañas */}
        <div className="flex flex-wrap gap-2 mt-5 border-t border-white/20 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold transition-all ${
              activeTab === 'form'
                ? 'bg-white text-sky-900 shadow-sm'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            <FileText size={14} />
            <span>Datos y Escudo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold transition-all ${
              activeTab === 'preview'
                ? 'bg-white text-sky-900 shadow-sm'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            <Eye size={14} />
            <span>Vista Previa en Documentos</span>
          </button>
        </div>
      </div>

      {/* Feedback de guardado */}
      {showSavedFeedback && (
        <div className="bg-emerald-500 text-white px-6 py-3 flex items-center justify-center gap-2 text-sm font-extrabold">
          <Check size={18} />
          <span>¡Configuración institucional aplicada en todo el sistema!</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-800 px-6 py-3 text-xs font-bold flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Contenido */}
      <div className={`p-6 md:p-8 ${embedded ? '' : 'max-h-[68vh] overflow-y-auto'}`}>
        {activeTab === 'form' ? (
          <form id="school-settings-form" onSubmit={handleRequestSave} className="space-y-6">
            {/* Escudo / Logotipo */}
            <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="w-20 h-20 rounded-2xl bg-white border-2 border-sky-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                {formData.logo ? (
                  <img src={formData.logo} alt="Escudo institucional" className="w-full h-full object-contain p-1" />
                ) : (
                  <img src="/aero-emblem.png" alt="Escudo por defecto" className="w-full h-full object-cover opacity-80" />
                )}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Escudo / Logotipo de la Institución
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Aparece en el encabezado principal, carnets de estudiantes y docentes, legajos impresos y reportes PDF.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFileChange}
                />
                <button
                  type="button"
                  disabled={isProcessingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="aero-btn-aqua px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-2"
                >
                  <Upload size={15} />
                  <span>{isProcessingLogo ? 'Cargando...' : formData.logo ? 'Cambiar Escudo' : 'Cargar Escudo'}</span>
                </button>
                {formData.logo && (
                  <button
                    type="button"
                    onClick={() => handleChange('logo', undefined)}
                    className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center"
                    title="Quitar escudo personalizado"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Sección 1: Identificación */}
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-2 mb-3">
                <Building2 size={15} />
                <span>1. Identificación y Tipo de Establecimiento</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Nombre completo de la institución <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Ingrese el nombre completo de la institución"
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm font-bold text-slate-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Ciclo Lectivo Vigente <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
                    <input
                      type="number"
                      min="2020"
                      max="2040"
                      required
                      value={formData.academicYear}
                      onChange={(e) =>
                        handleChange(
                          'academicYear',
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      placeholder="Ej. 2026"
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm font-extrabold text-sky-900 tabular-nums focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Tipo de institución
                  </label>
                  <select
                    value={formData.institutionType || ''}
                    onChange={(e) =>
                      handleChange(
                        'institutionType',
                        e.target.value ? (e.target.value as InstitutionType) : undefined
                      )
                    }
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm font-semibold text-slate-800 focus:border-sky-500 outline-none"
                  >
                    <option value="">Seleccione el tipo de institución...</option>
                    {INSTITUTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Número / Identificación
                  </label>
                  <input
                    type="text"
                    value={formData.institutionNumber || ''}
                    onChange={(e) => handleChange('institutionNumber', e.target.value)}
                    placeholder="Número o anexo institucional (opcional)"
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    C.U.E. (Código Único)
                  </label>
                  <div className="relative">
                    <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
                    <input
                      type="text"
                      value={formData.cue || ''}
                      onChange={(e) => handleChange('cue', e.target.value)}
                      placeholder="Ingrese el C.U.E. del establecimiento"
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm font-mono text-slate-800 focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sección 2: Ubicación y Contacto */}
            <div className="pt-4 border-t border-sky-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-2 mb-3">
                <MapPin size={15} />
                <span>2. Ubicación y Contacto Institucional</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Dirección <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="Calle, ruta, altura o referencia institucional"
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Localidad</label>
                  <input
                    type="text"
                    value={formData.locality || ''}
                    onChange={(e) => handleChange('locality', e.target.value)}
                    placeholder="Ingrese la localidad o departamento"
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Provincia</label>
                  <input
                    type="text"
                    value={formData.province || ''}
                    onChange={(e) => handleChange('province', e.target.value)}
                    placeholder="Ingrese la provincia"
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Teléfono</label>
                  <div className="relative">
                    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="Ingrese el teléfono de contacto"
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">Correo electrónico</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" />
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="correo@institucion.edu.ar"
                      className="w-full pl-9 pr-3 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sección 3: Autoridad y Persistencia */}
            <div className="pt-4 border-t border-sky-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-sky-800 flex items-center gap-2 mb-3">
                <ShieldCheck size={15} />
                <span>3. Dirección / Responsable Firmante</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Nombre del Director/a o Autoridad Responsable
                  </label>
                  <input
                    type="text"
                    value={formData.principalName || ''}
                    onChange={(e) => handleChange('principalName', e.target.value)}
                    placeholder="Ingrese el nombre del director/a o autoridad responsable"
                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-sky-200 rounded-xl text-sm text-slate-800 focus:border-sky-500 outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    Figura automáticamente al pie de boletines, legajos, informes PDF y dorso de carnets.
                  </p>
                </div>

                <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-3.5 text-xs text-slate-700 space-y-1">
                  <p className="font-extrabold text-sky-900 flex items-center gap-1.5">
                    <HardDrive size={14} className="text-teal-600" />
                    Aislamiento por instalación
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    ID de instalación local: <span className="font-mono font-bold text-sky-900">{formData.installationId?.slice(0, 12) || 'local'}</span>. Los datos se almacenan localmente en este equipo y se incluyen en cada copia de seguridad JSON.
                  </p>
                </div>
              </div>
            </div>

            {/* Restablecer */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
              {!showResetConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-sky-800 underline font-semibold"
                >
                  <RotateCcw size={13} />
                  <span>Restablecer valores predeterminados</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-xs">
                  <span className="font-bold text-amber-950">¿Restablecer campos?</span>
                  <button
                    type="button"
                    onClick={handleConfirmResetDefaults}
                    className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold"
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 font-bold"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </form>
        ) : (
          /* Vista Previa en Documentos */
          <div className="space-y-5">
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-start gap-3">
              <Sparkles size={18} className="text-sky-600 shrink-0 mt-0.5" />
              <p className="text-xs text-sky-950 leading-relaxed font-medium">
                Así aparecerá automáticamente la identidad institucional en encabezados de reportes PDF, libretas, legajos impresos y carnets escolares:
              </p>
            </div>

            <div className="border-2 border-sky-200 rounded-2xl overflow-hidden shadow-md bg-white">
              <div className="aero-header text-white p-5 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white p-1.5 shrink-0 flex items-center justify-center shadow">
                  {formData.logo ? (
                    <img src={formData.logo} alt="Escudo" className="w-full h-full object-contain" />
                  ) : (
                    <img src="/aero-emblem.png" alt="Emblema" className="w-full h-full object-cover rounded-xl" />
                  )}
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-100">
                    {formData.province ? `Provincia de ${formData.province}` : 'Establecimiento Educativo'} • {formData.institutionType || 'Institución Educativa'}
                  </p>
                  <h4 className="text-lg font-extrabold tracking-wide uppercase">
                    {formData.name || 'NOMBRE DE LA INSTITUCIÓN'}
                  </h4>
                  <p className="text-xs text-sky-100 mt-0.5">
                    {formData.address}
                    {formData.locality ? ` • ${formData.locality}` : ''}
                    {formData.phone ? ` • Tel: ${formData.phone}` : ''}
                    {formData.cue ? ` • CUE: ${formData.cue}` : ''}
                  </p>
                </div>
              </div>

              <div className="p-5 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Ciclo Lectivo</span>
                  <strong className="text-sky-900 text-sm">
                    {formData.academicYear ? `Ciclo ${formData.academicYear}` : 'Sin definir'}
                  </strong>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Autoridad / Dirección</span>
                  <strong className="text-slate-900 text-sm">{formData.principalName || 'Sin especificar'}</strong>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Canales de Contacto</span>
                  <span className="text-slate-700 font-semibold">
                    {formData.phone || 'Sin teléfono'} • {formData.email || 'Sin correo institucional'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 md:px-8 bg-white/80 border-t border-sky-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-slate-600">
          Cambios persistidos localmente; nunca eliminan registros de alumnos ni docentes.
        </p>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            form="school-settings-form"
            onClick={activeTab === 'preview' ? handleRequestSave : undefined}
            className="flex-1 sm:flex-none aero-btn-primary flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold active:scale-95"
          >
            <Save size={15} />
            <span>Guardar Configuración</span>
          </button>
        </div>
      </div>

      {/* Modal de Confirmación de Cambios Importantes */}
      {showConfirmSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4">
          <div className="aero-glass rounded-3xl max-w-md w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  ¿Confirmar cambios institucionales?
                </h4>
                <p className="text-xs text-slate-600">
                  Esta actualización modificará la cabecera, reportes PDF, exportaciones y carnets de toda la aplicación.
                </p>
              </div>
            </div>

            <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-3 text-xs space-y-1 text-slate-800">
              <p><strong>Institución:</strong> {formData.name}</p>
              <p><strong>Tipo:</strong> {formData.institutionType || 'Sin especificar'}</p>
              <p><strong>Ciclo Lectivo:</strong> {formData.academicYear}</p>
              <p><strong>Escudo:</strong> {formData.logo ? 'Personalizado cargado' : 'Emblema institucional por defecto'}</p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmSaveModal(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Revisar
              </button>
              <button
                type="button"
                onClick={commitSave}
                className="flex-1 aero-btn-emerald py-2.5 min-h-[44px] rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5"
              >
                <Check size={15} />
                <span>Sí, aplicar cambios</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return cardBody;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      {cardBody}
    </div>
  );
};
