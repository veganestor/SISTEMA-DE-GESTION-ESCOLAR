import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BadgeCheck,
  Search,
  Printer,
  FileDown,
  RefreshCw,
  Ban,
  CheckSquare,
  Square,
  SlidersHorizontal,
  Palette,
  Camera,
  Eye,
  X,
  Check,
  AlertTriangle,
  Copy,
} from 'lucide-react';
import {
  Teacher,
  SchoolInfo,
  CardDesignConfig,
  IssuedCardRecord,
  CardVisualOverride,
} from '../types';
import { CarnetPreviewCard } from './CarnetPreviewCard';
import {
  PrintableCardItem,
  buildTeacherPrintableCard,
  exportCardsSheetPDF,
} from '../services/cardPdfExport';
import { buildCardNumber, buildTeacherQRPayload, serializeQRPayload } from '../services/qrService';
import { compressImageFileToDataUrl, getLocalTodayISO } from '../services/storageService';

interface TeacherCarnetsModuleProps {
  teachers: Teacher[];
  schoolInfo: SchoolInfo;
  cardConfig: CardDesignConfig;
  issuedCards: IssuedCardRecord[];
  onUpsertIssuedCards: (updater: (prev: IssuedCardRecord[]) => IssuedCardRecord[]) => void;
  onOpenDesigner: () => void;
}

