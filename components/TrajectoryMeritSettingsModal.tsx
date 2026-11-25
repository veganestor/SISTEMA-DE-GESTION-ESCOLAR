import React, { useEffect, useMemo, useState } from 'react';
import {
  CourseYear,
  DEFAULT_COURSE_YEAR_WEIGHTS,
  DEFAULT_DISCIPLINARY_THRESHOLDS,
  DEFAULT_GRADING_PERIOD_WEIGHTS,
  DEFAULT_MERIT_ORDER_CONFIG,
  DisciplinaryIncident,
  DisciplinarySanctionType,
  MeritOrderConfig,
  SchoolInfo,
  Student,
  StudentTrajectoryProfile,
} from '../types';
import {
  SANCTION_TYPE_LABELS,
  evaluateMeritOrder,
  formatDecimalAverage,
} from '../services/trajectoryService';
import {
  AlertTriangle,
  Award,
  Calculator,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Info,
  RotateCcw,
  Save,
  Scale,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';

interface TrajectoryMeritSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MeritOrderConfig;
  onSaveConfig: (nextConfig: MeritOrderConfig) => void;
  students: Student[];
  trajectories: Record<string, StudentTrajectoryProfile>;
  disciplinaryRecords: DisciplinaryIncident[];
  currentAcademicYear: number;
  schoolInfo: SchoolInfo;
  initialTab?: 'weights' | 'discipline' | 'eligibility';
}

const ALL_COURSES: CourseYear[] = ['1', '2', '3', '4', '5', '6'];

const SANCTION_TYPES_LIST: DisciplinarySanctionType[] = [
  'llamado_atencion_verbal',
  'llamado_atencion_escrito',
  'apercibimiento',
  'acta_compromiso',
  'medida_reparadora',
  'suspension_temporal',
  'otra_medida',
];

function cloneConfigWithDefaults(cfg: MeritOrderConfig): MeritOrderConfig {
  return {
    ...DEFAULT_MERIT_ORDER_CONFIG,
    ...cfg,
    targetCourses: [...(cfg.targetCourses || DEFAULT_MERIT_ORDER_CONFIG.targetCourses)],
    excludedSanctionTypes: [...(cfg.excludedSanctionTypes || [])],
    gradingPeriodWeights: {
      ...DEFAULT_GRADING_PERIOD_WEIGHTS,
      ...(cfg.gradingPeriodWeights || {}),
    },
    courseYearWeights: {
      enabled: cfg.courseYearWeights?.enabled ?? DEFAULT_COURSE_YEAR_WEIGHTS.enabled,
      weights: {
        ...DEFAULT_COURSE_YEAR_WEIGHTS.weights,
        ...(cfg.courseYearWeights?.weights || {}),
      },
    },
    disciplinaryThresholds: {
      ...DEFAULT_DISCIPLINARY_THRESHOLDS,
      ...(cfg.disciplinaryThresholds || {}),
    },
  };
}

