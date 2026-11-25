import React, { useMemo, useRef, useState } from 'react';
import {
  CourseYear,
  DisciplinaryActuationStatus,
  DisciplinaryIncident,
  DisciplinarySanctionType,
  Student,
} from '../types';
import {
  ACTUATION_STATUS_LABELS,
  SANCTION_TYPE_LABELS,
} from '../services/trajectoryService';
import { getLocalTodayISO } from '../services/storageService';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  FileDown,
  FileText,
  History,
  Info,
  Paperclip,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

interface DisciplinaryRecordsPanelProps {
  student: Student;
  incidents: DisciplinaryIncident[];
  onAddIncident: (incident: DisciplinaryIncident) => void;
  onUpdateIncident: (incident: DisciplinaryIncident) => void;
  onDeleteIncident: (incidentId: string) => void;
  onMigrateLegacy?: () => void;
  onExportDisciplinaryPDF?: () => void;
  currentAcademicYear: number;
  defaultAuthority?: string;
}

const MAX_ATTACHMENT_BYTES = 450 * 1024; // 450 KB para cuidar cuota de almacenamiento local

const SANCTION_TYPES_ORDER: DisciplinarySanctionType[] = [
  'llamado_atencion_verbal',
  'llamado_atencion_escrito',
  'apercibimiento',
  'acta_compromiso',
  'medida_reparadora',
  'suspension_temporal',
  'otra_medida',
];

interface IncidentFormState {
  date: string;
  academicYear: number;
  course: CourseYear;
  sanctionType: DisciplinarySanctionType;
  customSanctionLabel: string;
  reason: string;
  description: string;
  authority: string;
  status: DisciplinaryActuationStatus;
  resolutionDetails: string;
  resolutionDate: string;
  supportingDocRef: string;
  supportingDocName: string;
  supportingDocDataUrl: string;
}

