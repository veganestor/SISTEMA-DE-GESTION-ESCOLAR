import React, { useState, useEffect, useMemo } from 'react';
import {
  Palette,
  LayoutTemplate,
  SlidersHorizontal,
  RotateCcw,
  Save,
  Check,
  Eye,
  GraduationCap,
  Users,
  ShieldCheck,
  Sparkles,
  FileText,
  Calendar,
} from 'lucide-react';
import {
  SchoolInfo,
  CardDesignConfig,
  DEFAULT_CARD_DESIGN_CONFIG,
  CardLayoutPreset,
  CardOrientation,
  CardSizePreset,
  CardFontFamily,
  Student,
  Teacher,
  IssuedCardRecord,
} from '../types';
import { CarnetPreviewCard } from './CarnetPreviewCard';
import {
  PrintableCardItem,
  buildStudentPrintableCard,
  buildTeacherPrintableCard,
} from '../services/cardPdfExport';
import { getLocalTodayISO } from '../services/storageService';

interface CardDesignCenterProps {
  schoolInfo: SchoolInfo;
  config: CardDesignConfig;
  onSaveConfig: (next: CardDesignConfig) => void;
  sampleStudent?: Student;
  sampleTeacher?: Teacher;
}

const COLOR_PRESETS: {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  accent: string;
  layout: CardLayoutPreset;
}[] = [
  {
    id: 'aero-sky',
    label: 'Cielo Frutiger Aero',
    primary: '#0284c7',
    secondary: '#06b6d4',
    accent: '#10b981',
    layout: 'aero-wave',
  },
  {
    id: 'crystal-ocean',
    label: 'Cristal Marino',
    primary: '#0369a1',
    secondary: '#38bdf8',
    accent: '#14b8a6',
    layout: 'crystal-clean',
  },
  {
    id: 'emerald-campus',
    label: 'Verde Agua Natural',
    primary: '#0f766e',
    secondary: '#14b8a6',
    accent: '#22c55e',
    layout: 'emerald-nature',
  },
  {
    id: 'institutional-blue',
    label: 'Azul Institucional Clásico',
    primary: '#1d4ed8',
    secondary: '#0ea5e9',
    accent: '#f59e0b',
    layout: 'crystal-clean',
  },
];

