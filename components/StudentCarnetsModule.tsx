import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  IdCard,
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
  Student,
  CourseYear,
  SchoolInfo,
  CardDesignConfig,
  IssuedCardRecord,
  CardVisualOverride,
} from '../types';
import { CarnetPreviewCard } from './CarnetPreviewCard';
import {
  PrintableCardItem,
  buildStudentPrintableCard,
  exportCardsSheetPDF,
} from '../services/cardPdfExport';
import { buildCardNumber, buildStudentQRPayload, serializeQRPayload } from '../services/qrService';
import { compressImageFileToDataUrl, getLocalTodayISO } from '../services/storageService';

interface StudentCarnetsModuleProps {
  students: Student[];
  schoolInfo: SchoolInfo;
  cardConfig: CardDesignConfig;
  issuedCards: IssuedCardRecord[];
  onUpsertIssuedCards: (updater: (prev: IssuedCardRecord[]) => IssuedCardRecord[]) => void;
  onOpenDesigner: () => void;
}

const COURSES: { id: CourseYear | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: '1', label: '1° Año' },
  { id: '2', label: '2° Año' },
  { id: '3', label: '3° Año' },
  { id: '4', label: '4° Año' },
  { id: '5', label: '5° Año' },
  { id: '6', label: '6° Año' },
];