export const DisciplinaryRecordsPanel: React.FC<DisciplinaryRecordsPanelProps> = ({
  student,
  incidents,
  onAddIncident,
  onUpdateIncident,
  onDeleteIncident,
  onMigrateLegacy,
  onExportDisciplinaryPDF,
  currentAcademicYear,
  defaultAuthority = '',
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | DisciplinaryActuationStatus>('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildInitialForm = (): IncidentFormState => ({
    date: getLocalTodayISO(),
    academicYear: currentAcademicYear,
    course: student.course,
    sanctionType: 'llamado_atencion_escrito',
    customSanctionLabel: '',
    reason: '',
    description: '',
    authority: defaultAuthority || 'Dirección / Preceptoría',
    status: 'pendiente',
    resolutionDetails: '',
    resolutionDate: '',
    supportingDocRef: '',
    supportingDocName: '',
    supportingDocDataUrl: '',
  });

  const [form, setForm] = useState<IncidentFormState>(buildInitialForm);

  const studentIncidents = useMemo(() => {
    return incidents
      .filter((i) => i.studentId === student.id)
      .sort((a, b) => {
        const cmp = b.date.localeCompare(a.date);
        if (cmp !== 0) return cmp;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [incidents, student.id]);

  const counts = useMemo(() => {
    let pending = 0;
    let resolved = 0;
    let annulled = 0;
    studentIncidents.forEach((inc) => {
      if (inc.status === 'pendiente') pending += 1;
      else if (inc.status === 'resuelta') resolved += 1;
      else annulled += 1;
    });
    return {
      total: studentIncidents.length,
      active: pending + resolved,
      pending,
      resolved,
      annulled,
    };
  }, [studentIncidents]);

  const filteredIncidents = useMemo(() => {
    if (statusFilter === 'all') return studentIncidents;
    return studentIncidents.filter((inc) => inc.status === statusFilter);
  }, [studentIncidents, statusFilter]);

  const unmigratedLegacyCount = useMemo(() => {
    const legacy = (student.disciplinary || []).filter((t) => (t || '').trim().length > 0);
    if (legacy.length === 0) return 0;
    const migratedDescriptions = new Set(
      studentIncidents.filter((i) => i.migratedFromLegacy).map((i) => i.description.trim())
    );
    return legacy.filter((raw) => !migratedDescriptions.has(raw.trim())).length;
  }, [student.disciplinary, studentIncidents]);

  const showNotice = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(buildInitialForm());
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditForm = (inc: DisciplinaryIncident) => {
    setEditingId(inc.id);
    setForm({
      date: inc.date,
      academicYear: inc.academicYear,
      course: inc.course,
      sanctionType: inc.sanctionType,
      customSanctionLabel: inc.customSanctionLabel || '',
      reason: inc.reason,
      description: inc.description,
      authority: inc.authority,
      status: inc.status,
      resolutionDetails: inc.resolutionDetails || '',
      resolutionDate: inc.resolutionDate || '',
      supportingDocRef: inc.supportingDocRef || '',
      supportingDocName: inc.supportingDocName || '',
      supportingDocDataUrl: inc.supportingDocDataUrl || '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setFormError(
        `El archivo "${file.name}" supera el límite recomendado de 450 KB. Comprima el documento o cargue la referencia de acta/expediente.`
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        supportingDocName: file.name,
        supportingDocDataUrl: String(reader.result || ''),
      }));
      setFormError(null);
    };
    reader.onerror = () => {
      setFormError('No se pudo leer el documento adjunto.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) {
      setFormError('Indique la fecha de la actuación disciplinaria.');
      return;
    }
    if (!form.reason.trim()) {
      setFormError('Ingrese el motivo de la medida o antecedente.');
      return;
    }
    if (!form.authority.trim()) {
      setFormError('Indique la autoridad que registra la medida.');
      return;
    }
    if (form.sanctionType === 'otra_medida' && !form.customSanctionLabel.trim()) {
      setFormError('Especifique el nombre de la medida disciplinaria.');
      return;
    }

    const now = new Date().toISOString();
    if (editingId) {
      const existing = studentIncidents.find((i) => i.id === editingId);
      const updated: DisciplinaryIncident = {
        id: editingId,
        studentId: student.id,
        date: form.date,
        academicYear: Number(form.academicYear) || currentAcademicYear,
        course: form.course,
        sanctionType: form.sanctionType,
        customSanctionLabel:
          form.sanctionType === 'otra_medida' ? form.customSanctionLabel.trim() : undefined,
        reason: form.reason.trim(),
        description: form.description.trim(),
        authority: form.authority.trim(),
        status: form.status,
        resolutionDetails: form.resolutionDetails.trim() || undefined,
        resolutionDate: form.resolutionDate || undefined,
        supportingDocRef: form.supportingDocRef.trim() || undefined,
        supportingDocName: form.supportingDocName || undefined,
        supportingDocDataUrl: form.supportingDocDataUrl || undefined,
        migratedFromLegacy: existing?.migratedFromLegacy,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      onUpdateIncident(updated);
      showNotice('Antecedente disciplinario actualizado correctamente.');
    } else {
      const created: DisciplinaryIncident = {
        id: `disc-${student.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        studentId: student.id,
        date: form.date,
        academicYear: Number(form.academicYear) || currentAcademicYear,
        course: form.course,
        sanctionType: form.sanctionType,
        customSanctionLabel:
          form.sanctionType === 'otra_medida' ? form.customSanctionLabel.trim() : undefined,
        reason: form.reason.trim(),
        description: form.description.trim(),
        authority: form.authority.trim(),
        status: form.status,
        resolutionDetails: form.resolutionDetails.trim() || undefined,
        resolutionDate: form.resolutionDate || undefined,
        supportingDocRef: form.supportingDocRef.trim() || undefined,
        supportingDocName: form.supportingDocName || undefined,
        supportingDocDataUrl: form.supportingDocDataUrl || undefined,
        createdAt: now,
        updatedAt: now,
      };
      onAddIncident(created);
      showNotice('Antecedente disciplinario registrado en el historial del estudiante.');
    }

    setIsFormOpen(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleQuickStatusChange = (
    inc: DisciplinaryIncident,
    nextStatus: DisciplinaryActuationStatus
  ) => {
    if (inc.status === nextStatus) return;
    onUpdateIncident({
      ...inc,
      status: nextStatus,
      resolutionDate:
        nextStatus === 'resuelta' && !inc.resolutionDate ? getLocalTodayISO() : inc.resolutionDate,
      updatedAt: new Date().toISOString(),
    });
    showNotice(`Estado actualizado a "${ACTUATION_STATUS_LABELS[nextStatus]}".`);
  };

  const statusTone = (status: DisciplinaryActuationStatus) => {
    if (status === 'pendiente') {
      return {
        text: 'text-amber-800',
        bg: 'bg-amber-50 border-amber-200',
        icon: <Clock size={13} className="text-amber-600 shrink-0" />,
      };
    }
    if (status === 'resuelta') {
      return {
        text: 'text-sky-800',
        bg: 'bg-sky-50 border-sky-200',
        icon: <CheckCircle2 size={13} className="text-sky-600 shrink-0" />,
      };
    }
    return {
      text: 'text-slate-500',
      bg: 'bg-slate-100 border-slate-200',
      icon: <XCircle size={13} className="text-slate-400 shrink-0" />,
    };
  };

  return (
    <div className="space-y-5">
      {/* Encabezado del bloque */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-lg sm:text-xl font-extrabold text-[#0c2d48] tracking-tight flex items-center gap-2">
            <ShieldAlert size={20} className="text-sky-700 shrink-0" />
            <span>Antecedentes disciplinarios</span>
          </h4>
          <p className="text-xs text-slate-600 mt-0.5">
            Historial cronológico de actuaciones y medidas vinculadas al legajo de{' '}
            <span className="font-bold text-slate-800">{student.fullName}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onMigrateLegacy && unmigratedLegacyCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onMigrateLegacy();
                showNotice(
                  `Se importaron ${unmigratedLegacyCount} registro(s) previos sin modificar el historial original.`
                );
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold transition-colors"
            >
              <History size={15} className="text-sky-600" />
              <span>Importar {unmigratedLegacyCount} novedad(es) previa(s)</span>
            </button>
          )}

          {onExportDisciplinaryPDF && (
            <button
              type="button"
              onClick={onExportDisciplinaryPDF}
              className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-extrabold transition-colors"
              title="Exportar resumen disciplinario completo del estudiante en PDF"
            >
              <FileDown size={15} className="text-rose-600" />
              <span>Exportar Resumen Disciplinario PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={isFormOpen && !editingId ? () => setIsFormOpen(false) : openCreateForm}
            className="aero-btn-primary flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold"
          >
            <Plus size={16} />
            <span>Registrar antecedente</span>
          </button>
        </div>
      </div>

      {/* Aviso normativo obligatorio: las sanciones jamás descuentan promedio */}
      <div className="bg-sky-50/85 border border-sky-200/90 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-sky-950">
        <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <span className="font-extrabold">Criterio académico:</span> Las sanciones o medidas
          disciplinarias <strong>nunca descuentan ni alteran el promedio académico</strong>. Este
          registro se conserva únicamente como antecedente institucional y se evalúa en el Orden de
          Mérito exclusivamente según la normativa configurada por la escuela.
        </p>
      </div>

      {feedbackMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Check size={15} className="text-emerald-600 shrink-0" />
            {feedbackMsg}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-emerald-700 hover:underline"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Métricas rápidas y filtro de estado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/80 border border-sky-100 rounded-2xl p-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
          <span>
            Activas: <strong className="text-slate-900">{counts.active}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            Pendientes: <strong className="text-amber-700">{counts.pending}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            Resueltas: <strong className="text-sky-800">{counts.resolved}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span>
            Anuladas: <strong className="text-slate-500">{counts.annulled}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1 bg-sky-50/90 p-1 rounded-xl border border-sky-100 overflow-x-auto">
          {(
            [
              { id: 'all', label: `Todas (${counts.total})` },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'resuelta', label: 'Resueltas' },
              { id: 'anulada', label: 'Anuladas' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 min-h-[34px] rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                statusFilter === f.id
                  ? 'bg-white text-sky-900 shadow-sm border border-sky-200'
                  : 'text-slate-600 hover:text-sky-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formulario de alta / edición */}
      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-sky-200 p-4 sm:p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-sky-100 pb-3">
            <h5 className="text-sm font-extrabold text-[#0c2d48]">
              {editingId ? 'Editar antecedente disciplinario' : 'Nuevo antecedente disciplinario'}
            </h5>
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingId(null);
                setFormError(null);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Cerrar formulario"
            >
              <X size={18} />
            </button>
          </div>

          {formError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-2.5 text-xs font-bold flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Fecha de la situación *
              </label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Ciclo lectivo *
              </label>
              <input
                type="number"
                min={2015}
                max={2040}
                required
                value={form.academicYear}
                onChange={(e) =>
                  setForm({ ...form, academicYear: Number(e.target.value) || currentAcademicYear })
                }
                className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-semibold text-slate-900 tabular-nums focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Curso al momento del hecho *
              </label>
              <select
                value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value as CourseYear })}
                className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              >
                {(['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((c) => (
                  <option key={c} value={c}>
                    {c}° Año
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Tipo de sanción o medida *
              </label>
              <select
                value={form.sanctionType}
                onChange={(e) =>
                  setForm({ ...form, sanctionType: e.target.value as DisciplinarySanctionType })
                }
                className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              >
                {SANCTION_TYPES_ORDER.map((typeKey) => (
                  <option key={typeKey} value={typeKey}>
                    {SANCTION_TYPE_LABELS[typeKey]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Estado de la actuación *
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as DisciplinaryActuationStatus })
                }
                className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              >
                <option value="pendiente">Pendiente</option>
                <option value="resuelta">Resuelta</option>
                <option value="anulada">Anulada (sin efecto)</option>
              </select>
            </div>
          </div>

          {form.sanctionType === 'otra_medida' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Nombre de la medida personalizada *
              </label>
              <input
                type="text"
                value={form.customSanctionLabel}
                onChange={(e) => setForm({ ...form, customSanctionLabel: e.target.value })}
                placeholder="Ej.: Instancia de mediación escolar / Reunión con tutor"
                className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Motivo principal *
              </label>
              <input
                type="text"
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Ej.: Incumplimiento reiterado de pautas de convivencia"
                className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Autoridad que registra la medida *
              </label>
              <input
                type="text"
                required
                value={form.authority}
                onChange={(e) => setForm({ ...form, authority: e.target.value })}
                placeholder="Ej.: Dirección / Vicedirección / Preceptoría"
                className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Descripción y observaciones del incidente
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalle de lo sucedido, intervención con la familia, acuerdos de convivencia u observaciones relevantes..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Resolución / Disposición institucional (opcional)
              </label>
              <textarea
                rows={2}
                value={form.resolutionDetails}
                onChange={(e) => setForm({ ...form, resolutionDetails: e.target.value })}
                placeholder="Ej.: Se notificó a la familia, se firmó acta de compromiso y se dio por cumplida la medida educativa..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Fecha de resolución (opcional)
              </label>
              <input
                type="date"
                value={form.resolutionDate}
                onChange={(e) => setForm({ ...form, resolutionDate: e.target.value })}
                className="w-full px-3 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          </div>

          {/* Documentación respaldatoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1 border-t border-sky-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Referencia documental (N° de acta / expediente)
              </label>
              <input
                type="text"
                value={form.supportingDocRef}
                onChange={(e) => setForm({ ...form, supportingDocRef: e.target.value })}
                placeholder="Ej.: Acta N° 14/2026 — Libro de Convivencia f. 18"
                className="w-full px-3.5 py-2.5 min-h-[44px] bg-slate-50 border border-sky-200 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Adjuntar respaldo digital (opcional, PDF/imagen máx. 450 KB)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                onChange={handleAttachmentChange}
                className="hidden"
              />
              {form.supportingDocName ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] bg-sky-50 border border-sky-200 rounded-xl text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-sky-900 truncate">
                    <Paperclip size={14} className="shrink-0" />
                    <span className="truncate">{form.supportingDocName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ ...form, supportingDocName: '', supportingDocDataUrl: '' });
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-rose-600 hover:underline font-bold shrink-0"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] bg-slate-50 hover:bg-sky-50 border border-dashed border-sky-300 rounded-xl text-xs font-bold text-sky-800 transition-colors"
                >
                  <Upload size={14} />
                  <span>Adjuntar acta o nota respaldatoria</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingId(null);
                setFormError(null);
              }}
              className="px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="aero-btn-primary px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold"
            >
              {editingId ? 'Guardar cambios' : 'Registrar en historial'}
            </button>
          </div>
        </form>
      )}

      {/* Listado cronológico */}
      {filteredIncidents.length > 0 ? (
        <div className="space-y-3">
          {filteredIncidents.map((inc) => {
            const tone = statusTone(inc.status);
            const sanctionLabel =
              inc.sanctionType === 'otra_medida' && inc.customSanctionLabel
                ? inc.customSanctionLabel
                : SANCTION_TYPE_LABELS[inc.sanctionType];

            return (
              <article
                key={inc.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  inc.status === 'anulada'
                    ? 'bg-slate-50/80 border-slate-200 opacity-80'
                    : 'bg-white border-sky-100 hover:border-sky-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                      <span className="font-extrabold text-[#0c2d48]">{sanctionLabel}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-semibold text-slate-600 tabular-nums">{inc.date}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-600 font-medium tabular-nums">
                        {inc.course}° Año ({inc.academicYear})
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${tone.bg} ${tone.text}`}
                      >
                        {tone.icon}
                        {ACTUATION_STATUS_LABELS[inc.status]}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900">{inc.reason}</p>
                    {inc.description && (
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                        {inc.description}
                      </p>
                    )}
                    {(inc.resolutionDetails || inc.resolutionDate) && (
                      <div className="bg-sky-50/80 border border-sky-100 rounded-xl px-3 py-2 text-xs text-sky-950 space-y-0.5">
                        <p className="font-extrabold text-[11px] text-sky-900">
                          Resolución institucional
                          {inc.resolutionDate ? ` (${inc.resolutionDate})` : ''}:
                        </p>
                        {inc.resolutionDetails && (
                          <p className="leading-relaxed whitespace-pre-line text-slate-700">
                            {inc.resolutionDetails}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-slate-500">
                      <span>
                        Autoridad: <strong className="text-slate-700">{inc.authority}</strong>
                      </span>
                      {inc.supportingDocRef && (
                        <span className="inline-flex items-center gap-1">
                          <FileText size={12} className="text-sky-600" />
                          <span>Ref.: {inc.supportingDocRef}</span>
                        </span>
                      )}
                      {inc.supportingDocDataUrl && inc.supportingDocName && (
                        <span className="inline-flex items-center gap-2">
                          <a
                            href={inc.supportingDocDataUrl}
                            download={inc.supportingDocName}
                            className="inline-flex items-center gap-1 text-sky-700 hover:underline font-bold"
                          >
                            <Paperclip size={12} />
                            <span>Descargar {inc.supportingDocName}</span>
                          </a>
                          {inc.supportingDocDataUrl.startsWith('data:image/') && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewDoc({
                                  name: inc.supportingDocName || 'Respaldo',
                                  dataUrl: inc.supportingDocDataUrl || '',
                                })
                              }
                              className="text-teal-700 hover:underline font-bold"
                            >
                              Ver imagen
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones de estado, edición y borrado seguro */}
                  <div className="flex flex-wrap sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <select
                        aria-label="Cambiar estado de la actuación"
                        value={inc.status}
                        onChange={(e) =>
                          handleQuickStatusChange(
                            inc,
                            e.target.value as DisciplinaryActuationStatus
                          )
                        }
                        className="px-2.5 py-1.5 min-h-[36px] bg-slate-50 border border-sky-200 rounded-lg text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="resuelta">Resuelta</option>
                        <option value="anulada">Anulada</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => openEditForm(inc)}
                        className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors"
                        title="Editar registro"
                      >
                        <Edit3 size={15} />
                      </button>

                      {deleteConfirmId === inc.id ? (
                        <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteIncident(inc.id);
                              setDeleteConfirmId(null);
                              showNotice('Registro eliminado del historial.');
                            }}
                            className="text-[11px] font-extrabold text-rose-700 hover:underline px-1"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-[11px] font-semibold text-slate-500 hover:underline px-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(inc.id)}
                          className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Eliminar registro"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white/75 border border-dashed border-sky-200 rounded-2xl p-8 text-center">
          <p className="text-sm font-bold text-slate-600">
            {statusFilter === 'all'
              ? 'Sin antecedentes disciplinarios estructurados registrados para este alumno.'
              : `No hay actuaciones en estado "${ACTUATION_STATUS_LABELS[statusFilter]}".`}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Utilice el botón &ldquo;Registrar antecedente&rdquo; cuando corresponda documentar una
            actuación o medida institucional.
          </p>
        </div>
      )}

      {/* Modal simple para previsualizar imagen respaldatoria */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-sky-950/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl border border-sky-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <span className="text-xs font-extrabold text-slate-800 truncate">
                {previewDoc.name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={previewDoc.dataUrl}
              alt={previewDoc.name}
              className="max-h-[70vh] w-full object-contain rounded-xl bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
};