export const TrajectoryMeritSettingsModal: React.FC<TrajectoryMeritSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  students,
  trajectories,
  disciplinaryRecords,
  currentAcademicYear,
  schoolInfo,
  initialTab = 'weights',
}) => {
  const [activeTab, setActiveTab] = useState<'weights' | 'discipline' | 'eligibility'>(initialTab);
  const [draft, setDraft] = useState<MeritOrderConfig>(() => cloneConfigWithDefaults(config));
  const [confirmReset, setConfirmReset] = useState(false);

  // Notas de muestra para el simulador matemático en vivo de ponderaciones por período
  const [simGrades, setSimGrades] = useState({
    t1: 7,
    t2: 8,
    t3: 9.5,
    finalExam: 9,
  });

  useEffect(() => {
    if (isOpen) {
      setDraft(cloneConfigWithDefaults(config));
      setActiveTab(initialTab);
      setConfirmReset(false);
    }
  }, [isOpen, config, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const periodWeights = draft.gradingPeriodWeights || DEFAULT_GRADING_PERIOD_WEIGHTS;
  const yearWeights = draft.courseYearWeights || DEFAULT_COURSE_YEAR_WEIGHTS;
  const thresholds = draft.disciplinaryThresholds || DEFAULT_DISCIPLINARY_THRESHOLDS;

  const periodWeightSum = useMemo(() => {
    const sum =
      (Number(periodWeights.trimestre1) || 0) +
      (Number(periodWeights.trimestre2) || 0) +
      (Number(periodWeights.trimestre3) || 0) +
      (Number(periodWeights.finalExamWeight) || 0);
    return Number(sum.toFixed(2));
  }, [periodWeights]);

  const isPeriodWeightSumValid = !periodWeights.enabled || Math.abs(periodWeightSum - 100) <= 0.1;

  // Simulación matemática en vivo de las ponderaciones de períodos
  const simulatorResult = useMemo(() => {
    const simpleAvg = (simGrades.t1 + simGrades.t2 + simGrades.t3) / 3;
    if (!periodWeights.enabled || periodWeightSum <= 0) {
      return {
        simpleFormatted: formatDecimalAverage(simpleAvg, draft.decimalPlaces),
        weightedFormatted: formatDecimalAverage(simpleAvg, draft.decimalPlaces),
        diff: 0,
      };
    }

    const weightedSum =
      simGrades.t1 * (Number(periodWeights.trimestre1) || 0) +
      simGrades.t2 * (Number(periodWeights.trimestre2) || 0) +
      simGrades.t3 * (Number(periodWeights.trimestre3) || 0) +
      simGrades.finalExam * (Number(periodWeights.finalExamWeight) || 0);

    const weightedAvg = weightedSum / periodWeightSum;
    return {
      simpleFormatted: formatDecimalAverage(simpleAvg, draft.decimalPlaces),
      weightedFormatted: formatDecimalAverage(weightedAvg, draft.decimalPlaces),
      diff: Number((weightedAvg - simpleAvg).toFixed(draft.decimalPlaces)),
    };
  }, [simGrades, periodWeights, periodWeightSum, draft.decimalPlaces]);

  // Vista previa en tiempo real del impacto sobre el padrón actual de alumnos
  const liveImpactPreview = useMemo(() => {
    if (!isOpen) return null;
    const res = evaluateMeritOrder(
      students,
      trajectories,
      disciplinaryRecords,
      draft,
      currentAcademicYear
    );
    return {
      evaluated: res.evaluatedCount,
      eligible: res.eligibleCandidates.length,
      review: res.reviewCandidates.length,
      ineligible: res.ineligibleCandidates.length,
    };
  }, [isOpen, students, trajectories, disciplinaryRecords, draft, currentAcademicYear]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(cloneConfigWithDefaults(config));
  }, [draft, config]);

  if (!isOpen) return null;

  const updatePeriodWeights = (patch: Partial<typeof DEFAULT_GRADING_PERIOD_WEIGHTS>) => {
    setDraft((prev) => ({
      ...prev,
      gradingPeriodWeights: {
        ...DEFAULT_GRADING_PERIOD_WEIGHTS,
        ...(prev.gradingPeriodWeights || {}),
        ...patch,
      },
    }));
  };

  const normalizePeriodWeightsTo100 = () => {
    const w1 = Math.max(0, Number(periodWeights.trimestre1) || 0);
    const w2 = Math.max(0, Number(periodWeights.trimestre2) || 0);
    const w3 = Math.max(0, Number(periodWeights.trimestre3) || 0);
    const wF = Math.max(0, Number(periodWeights.finalExamWeight) || 0);
    const total = w1 + w2 + w3 + wF;

    if (total <= 0) {
      updatePeriodWeights({ trimestre1: 30, trimestre2: 30, trimestre3: 40, finalExamWeight: 0 });
      return;
    }

    const n1 = Math.round((w1 / total) * 100);
    const n2 = Math.round((w2 / total) * 100);
    const nF = Math.round((wF / total) * 100);
    const n3 = Math.max(0, 100 - n1 - n2 - nF);

    updatePeriodWeights({
      trimestre1: n1,
      trimestre2: n2,
      trimestre3: n3,
      finalExamWeight: nF,
    });
  };

  const updateCourseYearWeights = (
    patch: Partial<{ enabled: boolean; weights: Record<CourseYear, number> }>
  ) => {
    setDraft((prev) => ({
      ...prev,
      courseYearWeights: {
        enabled: patch.enabled ?? prev.courseYearWeights?.enabled ?? false,
        weights: patch.weights ?? {
          ...DEFAULT_COURSE_YEAR_WEIGHTS.weights,
          ...(prev.courseYearWeights?.weights || {}),
        },
      },
    }));
  };

  const updateThresholds = (patch: Partial<typeof DEFAULT_DISCIPLINARY_THRESHOLDS>) => {
    setDraft((prev) => ({
      ...prev,
      disciplinaryThresholds: {
        ...DEFAULT_DISCIPLINARY_THRESHOLDS,
        ...(prev.disciplinaryThresholds || {}),
        ...patch,
      },
    }));
  };

  const handleSave = () => {
    if (!isPeriodWeightSumValid) return;
    onSaveConfig(draft);
    onClose();
  };

  const handleResetDefaults = () => {
    setDraft(cloneConfigWithDefaults(DEFAULT_MERIT_ORDER_CONFIG));
    setConfirmReset(false);
  };

  const safeBarWidth = (val: number) => {
    if (periodWeightSum <= 0) return '0%';
    return `${Math.min(100, Math.max(0, (val / Math.max(100, periodWeightSum)) * 100))}%`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trajectory-settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="aero-glass bg-white/95 w-full max-w-4xl max-h-[92vh] rounded-3xl border border-white/90 shadow-2xl flex flex-col overflow-hidden">
        {/* Encabezado del Modal */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-sky-100 bg-gradient-to-r from-sky-50/90 via-white/90 to-cyan-50/80 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
              <SlidersHorizontal size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-700 truncate">
                {schoolInfo.name} · Trayectoria Académica y Orden de Mérito
              </p>
              <h3
                id="trajectory-settings-modal-title"
                className="text-lg sm:text-xl font-extrabold text-[#0c2d48] tracking-tight leading-snug"
              >
                Configuración de Ponderaciones y Umbrales Disciplinarios
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Defina pesos matemáticos por período de calificación, multiplicadores por año y
                umbrales disciplinarios que activan revisión manual de elegibilidad.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar configuración"
            className="w-10 h-10 rounded-xl bg-white/90 hover:bg-slate-100 border border-sky-200 text-slate-600 hover:text-slate-900 flex items-center justify-center shrink-0 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Pestañas internas del Modal */}
        <div className="px-5 sm:px-6 py-2.5 bg-sky-50/75 border-b border-sky-100 flex flex-wrap gap-1.5 shrink-0">
          {[
            {
              id: 'weights' as const,
              label: 'Ponderaciones de Períodos',
              icon: <Calculator size={15} />,
              badge: periodWeights.enabled || yearWeights.enabled ? 'Activo' : null,
            },
            {
              id: 'discipline' as const,
              label: 'Umbrales Disciplinarios',
              icon: <ShieldAlert size={15} />,
              badge:
                draft.disciplinaryPolicy !== 'inform_only' ||
                thresholds.maxTotalActiveSanctionsBeforeEscalation > 0
                  ? 'Configurado'
                  : null,
            },
            {
              id: 'eligibility' as const,
              label: 'Requisitos y Alcance',
              icon: <ClipboardCheck size={15} />,
              badge: `${draft.targetCourses.length} curso(s)`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold transition-all ${
                activeTab === tab.id
                  ? 'aero-btn-primary text-white shadow-sm'
                  : 'bg-white/85 text-slate-700 border border-sky-200/80 hover:bg-white hover:text-sky-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-sky-100 text-sky-800'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 bg-slate-50/60">
          {/* =============================================================== */}
          {/* TAB 1: PONDERACIONES MATEMÁTICAS DE PERÍODOS Y AÑOS             */}
          {/* =============================================================== */}
          {activeTab === 'weights' && (
            <div className="space-y-5">
              {/* Bloque 1A: Ponderación por Período de Calificación (Trimestres / Instancia Final) */}
              <div className="bg-white rounded-2xl border border-sky-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-[#0c2d48] flex items-center gap-2">
                      <Calculator size={17} className="text-sky-600" />
                      <span>Ponderación Matemática por Período de Calificación</span>
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Asigne pesos porcentuales al 1.º, 2.º y 3.º Trimestre (y opcionalmente a la
                      instancia de cierre final). Los años históricos sin desglose trimestral
                      conservarán su calificación final registrada.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2.5 px-3.5 py-2 min-h-[42px] rounded-xl border border-sky-200 bg-sky-50/80 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={periodWeights.enabled}
                      onChange={(e) => updatePeriodWeights({ enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-sky-300 text-sky-700"
                    />
                    <span className="text-xs font-extrabold text-sky-950">
                      {periodWeights.enabled ? 'Ponderación activa' : 'Usar nota final directa'}
                    </span>
                  </label>
                </div>

                {/* Presets rápidos de ponderación de períodos */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                    Esquemas predefinidos
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      {
                        label: 'Equitativo (33,3% c/u)',
                        vals: { trimestre1: 33.33, trimestre2: 33.33, trimestre3: 33.34, finalExamWeight: 0 },
                      },
                      {
                        label: 'Progresivo (25% / 35% / 40%)',
                        vals: { trimestre1: 25, trimestre2: 35, trimestre3: 40, finalExamWeight: 0 },
                      },
                      {
                        label: 'Con Integrador (25% / 25% / 25% / 25%)',
                        vals: { trimestre1: 25, trimestre2: 25, trimestre3: 25, finalExamWeight: 25 },
                      },
                      {
                        label: 'Énfasis Cierre (20% / 30% / 30% / 20%)',
                        vals: { trimestre1: 20, trimestre2: 30, trimestre3: 30, finalExamWeight: 20 },
                      },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => updatePeriodWeights({ enabled: true, ...preset.vals })}
                        className="px-3 py-1.5 min-h-[36px] rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-[11px] font-bold transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Inputs de pesos porcentuales */}
                <div
                  className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${
                    periodWeights.enabled ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  {[
                    {
                      key: 'trimestre1' as const,
                      label: '1.º Trimestre',
                      accent: 'bg-sky-600',
                      val: periodWeights.trimestre1,
                    },
                    {
                      key: 'trimestre2' as const,
                      label: '2.º Trimestre',
                      accent: 'bg-cyan-500',
                      val: periodWeights.trimestre2,
                    },
                    {
                      key: 'trimestre3' as const,
                      label: '3.º Trimestre',
                      accent: 'bg-teal-600',
                      val: periodWeights.trimestre3,
                    },
                    {
                      key: 'finalExamWeight' as const,
                      label: 'Instancia Final / Cierre',
                      accent: 'bg-indigo-600',
                      val: periodWeights.finalExamWeight,
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="rounded-xl border border-sky-100 bg-slate-50/70 p-3 space-y-1.5"
                    >
                      <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-700">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.accent}`} />
                        <span>{item.label}</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          disabled={!periodWeights.enabled}
                          value={item.val}
                          onChange={(e) =>
                            updatePeriodWeights({
                              [item.key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-full pr-8 pl-3 py-2 min-h-[40px] bg-white border border-sky-200 rounded-xl text-sm font-black text-[#0c2d48] tabular-nums outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400">
                          %
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Barra visual proporcional y validación de suma 100% */}
                <div className="space-y-2">
                  <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden flex">
                    <div
                      className="bg-sky-600 transition-all duration-200"
                      style={{ width: safeBarWidth(periodWeights.trimestre1) }}
                    />
                    <div
                      className="bg-cyan-500 transition-all duration-200"
                      style={{ width: safeBarWidth(periodWeights.trimestre2) }}
                    />
                    <div
                      className="bg-teal-600 transition-all duration-200"
                      style={{ width: safeBarWidth(periodWeights.trimestre3) }}
                    />
                    <div
                      className="bg-indigo-600 transition-all duration-200"
                      style={{ width: safeBarWidth(periodWeights.finalExamWeight) }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 tabular-nums">
                      {isPeriodWeightSumValid ? (
                        <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-700">
                          <CheckCircle2 size={15} />
                          <span>
                            {periodWeights.enabled
                              ? `Distribución válida: ${periodWeightSum}%`
                              : 'Ponderación por períodos desactivada (usa nota final directa)'}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-extrabold text-rose-700">
                          <AlertTriangle size={15} />
                          <span>
                            La suma actual es {periodWeightSum}% — debe totalizar exactamente 100%.
                          </span>
                        </span>
                      )}
                    </div>

                    {periodWeights.enabled && !isPeriodWeightSumValid && (
                      <button
                        type="button"
                        onClick={normalizePeriodWeightsTo100}
                        className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[11px] font-extrabold transition-colors"
                      >
                        Normalizar a 100%
                      </button>
                    )}
                  </div>
                </div>

                {/* Simulador Matemático en Vivo */}
                <div className="rounded-xl bg-sky-50/75 border border-sky-200 p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800">
                      Simulador matemático en vivo (ejemplo de materia)
                    </span>
                    <span className="text-[11px] text-slate-600 tabular-nums">
                      Promedio simple: <strong>{simulatorResult.simpleFormatted}</strong> · Con
                      ponderación:{' '}
                      <strong className="text-sky-900 text-sm">
                        {simulatorResult.weightedFormatted}
                      </strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {(
                      [
                        { key: 't1', label: 'Nota 1.º Trim.' },
                        { key: 't2', label: 'Nota 2.º Trim.' },
                        { key: 't3', label: 'Nota 3.º Trim.' },
                        { key: 'finalExam', label: 'Nota Final' },
                      ] as const
                    ).map((f) => (
                      <label
                        key={f.key}
                        className="flex items-center justify-between gap-2 bg-white border border-sky-100 rounded-lg px-2.5 py-1.5"
                      >
                        <span className="text-[11px] font-semibold text-slate-600">{f.label}</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step={0.5}
                          value={simGrades[f.key]}
                          onChange={(e) =>
                            setSimGrades((prev) => ({
                              ...prev,
                              [f.key]: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                            }))
                          }
                          className="w-14 text-right font-extrabold text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-1.5 py-0.5 tabular-nums outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bloque 1B: Ponderación por Año de Trayectoria (1° a 6° Año) */}
              <div className="bg-white rounded-2xl border border-sky-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                      Ponderación por Año Lectivo de Trayectoria (1.º a 6.º Año)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Opcionalmente asigne mayor peso relativo a los cursos del Ciclo Orientado
                      (4.º a 6.º Año) al calcular el Promedio General Acumulado.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2.5 px-3.5 py-2 min-h-[42px] rounded-xl border border-sky-200 bg-sky-50/80 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={yearWeights.enabled}
                      onChange={(e) => updateCourseYearWeights({ enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-sky-300 text-sky-700"
                    />
                    <span className="text-xs font-extrabold text-sky-950">
                      {yearWeights.enabled ? 'Pesos por año activos' : 'Todos los años 1.0x'}
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    {
                      label: 'Igualitario (1.0x todos)',
                      w: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1 },
                    },
                    {
                      label: 'Ciclo Orientado (1°–3°: 1.0x · 4°–6°: 1.5x)',
                      w: { '1': 1, '2': 1, '3': 1, '4': 1.5, '5': 1.5, '6': 1.5 },
                    },
                    {
                      label: 'Progresivo (1.0x a 2.0x)',
                      w: { '1': 1, '2': 1.2, '3': 1.4, '4': 1.6, '5': 1.8, '6': 2 },
                    },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => updateCourseYearWeights({ enabled: true, weights: p.w })}
                      className="px-3 py-1.5 min-h-[34px] rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-[11px] font-bold transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div
                  className={`grid grid-cols-3 sm:grid-cols-6 gap-2.5 transition-opacity ${
                    yearWeights.enabled ? 'opacity-100' : 'opacity-60'
                  }`}
                >
                  {ALL_COURSES.map((course) => (
                    <div
                      key={course}
                      className="rounded-xl border border-sky-100 bg-slate-50/75 p-2.5 text-center space-y-1"
                    >
                      <span className="text-[11px] font-extrabold text-sky-900 block">
                        {course}° Año
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={0.25}
                          max={5}
                          step={0.1}
                          disabled={!yearWeights.enabled}
                          value={yearWeights.weights[course] ?? 1}
                          onChange={(e) =>
                            updateCourseYearWeights({
                              weights: {
                                ...yearWeights.weights,
                                [course]: Math.min(5, Math.max(0.25, Number(e.target.value) || 1)),
                              },
                            })
                          }
                          className="w-full pr-5 pl-2 py-1.5 min-h-[36px] bg-white border border-sky-200 rounded-lg text-xs font-black text-center text-[#0c2d48] tabular-nums outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                          x
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bloque 1C: Parámetros generales del motor de cálculo */}
              <div className="bg-white rounded-2xl border border-sky-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
                <h4 className="text-sm font-extrabold text-[#0c2d48]">
                  Parámetros Generales de Promedio y Precisión
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">
                      Criterio por materia
                    </label>
                    <select
                      value={draft.calculationMode}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          calculationMode: e.target.value as MeritOrderConfig['calculationMode'],
                        }))
                      }
                      className="w-full px-3 py-2.5 min-h-[42px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="simple">Promedio simple por materia</option>
                      <option value="weighted">Promedio ponderado por materia</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">
                      Decimales visibles
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([2, 3, 4] as const).map((dec) => (
                        <button
                          key={dec}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, decimalPlaces: dec }))}
                          className={`py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold tabular-nums border transition-colors ${
                            draft.decimalPlaces === dec
                              ? 'bg-sky-700 text-white border-sky-700'
                              : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-50'
                          }`}
                        >
                          {dec} dec.
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold text-slate-700 mb-1.5">
                      Nota mínima de aprobación
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={0.5}
                      value={draft.passingGrade}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          passingGrade: Math.min(10, Math.max(1, Number(e.target.value) || 6)),
                        }))
                      }
                      className="w-full px-3 py-2.5 min-h-[42px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-sky-100 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={draft.includePartialYearsInCumulative}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        includePartialYearsInCumulative: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-sky-300 text-sky-700"
                  />
                  <span className="text-slate-700 leading-relaxed">
                    <strong className="text-slate-900">
                      Incluir ciclos lectivos en curso (parciales) en el promedio acumulado
                    </strong>{' '}
                    — siempre etiquetados como Parcial hasta su cierre definitivo.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 2: UMBRALES DISCIPLINARIOS Y REVISIÓN MANUAL                */}
          {/* =============================================================== */}
          {activeTab === 'discipline' && (
            <div className="space-y-5">
              {/* Garantía institucional de no descuento académico */}
              <div className="bg-red-50/90 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-red-950">
                <ShieldAlert size={19} className="text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-black text-red-900">
                    Regla de integridad académica: las sanciones nunca descuentan promedio
                  </p>
                  <p className="text-red-900/85 leading-relaxed">
                    Los umbrales configurados aquí determinan cuándo un estudiante pasa a{' '}
                    <strong>Revisión Manual obligatoria</strong> de elegibilidad o resulta alcanzado
                    por una exclusión disciplinaria conforme al reglamento institucional.
                  </p>
                </div>
              </div>

              {/* Política general de evaluación disciplinaria */}
              <div className="bg-white rounded-2xl border border-sky-200/90 p-4 sm:p-5 space-y-3 shadow-sm">
                <h4 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                  Política General de Evaluación Disciplinaria
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {(
                    [
                      {
                        id: 'inform_only',
                        title: 'Solo informativo (no excluye automáticamente)',
                        desc: 'Resalta en rojo las sanciones activas en la ficha del alumno sin bloquear elegibilidad (salvo que supere el umbral de acumulación total).',
                      },
                      {
                        id: 'review_active',
                        title: 'Revisión manual obligatoria al alcanzar el umbral de sanciones activas',
                        desc: 'Deriva al estudiante a la bandeja de Revisión Institucional cuando alcanza la cantidad mínima configurada de sanciones activas o actuaciones pendientes.',
                      },
                      {
                        id: 'exclude_selected_types',
                        title: 'Umbral por tipos de sanción específicos (exclusión o revisión manual)',
                        desc: 'Permite elegir qué tipos de medidas disciplinarias activan el umbral de exclusión o disparan revisión manual de elegibilidad.',
                      },
                    ] as const
                  ).map((pol) => (
                    <label
                      key={pol.id}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer text-xs transition-colors ${
                        draft.disciplinaryPolicy === pol.id
                          ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-400'
                          : 'bg-slate-50/70 border-sky-100 hover:bg-sky-50/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modalDisciplinaryPolicy"
                        checked={draft.disciplinaryPolicy === pol.id}
                        onChange={() =>
                          setDraft((prev) => ({ ...prev, disciplinaryPolicy: pol.id }))
                        }
                        className="mt-0.5 text-sky-700"
                      />
                      <span>
                        <strong className="text-slate-900 block">{pol.title}</strong>
                        <span className="text-[11px] text-slate-600">{pol.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Umbrales numéricos de disparo de Revisión Manual */}
              <div className="bg-white rounded-2xl border border-sky-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
                <div>
                  <h4 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                    Umbrales de Disparo para Revisión Manual
                  </h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Establezca cuántas sanciones activas, en qué ventana de ciclos lectivos y bajo
                    qué condiciones se activa la revisión manual de elegibilidad del alumno.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-xl border border-sky-100 bg-slate-50/80 p-3.5 space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-800">
                      Mínimo de sanciones activas para Revisión Manual
                    </label>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Cantidad mínima de sanciones activas en la ventana elegida para enviar al
                      alumno a revisión manual (cuando la política activa revisión).
                    </p>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={thresholds.manualReviewMinActiveCount}
                      onChange={(e) =>
                        updateThresholds({
                          manualReviewMinActiveCount: Math.max(
                            1,
                            Math.min(15, Number(e.target.value) || 1)
                          ),
                        })
                      }
                      className="w-full px-3 py-2 min-h-[40px] bg-white border border-sky-200 rounded-xl text-sm font-black text-[#0c2d48] tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div className="rounded-xl border border-sky-100 bg-slate-50/80 p-3.5 space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-800">
                      Ventana temporal de evaluación disciplinaria
                    </label>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Defina si se contabilizan sanciones de toda la trayectoria o solo de los
                      últimos ciclos lectivos.
                    </p>
                    <select
                      value={thresholds.manualReviewRecentYearsWindow}
                      onChange={(e) =>
                        updateThresholds({
                          manualReviewRecentYearsWindow: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full px-3 py-2 min-h-[40px] bg-white border border-sky-200 rounded-xl text-xs font-extrabold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value={0}>Toda la trayectoria escolar (1.º a 6.º Año)</option>
                      <option value={1}>Solo último ciclo lectivo (1 año)</option>
                      <option value={2}>Últimos 2 ciclos lectivos</option>
                      <option value={3}>Últimos 3 ciclos lectivos (Ciclo Orientado)</option>
                    </select>
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/45 p-3.5 space-y-1.5 sm:col-span-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <label className="block text-xs font-extrabold text-red-900">
                          Umbral de acumulación total de sanciones activas (cualquier tipo)
                        </label>
                        <p className="text-[11px] text-red-900/80 leading-snug">
                          Si un alumno acumula esta cantidad de sanciones activas (sin importar su
                          tipo), se activa escalamiento automático a revisión manual o exclusión.
                          Indique <strong>0</strong> para desactivar este tope.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={thresholds.maxTotalActiveSanctionsBeforeEscalation}
                          onChange={(e) =>
                            updateThresholds({
                              maxTotalActiveSanctionsBeforeEscalation: Math.max(
                                0,
                                Math.min(20, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-24 px-3 py-2 min-h-[40px] bg-white border border-red-300 rounded-xl text-sm font-black text-center text-red-900 tabular-nums outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <span className="text-[11px] font-bold text-red-800 whitespace-nowrap">
                          {thresholds.maxTotalActiveSanctionsBeforeEscalation === 0
                            ? 'Desactivado'
                            : 'sanción(es)'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-sky-100 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={thresholds.alwaysReviewPendingActuations}
                      onChange={(e) =>
                        updateThresholds({ alwaysReviewPendingActuations: e.target.checked })
                      }
                      className="mt-0.5 rounded border-sky-300 text-sky-700"
                    />
                    <span className="text-slate-700 leading-snug">
                      <strong className="text-slate-900 block">
                        Actuaciones &ldquo;Pendientes&rdquo; siempre disparan Revisión Manual
                      </strong>
                      Aun por debajo del umbral numérico, cualquier trámite disciplinario abierto
                      exige revisión previa.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-sky-100 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={draft.ignoreAnnulledSanctions}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          ignoreAnnulledSanctions: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-sky-300 text-sky-700"
                    />
                    <span className="text-slate-700 leading-snug">
                      <strong className="text-slate-900 block">
                        Ignorar actuaciones en estado &ldquo;Anulada&rdquo;
                      </strong>
                      Las medidas dejadas sin efecto no se computan en ninguno de los umbrales.
                    </span>
                  </label>
                </div>
              </div>

              {/* Configuración de Exclusiones Disciplinarias y su relación con Revisión Manual */}
              <div className="bg-white rounded-2xl border border-red-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-red-900">
                      Tipos de Sanción y Umbral de Exclusión Disciplinaria
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Seleccione qué tipos de sanción se consideran críticos según el reglamento y
                      el umbral mínimo de repeticiones para activar la medida.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 shrink-0">
                    <span className="text-[11px] font-bold text-red-900">Umbral mín.:</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={thresholds.exclusionMinSanctionCount}
                      onChange={(e) =>
                        updateThresholds({
                          exclusionMinSanctionCount: Math.max(
                            1,
                            Math.min(10, Number(e.target.value) || 1)
                          ),
                        })
                      }
                      className="w-16 px-2 py-1 bg-white border border-red-300 rounded-lg text-xs font-black text-center text-red-900 tabular-nums outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SANCTION_TYPES_LIST.map((typeKey) => {
                    const checked = draft.excludedSanctionTypes.includes(typeKey);
                    return (
                      <label
                        key={typeKey}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                          checked
                            ? 'bg-red-50 border-red-300 text-red-900'
                            : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? draft.excludedSanctionTypes.filter((t) => t !== typeKey)
                              : [...draft.excludedSanctionTypes, typeKey];
                            setDraft((prev) => ({
                              ...prev,
                              excludedSanctionTypes: next,
                            }));
                          }}
                          className="rounded border-red-300 text-red-700"
                        />
                        <span>{SANCTION_TYPE_LABELS[typeKey]}</span>
                      </label>
                    );
                  })}
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50/90 border border-amber-300 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={thresholds.exclusionTriggersManualReviewInsteadOfHardBlock}
                    onChange={(e) =>
                      updateThresholds({
                        exclusionTriggersManualReviewInsteadOfHardBlock: e.target.checked,
                      })
                    }
                    className="mt-0.5 w-4 h-4 rounded border-amber-400 text-amber-700"
                  />
                  <span className="text-amber-950 leading-relaxed">
                    <strong className="block font-extrabold">
                      Al alcanzar el umbral de exclusión, disparar Revisión Manual obligatoria en
                      lugar de excluir automáticamente
                    </strong>
                    Recomendado cuando el Consejo Escolar o Equipo Directivo debe ratificar
                    manualmente cualquier inhabilitación de Abanderado/a o Escolta. Si se alcanza
                    un valor parcial previo al umbral (ej. 1 de 2 sanciones), también se genera
                    alerta de revisión manual.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 3: REQUISITOS DE TRAYECTORIA Y ALCANCE                      */}
          {/* =============================================================== */}
          {activeTab === 'eligibility' && (
            <div className="bg-white rounded-2xl border border-sky-200/90 p-4 sm:p-5 space-y-4 shadow-sm">
              <div>
                <h4 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                  Alcance y Requisitos Mínimos Institucionales de Trayectoria
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Seleccione los cursos incluidos en el Orden de Mérito y las condiciones mínimas de
                  regularidad académica.
                </p>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  Cursos incluidos en la evaluación de Abanderados y Escoltas
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_COURSES.map((c) => {
                    const selected = draft.targetCourses.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          const next = selected
                            ? draft.targetCourses.filter((x) => x !== c)
                            : [...draft.targetCourses, c].sort();
                          if (next.length === 0) return;
                          setDraft((prev) => ({ ...prev, targetCourses: next }));
                        }}
                        className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-extrabold border transition-colors ${
                          selected
                            ? 'bg-sky-700 text-white border-sky-700'
                            : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-50'
                        }`}
                      >
                        {c}° Año
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-sky-100 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={draft.requireDefinitiveAverage}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        requireDefinitiveAverage: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-sky-300 text-sky-700"
                  />
                  <span>
                    <strong className="text-slate-900 block">
                      Exigir calificaciones definitivas
                    </strong>
                    <span className="text-[11px] text-slate-600">
                      Requiere ciclos lectivos cerrados con todas las notas definitivas.
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-sky-100 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={draft.requireCompleteTrajectory}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        requireCompleteTrajectory: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-sky-300 text-sky-700"
                  />
                  <span>
                    <strong className="text-slate-900 block">
                      Exigir trayectoria completa (1.º al curso actual)
                    </strong>
                    <span className="text-[11px] text-slate-600">
                      Verifica registro histórico de todos los años previos.
                    </span>
                  </span>
                </label>

                <div className="rounded-xl bg-slate-50 border border-sky-100 p-3 space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-slate-700">
                    Antigüedad mínima en la institución
                  </label>
                  <select
                    value={draft.minYearsInInstitution}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        minYearsInInstitution: Number(e.target.value) || 1,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-sky-200 rounded-lg text-xs font-bold outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} año{n > 1 ? 's' : ''} mínimo{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl bg-slate-50 border border-sky-100 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.requireNoPendingSubjects}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          requireNoPendingSubjects: e.target.checked,
                        }))
                      }
                      className="rounded border-sky-300 text-sky-700"
                    />
                    <span>Controlar materias pendientes</span>
                  </label>
                  {draft.requireNoPendingSubjects && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>Máx. permitidas:</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={draft.maxAllowedPendingSubjects}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            maxAllowedPendingSubjects: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-16 px-2 py-1 bg-white border border-sky-200 rounded-lg text-center font-bold tabular-nums"
                      />
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-sky-100 cursor-pointer text-xs font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.allowRepeatedYears}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, allowRepeatedYears: e.target.checked }))
                  }
                  className="rounded border-sky-300 text-sky-700"
                />
                <span>Permitir elegibilidad de alumnos con años repetidos en su trayectoria</span>
              </label>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1">
                  Normativa o criterios institucionales de desempate (nota interna)
                </label>
                <textarea
                  rows={2}
                  value={draft.institutionalNotes || ''}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, institutionalNotes: e.target.value }))
                  }
                  placeholder="Ej.: Resolución ministerial vigente o acta escolar para resolución de empates y revisiones manuales..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Pie del modal: Vista previa de impacto en vivo + Botones de acción */}
        <div className="px-5 sm:px-6 py-4 border-t border-sky-100 bg-white/95 space-y-3 shrink-0">
          {liveImpactPreview && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-sky-50/90 border border-sky-200/80 text-xs">
              <span className="inline-flex items-center gap-1.5 font-extrabold text-sky-900">
                <Scale size={14} className="text-sky-600" />
                <span>Impacto en vivo ({liveImpactPreview.evaluated} evaluados):</span>
              </span>
              <div className="flex flex-wrap items-center gap-3 tabular-nums font-extrabold">
                <span className="text-emerald-700">{liveImpactPreview.eligible} Elegible(s)</span>
                <span className="text-amber-700">
                  {liveImpactPreview.review} Revisión manual
                </span>
                <span className="text-slate-600">
                  {liveImpactPreview.ineligible} No elegible(s)
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  <RotateCcw size={14} />
                  <span>Restablecer predeterminados</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs">
                  <span className="font-bold text-amber-900">¿Restablecer todo?</span>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-2.5 py-1 rounded-lg bg-amber-700 text-white font-extrabold hover:bg-amber-800"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 font-bold"
                  >
                    No
                  </button>
                </div>
              )}
              {hasUnsavedChanges && (
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                  <Info size={13} />
                  <span>Cambios sin guardar</span>
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 min-h-[42px] rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isPeriodWeightSumValid}
                className={`inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold transition-all ${
                  isPeriodWeightSumValid
                    ? 'aero-btn-primary text-white shadow-sm'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save size={15} />
                <span>Guardar configuración</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
