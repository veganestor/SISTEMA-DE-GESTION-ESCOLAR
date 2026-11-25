import React, { useMemo, useState } from 'react';
import { MeritOrderConfig, SchoolInfo } from '../types';
import { MeritOrderEvaluationResult } from '../services/trajectoryService';
import {
  MeritPdfExportOptions,
  MeritPdfExportResult,
  MeritPdfScope,
  exportMeritOrderPDF,
} from '../services/trajectoryPdfExport';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FileDown,
  FileText,
  ListChecks,
  Scale,
  X,
} from 'lucide-react';

interface MeritOrderPdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  meritResult: MeritOrderEvaluationResult;
  config: MeritOrderConfig;
  schoolInfo: SchoolInfo;
  onExportComplete?: (result: MeritPdfExportResult) => void;
}

export const MeritOrderPdfExportModal: React.FC<MeritOrderPdfExportModalProps> = ({
  isOpen,
  onClose,
  meritResult,
  config,
  schoolInfo,
  onExportComplete,
}) => {
  const [scope, setScope] = useState<MeritPdfScope>('all');
  const [includeCriteriaSummary, setIncludeCriteriaSummary] = useState(true);
  const [includeHonorRoll, setIncludeHonorRoll] = useState(true);
  const [includeRequirementsDetail, setIncludeRequirementsDetail] = useState(true);
  const [includePendingSubjectsDetail, setIncludePendingSubjectsDetail] = useState(true);
  const [actNumber, setActNumber] = useState('');
  const [additionalObservations, setAdditionalObservations] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const includedCount = useMemo(() => {
    if (scope === 'elegible') return meritResult.eligibleCandidates.length;
    if (scope === 'elegible_y_revision') {
      return meritResult.eligibleCandidates.length + meritResult.reviewCandidates.length;
    }
    return meritResult.evaluatedCount;
  }, [meritResult, scope]);

  if (!isOpen) return null;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const options: MeritPdfExportOptions = {
        scope,
        includeCriteriaSummary,
        includeHonorRoll,
        includeRequirementsDetail,
        includePendingSubjectsDetail: includeRequirementsDetail && includePendingSubjectsDetail,
        actNumber: actNumber.trim() || undefined,
        additionalObservations: additionalObservations.trim() || undefined,
      };
      const result = exportMeritOrderPDF(meritResult, config, schoolInfo, options);
      onExportComplete?.(result);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? `No se pudo generar el PDF: ${err.message}`
          : 'Ocurrió un error al generar el documento PDF.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto no-print"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="merit-pdf-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="aero-glass rounded-[28px] shadow-2xl max-w-2xl w-full border-2 border-white overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Cabecera */}
        <div className="aero-header px-5 py-5 sm:px-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana de exportación PDF"
            className="absolute top-4 right-4 text-sky-100 hover:text-white bg-white/15 hover:bg-white/25 p-2 rounded-full transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-start gap-3.5 pr-10">
            <div className="p-3 rounded-2xl bg-white/20 border border-white/30 shrink-0">
              <FileText size={24} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-sky-100">
                {schoolInfo.name} · Ciclo Lectivo {schoolInfo.academicYear}
              </p>
              <h3
                id="merit-pdf-modal-title"
                className="text-lg sm:text-xl font-extrabold tracking-tight leading-snug mt-0.5"
              >
                Exportar Acta de Abanderados y Escoltas (PDF)
              </h3>
              <p className="text-xs text-sky-100/95 mt-0.5">
                Formato institucional A4 horizontal · Lista ordenada, promedios generales y detalle
                de requisitos.
              </p>
            </div>
          </div>
        </div>

        {/* Cuerpo */}
        <form onSubmit={handleGenerate} className="p-5 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Resumen rápido de datos a exportar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 tabular-nums">
            <div className="bg-white/90 border border-sky-100 rounded-xl p-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 block">
                En este PDF
              </span>
              <span className="text-xl font-black text-[#0c2d48]">{includedCount}</span>
              <span className="text-[11px] text-slate-500 block">estudiantes</span>
            </div>
            <div className="bg-white/90 border border-sky-100 rounded-xl p-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">
                Elegibles
              </span>
              <span className="text-xl font-black text-emerald-700">
                {meritResult.eligibleCandidates.length}
              </span>
              <span className="text-[11px] text-slate-500 block">ordenados</span>
            </div>
            <div className="bg-white/90 border border-sky-100 rounded-xl p-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block">
                En revisión
              </span>
              <span className="text-xl font-black text-amber-700">
                {meritResult.reviewCandidates.length}
              </span>
              <span className="text-[11px] text-slate-500 block">directiva</span>
            </div>
            <div className="bg-white/90 border border-sky-100 rounded-xl p-3">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                No elegibles
              </span>
              <span className="text-xl font-black text-slate-700">
                {meritResult.ineligibleCandidates.length}
              </span>
              <span className="text-[11px] text-slate-500 block">con detalle</span>
            </div>
          </div>

          {meritResult.hasTopThreeTie && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 flex items-start gap-2">
              <Scale size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <p>
                El acta reflejará explícitamente el <strong>empate detectado</strong> en el Cuadro
                de Honor para resolución de las autoridades institucionales.
              </p>
            </div>
          )}

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-bold text-rose-800 flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Alcance de la nómina */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-[#0c2d48]">
              1. Alcance de la lista ordenada de alumnos
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'all' as MeritPdfScope,
                    title: 'Nómina completa',
                    desc: `Todos los evaluados (${meritResult.evaluatedCount})`,
                  },
                  {
                    id: 'elegible_y_revision' as MeritPdfScope,
                    title: 'Elegibles y Revisión',
                    desc: `${
                      meritResult.eligibleCandidates.length + meritResult.reviewCandidates.length
                    } estudiantes`,
                  },
                  {
                    id: 'elegible' as MeritPdfScope,
                    title: 'Solo Elegibles',
                    desc: `${meritResult.eligibleCandidates.length} con orden de mérito`,
                  },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScope(opt.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    scope === opt.id
                      ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-500'
                      : 'bg-white border-sky-100 hover:bg-sky-50/50'
                  }`}
                >
                  <p className="text-xs font-extrabold text-[#0c2d48]">{opt.title}</p>
                  <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Secciones incluidas */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-[#0c2d48]">
              2. Contenido del documento institucional
            </label>
            <div className="bg-white/90 border border-sky-100 rounded-2xl divide-y divide-sky-100 text-xs">
              <div className="p-3 flex items-center justify-between gap-3 bg-sky-50/50">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-sky-700 shrink-0" />
                  <div>
                    <p className="font-extrabold text-slate-900">
                      Lista ordenada de alumnos con promedios generales
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Siempre incluida · Orden de mérito, DNI, curso, promedio ({config.decimalPlaces}{' '}
                      dec.), estado y resumen de requisitos.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 shrink-0">
                  Incluida
                </span>
              </div>

              <label className="p-3 flex items-start gap-2.5 cursor-pointer hover:bg-sky-50/40">
                <input
                  type="checkbox"
                  checked={includeRequirementsDetail}
                  onChange={(e) => setIncludeRequirementsDetail(e.target.checked)}
                  className="mt-0.5 rounded border-sky-300 text-sky-700"
                />
                <div>
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ListChecks size={14} className="text-sky-600" />
                    <span>Detalle de cumplimiento de requisitos institucionales por estudiante</span>
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Verificación punto por punto ([CUMPLE] / [REVISIÓN] / [NO CUMPLE]) para cada
                    estudiante evaluado.
                  </span>
                </div>
              </label>

              {includeRequirementsDetail && (
                <label className="p-3 pl-9 flex items-start gap-2.5 cursor-pointer hover:bg-sky-50/40 bg-slate-50/60">
                  <input
                    type="checkbox"
                    checked={includePendingSubjectsDetail}
                    onChange={(e) => setIncludePendingSubjectsDetail(e.target.checked)}
                    className="mt-0.5 rounded border-sky-300 text-sky-700"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">
                      Detallar nómina de materias pendientes por alumno
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Agrega el nombre y curso de cada materia pendiente cuando corresponda.
                    </span>
                  </div>
                </label>
              )}

              <label className="p-3 flex items-start gap-2.5 cursor-pointer hover:bg-sky-50/40">
                <input
                  type="checkbox"
                  checked={includeHonorRoll}
                  onChange={(e) => setIncludeHonorRoll(e.target.checked)}
                  className="mt-0.5 rounded border-sky-300 text-sky-700"
                />
                <div>
                  <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Award size={14} className="text-sky-600" />
                    <span>Cuadro de Honor (Abanderado/a, 1° y 2° Escolta)</span>
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Tabla destacada con las designaciones y avisos de empate si existieran.
                  </span>
                </div>
              </label>

              <label className="p-3 flex items-start gap-2.5 cursor-pointer hover:bg-sky-50/40">
                <input
                  type="checkbox"
                  checked={includeCriteriaSummary}
                  onChange={(e) => setIncludeCriteriaSummary(e.target.checked)}
                  className="mt-0.5 rounded border-sky-300 text-sky-700"
                />
                <div>
                  <span className="font-extrabold text-slate-900 block">
                    Cuadro de criterios y parámetros institucionales vigentes
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Documenta cursos, fórmula de cálculo, regularidad y política disciplinaria
                    aplicada en el acta.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Datos opcionales del acta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                N° de Acta / Disposición (opcional)
              </label>
              <input
                type="text"
                value={actNumber}
                onChange={(e) => setActNumber(e.target.value)}
                placeholder="Ej.: Acta N° 04/2026"
                className="w-full px-3.5 py-2.5 min-h-[42px] bg-white border border-sky-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                Observaciones adicionales del acta (opcional)
              </label>
              <input
                type="text"
                value={additionalObservations}
                onChange={(e) => setAdditionalObservations(e.target.value)}
                placeholder="Ej.: Acta provisoria sujeta a mesa de diciembre"
                className="w-full px-3.5 py-2.5 min-h-[42px] bg-white border border-sky-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Acciones */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-3 border-t border-sky-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="aero-btn-primary flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold shadow-md"
            >
              <FileDown size={16} />
              <span>Generar y Descargar PDF Oficial</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