export const TeacherCarnetsModule: React.FC<TeacherCarnetsModuleProps> = ({
  teachers,
  schoolInfo,
  cardConfig,
  issuedCards,
  onUpsertIssuedCards,
  onOpenDesigner,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTeacherId, setActiveTeacherId] = useState<string | null>(null);
  const [showPhotoLocal, setShowPhotoLocal] = useState<boolean>(cardConfig.showTeacherPhoto);
  const [showDniLocal, setShowDniLocal] = useState<boolean>(cardConfig.showTeacherDni);
  const [previewItem, setPreviewItem] = useState<PrintableCardItem | null>(null);
  const [printSheetItems, setPrintSheetItems] = useState<PrintableCardItem[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const [editingVisualTeacher, setEditingVisualTeacher] = useState<Teacher | null>(null);
  const [visualDraft, setVisualDraft] = useState<CardVisualOverride>({});
  const [revokingTeacher, setRevokingTeacher] = useState<Teacher | null>(null);
  const [revokeReason, setRevokeReason] = useState('Renovación / Baja de credencial');
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2800);
  };

  useEffect(() => {
    setShowPhotoLocal(cardConfig.showTeacherPhoto);
    setShowDniLocal(cardConfig.showTeacherDni);
  }, [cardConfig.showTeacherPhoto, cardConfig.showTeacherDni]);

  const effectiveConfig = useMemo<CardDesignConfig>(
    () => ({
      ...cardConfig,
      showTeacherPhoto: showPhotoLocal,
      showTeacherDni: showDniLocal,
    }),
    [cardConfig, showPhotoLocal, showDniLocal]
  );

  const latestCardByTeacher = useMemo(() => {
    const map = new Map<string, IssuedCardRecord>();
    issuedCards
      .filter((c) => c.personType === 'teacher')
      .forEach((rec) => {
        const current = map.get(rec.personId);
        if (!current || rec.reissueCount >= current.reissueCount) {
          map.set(rec.personId, rec);
        }
      });
    return map;
  }, [issuedCards]);

  const filteredTeachers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        t.dni.toLowerCase().includes(q) ||
        (t.legajo || '').toLowerCase().includes(q) ||
        (t.role || '').toLowerCase().includes(q) ||
        t.assignedCourses.some((ac) => ac.subject.toLowerCase().includes(q))
    );
  }, [teachers, searchTerm]);

  const activeTeacher = useMemo(() => {
    if (activeTeacherId) {
      const found = teachers.find((t) => t.id === activeTeacherId);
      if (found) return found;
    }
    return filteredTeachers[0] || teachers[0] || null;
  }, [activeTeacherId, filteredTeachers, teachers]);

  const getOrDraftCardRecord = (teacher: Teacher): IssuedCardRecord => {
    const existing = latestCardByTeacher.get(teacher.id);
    if (existing) return existing;
    const seq = Math.max(1, teachers.findIndex((t) => t.id === teacher.id) + 1);
    return {
      cardNumber: buildCardNumber('teacher', schoolInfo.academicYear, seq, 1),
      personId: teacher.id,
      personType: 'teacher',
      issuedAt: getLocalTodayISO(),
      validUntil: cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
      academicYear: String(schoolInfo.academicYear),
      status: 'vigente',
      reissueCount: 1,
      snapshotName: teacher.fullName,
      snapshotRoleOrCourse: teacher.role || 'Personal Docente',
    };
  };

  const ensureIssuedRecords = (targetTeachers: Teacher[]): Map<string, IssuedCardRecord> => {
    const resultMap = new Map<string, IssuedCardRecord>();
    const toAppend: IssuedCardRecord[] = [];
    const today = getLocalTodayISO();
    let nextSeq = issuedCards.filter((c) => c.personType === 'teacher').length + 1;

    targetTeachers.forEach((tea) => {
      const existing = latestCardByTeacher.get(tea.id);
      if (existing && existing.status === 'vigente') {
        resultMap.set(tea.id, existing);
      } else {
        const prevCount = existing ? existing.reissueCount : 0;
        const fresh: IssuedCardRecord = {
          cardNumber: buildCardNumber('teacher', schoolInfo.academicYear, nextSeq++, prevCount + 1),
          personId: tea.id,
          personType: 'teacher',
          issuedAt: today,
          validUntil: cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
          academicYear: String(schoolInfo.academicYear),
          status: 'vigente',
          reissueCount: prevCount + 1,
          snapshotName: tea.fullName,
          snapshotRoleOrCourse: tea.role || 'Personal Docente',
          visualOverride: existing?.visualOverride,
        };
        toAppend.push(fresh);
        resultMap.set(tea.id, fresh);
      }
    });

    if (toAppend.length > 0) {
      onUpsertIssuedCards((prev) => [...prev, ...toAppend]);
    }
    return resultMap;
  };

  useEffect(() => {
    let mounted = true;
    if (!activeTeacher) {
      setPreviewItem(null);
      return;
    }
    const rec = getOrDraftCardRecord(activeTeacher);
    buildTeacherPrintableCard(activeTeacher, schoolInfo, rec, effectiveConfig).then((item) => {
      if (mounted) setPreviewItem(item);
    });
    return () => {
      mounted = false;
    };
  }, [activeTeacher, schoolInfo, effectiveConfig, issuedCards]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectFiltered = () => {
    const ids = filteredTeachers.map((t) => t.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  };

  const handleReissueCard = (teacher: Teacher) => {
    const today = getLocalTodayISO();
    onUpsertIssuedCards((prev) => {
      const records = prev.filter((c) => c.personType === 'teacher' && c.personId === teacher.id);
      const maxReissue = records.reduce((acc, r) => Math.max(acc, r.reissueCount), 0);
      const latestOverride = records[records.length - 1]?.visualOverride;
      const updatedOld = prev.map((c) =>
        c.personType === 'teacher' && c.personId === teacher.id && c.status === 'vigente'
          ? { ...c, status: 'reemplazado' as const }
          : c
      );
      const seq = Math.max(1, teachers.findIndex((t) => t.id === teacher.id) + 1);
      const fresh: IssuedCardRecord = {
        cardNumber: buildCardNumber('teacher', schoolInfo.academicYear, seq, maxReissue + 1),
        personId: teacher.id,
        personType: 'teacher',
        issuedAt: today,
        validUntil: latestOverride?.customValidityDate || cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
        academicYear: String(schoolInfo.academicYear),
        status: 'vigente',
        reissueCount: maxReissue + 1,
        snapshotName: teacher.fullName,
        snapshotRoleOrCourse: teacher.role || 'Personal Docente',
        visualOverride: latestOverride,
      };
      return [...updatedOld, fresh];
    });
    showToast(`Credencial docente reemitida para ${teacher.fullName}.`);
  };

  const handleConfirmRevoke = () => {
    if (!revokingTeacher) return;
    const targetCard = latestCardByTeacher.get(revokingTeacher.id);
    const today = getLocalTodayISO();
    onUpsertIssuedCards((prev) => {
      if (!targetCard) {
        const seq = Math.max(1, teachers.findIndex((t) => t.id === revokingTeacher.id) + 1);
        return [
          ...prev,
          {
            cardNumber: buildCardNumber('teacher', schoolInfo.academicYear, seq, 1),
            personId: revokingTeacher.id,
            personType: 'teacher',
            issuedAt: today,
            validUntil: cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
            academicYear: String(schoolInfo.academicYear),
            status: 'anulado',
            reissueCount: 1,
            revokedAt: today,
            revokeReason: revokeReason.trim() || 'Anulado manualmente',
            snapshotName: revokingTeacher.fullName,
            snapshotRoleOrCourse: revokingTeacher.role || 'Personal Docente',
          },
        ];
      }
      return prev.map((c) =>
        c.cardNumber === targetCard.cardNumber
          ? {
              ...c,
              status: 'anulado',
              revokedAt: today,
              revokeReason: revokeReason.trim() || 'Anulado manualmente',
            }
          : c
      );
    });
    showToast(`Credencial de ${revokingTeacher.fullName} anulada correctamente.`);
    setRevokingTeacher(null);
  };

  const openVisualOverrideModal = (teacher: Teacher) => {
    const existing = latestCardByTeacher.get(teacher.id);
    setEditingVisualTeacher(teacher);
    setVisualDraft({
      displayName: existing?.visualOverride?.displayName || '',
      customSubtitle: existing?.visualOverride?.customSubtitle || teacher.role || 'Personal Docente',
      customArea: existing?.visualOverride?.customArea || '',
      customValidityDate: existing?.visualOverride?.customValidityDate || '',
      displayPhoto: existing?.visualOverride?.displayPhoto,
      hidePhoto: existing?.visualOverride?.hidePhoto || false,
    });
  };

  const handleUploadVisualPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 360, 0.85);
      setVisualDraft((prev) => ({ ...prev, displayPhoto: dataUrl, hidePhoto: false }));
    } catch {
      showToast('No se pudo cargar la imagen seleccionada.');
    }
    e.target.value = '';
  };

  const handleSaveVisualOverride = () => {
    if (!editingVisualTeacher) return;
    const target = editingVisualTeacher;
    const existing = latestCardByTeacher.get(target.id);
    const cleanOverride: CardVisualOverride = {
      displayName: visualDraft.displayName?.trim() || undefined,
      customSubtitle: visualDraft.customSubtitle?.trim() || undefined,
      customArea: visualDraft.customArea?.trim() || undefined,
      customValidityDate: visualDraft.customValidityDate?.trim() || undefined,
      displayPhoto: visualDraft.displayPhoto,
      hidePhoto: visualDraft.hidePhoto,
    };

    onUpsertIssuedCards((prev) => {
      if (existing) {
        return prev.map((c) =>
          c.cardNumber === existing.cardNumber
            ? {
                ...c,
                validUntil: cleanOverride.customValidityDate || c.validUntil,
                visualOverride: cleanOverride,
              }
            : c
        );
      }
      const seq = Math.max(1, teachers.findIndex((t) => t.id === target.id) + 1);
      return [
        ...prev,
        {
          cardNumber: buildCardNumber('teacher', schoolInfo.academicYear, seq, 1),
          personId: target.id,
          personType: 'teacher',
          issuedAt: getLocalTodayISO(),
          validUntil: cleanOverride.customValidityDate || cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
          academicYear: String(schoolInfo.academicYear),
          status: 'vigente',
          reissueCount: 1,
          snapshotName: target.fullName,
          snapshotRoleOrCourse: target.role || 'Personal Docente',
          visualOverride: cleanOverride,
        },
      ];
    });

    showToast('Ajuste visual guardado (el legajo oficial del docente no fue modificado).');
    setEditingVisualTeacher(null);
  };

  const resolveBatchTargets = (onlyActive = false): Teacher[] => {
    if (onlyActive && activeTeacher) return [activeTeacher];
    if (selectedIds.length > 0) {
      return teachers.filter((t) => selectedIds.includes(t.id));
    }
    return filteredTeachers;
  };

  const handleExportPDF = async (onlyActive = false) => {
    const targets = resolveBatchTargets(onlyActive);
    if (!targets.length) return;
    setIsGeneratingPdf(true);
    try {
      const recordMap = ensureIssuedRecords(targets);
      const items = await Promise.all(
        targets.map((tea) =>
          buildTeacherPrintableCard(tea, schoolInfo, recordMap.get(tea.id)!, effectiveConfig)
        )
      );
      const slug = onlyActive ? targets[0].fullName.slice(0, 20) : 'docentes';
      exportCardsSheetPDF(items, schoolInfo, effectiveConfig, slug);
      showToast(`PDF generado con ${items.length} credencial(es) docente(s) en formato A4.`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintSheet = async (onlyActive = false) => {
    const targets = resolveBatchTargets(onlyActive);
    if (!targets.length) return;
    const recordMap = ensureIssuedRecords(targets);
    const items = await Promise.all(
      targets.map((tea) =>
        buildTeacherPrintableCard(tea, schoolInfo, recordMap.get(tea.id)!, effectiveConfig)
      )
    );
    setPrintSheetItems(items);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleCopyActiveQrJson = async () => {
    if (!activeTeacher) return;
    const rec = getOrDraftCardRecord(activeTeacher);
    const raw = serializeQRPayload(buildTeacherQRPayload(activeTeacher, schoolInfo, rec, effectiveConfig));
    try {
      await navigator.clipboard.writeText(raw);
      showToast('Payload JSON del QR docente copiado al portapapeles.');
    } catch {
      showToast('No se pudo acceder al portapapeles.');
    }
  };

  const batchCount = selectedIds.length > 0 ? selectedIds.length : filteredTeachers.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Cabecera */}
      <div className="aero-glass rounded-[28px] p-5 sm:p-7 border border-white/90 shadow-lg no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-teal-700 flex items-center gap-1.5">
              <BadgeCheck size={14} className="text-sky-600" />
              <span>Credenciales de Personal • Lectura en Vivo desde Docentes</span>
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Carnets de Docentes
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Emita identificaciones oficiales con código QR para el equipo docente de {schoolInfo.name} de forma individual o por lote.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenDesigner}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-white/90 hover:bg-white border border-sky-200 text-sky-900 text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
            >
              <Palette size={15} className="text-sky-600" />
              <span>Personalizar Diseño</span>
            </button>
            <button
              type="button"
              disabled={isGeneratingPdf || batchCount === 0}
              onClick={() => handleExportPDF(false)}
              className="aero-btn-primary px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              <FileDown size={15} />
              <span>
                {isGeneratingPdf ? 'Generando PDF...' : `Exportar Lote PDF (${batchCount})`}
              </span>
            </button>
            <button
              type="button"
              disabled={batchCount === 0}
              onClick={() => handlePrintSheet(false)}
              className="aero-btn-emerald px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md disabled:opacity-50"
            >
              <Printer size={15} />
              <span>Imprimir A4 ({batchCount})</span>
            </button>
          </div>
        </div>

        {/* Barra de Búsqueda y Toggles */}
        <div className="mt-5 pt-4 border-t border-sky-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar docente por nombre, DNI, legajo o materia..."
              className="w-full pl-9 pr-3.5 py-2 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-semibold text-slate-800 outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 bg-white/85 border border-sky-200 rounded-xl px-3.5 py-2 min-h-[44px] text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showPhotoLocal}
                onChange={(e) => setShowPhotoLocal(e.target.checked)}
                className="w-4 h-4 accent-sky-600"
              />
              <span>Incluir foto</span>
            </label>
            <label className="flex items-center gap-2 bg-white/85 border border-sky-200 rounded-xl px-3.5 py-2 min-h-[44px] text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showDniLocal}
                onChange={(e) => setShowDniLocal(e.target.checked)}
                className="w-4 h-4 accent-sky-600"
              />
              <span>Mostrar DNI</span>
            </label>
          </div>
        </div>
      </div>

      {feedbackToast && (
        <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 no-print">
          <Check size={17} />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Cuerpo Principal */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start no-print">
        {/* Lista de Docentes */}
        <div className="xl:col-span-5 aero-glass rounded-3xl p-4 sm:p-5 border border-white/90 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-sky-100">
            <span className="text-xs font-extrabold text-sky-950">
              Planta Docente ({filteredTeachers.length})
              {selectedIds.length > 0 && (
                <span className="text-teal-700 ml-1.5">• {selectedIds.length} seleccionados</span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectFiltered}
                className="text-[11px] font-extrabold text-sky-700 hover:text-sky-950 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg border border-sky-200"
              >
                {filteredTeachers.length > 0 && filteredTeachers.every((t) => selectedIds.includes(t.id))
                  ? 'Deseleccionar'
                  : 'Seleccionar todos'}
              </button>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-2 py-1.5"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {filteredTeachers.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">
              No se encontraron docentes con ese criterio de búsqueda.
            </p>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filteredTeachers.map((tea) => {
                const isSelected = selectedIds.includes(tea.id);
                const isActive = activeTeacher?.id === tea.id;
                const cardRec = latestCardByTeacher.get(tea.id);
                const photoSrc = cardRec?.visualOverride?.displayPhoto || tea.photo;
                return (
                  <div
                    key={tea.id}
                    className={`rounded-2xl p-3 border transition-all flex items-center gap-3 ${
                      isActive
                        ? 'bg-sky-50 border-sky-400 shadow-sm ring-2 ring-sky-200/70'
                        : 'bg-white/85 border-sky-100 hover:bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(tea.id)}
                      className="p-1.5 text-sky-600 shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                      aria-label={`Seleccionar a ${tea.fullName}`}
                    >
                      {isSelected ? <CheckSquare size={19} /> : <Square size={19} className="text-slate-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTeacherId(tea.id)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                    >
                      <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 font-extrabold text-xs flex items-center justify-center overflow-hidden shrink-0 border border-teal-200">
                        {photoSrc ? (
                          <img src={photoSrc} alt={tea.fullName} className="w-full h-full object-cover" />
                        ) : (
                          tea.fullName.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 uppercase truncate">
                          {tea.fullName}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold text-teal-700">
                            {tea.role || 'Docente'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Leg. {tea.legajo || 'S/L'}
                          </span>
                          {cardRec && (
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                cardRec.status === 'vigente'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : cardRec.status === 'anulado'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {cardRec.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Vista Previa Individual */}
        <div className="xl:col-span-7 aero-glass rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-5">
          {activeTeacher && previewItem ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 flex items-center gap-1">
                    <Eye size={13} />
                    <span>Vista Previa Frente y Dorso</span>
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 uppercase">
                    {activeTeacher.fullName}
                  </h3>
                  <p className="text-xs text-slate-600 font-mono">
                    Credencial N° {previewItem.cardRecord.cardNumber} • Estado:{' '}
                    <strong className="uppercase text-sky-900">{previewItem.cardRecord.status}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openVisualOverrideModal(activeTeacher)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <SlidersHorizontal size={14} />
                    <span>Ajustar Carnet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReissueCard(activeTeacher)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <RefreshCw size={14} />
                    <span>Reemitir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevokingTeacher(activeTeacher)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Ban size={14} />
                    <span>Anular</span>
                  </button>
                </div>
              </div>

              <div className="bg-gradient-to-br from-sky-100/60 via-white/80 to-emerald-100/50 rounded-2xl p-4 sm:p-6 border border-sky-200/80 flex items-center justify-center overflow-x-auto">
                <CarnetPreviewCard
                  item={previewItem}
                  schoolInfo={schoolInfo}
                  config={effectiveConfig}
                  side="both"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleCopyActiveQrJson}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-sky-50 border border-sky-200 text-slate-700 text-xs font-bold flex items-center gap-1.5"
                >
                  <Copy size={14} className="text-sky-600" />
                  <span>Copiar JSON del QR</span>
                </button>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportPDF(true)}
                    className="aero-btn-aqua px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <FileDown size={15} />
                    <span>PDF Individual</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintSheet(true)}
                    className="aero-btn-primary px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Printer size={15} />
                    <span>Imprimir Carnet</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500 text-center py-16">
              Seleccione un docente de la lista para visualizar su credencial frente y dorso.
            </p>
          )}
        </div>
      </div>

      {/* Modal Ajuste Visual Docente */}
      {editingVisualTeacher && (
        <div className="fixed inset-0 z-50 bg-sky-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="aero-glass rounded-3xl max-w-lg w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700">
                  Personalización Solo Visual del Carnet Docente
                </span>
                <h4 className="text-base font-extrabold text-slate-900">
                  {editingVisualTeacher.fullName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingVisualTeacher(null)}
                className="p-2 rounded-xl hover:bg-sky-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre visible en credencial</label>
                <input
                  type="text"
                  value={visualDraft.displayName || ''}
                  onChange={(e) => setVisualDraft((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder={editingVisualTeacher.fullName}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cargo / Función</label>
                  <input
                    type="text"
                    value={visualDraft.customSubtitle || ''}
                    onChange={(e) => setVisualDraft((p) => ({ ...p, customSubtitle: e.target.value }))}
                    placeholder="Ej. Profesor Titular / Preceptor"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Vigencia particular</label>
                  <input
                    type="date"
                    value={visualDraft.customValidityDate || ''}
                    onChange={(e) => setVisualDraft((p) => ({ ...p, customValidityDate: e.target.value }))}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Área / Materias resumidas (opcional)</label>
                <input
                  type="text"
                  value={visualDraft.customArea || ''}
                  onChange={(e) => setVisualDraft((p) => ({ ...p, customArea: e.target.value }))}
                  placeholder="Ej. Matemática y Física • Ciclo Orientado"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-white/80 p-3 rounded-xl border border-sky-100">
                <div className="flex items-center gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadVisualPhoto}
                  />
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="aero-btn-aqua px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Camera size={14} />
                    <span>Adjuntar Foto</span>
                  </button>
                  {visualDraft.displayPhoto && (
                    <button
                      type="button"
                      onClick={() => setVisualDraft((p) => ({ ...p, displayPhoto: undefined }))}
                      className="text-rose-600 font-bold hover:underline"
                    >
                      Quitar foto
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(visualDraft.hidePhoto)}
                    onChange={(e) => setVisualDraft((p) => ({ ...p, hidePhoto: e.target.checked }))}
                    className="w-4 h-4 accent-sky-600"
                  />
                  <span>Ocultar foto</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingVisualTeacher(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveVisualOverride}
                className="aero-btn-primary px-5 py-2.5 min-h-[44px] rounded-xl font-extrabold text-xs"
              >
                Guardar Ajuste Visual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Anulación Docente */}
      {revokingTeacher && (
        <div className="fixed inset-0 z-50 bg-sky-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="aero-glass rounded-3xl max-w-md w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">Anular Carnet Docente</h4>
                <p className="text-xs text-slate-600">{revokingTeacher.fullName}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Motivo de anulación</label>
              <input
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-rose-200 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRevokingTeacher(null)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold"
              >
                Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plancha A4 para window.print() */}
      {printSheetItems.length > 0 && (
        <div className="print-only carnet-print-sheet">
          <div className="mb-4 pb-2 border-b border-slate-300 flex items-center justify-between text-xs">
            <strong>{schoolInfo.name} — PLANCHA DE CREDENCIALES DOCENTES</strong>
            <span>Ciclo {schoolInfo.academicYear}</span>
          </div>
          <div className="space-y-6">
            {printSheetItems.map((item) => (
              <div key={item.cardRecord.cardNumber} className="break-inside-avoid flex justify-center">
                <CarnetPreviewCard
                  item={item}
                  schoolInfo={schoolInfo}
                  config={effectiveConfig}
                  side="both"
                  compact
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