export const CardDesignCenter: React.FC<CardDesignCenterProps> = ({
  schoolInfo,
  config,
  onSaveConfig,
  sampleStudent,
  sampleTeacher,
}) => {
  const [draft, setDraft] = useState<CardDesignConfig>(config);
  const [previewTarget, setPreviewTarget] = useState<'student' | 'teacher'>('student');
  const [savedBanner, setSavedBanner] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewItem, setPreviewItem] = useState<PrintableCardItem | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const fallbackStudent: Student = useMemo(
    () =>
      sampleStudent || {
        id: 'sample-preview-stu',
        fullName: 'GÓMEZ, VALENTINA MARÍA',
        birthDate: '2010-05-14',
        dni: '50123456',
        address: '',
        course: '3',
        division: 'A',
        grades: {},
        attendance: [],
        medical: { treatments: '', medications: '', notes: '' },
        disciplinary: [],
      },
    [sampleStudent]
  );

  const fallbackTeacher: Teacher = useMemo(
    () =>
      sampleTeacher || {
        id: 'sample-preview-tea',
        fullName: 'FERNÁNDEZ, CARLOS ALBERTO',
        dni: '31456789',
        birthDate: '1984-08-22',
        legajo: 'DOC-1042',
        entryDate: '2018-03-01',
        address: '',
        hours: 24,
        phone: '',
        email: '',
        role: 'Profesor Titular',
        assignedCourses: [
          { course: '3', subject: 'MATEMÁTICA 3' },
          { course: '4', subject: 'FÍSICA 3' },
        ],
        attendance: [],
      },
    [sampleTeacher]
  );

  useEffect(() => {
    let active = true;
    const today = getLocalTodayISO();

    const buildPreview = async () => {
      if (previewTarget === 'student') {
        const mockRecord: IssuedCardRecord = {
          cardNumber: `EST-${schoolInfo.academicYear}-0001`,
          personId: fallbackStudent.id,
          personType: 'student',
          issuedAt: today,
          validUntil: draft.validityDate || `${schoolInfo.academicYear}-12-31`,
          academicYear: String(schoolInfo.academicYear),
          status: 'vigente',
          reissueCount: 1,
          snapshotName: fallbackStudent.fullName,
          snapshotRoleOrCourse: `${fallbackStudent.course}° Año`,
        };
        const item = await buildStudentPrintableCard(fallbackStudent, schoolInfo, mockRecord, draft);
        if (active) setPreviewItem(item);
      } else {
        const mockRecord: IssuedCardRecord = {
          cardNumber: `DOC-${schoolInfo.academicYear}-0001`,
          personId: fallbackTeacher.id,
          personType: 'teacher',
          issuedAt: today,
          validUntil: draft.validityDate || `${schoolInfo.academicYear}-12-31`,
          academicYear: String(schoolInfo.academicYear),
          status: 'vigente',
          reissueCount: 1,
          snapshotName: fallbackTeacher.fullName,
          snapshotRoleOrCourse: fallbackTeacher.role || 'Personal Docente',
        };
        const item = await buildTeacherPrintableCard(fallbackTeacher, schoolInfo, mockRecord, draft);
        if (active) setPreviewItem(item);
      }
    };

    buildPreview();
    return () => {
      active = false;
    };
  }, [draft, previewTarget, schoolInfo, fallbackStudent, fallbackTeacher]);

  const updateField = <K extends keyof CardDesignConfig>(key: K, value: CardDesignConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSavedBanner(false);
  };

  const handleSave = () => {
    onSaveConfig(draft);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2600);
  };

  const handleResetDefaults = () => {
    const resetVal: CardDesignConfig = {
      ...DEFAULT_CARD_DESIGN_CONFIG,
      validityDate: `${schoolInfo.academicYear}-12-31`,
    };
    setDraft(resetVal);
    onSaveConfig(resetVal);
    setConfirmReset(false);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 2400);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Cabecera */}
      <div className="aero-glass rounded-[28px] p-5 sm:p-7 border border-white/90 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
            <Sparkles size={14} className="text-teal-500" />
            <span>Centro de Personalización Visual de Credenciales</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Personalizar Diseño de Carnets
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
            Configure colores, formato, tipografía, campos visibles, vigencia y dorso institucional. Los ajustes afectan únicamente el aspecto de los carnets y nunca modifican los registros de alumnos ni docentes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/85 hover:bg-white border border-sky-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <RotateCcw size={15} />
              <span>Restablecer</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl text-xs">
              <span className="font-bold text-amber-950">¿Restablecer diseño?</span>
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 font-bold"
              >
                No
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="aero-btn-primary px-6 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md active:scale-95"
          >
            <Save size={16} />
            <span>Guardar Diseño</span>
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm font-extrabold">
          <Check size={18} />
          <span>¡Diseño de carnets guardado! Se aplicará automáticamente en Carnets de Estudiantes, Docentes y PDF.</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Panel Izquierdo: Controles */}
        <div className="xl:col-span-7 space-y-5">
          {/* 1. Paleta y Estilo */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
            <h3 className="text-sm font-extrabold text-sky-950 uppercase tracking-wider flex items-center gap-2">
              <Palette size={17} className="text-sky-600" />
              <span>1. Paleta Institucional y Estilo Visual</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {COLOR_PRESETS.map((preset) => {
                const isSelected =
                  draft.primaryColor.toLowerCase() === preset.primary.toLowerCase() &&
                  draft.secondaryColor.toLowerCase() === preset.secondary.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        primaryColor: preset.primary,
                        secondaryColor: preset.secondary,
                        accentColor: preset.accent,
                        layoutPreset: preset.layout,
                      }))
                    }
                    className={`p-3 rounded-2xl border text-left transition-all min-h-[68px] ${
                      isSelected
                        ? 'bg-sky-50 border-sky-500 ring-2 ring-sky-200 shadow-sm'
                        : 'bg-white/80 border-sky-100 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded-full shadow-inner border border-white" style={{ background: preset.primary }} />
                      <span className="w-5 h-5 rounded-full shadow-inner border border-white" style={{ background: preset.secondary }} />
                      <span className="w-5 h-5 rounded-full shadow-inner border border-white" style={{ background: preset.accent }} />
                    </div>
                    <span className="text-[11px] font-extrabold text-slate-800 leading-tight block">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <label className="bg-white/80 border border-sky-100 rounded-2xl p-3 flex items-center justify-between gap-2 cursor-pointer">
                <div>
                  <span className="text-[11px] font-extrabold text-slate-800 block">Color Primario</span>
                  <span className="text-[10px] font-mono text-slate-500">{draft.primaryColor}</span>
                </div>
                <input
                  type="color"
                  value={draft.primaryColor}
                  onChange={(e) => updateField('primaryColor', e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                />
              </label>

              <label className="bg-white/80 border border-sky-100 rounded-2xl p-3 flex items-center justify-between gap-2 cursor-pointer">
                <div>
                  <span className="text-[11px] font-extrabold text-slate-800 block">Color Secundario</span>
                  <span className="text-[10px] font-mono text-slate-500">{draft.secondaryColor}</span>
                </div>
                <input
                  type="color"
                  value={draft.secondaryColor}
                  onChange={(e) => updateField('secondaryColor', e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                />
              </label>

              <label className="bg-white/80 border border-sky-100 rounded-2xl p-3 flex items-center justify-between gap-2 cursor-pointer">
                <div>
                  <span className="text-[11px] font-extrabold text-slate-800 block">Color Acento</span>
                  <span className="text-[10px] font-mono text-slate-500">{draft.accentColor}</span>
                </div>
                <input
                  type="color"
                  value={draft.accentColor}
                  onChange={(e) => updateField('accentColor', e.target.value)}
                  className="w-10 h-10 rounded-xl cursor-pointer border-0 bg-transparent"
                />
              </label>
            </div>
          </div>

          {/* 2. Formato, Orientación y Tipografía */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
            <h3 className="text-sm font-extrabold text-sky-950 uppercase tracking-wider flex items-center gap-2">
              <LayoutTemplate size={17} className="text-teal-600" />
              <span>2. Formato Físico, Orientación y Tipografía</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1.5">Orientación del Carnet</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['horizontal', 'vertical'] as CardOrientation[]).map((ori) => (
                    <button
                      key={ori}
                      type="button"
                      onClick={() => updateField('orientation', ori)}
                      className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-extrabold border transition-all ${
                        draft.orientation === ori
                          ? 'bg-sky-600 text-white border-sky-600 shadow'
                          : 'bg-white/80 text-slate-700 border-sky-200 hover:bg-white'
                      }`}
                    >
                      {ori === 'horizontal' ? 'Horizontal' : 'Vertical'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-bold text-slate-700 mb-1.5">Tamaño en Impresión PDF</span>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'cr80', label: 'CR80 (85.6×54mm)' },
                    { id: 'large', label: 'Amplio (92×58mm)' },
                  ] as { id: CardSizePreset; label: string }[]).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => updateField('sizePreset', sz.id)}
                      className={`py-2.5 px-2.5 min-h-[44px] rounded-xl text-[11px] font-extrabold border transition-all ${
                        draft.sizePreset === sz.id
                          ? 'bg-sky-600 text-white border-sky-600 shadow'
                          : 'bg-white/80 text-slate-700 border-sky-200 hover:bg-white'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Estilo de Encabezado</label>
                <select
                  value={draft.layoutPreset}
                  onChange={(e) => updateField('layoutPreset', e.target.value as CardLayoutPreset)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                >
                  <option value="aero-wave">Frutiger Aero Luminoso (Tri-tono)</option>
                  <option value="crystal-clean">Cristal Limpio (Cielo + Celeste)</option>
                  <option value="emerald-nature">Naturaleza Aqua (Primario + Verde)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Familia Tipográfica</label>
                <select
                  value={draft.fontFamily}
                  onChange={(e) => updateField('fontFamily', e.target.value as CardFontFamily)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                >
                  <option value="jakarta">Plus Jakarta Sans (Moderna Aero)</option>
                  <option value="dm">DM Sans (Geométrica Limpia)</option>
                  <option value="classic">Clásica Serif (Protocolar)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. Campos Visibles y Privacidad */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
            <h3 className="text-sm font-extrabold text-sky-950 uppercase tracking-wider flex items-center gap-2">
              <SlidersHorizontal size={17} className="text-emerald-600" />
              <span>3. Campos Visibles y Privacidad</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'showStudentPhoto' as const, label: 'Mostrar foto en carnet estudiantil' },
                { key: 'showStudentDivision' as const, label: 'Mostrar división / subtítulo del alumno' },
                { key: 'showStudentDniMasked' as const, label: 'Mostrar DNI enmascarado (***123) en alumno' },
                { key: 'showTeacherPhoto' as const, label: 'Mostrar foto en carnet docente' },
                { key: 'showTeacherDni' as const, label: 'Mostrar DNI en carnet docente' },
                { key: 'showTeacherSubjects' as const, label: 'Mostrar materias / área asignada en docente' },
                { key: 'showContactOnBack' as const, label: 'Incluir contacto institucional en el dorso' },
                { key: 'includeMaskedDniInQr' as const, label: 'Incluir referencia DNI enmascarada en el QR' },
              ].map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex items-center justify-between gap-3 bg-white/85 border border-sky-100 rounded-2xl px-3.5 py-3 cursor-pointer hover:bg-white min-h-[48px]"
                >
                  <span className="text-xs font-bold text-slate-800 leading-snug">{toggle.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(draft[toggle.key])}
                    onChange={(e) => updateField(toggle.key, e.target.checked)}
                    className="w-5 h-5 accent-sky-600 rounded shrink-0 cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-[11px] text-emerald-950">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>Privacidad de menores garantizada:</strong> el código QR nunca incluye domicilio, teléfono personal, historia médica ni datos familiares.
              </p>
            </div>
          </div>

          {/* 4. Textos, Títulos y Vigencia */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
            <h3 className="text-sm font-extrabold text-sky-950 uppercase tracking-wider flex items-center gap-2">
              <FileText size={17} className="text-sky-600" />
              <span>4. Textos, Vigencia y Leyenda del Dorso</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Título Carnet Alumno</label>
                <input
                  type="text"
                  value={draft.studentCardTitle}
                  onChange={(e) => updateField('studentCardTitle', e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Título Carnet Docente</label>
                <input
                  type="text"
                  value={draft.teacherCardTitle}
                  onChange={(e) => updateField('teacherCardTitle', e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Calendar size={12} className="text-sky-600" />
                  <span>Vigencia por Defecto</span>
                </label>
                <input
                  type="date"
                  value={draft.validityDate}
                  onChange={(e) => updateField('validityDate', e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-bold text-slate-800 outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Leyenda institucional en el dorso
              </label>
              <textarea
                rows={3}
                value={draft.backUsageLegend}
                onChange={(e) => updateField('backUsageLegend', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-sky-200 text-xs text-slate-800 outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nota administrativa / emergencia (opcional)
              </label>
              <input
                type="text"
                value={draft.backEmergencyNote}
                onChange={(e) => updateField('backEmergencyNote', e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs text-slate-800 outline-none focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Panel Derecho: Vista Previa en Tiempo Real */}
        <div className="xl:col-span-5 xl:sticky xl:top-6 space-y-4">
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-sky-950 flex items-center gap-2">
                <Eye size={17} className="text-sky-600" />
                <span>Vista Previa en Vivo</span>
              </h3>

              <div className="flex bg-sky-100/80 p-1 rounded-xl border border-sky-200">
                <button
                  type="button"
                  onClick={() => setPreviewTarget('student')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                    previewTarget === 'student'
                      ? 'bg-white text-sky-900 shadow-sm'
                      : 'text-sky-700 hover:text-sky-950'
                  }`}
                >
                  <Users size={13} />
                  <span>Alumno</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTarget('teacher')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                    previewTarget === 'teacher'
                      ? 'bg-white text-sky-900 shadow-sm'
                      : 'text-sky-700 hover:text-sky-950'
                  }`}
                >
                  <GraduationCap size={13} />
                  <span>Docente</span>
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-sky-100/70 via-white/80 to-teal-100/60 rounded-2xl p-4 sm:p-5 border border-sky-200/80 flex items-center justify-center overflow-x-auto">
              {previewItem ? (
                <CarnetPreviewCard
                  item={previewItem}
                  schoolInfo={schoolInfo}
                  config={draft}
                  side="both"
                  compact={draft.orientation === 'horizontal'}
                />
              ) : (
                <p className="text-xs text-slate-500 py-12 font-semibold">Generando vista previa...</p>
              )}
            </div>

            <div className="text-[11px] text-slate-600 bg-white/80 border border-sky-100 rounded-2xl p-3.5 space-y-1">
              <p className="font-bold text-slate-800">
                Identidad sincronizada con Configuración Institucional:
              </p>
              <p className="truncate">
                <strong>Establecimiento:</strong> {schoolInfo.name}
              </p>
              <p>
                <strong>Formato:</strong> {draft.sizePreset === 'cr80' ? 'Estándar CR80 (85.6 × 54 mm)' : 'Amplio (92 × 58 mm)'} • {draft.orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