export const StudentCarnetsModule: React.FC<StudentCarnetsModuleProps> = ({
  students,
  schoolInfo,
  cardConfig,
  issuedCards,
  onUpsertIssuedCards,
  onOpenDesigner,
}) => {
  const [selectedCourse, setSelectedCourse] = useState<CourseYear | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [includePhotoOverride, setIncludePhotoOverride] = useState<boolean>(cardConfig.showStudentPhoto);
  const [previewItem, setPreviewItem] = useState<PrintableCardItem | null>(null);
  const [printSheetItems, setPrintSheetItems] = useState<PrintableCardItem[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Modales locales (override visual y anulación)
  const [editingVisualStudent, setEditingVisualStudent] = useState<Student | null>(null);
  const [visualDraft, setVisualDraft] = useState<CardVisualOverride>({});
  const [revokingStudent, setRevokingStudent] = useState<Student | null>(null);
  const [revokeReason, setRevokeReason] = useState('Extravío / Solicitud de reposición');
  const overridePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 2800);
  };

  useEffect(() => {
    setIncludePhotoOverride(cardConfig.showStudentPhoto);
  }, [cardConfig.showStudentPhoto]);

  const effectiveConfig = useMemo<CardDesignConfig>(
    () => ({
      ...cardConfig,
      showStudentPhoto: includePhotoOverride,
    }),
    [cardConfig, includePhotoOverride]
  );

  // Mapa rápido del último carnet emitido por alumno
  const latestCardByStudent = useMemo(() => {
    const map = new Map<string, IssuedCardRecord>();
    issuedCards
      .filter((c) => c.personType === 'student')
      .forEach((rec) => {
        const current = map.get(rec.personId);
        if (!current || rec.reissueCount >= current.reissueCount) {
          map.set(rec.personId, rec);
        }
      });
    return map;
  }, [issuedCards]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return students.filter((s) => {
      if (selectedCourse !== 'all' && s.course !== selectedCourse) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        s.dni.toLowerCase().includes(q) ||
        `${s.course}°`.includes(q)
      );
    });
  }, [students, selectedCourse, searchTerm]);

  const activeStudent = useMemo(() => {
    if (activeStudentId) {
      const found = students.find((s) => s.id === activeStudentId);
      if (found) return found;
    }
    return filteredStudents[0] || students[0] || null;
  }, [activeStudentId, filteredStudents, students]);

  // Crea un registro temporal o retorna el registro emitido del alumno
  const getOrDraftCardRecord = (student: Student, idxFallback = 1): IssuedCardRecord => {
    const existing = latestCardByStudent.get(student.id);
    if (existing) return existing;
    const seq = Math.max(1, students.findIndex((s) => s.id === student.id) + 1 || idxFallback);
    return {
      cardNumber: buildCardNumber('student', schoolInfo.academicYear, seq, 1),
      personId: student.id,
      personType: 'student',
      issuedAt: getLocalTodayISO(),
      validUntil: cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
      academicYear: String(schoolInfo.academicYear),
      status: 'vigente',
      reissueCount: 1,
      snapshotName: student.fullName,
      snapshotRoleOrCourse: `${student.course}° Año`,
    };
  };

  // Emitir o registrar carnet(s) formalmente en `issuedCards` sin tocar `students`
  const ensureIssuedRecords = (targetStudents: Student[]): Map<string, IssuedCardRecord> => {
    const resultMap = new Map<string, IssuedCardRecord>();
    const toAppend: IssuedCardRecord[] = [];
    const today = getLocalTodayISO();
    const existingStudentCardsCount = issuedCards.filter((c) => c.personType === 'student').length;
    let nextSeq = existingStudentCardsCount + 1;

    targetStudents.forEach((st) => {
      const existing = latestCardByStudent.get(st.id);
      if (existing && existing.status === 'vigente') {
        resultMap.set(st.id, existing);
      } else {
        const prevCount = existing ? existing.reissueCount : 0;
        const newRec: IssuedCardRecord = {
          cardNumber: buildCardNumber('student', schoolInfo.academicYear, nextSeq++, prevCount + 1),
          personId: st.id,
          personType: 'student',
          issuedAt: today,
          validUntil: cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
          academicYear: String(schoolInfo.academicYear),
          status: 'vigente',
          reissueCount: prevCount + 1,
          snapshotName: st.fullName,
          snapshotRoleOrCourse: `${st.course}° Año`,
          visualOverride: existing?.visualOverride,
        };
        toAppend.push(newRec);
        resultMap.set(st.id, newRec);
      }
    });

    if (toAppend.length > 0) {
      onUpsertIssuedCards((prev) => [...prev, ...toAppend]);
    }
    return resultMap;
  };

  // Actualizar vista previa del alumno seleccionado
  useEffect(() => {
    let mounted = true;
    if (!activeStudent) {
      setPreviewItem(null);
      return;
    }
    const rec = getOrDraftCardRecord(activeStudent);
    buildStudentPrintableCard(activeStudent, schoolInfo, rec, effectiveConfig).then((item) => {
      if (mounted) setPreviewItem(item);
    });
    return () => {
      mounted = false;
    };
  }, [activeStudent, schoolInfo, effectiveConfig, issuedCards]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectFiltered = () => {
    const filteredIds = filteredStudents.map((s) => s.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleReissueCard = (student: Student) => {
    const today = getLocalTodayISO();
    onUpsertIssuedCards((prev) => {
      const studentRecords = prev.filter((c) => c.personType === 'student' && c.personId === student.id);
      const maxReissue = studentRecords.reduce((acc, r) => Math.max(acc, r.reissueCount), 0);
      const latestOverride = studentRecords[studentRecords.length - 1]?.visualOverride;
      const updatedOld = prev.map((c) =>
        c.personType === 'student' && c.personId === student.id && c.status === 'vigente'
          ? { ...c, status: 'reemplazado' as const }
          : c
      );
      const seq = Math.max(1, students.findIndex((s) => s.id === student.id) + 1);
      const fresh: IssuedCardRecord = {
        cardNumber: buildCardNumber('student', schoolInfo.academicYear, seq, maxReissue + 1),
        personId: student.id,
        personType: 'student',
        issuedAt: today,
        validUntil: latestOverride?.customValidityDate || cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
        academicYear: String(schoolInfo.academicYear),
        status: 'vigente',
        reissueCount: maxReissue + 1,
        snapshotName: student.fullName,
        snapshotRoleOrCourse: `${student.course}° Año`,
        visualOverride: latestOverride,
      };
      return [...updatedOld, fresh];
    });
    showToast(`Carnet reemitido para ${student.fullName}. La credencial anterior quedó marcada como reemplazada.`);
  };

  const handleConfirmRevoke = () => {
    if (!revokingStudent) return;
    const targetCard = latestCardByStudent.get(revokingStudent.id);
    const today = getLocalTodayISO();
    onUpsertIssuedCards((prev) => {
      if (!targetCard) {
        const seq = Math.max(1, students.findIndex((s) => s.id === revokingStudent.id) + 1);
        return [
          ...prev,
          {
            cardNumber: buildCardNumber('student', schoolInfo.academicYear, seq, 1),
            personId: revokingStudent.id,
            personType: 'student',
            issuedAt: today,
            validUntil: cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
            academicYear: String(schoolInfo.academicYear),
            status: 'anulado',
            reissueCount: 1,
            revokedAt: today,
            revokeReason: revokeReason.trim() || 'Anulado manualmente',
            snapshotName: revokingStudent.fullName,
            snapshotRoleOrCourse: `${revokingStudent.course}° Año`,
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
    showToast(`Carnet de ${revokingStudent.fullName} anulado. El lector QR lo detectará como revocado.`);
    setRevokingStudent(null);
  };

  const openVisualOverrideModal = (student: Student) => {
    const existing = latestCardByStudent.get(student.id);
    setEditingVisualStudent(student);
    setVisualDraft({
      displayName: existing?.visualOverride?.displayName || '',
      customSubtitle: existing?.visualOverride?.customSubtitle || student.division || '',
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
      showToast('No se pudo procesar la foto seleccionada.');
    }
    e.target.value = '';
  };

  const handleSaveVisualOverride = () => {
    if (!editingVisualStudent) return;
    const target = editingVisualStudent;
    const existing = latestCardByStudent.get(target.id);
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
      const seq = Math.max(1, students.findIndex((s) => s.id === target.id) + 1);
      return [
        ...prev,
        {
          cardNumber: buildCardNumber('student', schoolInfo.academicYear, seq, 1),
          personId: target.id,
          personType: 'student',
          issuedAt: getLocalTodayISO(),
          validUntil: cleanOverride.customValidityDate || cardConfig.validityDate || `${schoolInfo.academicYear}-12-31`,
          academicYear: String(schoolInfo.academicYear),
          status: 'vigente',
          reissueCount: 1,
          snapshotName: target.fullName,
          snapshotRoleOrCourse: `${target.course}° Año`,
          visualOverride: cleanOverride,
        },
      ];
    });

    showToast('Personalización visual guardada (sin alterar el legajo original del estudiante).');
    setEditingVisualStudent(null);
  };

  const resolveBatchTargets = (onlyActive = false): Student[] => {
    if (onlyActive && activeStudent) return [activeStudent];
    if (selectedIds.length > 0) {
      return students.filter((s) => selectedIds.includes(s.id));
    }
    return filteredStudents;
  };

  const handleExportPDF = async (onlyActive = false) => {
    const targets = resolveBatchTargets(onlyActive);
    if (!targets.length) {
      showToast('No hay estudiantes seleccionados para exportar.');
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const recordMap = ensureIssuedRecords(targets);
      const items = await Promise.all(
        targets.map((st) =>
          buildStudentPrintableCard(st, schoolInfo, recordMap.get(st.id)!, effectiveConfig)
        )
      );
      const slug = onlyActive
        ? targets[0].fullName.slice(0, 20)
        : selectedCourse === 'all'
        ? 'estudiantes'
        : `estudiantes_${selectedCourse}_anio`;
      exportCardsSheetPDF(items, schoolInfo, effectiveConfig, slug);
      showToast(`PDF generado con ${items.length} carnet(s) en plancha A4 (Frente + Dorso).`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintSheet = async (onlyActive = false) => {
    const targets = resolveBatchTargets(onlyActive);
    if (!targets.length) return;
    const recordMap = ensureIssuedRecords(targets);
    const items = await Promise.all(
      targets.map((st) =>
        buildStudentPrintableCard(st, schoolInfo, recordMap.get(st.id)!, effectiveConfig)
      )
    );
    setPrintSheetItems(items);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleCopyActiveQrJson = async () => {
    if (!activeStudent) return;
    const rec = getOrDraftCardRecord(activeStudent);
    const raw = serializeQRPayload(buildStudentQRPayload(activeStudent, schoolInfo, rec, effectiveConfig));
    try {
      await navigator.clipboard.writeText(raw);
      showToast('Payload JSON del QR copiado al portapapeles para pruebas en el Lector QR.');
    } catch {
      showToast('No se pudo acceder al portapapeles.');
    }
  };

  const batchCount = selectedIds.length > 0 ? selectedIds.length : filteredStudents.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* Encabezado del Módulo */}
      <div className="aero-glass rounded-[28px] p-5 sm:p-7 border border-white/90 shadow-lg no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700 flex items-center gap-1.5">
              <IdCard size={14} className="text-teal-500" />
              <span>Credenciales Escolares con QR • Lectura en Vivo desde Alumnos</span>
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Carnets de Estudiantes
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              Genere carnets individuales, por curso o en lote desde los registros reales de alumnos sin duplicar ni modificar legajos.
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
                {isGeneratingPdf
                  ? 'Generando PDF...'
                  : `Exportar Lote PDF (${batchCount})`}
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

        {/* Filtros por curso, búsqueda y toggle foto */}
        <div className="mt-5 pt-4 border-t border-sky-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {COURSES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCourse(c.id)}
                className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-extrabold transition-all ${
                  selectedCourse === c.id
                    ? 'bg-sky-600 text-white shadow'
                    : 'bg-white/80 hover:bg-white text-slate-700 border border-sky-100'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[210px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sky-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, DNI o curso..."
                className="w-full pl-9 pr-3.5 py-2 min-h-[44px] rounded-xl bg-white border border-sky-200 text-xs font-semibold text-slate-800 outline-none focus:border-sky-500"
              />
            </div>

            <label className="flex items-center gap-2 bg-white/85 border border-sky-200 rounded-xl px-3.5 py-2 min-h-[44px] text-xs font-bold text-slate-700 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={includePhotoOverride}
                onChange={(e) => setIncludePhotoOverride(e.target.checked)}
                className="w-4 h-4 accent-sky-600"
              />
              <span>Incluir foto</span>
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

      {/* Cuerpo Principal: Lista de Alumnos + Vista Previa */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start no-print">
        {/* Lista de Estudiantes */}
        <div className="xl:col-span-5 aero-glass rounded-3xl p-4 sm:p-5 border border-white/90 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-sky-100">
            <span className="text-xs font-extrabold text-sky-950">
              Alumnos filtrados ({filteredStudents.length})
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
                {filteredStudents.length > 0 && filteredStudents.every((s) => selectedIds.includes(s.id))
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

          {filteredStudents.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-10">
              No se encontraron estudiantes con el filtro actual.
            </p>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
              {filteredStudents.map((st) => {
                const isSelected = selectedIds.includes(st.id);
                const isActive = activeStudent?.id === st.id;
                const cardRec = latestCardByStudent.get(st.id);
                return (
                  <div
                    key={st.id}
                    className={`rounded-2xl p-3 border transition-all flex items-center gap-3 ${
                      isActive
                        ? 'bg-sky-50 border-sky-400 shadow-sm ring-2 ring-sky-200/70'
                        : 'bg-white/85 border-sky-100 hover:bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelect(st.id)}
                      className="p-1.5 text-sky-600 shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                      aria-label={`Seleccionar a ${st.fullName}`}
                    >
                      {isSelected ? <CheckSquare size={19} /> : <Square size={19} className="text-slate-400" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveStudentId(st.id)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2.5"
                    >
                      <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 font-extrabold text-xs flex items-center justify-center overflow-hidden shrink-0 border border-sky-200">
                        {st.photo ? (
                          <img src={st.photo} alt={st.fullName} className="w-full h-full object-cover" />
                        ) : (
                          st.fullName.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 uppercase truncate">
                          {st.fullName}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-bold text-sky-700">{st.course}° Año</span>
                          <span className="text-[10px] text-slate-400 font-mono">DNI {st.dni}</span>
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

        {/* Vista Previa Individual Frente + Dorso y Acciones */}
        <div className="xl:col-span-7 aero-glass rounded-3xl p-5 sm:p-6 border-2 border-white shadow-xl space-y-5">
          {activeStudent && previewItem ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-100 pb-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 flex items-center gap-1">
                    <Eye size={13} />
                    <span>Vista Previa Frente y Dorso</span>
                  </span>
                  <h3 className="text-lg font-extrabold text-slate-900 uppercase">
                    {activeStudent.fullName}
                  </h3>
                  <p className="text-xs text-slate-600 font-mono">
                    Carnet N° {previewItem.cardRecord.cardNumber} • Estado:{' '}
                    <strong className="uppercase text-sky-900">{previewItem.cardRecord.status}</strong>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openVisualOverrideModal(activeStudent)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-extrabold flex items-center gap-1.5"
                    title="Personalizar texto o foto solo para este carnet sin alterar el legajo"
                  >
                    <SlidersHorizontal size={14} />
                    <span>Ajustar Carnet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReissueCard(activeStudent)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-900 text-xs font-extrabold flex items-center gap-1.5"
                    title="Generar nueva versión y marcar la anterior como reemplazada"
                  >
                    <RefreshCw size={14} />
                    <span>Reemitir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevokingStudent(activeStudent)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-extrabold flex items-center gap-1.5"
                    title="Anular o revocar esta credencial"
                  >
                    <Ban size={14} />
                    <span>Anular</span>
                  </button>
                </div>
              </div>

              <div className="bg-gradient-to-br from-sky-100/60 via-white/80 to-teal-100/50 rounded-2xl p-4 sm:p-6 border border-sky-200/80 flex items-center justify-center overflow-x-auto">
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
              Seleccione un estudiante de la lista para visualizar su carnet frente y dorso.
            </p>
          )}
        </div>
      </div>

      {/* Modal de Sobrescritura Puramente Visual (NO altera `students`) */}
      {editingVisualStudent && (
        <div className="fixed inset-0 z-50 bg-sky-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="aero-glass rounded-3xl max-w-lg w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">
                  Personalización Solo Visual del Carnet
                </span>
                <h4 className="text-base font-extrabold text-slate-900">
                  {editingVisualStudent.fullName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingVisualStudent(null)}
                className="p-2 rounded-xl hover:bg-sky-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 bg-sky-50 border border-sky-200 rounded-xl p-3">
              Estos ajustes cambian únicamente cómo se imprime este carnet y <strong>no modifican</strong> la ficha original del alumno en el módulo Alumnos.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nombre visible en carnet (opcional)</label>
                <input
                  type="text"
                  value={visualDraft.displayName || ''}
                  onChange={(e) => setVisualDraft((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder={editingVisualStudent.fullName}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white border border-sky-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">División / Subtítulo</label>
                  <input
                    type="text"
                    value={visualDraft.customSubtitle || ''}
                    onChange={(e) => setVisualDraft((p) => ({ ...p, customSubtitle: e.target.value }))}
                    placeholder="Ej. Div. A / Turno Mañana"
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

              <div className="flex flex-wrap items-center justify-between gap-2 bg-white/80 p-3 rounded-xl border border-sky-100">
                <div className="flex items-center gap-2">
                  <input
                    ref={overridePhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleUploadVisualPhoto}
                  />
                  <button
                    type="button"
                    onClick={() => overridePhotoInputRef.current?.click()}
                    className="aero-btn-aqua px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <Camera size={14} />
                    <span>Foto solo para carnet</span>
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
                onClick={() => setEditingVisualStudent(null)}
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

      {/* Modal de Anulación / Revocación */}
      {revokingStudent && (
        <div className="fixed inset-0 z-50 bg-sky-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print">
          <div className="aero-glass rounded-3xl max-w-md w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">Anular Carnet Estudiantil</h4>
                <p className="text-xs text-slate-600">{revokingStudent.fullName}</p>
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
                onClick={() => setRevokingStudent(null)}
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

      {/* Plancha A4 exclusiva para window.print() */}
      {printSheetItems.length > 0 && (
        <div className="print-only carnet-print-sheet">
          <div className="mb-4 pb-2 border-b border-slate-300 flex items-center justify-between text-xs">
            <strong>{schoolInfo.name} — PLANCHA DE CARNETS ESTUDIANTILES</strong>
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
