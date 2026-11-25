import React from 'react';
import { MeritOrderConfig } from '../types';
import {
  SANCTION_TYPE_LABELS,
  StudentMeritEligibilityDetail,
} from '../services/trajectoryService';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Info,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';

interface MeritStudentEligibilityIndicatorProps {
  evaluation: StudentMeritEligibilityDetail;
  config: MeritOrderConfig;
  variant?: 'compact' | 'card';
  showClearDisciplineInCompact?: boolean;
  onReviewDiscipline?: () => void;
  onOpenTrajectory?: () => void;
  className?: string;
}

export const MeritStudentEligibilityIndicator: React.FC<
  MeritStudentEligibilityIndicatorProps
> = ({
  evaluation,
  config,
  variant = 'card',
  showClearDisciplineInCompact = false,
  onReviewDiscipline,
  onOpenTrajectory,
  className = '',
}) => {
  const {
    student,
    summary,
    trajectoryChecks,
    meetsTrajectoryRequirements,
    passedTrajectoryChecksCount,
    totalTrajectoryChecksCount,
    activeDisciplinaryIncidents,
    pendingDisciplinaryIncidentsCount,
    hasActiveSanctionsForManualReview,
    manualReviewTriggerReasons = [],
  } = evaluation;

  const failedTrajectoryCount = totalTrajectoryChecksCount - passedTrajectoryChecksCount;
  const isCourseInMeritPool =
    config.targetCourses.length === 0 || config.targetCourses.includes(student.course);

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {/* Indicador de cumplimiento de requisitos mínimos de trayectoria */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold tabular-nums ${
            meetsTrajectoryRequirements
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
          title={
            meetsTrajectoryRequirements
              ? `Cumple los ${totalTrajectoryChecksCount} requisitos mínimos institucionales de trayectoria`
              : `Incumple ${failedTrajectoryCount} de ${totalTrajectoryChecksCount} requisitos mínimos institucionales de trayectoria`
          }
        >
          {meetsTrajectoryRequirements ? (
            <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
          ) : (
            <XCircle size={13} className="text-rose-600 shrink-0" />
          )}
          <span>
            {meetsTrajectoryRequirements
              ? `Trayectoria: Cumple (${passedTrajectoryChecksCount}/${totalTrajectoryChecksCount})`
              : `Trayectoria: No cumple (${passedTrajectoryChecksCount}/${totalTrajectoryChecksCount})`}
          </span>
        </span>

        {/* Alerta en ROJO cuando existen sanciones disciplinarias activas para revisión manual */}
        {hasActiveSanctionsForManualReview ? (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-300 text-red-800 text-[11px] font-extrabold tabular-nums"
            title="Registra sanciones disciplinarias activas que deben ser revisadas manualmente (no descuentan promedio)"
          >
            <ShieldAlert size={13} className="text-red-600 shrink-0" />
            <span>
              {activeDisciplinaryIncidents.length}{' '}
              {activeDisciplinaryIncidents.length === 1
                ? 'sanción activa'
                : 'sanciones activas'}{' '}
              · Revisar manualmente
            </span>
          </span>
        ) : (
          showClearDisciplineInCompact && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-bold">
              <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
              <span>Sin sanciones activas</span>
            </span>
          )
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-3.5 ${className}`}>
      {/* BLOQUE 1: INDICADOR VISUAL DE REQUISITOS MÍNIMOS INSTITUCIONALES DE TRAYECTORIA */}
      <div
        className={`rounded-2xl border p-4 space-y-3 ${
          meetsTrajectoryRequirements
            ? 'bg-emerald-50/75 border-emerald-200'
            : 'bg-amber-50/85 border-amber-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                meetsTrajectoryRequirements
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                  : 'bg-rose-100 border-rose-300 text-rose-700'
              }`}
            >
              {meetsTrajectoryRequirements ? (
                <CheckCircle2 size={21} />
              ) : (
                <XCircle size={21} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider ${
                    meetsTrajectoryRequirements ? 'text-emerald-800' : 'text-amber-900'
                  }`}
                >
                  Requisitos Mínimos Institucionales de Trayectoria
                </span>
                {!isCourseInMeritPool && (
                  <span className="px-2 py-0.5 rounded-md bg-white/90 border border-sky-200 text-sky-800 text-[10px] font-bold">
                    Curso actual ({student.course}° Año) fuera del alcance vigente (
                    {config.targetCourses.map((c) => `${c}°`).join(', ')} Año)
                  </span>
                )}
              </div>
              <h4
                className={`text-sm sm:text-base font-extrabold leading-snug mt-0.5 ${
                  meetsTrajectoryRequirements ? 'text-emerald-950' : 'text-amber-950'
                }`}
              >
                {meetsTrajectoryRequirements
                  ? 'Cumple con los requisitos mínimos institucionales de trayectoria'
                  : 'No cumple con todos los requisitos mínimos institucionales de trayectoria'}
              </h4>
              <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                {meetsTrajectoryRequirements
                  ? `Acredita ${passedTrajectoryChecksCount} de ${totalTrajectoryChecksCount} criterios mínimos académicos y de regularidad configurados para Abanderados y Escoltas.`
                  : `Presenta ${failedTrajectoryCount} criterio(s) de trayectoria pendiente(s) o sin cumplir (${passedTrajectoryChecksCount} de ${totalTrajectoryChecksCount} acreditados).`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-black tabular-nums ${
                meetsTrajectoryRequirements
                  ? 'bg-white border-emerald-300 text-emerald-800'
                  : 'bg-white border-rose-300 text-rose-800'
              }`}
            >
              {passedTrajectoryChecksCount}/{totalTrajectoryChecksCount} criterios OK
            </div>
            {onOpenTrajectory && (
              <button
                type="button"
                onClick={onOpenTrajectory}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-white hover:bg-sky-50 border border-sky-200 text-sky-900 text-xs font-extrabold transition-colors"
              >
                <ClipboardCheck size={14} className="text-sky-700" />
                <span>Abrir trayectoria</span>
              </button>
            )}
          </div>
        </div>

        {/* Detalle visual de cada requisito mínimo de trayectoria */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {trajectoryChecks.map((chk) => {
            const passed = chk.status === 'ok';
            return (
              <div
                key={chk.code}
                className={`rounded-xl border p-3 flex items-start gap-2.5 text-xs ${
                  passed
                    ? 'bg-white/95 border-emerald-200/90'
                    : 'bg-rose-50/90 border-rose-300'
                }`}
              >
                {passed ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p
                      className={`font-extrabold leading-snug ${
                        passed ? 'text-slate-900' : 'text-rose-950'
                      }`}
                    >
                      {chk.label}
                    </p>
                    <span
                      className={`text-[10px] font-black uppercase ${
                        passed ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {passed ? 'Cumple' : 'No cumple'}
                    </span>
                  </div>
                  <p
                    className={`text-[11px] mt-0.5 leading-snug ${
                      passed ? 'text-slate-600' : 'text-rose-900/90'
                    }`}
                  >
                    {chk.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BLOQUE 2: SANCIONES DISCIPLINARIAS ACTIVAS PARA REVISIÓN MANUAL (RESALTADO EN ROJO) */}
      {hasActiveSanctionsForManualReview ? (
        <div
          role="alert"
          className="rounded-2xl bg-red-50/95 border-2 border-red-300 p-4 space-y-3 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-300 text-red-700 flex items-center justify-center shrink-0">
                <ShieldAlert size={21} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-red-700">
                    Revisión Manual Obligatoria · Antecedentes Disciplinarios
                  </span>
                  {pendingDisciplinaryIncidentsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-extrabold tabular-nums">
                      {pendingDisciplinaryIncidentsCount} pendiente(s) de resolución
                    </span>
                  )}
                </div>
                <h4 className="text-sm sm:text-base font-black text-red-900 leading-snug mt-0.5 tabular-nums">
                  {activeDisciplinaryIncidents.length}{' '}
                  {activeDisciplinaryIncidents.length === 1
                    ? 'sanción disciplinaria activa'
                    : 'sanciones disciplinarias activas'}{' '}
                  que deben revisarse manualmente
                </h4>
                <p className="text-xs text-red-900/85 mt-0.5 leading-relaxed">
                  Se resaltan en rojo para consideración del Equipo Directivo / Comisión Evaluadora
                  antes de confirmar el Cuadro de Honor.{' '}
                  <strong className="text-red-950">
                    No descuentan puntos ni alteran el promedio académico.
                  </strong>
                </p>
              </div>
            </div>

            {onReviewDiscipline && (
              <button
                type="button"
                onClick={onReviewDiscipline}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-extrabold transition-colors shrink-0 shadow-sm"
              >
                <ShieldAlert size={14} />
                <span>Revisar en historial disciplinario</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>

          {/* Motivos concretos de disparo según umbrales disciplinarios configurados */}
          {manualReviewTriggerReasons.length > 0 && (
            <div className="bg-red-100/80 border border-red-300 rounded-xl px-3.5 py-2.5 space-y-1 text-xs text-red-950">
              <p className="text-[10px] font-black uppercase tracking-wider text-red-800">
                Umbrales disciplinarios activados para revisión manual
              </p>
              <ul className="space-y-0.5 list-disc list-inside font-semibold">
                {manualReviewTriggerReasons.map((reason, idx) => (
                  <li key={`trigger-${idx}`} className="leading-snug">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detalle individual en rojo de cada sanción disciplinaria activa */}
          <div className="space-y-2">
            {activeDisciplinaryIncidents.map((inc) => {
              const sanctionLabel =
                inc.customSanctionLabel?.trim() ||
                SANCTION_TYPE_LABELS[inc.sanctionType] ||
                inc.sanctionType;
              const isExcludedByPolicy =
                config.disciplinaryPolicy === 'exclude_selected_types' &&
                config.excludedSanctionTypes.includes(inc.sanctionType);
              const isPending = inc.status === 'pendiente';

              return (
                <div
                  key={inc.id}
                  className="bg-white border border-red-200 rounded-xl p-3 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle size={15} className="text-red-600 shrink-0" />
                      <span className="text-xs sm:text-sm font-black text-red-800">
                        {sanctionLabel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                          isPending
                            ? 'bg-red-600 text-white'
                            : 'bg-red-100 text-red-800 border border-red-300'
                        }`}
                      >
                        {isPending
                          ? 'Pendiente · Revisión prioritaria'
                          : 'Activa (Resuelta) · Revisar manualmente'}
                      </span>
                      {isExcludedByPolicy && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-950 text-white text-[10px] font-extrabold uppercase tracking-wide">
                          Alcanzada por criterio de exclusión
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 tabular-nums">
                      <Calendar size={12} className="text-red-600" />
                      <span>
                        {inc.date || 'Sin fecha'} · {inc.course}° Año (Ciclo {inc.academicYear})
                      </span>
                    </span>
                  </div>

                  <p className="text-xs text-slate-900 leading-snug">
                    <strong className="text-red-900">Motivo:</strong> {inc.reason}
                  </p>

                  {inc.description && (
                    <p className="text-[11px] text-slate-700 leading-relaxed">{inc.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-red-100 text-[11px] text-red-900/80">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <UserCheck size={12} className="text-red-600" />
                      <span>Autoridad: {inc.authority || 'Sin especificar'}</span>
                    </span>
                    {inc.supportingDocRef && (
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <FileText size={12} className="text-red-600" />
                        <span>Ref. documental: {inc.supportingDocRef}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {summary.disciplinary.legacyNotesCount > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-white/90 border border-red-200 px-3 py-2 text-[11px] text-red-900">
              <Info size={14} className="text-red-600 shrink-0 mt-0.5" />
              <span>
                Además existen <strong>{summary.disciplinary.legacyNotesCount}</strong> anotación(es)
                disciplinaria(s) histórica(s) en el legajo original. Verifique si corresponden a
                actuaciones ya cargadas o requieren revisión.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white/90 border border-slate-200 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-slate-700">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="text-slate-900">Antecedentes disciplinarios:</strong> Sin sanciones
              disciplinarias activas para revisión manual.
              {summary.disciplinary.annulledCount > 0 && (
                <span className="text-slate-500">
                  {' '}
                  ({summary.disciplinary.annulledCount} actuación(es) anulada(s) sin efecto.)
                </span>
              )}
            </span>
          </div>
          {summary.disciplinary.legacyNotesCount > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                {summary.disciplinary.legacyNotesCount} nota(s) histórica(s) en legajo
              </span>
              {onReviewDiscipline && (
                <button
                  type="button"
                  onClick={onReviewDiscipline}
                  className="text-[11px] font-extrabold text-sky-700 hover:text-sky-900 underline"
                >
                  Verificar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
