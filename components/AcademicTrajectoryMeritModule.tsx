import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AcademicMovementRecord,
  AcademicMovementType,
  AcademicSubjectRecord,
  AcademicYearTrajectory,
  CourseYear,
  DEFAULT_MERIT_ORDER_CONFIG,
  DisciplinaryIncident,
  DisciplinarySanctionType,
  MeritOrderConfig,
  SchoolInfo,
  Student,
  StudentTrajectoryProfile,
  SubjectAccreditationStatus,
  YearTrajectoryCondition,
} from '../types';
import {
  MOVEMENT_TYPE_LABELS,
  MeritCandidateEvaluation,
  SANCTION_TYPE_LABELS,
  YEAR_CONDITION_LABELS,
  buildDemoTrajectoriesForExistingSeniorStudents,
  calculateStudentTrajectorySummary,
  createBlankAcademicYear,
  deduplicateYearSubjects,
  evaluateMeritOrder,
  evaluateStudentMeritEligibility,
  formatDecimalAverage,
  migrateLegacyDisciplinaryToStructured,
  normalizeSubjectKey,
  resolveStudentTrajectory,
} from '../services/trajectoryService';
import {
  exportMeritOrderPDF,
  exportStudentDisciplinarySummaryPDF,
  exportStudentTrajectoryPDF,
} from '../services/trajectoryPdfExport';
import {
  getLocalTodayISO,
  loadTrajectoryMigrationSnapshot,
  saveTrajectoryMigrationSnapshot,
} from '../services/storageService';
import { DisciplinaryRecordsPanel } from './DisciplinaryRecordsPanel';
import { MeritOrderPdfExportModal } from './MeritOrderPdfExportModal';
import { MeritStudentEligibilityIndicator } from './MeritStudentEligibilityIndicator';
import { StudentTrajectoryEvolutionChart } from './StudentTrajectoryEvolutionChart';
import { TrajectoryMeritSettingsModal } from './TrajectoryMeritSettingsModal';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ExternalLink,
  FileDown,
  FileText,
  GitBranch,
  History,
  Info,
  Lock,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  X,
  XCircle,
} from 'lucide-react';

interface AcademicTrajectoryMeritModuleProps {
  students: Student[];
  onUpdateStudent: (student: Student) => void;
  trajectories: Record<string, StudentTrajectoryProfile>;
  onSaveTrajectory: (profile: StudentTrajectoryProfile) => void;
  onReplaceAllTrajectories: (nextMap: Record<string, StudentTrajectoryProfile>) => void;
  disciplinaryRecords: DisciplinaryIncident[];
  onAddIncident: (incident: DisciplinaryIncident) => void;
  onUpdateIncident: (incident: DisciplinaryIncident) => void;
  onDeleteIncident: (incidentId: string) => void;
  onBatchAddIncidents: (incidents: DisciplinaryIncident[]) => void;
  meritConfig: MeritOrderConfig;
  onUpdateMeritConfig: (config: MeritOrderConfig) => void;
  schoolInfo: SchoolInfo;
  initialSubTab?: 'trajectory' | 'merit' | 'criteria';
  initialStudentId?: string;
  onOpenStudentLegajo?: (student: Student) => void;
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

const MOVEMENT_TYPES_LIST: AcademicMovementType[] = [
  'promocion',
  'repitencia',
  'cambio_curso',
  'cambio_division',
  'pase_entrada',
  'pase_salida',
  'ingreso',
  'egreso',
  'otra_situacion',
];

const SUBJECT_STATUS_LABELS: Record<SubjectAccreditationStatus, string> = {
  aprobada: 'Aprobada',
  desaprobada: 'Desaprobada',
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  eximida: 'Eximida',
};

export const AcademicTrajectoryMeritModule: React.FC<AcademicTrajectoryMeritModuleProps> = ({
  students,
  onUpdateStudent,
  trajectories,
  onSaveTrajectory,
  onReplaceAllTrajectories,
  disciplinaryRecords,
  onAddIncident,
  onUpdateIncident,
  onDeleteIncident,
  onBatchAddIncidents,
  meritConfig,
  onUpdateMeritConfig,
  schoolInfo,
  initialSubTab = 'trajectory',
  initialStudentId,
  onOpenStudentLegajo,
}) => {
  const currentAcademicYear = Number(schoolInfo.academicYear) || new Date().getFullYear();

  const [activeSubTab, setActiveSubTab] = useState<'trajectory' | 'merit' | 'criteria'>(
    initialSubTab
  );
  const [courseFilter, setCourseFilter] = useState<'all' | CourseYear>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    initialStudentId || students.find((s) => s.course === '6')?.id || students[0]?.id || ''
  );
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(
    null
  );

  // Formularios inline de trayectoria
  const [showAddYearForm, setShowAddYearForm] = useState(false);
  const [newYearForm, setNewYearForm] = useState<{
    academicYear: number;
    course: CourseYear;
    division: string;
    isRepeatedYear: boolean;
    isClosed: boolean;
  }>({
    academicYear: currentAcademicYear - 1,
    course: '1',
    division: 'Única',
    isRepeatedYear: false,
    isClosed: true,
  });

  const [showMovementForm, setShowMovementForm] = useState(false);
  const [movementForm, setMovementForm] = useState<{
    date: string;
    academicYear: number;
    type: AcademicMovementType;
    fromCourse: CourseYear;
    toCourse: CourseYear;
    toDivision: string;
    description: string;
    authority: string;
    resolutionRef: string;
    syncStudentCurrentCourse: boolean;
  }>({
    date: getLocalTodayISO(),
    academicYear: currentAcademicYear,
    type: 'promocion',
    fromCourse: '5',
    toCourse: '6',
    toDivision: '',
    description: '',
    authority: schoolInfo.principalName || 'Dirección Escolar',
    resolutionRef: '',
    syncStudentCurrentCourse: false,
  });

  const [newSubjectName, setNewSubjectName] = useState('');
  const [confirmDeleteYearId, setConfirmDeleteYearId] = useState<string | null>(null);
  const [meritListFilter, setMeritListFilter] = useState<
    'all' | 'elegible' | 'revision_institucional' | 'no_elegible' | 'con_sanciones'
  >('all');
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [isMeritPdfModalOpen, setIsMeritPdfModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsModalInitialTab, setSettingsModalInitialTab] = useState<
    'weights' | 'discipline' | 'eligibility'
  >('weights');
  const [hasRevertSnapshot, setHasRevertSnapshot] = useState<boolean>(() =>
    Boolean(loadTrajectoryMigrationSnapshot())
  );
  const disciplinarySectionRef = useRef<HTMLDivElement | null>(null);
  const meritListSectionRef = useRef<HTMLDivElement | null>(null);

  const openSettingsModal = (tab: 'weights' | 'discipline' | 'eligibility' = 'weights') => {
    setSettingsModalInitialTab(tab);
    setIsSettingsModalOpen(true);
  };

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (initialStudentId && students.some((s) => s.id === initialStudentId)) {
      setSelectedStudentId(initialStudentId);
      setActiveSubTab('trajectory');
    }
  }, [initialStudentId, students]);

  useEffect(() => {
    if (!students.some((s) => s.id === selectedStudentId) && students.length > 0) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4200);
  };

  // Precalcular trayectorias y resúmenes de todos los estudiantes (reactivo a cada cambio de nota)
  const resolvedByStudentId = useMemo(() => {
    const map: Record<
      string,
      {
        trajectory: StudentTrajectoryProfile;
        summary: ReturnType<typeof calculateStudentTrajectorySummary>;
      }
    > = {};
    students.forEach((student) => {
      const trajectory = resolveStudentTrajectory(
        student,
        trajectories[student.id],
        currentAcademicYear,
        meritConfig.passingGrade
      );
      const summary = calculateStudentTrajectorySummary(
        student,
        trajectory,
        disciplinaryRecords,
        meritConfig
      );
      map[student.id] = { trajectory, summary };
    });
    return map;
  }, [students, trajectories, currentAcademicYear, disciplinaryRecords, meritConfig]);

  // Evaluación completa del Orden de Mérito
  const meritResult = useMemo(
    () =>
      evaluateMeritOrder(
        students,
        trajectories,
        disciplinaryRecords,
        meritConfig,
        currentAcademicYear
      ),
    [students, trajectories, disciplinaryRecords, meritConfig, currentAcademicYear]
  );

  // Alumnos filtrados en el selector lateral de Trayectoria
  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students
      .filter((s) => {
        if (courseFilter !== 'all' && s.course !== courseFilter) return false;
        if (!q) return true;
        return (
          s.fullName.toLowerCase().includes(q) ||
          (s.dni || '').toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.course !== b.course) return Number(b.course) - Number(a.course);
        return a.fullName.localeCompare(b.fullName, 'es-AR');
      });
  }, [students, courseFilter, searchQuery]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || students[0] || null,
    [students, selectedStudentId]
  );

  const selectedData = selectedStudent ? resolvedByStudentId[selectedStudent.id] : null;
  const activeTrajectory = selectedData?.trajectory || null;
  const activeSummary = selectedData?.summary || null;

  // Evaluación individual de requisitos mínimos de trayectoria y sanciones activas para la ficha del alumno
  const selectedStudentEligibility = useMemo(() => {
    if (!selectedStudent || !activeTrajectory || !activeSummary) return null;
    return evaluateStudentMeritEligibility(
      selectedStudent,
      activeTrajectory,
      disciplinaryRecords,
      meritConfig,
      activeSummary
    );
  }, [selectedStudent, activeTrajectory, activeSummary, disciplinaryRecords, meritConfig]);

  const handleOpenStudentDisciplinaryReview = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveSubTab('trajectory');
    setTimeout(() => {
      disciplinarySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  const handleInspectCandidateFicha = (studentId: string) => {
    setMeritListFilter('all');
    setExpandedCandidateId(studentId);
    setTimeout(() => {
      meritListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  // Asegurar año seleccionado válido cuando cambia el alumno o sus años
  useEffect(() => {
    if (!activeTrajectory || activeTrajectory.years.length === 0) {
      setSelectedYearId('');
      return;
    }
    const stillExists = activeTrajectory.years.some((y) => y.id === selectedYearId);
    if (!stillExists) {
      const latestYear = activeTrajectory.years[activeTrajectory.years.length - 1];
      setSelectedYearId(latestYear.id);
    }
  }, [activeTrajectory, selectedYearId]);

  const selectedYear = useMemo(() => {
    if (!activeTrajectory) return null;
    return (
      activeTrajectory.years.find((y) => y.id === selectedYearId) ||
      activeTrajectory.years[activeTrajectory.years.length - 1] ||
      null
    );
  }, [activeTrajectory, selectedYearId]);

  const selectedYearSummary = useMemo(() => {
    if (!activeSummary || !selectedYear) return null;
    return activeSummary.yearSummaries.find((ys) => ys.yearId === selectedYear.id) || null;
  }, [activeSummary, selectedYear]);

  // Helper para persistir modificaciones sobre la trayectoria del estudiante actual
  const persistTrajectory = (nextProfile: StudentTrajectoryProfile) => {
    onSaveTrajectory({
      ...nextProfile,
      updatedAt: new Date().toISOString(),
    });
  };

  // Actualizar metadatos del ciclo seleccionado
  const updateSelectedYear = (updater: (yr: AcademicYearTrajectory) => AcademicYearTrajectory) => {
    if (!activeTrajectory || !selectedYear) return;
    const nextYears = activeTrajectory.years.map((yr) =>
      yr.id === selectedYear.id
        ? { ...updater(yr), updatedAt: new Date().toISOString() }
        : yr
    );
    persistTrajectory({
      ...activeTrajectory,
      years: nextYears,
    });
  };

  // Editar calificación de una materia en el año seleccionado (y sincronizar si es el curso/ciclo vigente)
  const handleSubjectChange = (
    subjectName: string,
    patch: Partial<AcademicSubjectRecord>
  ) => {
    if (!selectedStudent || !activeTrajectory || !selectedYear) return;

    const targetKey = normalizeSubjectKey(subjectName);
    const passing = meritConfig.passingGrade || 6;

    const nextSubjects = selectedYear.subjects.map((subj) => {
      if (normalizeSubjectKey(subj.subject) !== targetKey) return subj;

      const merged: AcademicSubjectRecord = { ...subj, ...patch };

      // Si se editaron trimestres y no se editó explícitamente finalGrade, recalcular promedio T1-T3
      const editedTrimester =
        'trimestre1' in patch || 'trimestre2' in patch || 'trimestre3' in patch;
      if (editedTrimester && !('finalGrade' in patch)) {
        const vals = [merged.trimestre1, merged.trimestre2, merged.trimestre3].filter(
          (v): v is number => typeof v === 'number' && !Number.isNaN(v)
        );
        if (vals.length > 0) {
          merged.finalGrade = Number(
            (vals.reduce((acc, v) => acc + v, 0) / vals.length).toFixed(2)
          );
        } else {
          merged.finalGrade = undefined;
        }
      }

      // Si no hay nota final, no puede quedar como definitiva
      if (merged.finalGrade === undefined || Number.isNaN(merged.finalGrade)) {
        merged.isDefinitive = false;
      }

      // Actualizar estado automáticamente salvo que el usuario lo haya fijado en el patch
      if (!('status' in patch)) {
        if (merged.excludeFromAverage) {
          merged.status = 'eximida';
        } else if (typeof merged.finalGrade === 'number') {
          if (merged.finalGrade >= passing) {
            merged.status = 'aprobada';
          } else {
            merged.status = merged.isDefinitive ? 'pendiente' : 'desaprobada';
          }
        } else {
          merged.status = 'en_curso';
        }
      }

      return merged;
    });

    const pendingSubjects = nextSubjects
      .filter(
        (s) =>
          !s.excludeFromAverage &&
          s.status !== 'eximida' &&
          (s.status === 'pendiente' ||
            (typeof s.finalGrade === 'number' && s.finalGrade < passing))
      )
      .map((s) => s.subject);

    updateSelectedYear((yr) => ({
      ...yr,
      subjects: deduplicateYearSubjects(nextSubjects),
      pendingSubjects,
    }));

    // Si corresponde al curso y ciclo lectivo actual del alumno, mantener sincronizado `student.grades`
    if (
      selectedYear.academicYear === currentAcademicYear &&
      selectedYear.course === selectedStudent.course
    ) {
      const updatedSubject = nextSubjects.find(
        (s) => normalizeSubjectKey(s.subject) === targetKey
      );
      if (updatedSubject) {
        onUpdateStudent({
          ...selectedStudent,
          grades: {
            ...selectedStudent.grades,
            [updatedSubject.subject]: {
              trimestre1: updatedSubject.trimestre1,
              trimestre2: updatedSubject.trimestre2,
              trimestre3: updatedSubject.trimestre3,
              final: updatedSubject.finalGrade,
            },
          },
        });
      }
    }
  };

  const handleMarkAllGradesDefinitive = () => {
    if (!selectedYear) return;
    const passing = meritConfig.passingGrade || 6;
    let updatedCount = 0;

    updateSelectedYear((yr) => {
      const nextSubjects = yr.subjects.map((s) => {
        if (s.excludeFromAverage || s.status === 'eximida') return s;
        if (typeof s.finalGrade === 'number' && !Number.isNaN(s.finalGrade)) {
          updatedCount += 1;
          return {
            ...s,
            isDefinitive: true,
            status: (s.finalGrade >= passing ? 'aprobada' : 'pendiente') as SubjectAccreditationStatus,
          };
        }
        return s;
      });
      return {
        ...yr,
        subjects: nextSubjects,
      };
    });

    showToast(
      updatedCount > 0
        ? `${updatedCount} materia(s) con nota final marcadas como definitivas.`
        : 'No hay materias con calificación final cargada para marcar como definitivas.',
      updatedCount > 0 ? 'success' : 'info'
    );
  };

  const handleAddSubjectToYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedYear) return;
    const clean = newSubjectName.trim().toUpperCase();
    if (!clean) return;
    const exists = selectedYear.subjects.some(
      (s) => normalizeSubjectKey(s.subject) === normalizeSubjectKey(clean)
    );
    if (exists) {
      showToast(
        `La materia "${clean}" ya existe en este año lectivo (no se permiten duplicados).`,
        'error'
      );
      return;
    }

    updateSelectedYear((yr) => ({
      ...yr,
      subjects: [
        ...yr.subjects,
        {
          subject: clean,
          isDefinitive: false,
          weight: 1,
          status: 'en_curso',
          excludeFromAverage: false,
        },
      ],
    }));
    setNewSubjectName('');
    showToast(`Materia "${clean}" agregada al ciclo ${selectedYear.academicYear}.`);
  };

  const handleAddAcademicYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !activeTrajectory) return;

    const duplicateSameCycleAndCourse = activeTrajectory.years.some(
      (y) => y.academicYear === newYearForm.academicYear && y.course === newYearForm.course
    );
    if (duplicateSameCycleAndCourse) {
      showToast(
        `Ya existe un registro para ${newYearForm.course}° Año en el ciclo ${newYearForm.academicYear}.`,
        'error'
      );
      return;
    }

    const created = createBlankAcademicYear(
      selectedStudent.id,
      newYearForm.academicYear,
      newYearForm.course,
      newYearForm.division.trim() || selectedStudent.division || 'Única',
      newYearForm.isRepeatedYear
    );
    created.isClosed = newYearForm.isClosed;
    created.condition = newYearForm.isRepeatedYear
      ? 'repitio'
      : newYearForm.isClosed
      ? newYearForm.course === '6'
        ? 'egresado'
        : 'promovido'
      : 'en_curso';

    const nextYears = [...activeTrajectory.years, created].sort((a, b) =>
      a.academicYear !== b.academicYear
        ? a.academicYear - b.academicYear
        : Number(a.course) - Number(b.course)
    );

    const nextEntryYear = Math.min(activeTrajectory.entryYear, created.academicYear);

    persistTrajectory({
      ...activeTrajectory,
      entryYear: nextEntryYear,
      years: nextYears,
    });
    setSelectedYearId(created.id);
    setShowAddYearForm(false);
    showToast(
      `Año lectivo ${created.academicYear} (${created.course}° Año) incorporado a la trayectoria.`
    );
  };

  const handleDeleteYear = (yearId: string) => {
    if (!activeTrajectory || activeTrajectory.years.length <= 1) return;
    const remaining = activeTrajectory.years.filter((y) => y.id !== yearId);
    persistTrajectory({
      ...activeTrajectory,
      years: remaining,
    });
    setConfirmDeleteYearId(null);
    setSelectedYearId(remaining[remaining.length - 1]?.id || '');
    showToast('Año lectivo quitado de la trayectoria.', 'info');
  };

  const handleAddMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !activeTrajectory) return;
    if (!movementForm.description.trim()) {
      showToast('Ingrese una descripción para el movimiento académico.', 'error');
      return;
    }

    const record: AcademicMovementRecord = {
      id: `mov-${selectedStudent.id}-${Date.now()}`,
      date: movementForm.date || getLocalTodayISO(),
      academicYear: Number(movementForm.academicYear) || currentAcademicYear,
      type: movementForm.type,
      fromCourse:
        movementForm.type === 'promocion' ||
        movementForm.type === 'cambio_curso' ||
        movementForm.type === 'repitencia'
          ? movementForm.fromCourse
          : undefined,
      toCourse:
        movementForm.type !== 'pase_salida' ? movementForm.toCourse : undefined,
      toDivision: movementForm.toDivision.trim() || undefined,
      description: movementForm.description.trim(),
      authority: movementForm.authority.trim() || undefined,
      resolutionRef: movementForm.resolutionRef.trim() || undefined,
    };

    persistTrajectory({
      ...activeTrajectory,
      movements: [...activeTrajectory.movements, record],
    });

    // Si el usuario eligió actualizar el curso/división vigente, hacerlo sobre el MISMO ID sin duplicar alumnos
    if (
      movementForm.syncStudentCurrentCourse &&
      (movementForm.type === 'promocion' ||
        movementForm.type === 'cambio_curso' ||
        movementForm.type === 'cambio_division' ||
        movementForm.type === 'repitencia')
    ) {
      onUpdateStudent({
        ...selectedStudent,
        course: movementForm.toCourse,
        division: movementForm.toDivision.trim() || selectedStudent.division,
      });
    }

    setShowMovementForm(false);
    setMovementForm((prev) => ({ ...prev, description: '', resolutionRef: '' }));
    showToast(
      movementForm.syncStudentCurrentCourse
        ? 'Movimiento registrado y curso vigente actualizado sobre el mismo legajo (sin duplicados).'
        : 'Movimiento académico registrado en el historial.'
    );
  };

  const handleDeleteMovement = (movementId: string) => {
    if (!activeTrajectory) return;
    persistTrajectory({
      ...activeTrajectory,
      movements: activeTrajectory.movements.filter((m) => m.id !== movementId),
    });
    showToast('Movimiento eliminado del historial.', 'info');
  };

  // Carga demostrativa reversible de trayectorias 1°–6° para alumnos existentes de 5° y 6°
  const handlePopulateDemoTrajectories = () => {
    saveTrajectoryMigrationSnapshot({
      createdAt: new Date().toISOString(),
      previousTrajectories: trajectories,
      previousDisciplinary: disciplinaryRecords,
      reason: 'Respaldo previo a carga demostrativa de trayectorias históricas 1° a 6° Año',
    });
    const nextMap = buildDemoTrajectoriesForExistingSeniorStudents(
      students,
      trajectories,
      currentAcademicYear
    );
    onReplaceAllTrajectories(nextMap);
    setHasRevertSnapshot(true);
    showToast(
      'Trayectorias históricas (1° a 6°) generadas sobre los alumnos existentes de 5° y 6° Año. Puede revertir en cualquier momento.'
    );
  };

  const handleRevertSnapshot = () => {
    const snap = loadTrajectoryMigrationSnapshot();
    if (!snap) return;
    onReplaceAllTrajectories(snap.previousTrajectories || {});
    setHasRevertSnapshot(false);
    showToast('Se restauró el estado previo de trayectorias correctamente.', 'info');
  };

  const seniorCountWithMultiYear = useMemo(() => {
    return students
      .filter((s) => s.course === '6' || s.course === '5')
      .filter((s) => (trajectories[s.id]?.years.length || 0) >= 2).length;
  }, [students, trajectories]);

  const allMeritCandidates = useMemo(
    () => [
      ...meritResult.eligibleCandidates,
      ...meritResult.reviewCandidates,
      ...meritResult.ineligibleCandidates,
    ],
    [meritResult]
  );

  const candidatesWithActiveSanctions = useMemo(
    () => allMeritCandidates.filter((ev) => ev.hasActiveSanctionsForManualReview),
    [allMeritCandidates]
  );

  // Listado filtrado en el Orden de Mérito
  const displayedMeritCandidates = useMemo(() => {
    if (meritListFilter === 'elegible') return meritResult.eligibleCandidates;
    if (meritListFilter === 'revision_institucional') return meritResult.reviewCandidates;
    if (meritListFilter === 'no_elegible') return meritResult.ineligibleCandidates;
    if (meritListFilter === 'con_sanciones') return candidatesWithActiveSanctions;
    return allMeritCandidates;
  }, [meritResult, meritListFilter, allMeritCandidates, candidatesWithActiveSanctions]);

  const parseNumericInput = (raw: string): number | undefined => {
    if (raw.trim() === '') return undefined;
    const normalized = raw.replace(',', '.');
    const n = Number(normalized);
    if (Number.isNaN(n)) return undefined;
    return Math.min(10, Math.max(1, n));
  };

  const renderHonorSlotCard = (
    rankNumber: 1 | 2 | 3,
    roleTitle: string,
    group: MeritCandidateEvaluation[],
    accentBorder: string,
    accentHeading: string
  ) => {
    const isTie = group.length > 1;
    return (
      <div
        className={`aero-glass rounded-2xl p-5 border ${accentBorder} flex flex-col justify-between gap-3`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${accentHeading}`}>
              {rankNumber}° Lugar · Orden de Mérito
            </span>
            <h4 className="text-base sm:text-lg font-extrabold text-[#0c2d48] tracking-tight mt-0.5">
              {roleTitle}
            </h4>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0 text-sky-700 font-black tabular-nums text-sm">
            {rankNumber}°
          </div>
        </div>

        {group.length === 0 ? (
          <div className="bg-slate-50/90 border border-dashed border-slate-200 rounded-xl p-4 text-xs text-slate-500">
            Sin candidato elegible para este puesto según los criterios actuales.
          </div>
        ) : (
          <div className="space-y-2.5">
            {isTie && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2 text-[11px] font-bold flex items-center gap-1.5">
                <Scale size={14} className="text-amber-600 shrink-0" />
                <span>Empate exacto ({group.length} estudiantes) · Requiere resolución institucional</span>
              </div>
            )}
            {group.map((ev) => (
              <div
                key={ev.student.id}
                className={`rounded-xl p-3.5 border space-y-2.5 ${
                  ev.hasActiveSanctionsForManualReview
                    ? 'bg-red-50/55 border-red-300'
                    : 'bg-white/95 border-sky-100'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentId(ev.student.id);
                        setActiveSubTab('trajectory');
                      }}
                      className="text-sm font-extrabold text-slate-900 hover:text-sky-700 text-left truncate block max-w-full"
                    >
                      {ev.student.fullName}
                    </button>
                    <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                      DNI {ev.student.dni || 'S/D'} · {ev.student.course}° Año ·{' '}
                      {ev.summary.cumulativeCountedSubjects} mat. ({ev.summary.cumulativeCountedYears}{' '}
                      años)
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-black text-sky-800 tabular-nums leading-none">
                      {ev.formattedAverage}
                    </p>
                    <span className="text-[10px] font-bold text-slate-500">
                      {ev.summary.cumulativeStatusLabel}
                    </span>
                  </div>
                </div>

                {/* Indicador compacto de requisitos de trayectoria y alerta roja de sanciones activas */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <MeritStudentEligibilityIndicator
                    evaluation={ev}
                    config={meritConfig}
                    variant="compact"
                  />
                  <button
                    type="button"
                    onClick={() => handleInspectCandidateFicha(ev.student.id)}
                    className="text-[11px] font-extrabold text-sky-700 hover:text-sky-900 underline underline-offset-2 shrink-0"
                  >
                    Ver ficha de evaluación
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12 max-w-[1440px] mx-auto animate-in fade-in duration-300">
      {/* Toast flotante */}
      {toast && (
        <div
          className={`fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 max-w-md px-4 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2.5 ${
            toast.type === 'error'
              ? 'bg-rose-900 text-white border-rose-700'
              : toast.type === 'info'
              ? 'bg-sky-900 text-white border-sky-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle size={16} className="text-rose-300 shrink-0" />
          ) : (
            <Check size={16} className="text-emerald-300 shrink-0" />
          )}
          <span className="leading-snug">{toast.text}</span>
        </div>
      )}

      {/* Encabezado Principal del Módulo */}
      <div className="aero-glass rounded-[28px] p-5 sm:p-6 border border-white/90 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
            {schoolInfo.name} · Ciclo Lectivo {currentAcademicYear}
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0c2d48] tracking-tight leading-tight flex items-center gap-2.5">
            <Award size={26} className="text-sky-600 shrink-0" />
            <span>Trayectoria Académica y Orden de Mérito</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            Seguimiento escolar histórico (1.º a 6.º Año), cálculo automático de promedios,
            antecedentes disciplinarios y Selección de Abanderados y Escoltas.
          </p>
        </div>

        {/* Navegación interna del módulo (3 vistas limpias) + acceso al modal de configuración */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-sky-50/90 p-1.5 rounded-2xl border border-sky-200/80">
            {[
              {
                id: 'trajectory' as const,
                label: 'Trayectoria (1°–6°)',
                icon: <BookOpen size={15} />,
              },
              {
                id: 'merit' as const,
                label: 'Abanderados y Escoltas',
                icon: <Award size={15} />,
              },
              {
                id: 'criteria' as const,
                label: 'Criterios y Cálculo',
                icon: <Settings2 size={15} />,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                  activeSubTab === tab.id
                    ? 'aero-btn-primary text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white/90 hover:text-sky-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openSettingsModal('weights')}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-2xl bg-white hover:bg-sky-50 text-[#0c2d48] border border-sky-200/90 shadow-sm text-xs font-extrabold transition-colors whitespace-nowrap"
            title="Configurar ponderaciones matemáticas de períodos y umbrales disciplinarios"
          >
            <SlidersHorizontal size={15} className="text-sky-600 shrink-0" />
            <span>Configuración</span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SUB-VISTA 1: SEGUIMIENTO DE LA TRAYECTORIA ESCOLAR (1° A 6° AÑO)  */}
      {/* ================================================================= */}
      {activeSubTab === 'trajectory' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Directorio lateral de estudiantes */}
          <aside className="lg:col-span-4 xl:col-span-3 aero-glass rounded-2xl border border-white/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-[#0c2d48] flex items-center gap-1.5">
                <Users size={16} className="text-sky-600" />
                <span>Estudiantes ({filteredDirectory.length})</span>
              </h3>
              <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                Total: {students.length}
              </span>
            </div>

            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre o DNI..."
                className="w-full pl-9 pr-3 py-2.5 min-h-[42px] bg-white/90 border border-sky-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCourseFilter('all')}
                className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-[11px] font-bold transition-colors ${
                  courseFilter === 'all'
                    ? 'bg-sky-700 text-white'
                    : 'bg-white/80 text-slate-600 border border-sky-100 hover:bg-sky-50'
                }`}
              >
                Todos
              </button>
              {ALL_COURSES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCourseFilter(c)}
                  className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-[11px] font-bold transition-colors ${
                    courseFilter === c
                      ? 'bg-sky-700 text-white'
                      : 'bg-white/80 text-slate-600 border border-sky-100 hover:bg-sky-50'
                  }`}
                >
                  {c}°
                </button>
              ))}
            </div>

            <div className="max-h-[420px] lg:max-h-[680px] overflow-y-auto divide-y divide-sky-100/80 pr-0.5">
              {filteredDirectory.map((st) => {
                const stSummary = resolvedByStudentId[st.id]?.summary;
                const isSelected = selectedStudent?.id === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStudentId(st.id)}
                    className={`w-full text-left py-3 px-2.5 rounded-xl transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-sky-100/90 text-sky-950'
                        : 'hover:bg-sky-50/80 text-slate-700'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold truncate text-slate-900">
                        {st.fullName}
                      </p>
                      <p className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {st.course}° Año · DNI {st.dni || 'S/D'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <span className="text-sm font-black text-sky-800 block leading-none">
                        {stSummary?.formattedCumulativeAverage || '—'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {stSummary?.cumulativeStatusLabel === 'Definitivo'
                          ? 'Def.'
                          : stSummary?.cumulativeStatusLabel === 'Parcial'
                          ? 'Parc.'
                          : 'S/N'}
                      </span>
                    </div>
                  </button>
                );
              })}

              {filteredDirectory.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-500">
                  No se encontraron alumnos con ese filtro.
                </p>
              )}
            </div>
          </aside>

          {/* Ficha individual de trayectoria del estudiante seleccionado */}
          <section className="lg:col-span-8 xl:col-span-9 space-y-5 min-w-0">
            {selectedStudent && activeTrajectory && activeSummary ? (
              <>
                {/* Cabecera de identificación única del estudiante */}
                <div className="aero-glass rounded-2xl border border-white/90 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {selectedStudent.photo ? (
                        <img
                          src={selectedStudent.photo}
                          alt={selectedStudent.fullName}
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-sky-100 text-sky-900 font-black text-xl flex items-center justify-center border border-sky-200 shrink-0">
                          {selectedStudent.fullName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-xl sm:text-2xl font-extrabold text-[#0c2d48] leading-tight truncate">
                          {selectedStudent.fullName}
                        </h3>
                        <p className="text-xs text-slate-600 tabular-nums flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>
                            ID: <strong className="text-slate-800">{selectedStudent.id}</strong>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            DNI:{' '}
                            <strong className="text-slate-800">
                              {selectedStudent.dni || 'Sin registrar'}
                            </strong>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            Curso actual:{' '}
                            <strong className="text-sky-800">
                              {selectedStudent.course}° Año
                              {selectedStudent.division ? ` "${selectedStudent.division}"` : ''}
                            </strong>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            Años registrados:{' '}
                            <strong className="text-slate-800">
                              {activeTrajectory.years.length}
                            </strong>
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          exportStudentTrajectoryPDF(
                            selectedStudent,
                            activeTrajectory,
                            activeSummary,
                            disciplinaryRecords.filter((r) => r.studentId === selectedStudent.id),
                            meritConfig,
                            schoolInfo
                          );
                          showToast('Ficha individual de trayectoria descargada en PDF.');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                      >
                        <FileDown size={15} className="text-sky-700" />
                        <span>Exportar Ficha PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const pdfMeta = exportStudentDisciplinarySummaryPDF(
                            selectedStudent,
                            disciplinaryRecords,
                            schoolInfo,
                            {
                              trajectory: activeTrajectory,
                              meritConfig,
                            }
                          );
                          showToast(
                            `Resumen disciplinario PDF descargado (${pdfMeta.totalIncidents} incidente${
                              pdfMeta.totalIncidents === 1 ? '' : 's'
                            }).`
                          );
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-extrabold transition-colors"
                        title="Exportar informe disciplinario completo del estudiante en PDF (incidentes y resoluciones)"
                      >
                        <ShieldAlert size={15} className="text-rose-600" />
                        <span>Resumen Disciplinario PDF</span>
                      </button>

                      {onOpenStudentLegajo && (
                        <button
                          type="button"
                          onClick={() => onOpenStudentLegajo(selectedStudent)}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold transition-colors"
                        >
                          <ExternalLink size={14} />
                          <span>Ir al Legajo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Año y curso de ingreso editables */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-sky-100 text-xs">
                    <div className="flex items-center justify-between gap-2 bg-white/80 border border-sky-100 rounded-xl px-3 py-2">
                      <span className="text-slate-600 font-semibold">Año de ingreso:</span>
                      <input
                        type="number"
                        min={2010}
                        max={2040}
                        value={activeTrajectory.entryYear}
                        onChange={(e) =>
                          persistTrajectory({
                            ...activeTrajectory,
                            entryYear: Number(e.target.value) || activeTrajectory.entryYear,
                          })
                        }
                        className="w-20 text-right font-extrabold text-sky-900 bg-sky-50/80 border border-sky-200 rounded-lg px-2 py-1 tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-white/80 border border-sky-100 rounded-xl px-3 py-2">
                      <span className="text-slate-600 font-semibold">Curso de ingreso:</span>
                      <select
                        value={activeTrajectory.entryCourse}
                        onChange={(e) =>
                          persistTrajectory({
                            ...activeTrajectory,
                            entryCourse: e.target.value as CourseYear,
                          })
                        }
                        className="font-extrabold text-sky-900 bg-sky-50/80 border border-sky-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        {ALL_COURSES.map((c) => (
                          <option key={c} value={c}>
                            {c}° Año
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-white/80 border border-sky-100 rounded-xl px-3 py-2 tabular-nums">
                      <span className="text-slate-600 font-semibold">Pendientes activas:</span>
                      <span
                        className={`font-extrabold ${
                          activeSummary.totalPendingSubjects > 0
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {activeSummary.totalPendingSubjects === 0
                          ? '0 (Regular)'
                          : `${activeSummary.totalPendingSubjects} materia(s)`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* INDICADOR VISUAL DE REQUISITOS MÍNIMOS DE TRAYECTORIA Y SANCIONES ACTIVAS */}
                {selectedStudentEligibility && (
                  <div className="aero-glass rounded-2xl border border-white/90 p-4 sm:p-5">
                    <MeritStudentEligibilityIndicator
                      evaluation={selectedStudentEligibility}
                      config={meritConfig}
                      variant="card"
                      onReviewDiscipline={() =>
                        disciplinarySectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        })
                      }
                    />
                  </div>
                )}

                {/* LOS 3 PROMEDIOS POR SEPARADO (Anual / General Acumulado / Final de Trayectoria 6°) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 1. Promedio Anual del ciclo seleccionado */}
                  <div className="aero-glass rounded-2xl border border-white/90 p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-700">
                        1. Promedio Anual
                      </span>
                      <span
                        className={`text-[11px] font-extrabold ${
                          selectedYearSummary?.isDefinitive ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {selectedYearSummary?.statusLabel || 'Sin calificaciones'}
                      </span>
                    </div>
                    <p className="text-3xl sm:text-4xl font-black text-[#0c2d48] tabular-nums">
                      {selectedYearSummary?.formattedAverage || '—'}
                    </p>
                    <p className="text-xs text-slate-600 tabular-nums">
                      {selectedYear
                        ? `${selectedYear.course}° Año · Ciclo ${selectedYear.academicYear}`
                        : 'Sin ciclo'}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      {selectedYearSummary
                        ? `${selectedYearSummary.countedSubjects} de ${selectedYearSummary.totalApplicableSubjects} materias computadas · ${
                            meritConfig.calculationMode === 'weighted' ? 'Ponderado' : 'Simple'
                          }`
                        : '—'}
                    </p>
                    {selectedYearSummary?.partialReason && !selectedYearSummary.isDefinitive && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded-lg px-2.5 py-1.5 leading-snug">
                        {selectedYearSummary.partialReason}
                      </p>
                    )}
                  </div>

                  {/* 2. Promedio General Acumulado */}
                  <div className="aero-glass rounded-2xl border border-white/90 p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-700">
                        2. Promedio Acumulado
                      </span>
                      <span
                        className={`text-[11px] font-extrabold ${
                          activeSummary.cumulativeIsDefinitive
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {activeSummary.cumulativeStatusLabel}
                      </span>
                    </div>
                    <p className="text-3xl sm:text-4xl font-black text-sky-800 tabular-nums">
                      {activeSummary.formattedCumulativeAverage}
                    </p>
                    <p className="text-xs text-slate-600 tabular-nums">
                      {activeSummary.cumulativeCountedSubjects} calificación(es) en{' '}
                      {activeSummary.cumulativeCountedYears} ciclo(s) lectivo(s)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Criterio:{' '}
                      {meritConfig.calculationMode === 'weighted'
                        ? 'Promedio ponderado'
                        : 'Promedio simple'}{' '}
                      ({meritConfig.decimalPlaces} decimales)
                    </p>
                  </div>

                  {/* 3. Promedio Final de Trayectoria al completar 6° Año */}
                  <div className="aero-glass rounded-2xl border border-white/90 p-5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                        3. Final de Trayectoria (6.°)
                      </span>
                      <span
                        className={`text-[11px] font-extrabold ${
                          activeSummary.finalSixthYearIsDefinitive
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {activeSummary.finalSixthYearIsDefinitive ? 'Definitivo' : 'En progreso'}
                      </span>
                    </div>
                    <p className="text-3xl sm:text-4xl font-black text-emerald-700 tabular-nums">
                      {activeSummary.formattedFinalSixthYearAverage}
                    </p>
                    <p className="text-xs text-slate-600 leading-snug">
                      {activeSummary.finalSixthYearStatusLabel}
                    </p>
                    <p className="text-[11px] text-slate-500 tabular-nums">
                      Cursos en historial:{' '}
                      {activeSummary.distinctCoursesRecorded.map((c) => `${c}°`).join(', ') || '—'}
                    </p>
                  </div>
                </div>

                {/* Gráfico de líneas: Evolución de Promedios Anuales (1.º a 6.º Año) */}
                <StudentTrajectoryEvolutionChart
                  student={selectedStudent}
                  summary={activeSummary}
                  meritConfig={meritConfig}
                  schoolInfo={schoolInfo}
                  variant="full"
                  selectedYearId={selectedYear?.id}
                  onSelectYear={(yearId) => setSelectedYearId(yearId)}
                />

                {/* Línea histórica por ciclo lectivo + acciones aditivas */}
                <div className="aero-glass rounded-2xl border border-white/90 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-extrabold text-[#0c2d48]">
                        Recorrido por Año Lectivo (1.º a 6.º Año)
                      </h4>
                      <p className="text-xs text-slate-600">
                        Seleccione un año para consultar o editar sus materias, calificaciones y
                        cierre definitivo.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddYearForm((v) => !v);
                          setShowMovementForm(false);
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                      >
                        <CalendarPlus size={15} className="text-sky-600" />
                        <span>Agregar año lectivo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMovementForm((prev) => ({
                            ...prev,
                            fromCourse: selectedStudent.course,
                            toCourse:
                              selectedStudent.course === '6'
                                ? '6'
                                : (String(Number(selectedStudent.course) + 1) as CourseYear),
                            toDivision: selectedStudent.division || '',
                          }));
                          setShowMovementForm((v) => !v);
                          setShowAddYearForm(false);
                        }}
                        className="aero-btn-primary flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold"
                      >
                        <GitBranch size={15} />
                        <span>Registrar movimiento</span>
                      </button>
                    </div>
                  </div>

                  {/* Formulario inline: Agregar Año Lectivo Histórico */}
                  {showAddYearForm && (
                    <form
                      onSubmit={handleAddAcademicYear}
                      className="bg-white rounded-2xl border border-sky-200 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[#0c2d48]">
                          Incorporar año lectivo histórico o adicional (sin duplicar al alumno)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddYearForm(false)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Ciclo lectivo
                          </label>
                          <input
                            type="number"
                            min={2010}
                            max={2040}
                            required
                            value={newYearForm.academicYear}
                            onChange={(e) =>
                              setNewYearForm({
                                ...newYearForm,
                                academicYear: Number(e.target.value) || currentAcademicYear - 1,
                              })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold tabular-nums outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Curso
                          </label>
                          <select
                            value={newYearForm.course}
                            onChange={(e) =>
                              setNewYearForm({
                                ...newYearForm,
                                course: e.target.value as CourseYear,
                              })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold outline-none"
                          >
                            {ALL_COURSES.map((c) => (
                              <option key={c} value={c}>
                                {c}° Año
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            División
                          </label>
                          <input
                            type="text"
                            value={newYearForm.division}
                            onChange={(e) =>
                              setNewYearForm({ ...newYearForm, division: e.target.value })
                            }
                            placeholder="Única / A / B"
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs outline-none"
                          />
                        </div>
                        <div className="flex flex-col justify-center gap-1.5 pt-1 text-xs">
                          <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newYearForm.isClosed}
                              onChange={(e) =>
                                setNewYearForm({ ...newYearForm, isClosed: e.target.checked })
                              }
                              className="rounded border-sky-300 text-sky-600"
                            />
                            <span>Ciclo cerrado</span>
                          </label>
                          <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newYearForm.isRepeatedYear}
                              onChange={(e) =>
                                setNewYearForm({
                                  ...newYearForm,
                                  isRepeatedYear: e.target.checked,
                                })
                              }
                              className="rounded border-sky-300 text-sky-600"
                            />
                            <span>Repitencia</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddYearForm(false)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="aero-btn-primary px-4 py-2 rounded-xl text-xs font-extrabold"
                        >
                          Crear año lectivo
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Formulario inline: Registrar Movimiento Académico */}
                  {showMovementForm && (
                    <form
                      onSubmit={handleAddMovement}
                      className="bg-white rounded-2xl border border-sky-200 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[#0c2d48]">
                          Registrar promoción, repitencia, cambio de curso/división o pase
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowMovementForm(false)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Tipo de movimiento
                          </label>
                          <select
                            value={movementForm.type}
                            onChange={(e) =>
                              setMovementForm({
                                ...movementForm,
                                type: e.target.value as AcademicMovementType,
                              })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold outline-none"
                          >
                            {MOVEMENT_TYPES_LIST.map((m) => (
                              <option key={m} value={m}>
                                {MOVEMENT_TYPE_LABELS[m]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Fecha
                          </label>
                          <input
                            type="date"
                            value={movementForm.date}
                            onChange={(e) =>
                              setMovementForm({ ...movementForm, date: e.target.value })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs tabular-nums outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Ciclo lectivo
                          </label>
                          <input
                            type="number"
                            min={2010}
                            max={2040}
                            value={movementForm.academicYear}
                            onChange={(e) =>
                              setMovementForm({
                                ...movementForm,
                                academicYear: Number(e.target.value) || currentAcademicYear,
                              })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs tabular-nums outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Curso origen
                          </label>
                          <select
                            value={movementForm.fromCourse}
                            onChange={(e) =>
                              setMovementForm({
                                ...movementForm,
                                fromCourse: e.target.value as CourseYear,
                              })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold outline-none"
                          >
                            {ALL_COURSES.map((c) => (
                              <option key={c} value={c}>
                                {c}° Año
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Curso destino
                          </label>
                          <select
                            value={movementForm.toCourse}
                            onChange={(e) =>
                              setMovementForm({
                                ...movementForm,
                                toCourse: e.target.value as CourseYear,
                              })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs font-bold outline-none"
                          >
                            {ALL_COURSES.map((c) => (
                              <option key={c} value={c}>
                                {c}° Año
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            División destino (opcional)
                          </label>
                          <input
                            type="text"
                            value={movementForm.toDivision}
                            onChange={(e) =>
                              setMovementForm({ ...movementForm, toDivision: e.target.value })
                            }
                            placeholder="Ej.: A / B / Única"
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Autoridad interviniente
                          </label>
                          <input
                            type="text"
                            value={movementForm.authority}
                            onChange={(e) =>
                              setMovementForm({ ...movementForm, authority: e.target.value })
                            }
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Referencia de resolución / acta (opcional)
                          </label>
                          <input
                            type="text"
                            value={movementForm.resolutionRef}
                            onChange={(e) =>
                              setMovementForm({ ...movementForm, resolutionRef: e.target.value })
                            }
                            placeholder="Ej.: Libro Matriz f. 42 / Disposición N° 18"
                            className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Detalle del movimiento *
                        </label>
                        <input
                          type="text"
                          required
                          value={movementForm.description}
                          onChange={(e) =>
                            setMovementForm({ ...movementForm, description: e.target.value })
                          }
                          placeholder="Ej.: Promoción regular de 5° a 6° Año sin materias pendientes."
                          className="w-full px-3 py-2 min-h-[40px] bg-slate-50 border border-sky-200 rounded-xl text-xs outline-none"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-xs font-semibold text-sky-900 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={movementForm.syncStudentCurrentCourse}
                          onChange={(e) =>
                            setMovementForm({
                              ...movementForm,
                              syncStudentCurrentCourse: e.target.checked,
                            })
                          }
                          className="rounded border-sky-300 text-sky-600"
                        />
                        <span>
                          Actualizar también el curso/división vigente en el padrón del alumno (mantiene
                          el mismo ID y DNI sin duplicar legajos)
                        </span>
                      </label>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowMovementForm(false)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="aero-btn-primary px-4 py-2 rounded-xl text-xs font-extrabold"
                        >
                          Guardar movimiento
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Tarjetas selectoras por año lectivo */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
                    {activeSummary.yearSummaries.map((ys) => {
                      const active = selectedYear?.id === ys.yearId;
                      return (
                        <button
                          key={ys.yearId}
                          type="button"
                          onClick={() => setSelectedYearId(ys.yearId)}
                          className={`text-left p-3 rounded-xl border transition-all ${
                            active
                              ? 'bg-sky-700 text-white border-sky-700 shadow-md'
                              : 'bg-white/90 hover:bg-sky-50 text-slate-800 border-sky-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[11px] font-bold tabular-nums">
                            <span>{ys.course}° Año</span>
                            <span className={active ? 'text-sky-100' : 'text-slate-400'}>
                              {ys.academicYear}
                            </span>
                          </div>
                          <p
                            className={`text-xl font-black tabular-nums mt-1 ${
                              active ? 'text-white' : 'text-[#0c2d48]'
                            }`}
                          >
                            {ys.formattedAverage}
                          </p>
                          <p
                            className={`text-[10px] font-semibold mt-0.5 truncate ${
                              active ? 'text-sky-100' : 'text-slate-500'
                            }`}
                          >
                            {ys.statusLabel}
                            {ys.isRepeatedYear ? ' · Rep.' : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {/* Editor del año lectivo seleccionado */}
                  {selectedYear && selectedYearSummary && (
                    <div className="pt-4 border-t border-sky-100 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <h5 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                            Detalle de Calificaciones — {selectedYear.course}° Año · Ciclo{' '}
                            {selectedYear.academicYear}
                            {selectedYear.division ? ` (Div. ${selectedYear.division})` : ''}
                          </h5>
                          <p className="text-xs text-slate-500 tabular-nums">
                            Aprobadas: <strong className="text-emerald-700">{selectedYearSummary.approvedCount}</strong>{' '}
                            · Desaprobadas: <strong className="text-rose-700">{selectedYearSummary.disapprovedCount}</strong>{' '}
                            · Pendientes: <strong className="text-amber-700">{selectedYearSummary.pendingAccreditationCount}</strong>{' '}
                            · Excluidas: <strong className="text-slate-700">{selectedYearSummary.excludedSubjects}</strong>{' '}
                            · Computadas:{' '}
                            <strong className="text-sky-800">
                              {selectedYearSummary.countedSubjects}/
                              {selectedYearSummary.totalApplicableSubjects}
                            </strong>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedYear((yr) => ({
                                ...yr,
                                isClosed: !yr.isClosed,
                              }))
                            }
                            className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl text-xs font-extrabold border transition-colors ${
                              selectedYear.isClosed
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                            }`}
                          >
                            {selectedYear.isClosed ? <Lock size={14} /> : <Unlock size={14} />}
                            <span>
                              {selectedYear.isClosed ? 'Ciclo Cerrado' : 'Ciclo Abierto (Parcial)'}
                            </span>
                          </button>

                          <select
                            aria-label="Condición del año lectivo"
                            value={selectedYear.condition}
                            onChange={(e) =>
                              updateSelectedYear((yr) => ({
                                ...yr,
                                condition: e.target.value as YearTrajectoryCondition,
                                isRepeatedYear:
                                  e.target.value === 'repitio' ? true : yr.isRepeatedYear,
                              }))
                            }
                            className="px-3 py-2 min-h-[38px] bg-white border border-sky-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
                          >
                            {(Object.keys(YEAR_CONDITION_LABELS) as YearTrajectoryCondition[]).map(
                              (cond) => (
                                <option key={cond} value={cond}>
                                  {YEAR_CONDITION_LABELS[cond]}
                                </option>
                              )
                            )}
                          </select>

                          <button
                            type="button"
                            onClick={handleMarkAllGradesDefinitive}
                            className="px-3 py-2 min-h-[38px] bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold transition-colors"
                          >
                            Marcar notas como definitivas
                          </button>

                          {activeTrajectory.years.length > 1 &&
                            !(
                              selectedYear.academicYear === currentAcademicYear &&
                              selectedYear.course === selectedStudent.course
                            ) &&
                            (confirmDeleteYearId === selectedYear.id ? (
                              <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteYear(selectedYear.id)}
                                  className="font-extrabold text-rose-700 hover:underline"
                                >
                                  Confirmar baja
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteYearId(null)}
                                  className="text-slate-500 hover:underline ml-1"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteYearId(selectedYear.id)}
                                className="p-2 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                                title="Quitar este año histórico"
                              >
                                <Trash2 size={15} />
                              </button>
                            ))}
                        </div>
                      </div>

                      {/* Vista móvil (tarjetas de materias) */}
                      <div className="md:hidden space-y-2.5">
                        {selectedYear.subjects.map((subj) => (
                          <div
                            key={subj.subject}
                            className={`rounded-xl border p-3.5 space-y-2.5 ${
                              subj.excludeFromAverage
                                ? 'bg-slate-50 border-slate-200 opacity-75'
                                : 'bg-white border-sky-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-extrabold text-slate-900 leading-snug">
                                {subj.subject}
                              </span>
                              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 shrink-0">
                                <input
                                  type="checkbox"
                                  checked={subj.isDefinitive}
                                  disabled={subj.finalGrade === undefined || subj.excludeFromAverage}
                                  onChange={(e) =>
                                    handleSubjectChange(subj.subject, {
                                      isDefinitive: e.target.checked,
                                    })
                                  }
                                />
                                <span>Def.</span>
                              </label>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                              {(
                                [
                                  ['trimestre1', '1° T'],
                                  ['trimestre2', '2° T'],
                                  ['trimestre3', '3° T'],
                                  ['finalGrade', 'Final'],
                                ] as const
                              ).map(([field, label]) => (
                                <div key={field}>
                                  <span className="block text-[10px] font-bold text-slate-400 mb-0.5">
                                    {label}
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={1}
                                    max={10}
                                    value={subj[field] ?? ''}
                                    onChange={(e) =>
                                      handleSubjectChange(subj.subject, {
                                        [field]: parseNumericInput(e.target.value),
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-sky-200 rounded-lg text-xs font-bold text-center tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-[11px]">
                              <select
                                value={subj.status}
                                onChange={(e) =>
                                  handleSubjectChange(subj.subject, {
                                    status: e.target.value as SubjectAccreditationStatus,
                                    excludeFromAverage: e.target.value === 'eximida',
                                  })
                                }
                                className="px-2 py-1 bg-slate-50 border border-sky-200 rounded-lg font-bold text-slate-700"
                              >
                                {(
                                  Object.keys(SUBJECT_STATUS_LABELS) as SubjectAccreditationStatus[]
                                ).map((st) => (
                                  <option key={st} value={st}>
                                    {SUBJECT_STATUS_LABELS[st]}
                                  </option>
                                ))}
                              </select>

                              <label className="flex items-center gap-1.5 text-slate-600 font-semibold">
                                <input
                                  type="checkbox"
                                  checked={Boolean(subj.excludeFromAverage)}
                                  onChange={(e) =>
                                    handleSubjectChange(subj.subject, {
                                      excludeFromAverage: e.target.checked,
                                    })
                                  }
                                />
                                <span>Excluir</span>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Vista escritorio (tabla compacta tabular-nums) */}
                      <div className="hidden md:block overflow-x-auto rounded-2xl border border-sky-100 bg-white">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-sky-50/90 text-[11px] font-extrabold uppercase tracking-wider text-sky-900 border-b border-sky-100">
                              <th className="py-3 px-3.5">Materia</th>
                              <th className="py-3 px-2 text-center w-20">1° Trim.</th>
                              <th className="py-3 px-2 text-center w-20">2° Trim.</th>
                              <th className="py-3 px-2 text-center w-20">3° Trim.</th>
                              <th className="py-3 px-2 text-center w-24">Nota Final</th>
                              {meritConfig.calculationMode === 'weighted' && (
                                <th className="py-3 px-2 text-center w-20">Peso</th>
                              )}
                              <th className="py-3 px-2 text-center w-20">Definitiva</th>
                              <th className="py-3 px-2 text-center w-32">Estado</th>
                              <th className="py-3 px-2 text-center w-20">Excluir</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {selectedYear.subjects.map((subj) => (
                              <tr
                                key={subj.subject}
                                className={
                                  subj.excludeFromAverage
                                    ? 'bg-slate-50/80 text-slate-400'
                                    : 'hover:bg-sky-50/40'
                                }
                              >
                                <td className="py-2.5 px-3.5 font-bold text-slate-800">
                                  {subj.subject}
                                </td>
                                {(['trimestre1', 'trimestre2', 'trimestre3'] as const).map(
                                  (field) => (
                                    <td key={field} className="py-2 px-1.5 text-center">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min={1}
                                        max={10}
                                        value={subj[field] ?? ''}
                                        onChange={(e) =>
                                          handleSubjectChange(subj.subject, {
                                            [field]: parseNumericInput(e.target.value),
                                          })
                                        }
                                        className="w-16 px-1.5 py-1.5 bg-slate-50 border border-sky-200/80 rounded-lg text-center font-semibold tabular-nums focus:ring-2 focus:ring-sky-500 outline-none"
                                      />
                                    </td>
                                  )
                                )}
                                <td className="py-2 px-1.5 text-center">
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={1}
                                    max={10}
                                    value={subj.finalGrade ?? ''}
                                    onChange={(e) =>
                                      handleSubjectChange(subj.subject, {
                                        finalGrade: parseNumericInput(e.target.value),
                                      })
                                    }
                                    className={`w-20 px-1.5 py-1.5 border rounded-lg text-center font-extrabold tabular-nums focus:ring-2 focus:ring-sky-500 outline-none ${
                                      typeof subj.finalGrade === 'number'
                                        ? subj.finalGrade >= meritConfig.passingGrade
                                          ? 'bg-sky-50/70 border-sky-300 text-sky-900'
                                          : 'bg-rose-50/70 border-rose-300 text-rose-800'
                                        : 'bg-slate-50 border-slate-200 text-slate-500'
                                    }`}
                                  />
                                </td>
                                {meritConfig.calculationMode === 'weighted' && (
                                  <td className="py-2 px-1.5 text-center">
                                    <input
                                      type="number"
                                      step="0.5"
                                      min={0.5}
                                      max={10}
                                      value={subj.weight ?? 1}
                                      onChange={(e) =>
                                        handleSubjectChange(subj.subject, {
                                          weight: Math.max(0.5, Number(e.target.value) || 1),
                                        })
                                      }
                                      className="w-14 px-1.5 py-1.5 bg-slate-50 border border-sky-200 rounded-lg text-center font-semibold tabular-nums outline-none"
                                    />
                                  </td>
                                )}
                                <td className="py-2 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`Calificación definitiva en ${subj.subject}`}
                                    checked={subj.isDefinitive}
                                    disabled={
                                      subj.finalGrade === undefined || subj.excludeFromAverage
                                    }
                                    onChange={(e) =>
                                      handleSubjectChange(subj.subject, {
                                        isDefinitive: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 rounded border-sky-300 text-sky-700 cursor-pointer disabled:opacity-40"
                                  />
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <select
                                    value={subj.status}
                                    onChange={(e) =>
                                      handleSubjectChange(subj.subject, {
                                        status: e.target.value as SubjectAccreditationStatus,
                                        excludeFromAverage: e.target.value === 'eximida',
                                      })
                                    }
                                    className="px-2 py-1 bg-slate-50 border border-sky-200/80 rounded-lg text-[11px] font-bold text-slate-700 outline-none"
                                  >
                                    {(
                                      Object.keys(
                                        SUBJECT_STATUS_LABELS
                                      ) as SubjectAccreditationStatus[]
                                    ).map((st) => (
                                      <option key={st} value={st}>
                                        {SUBJECT_STATUS_LABELS[st]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`Excluir ${subj.subject} del promedio`}
                                    checked={Boolean(subj.excludeFromAverage)}
                                    onChange={(e) =>
                                      handleSubjectChange(subj.subject, {
                                        excludeFromAverage: e.target.checked,
                                      })
                                    }
                                    className="w-4 h-4 rounded border-slate-300 text-slate-600 cursor-pointer"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Agregar materia adicional (con control antiduplicado) */}
                      <form
                        onSubmit={handleAddSubjectToYear}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
                      >
                        <input
                          type="text"
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          placeholder="Agregar espacio curricular / taller adicional al año..."
                          className="flex-1 px-3.5 py-2.5 min-h-[42px] bg-white border border-sky-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                          type="submit"
                          className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                        >
                          <Plus size={15} />
                          <span>Agregar materia</span>
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Historial de Movimientos Académicos */}
                <div className="aero-glass rounded-2xl border border-white/90 p-5 space-y-3">
                  <h4 className="text-base font-extrabold text-[#0c2d48] flex items-center gap-2">
                    <History size={18} className="text-sky-600" />
                    <span>Historial de Movimientos y Situaciones Académicas</span>
                  </h4>
                  {activeTrajectory.movements.length > 0 ? (
                    <div className="divide-y divide-sky-100 bg-white/90 rounded-xl border border-sky-100">
                      {[...activeTrajectory.movements].reverse().map((mov) => (
                        <div
                          key={mov.id}
                          className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-extrabold text-[#0c2d48]">
                                {MOVEMENT_TYPE_LABELS[mov.type]}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold text-slate-600 tabular-nums">
                                {mov.date}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span className="text-slate-500 tabular-nums">
                                Ciclo {mov.academicYear}
                              </span>
                              {(mov.fromCourse || mov.toCourse) && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="font-bold text-sky-800">
                                    {mov.fromCourse ? `${mov.fromCourse}° → ` : ''}
                                    {mov.toCourse ? `${mov.toCourse}° Año` : ''}
                                    {mov.toDivision ? ` "${mov.toDivision}"` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-slate-700">{mov.description}</p>
                            {(mov.authority || mov.resolutionRef) && (
                              <p className="text-[11px] text-slate-500">
                                {[mov.authority, mov.resolutionRef].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMovement(mov.id)}
                            className="self-end sm:self-center p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                            title="Quitar movimiento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Sin movimientos adicionales registrados.
                    </p>
                  )}
                </div>

                {/* Antecedentes Disciplinarios integrados en la ficha de trayectoria */}
                <div
                  ref={disciplinarySectionRef}
                  className="aero-glass rounded-2xl border border-white/90 p-5 scroll-mt-6"
                >
                  <DisciplinaryRecordsPanel
                    student={selectedStudent}
                    incidents={disciplinaryRecords}
                    onAddIncident={onAddIncident}
                    onUpdateIncident={onUpdateIncident}
                    onDeleteIncident={onDeleteIncident}
                    onMigrateLegacy={() => {
                      const migrated = migrateLegacyDisciplinaryToStructured(
                        selectedStudent,
                        disciplinaryRecords,
                        currentAcademicYear
                      );
                      if (migrated.length > 0) onBatchAddIncidents(migrated);
                    }}
                    onExportDisciplinaryPDF={() => {
                      const pdfMeta = exportStudentDisciplinarySummaryPDF(
                        selectedStudent,
                        disciplinaryRecords,
                        schoolInfo,
                        {
                          trajectory: activeTrajectory,
                          meritConfig,
                        }
                      );
                      showToast(
                        `Resumen disciplinario PDF descargado (${pdfMeta.totalIncidents} incidente${
                          pdfMeta.totalIncidents === 1 ? '' : 's'
                        }).`
                      );
                    }}
                    currentAcademicYear={currentAcademicYear}
                    defaultAuthority={schoolInfo.principalName || 'Dirección Escolar'}
                  />
                </div>
              </>
            ) : (
              <div className="aero-glass rounded-2xl p-10 text-center text-slate-500 text-sm">
                Registre o seleccione un estudiante para visualizar su trayectoria escolar.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VISTA 2: SELECCIÓN DE ABANDERADOS Y ESCOLTAS (ORDEN DE MÉRITO) */}
      {/* ================================================================= */}
      {activeSubTab === 'merit' && (
        <div className="space-y-5">
          {/* Barra superior de cursos evaluados y exportación */}
          <div className="aero-glass rounded-2xl border border-white/90 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-[#0c2d48]">Cursos evaluados:</span>
              {[
                { label: '6° Año', courses: ['6'] as CourseYear[] },
                { label: '5° Año', courses: ['5'] as CourseYear[] },
                { label: '5° y 6° Año', courses: ['5', '6'] as CourseYear[] },
                { label: 'Todos (1°–6°)', courses: ALL_COURSES },
              ].map((preset) => {
                const isActive =
                  preset.courses.length === meritConfig.targetCourses.length &&
                  preset.courses.every((c) => meritConfig.targetCourses.includes(c));
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onUpdateMeritConfig({ ...meritConfig, targetCourses: preset.courses })
                    }
                    className={`px-3 py-2 min-h-[38px] rounded-xl text-xs font-bold transition-colors ${
                      isActive
                        ? 'bg-sky-700 text-white shadow-sm'
                        : 'bg-white text-slate-700 border border-sky-200 hover:bg-sky-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => openSettingsModal('weights')}
                className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                title="Abrir modal de ponderaciones matemáticas de períodos y umbrales disciplinarios"
              >
                <SlidersHorizontal size={15} className="text-sky-600" />
                <span>Ponderaciones y umbrales</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('criteria')}
                className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-bold transition-colors"
              >
                <Settings2 size={15} />
                <span>Ajustar criterios</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMeritPdfModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                title="Elegir alcance, N° de acta y secciones del informe PDF"
              >
                <FileText size={15} className="text-sky-700" />
                <span>Configurar Acta PDF</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const res = exportMeritOrderPDF(meritResult, meritConfig, schoolInfo, {
                    scope: 'all',
                    includeCriteriaSummary: true,
                    includeHonorRoll: true,
                    includeRequirementsDetail: true,
                    includePendingSubjectsDetail: true,
                  });
                  showToast(
                    `PDF oficial descargado: ${res.includedStudentsCount} alumno(s) y detalle de requisitos (${res.pageCount} pág.).`
                  );
                }}
                className="aero-btn-primary flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold"
                title="Descargar inmediatamente el PDF completo con lista ordenada, promedios y cumplimiento de requisitos"
              >
                <FileDown size={15} />
                <span>Exportar Orden de Mérito (PDF)</span>
              </button>
            </div>
          </div>

          {/* Asistente opcional y reversible para completar trayectorias 1°–6° en alumnos existentes */}
          {(seniorCountWithMultiYear === 0 || hasRevertSnapshot) && (
            <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs text-sky-950">
                <Sparkles size={17} className="text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold">
                    {seniorCountWithMultiYear === 0
                      ? 'Evaluación con historial completo 1.º a 6.º Año'
                      : 'Historial demostrativo activo (reversible)'}
                  </p>
                  <p className="text-slate-600 mt-0.5 leading-relaxed">
                    {seniorCountWithMultiYear === 0
                      ? 'Puede cargar manualmente cada ciclo en la pestaña Trayectoria o generar trayectorias históricas de demostración (1° a 6° cerrados) sobre los alumnos ya registrados de 5° y 6° Año sin modificar el padrón original.'
                      : 'Se conserva un respaldo automático previo para revertir la carga demostrativa en cualquier momento.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {seniorCountWithMultiYear === 0 && (
                  <button
                    type="button"
                    onClick={handlePopulateDemoTrajectories}
                    className="aero-btn-emerald px-3.5 py-2.5 min-h-[40px] rounded-xl text-xs font-extrabold whitespace-nowrap"
                  >
                    Completar historial 1°–6° (5° y 6°)
                  </button>
                )}
                {hasRevertSnapshot && (
                  <button
                    type="button"
                    onClick={handleRevertSnapshot}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[40px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold whitespace-nowrap"
                  >
                    <RotateCcw size={14} />
                    <span>Revertir carga</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Aviso de integridad si existen DNI repetidos */}
          {meritResult.duplicateDniWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold">
                  Atención: se detectaron registros con el mismo DNI en el padrón
                </p>
                <p className="mt-0.5 text-amber-900">
                  {meritResult.duplicateDniWarnings
                    .map((w) => `DNI ${w.dni}: ${w.studentNames.join(' / ')}`)
                    .join(' · ')}
                  . Verifique antes de emitir el acta definitiva.
                </p>
              </div>
            </div>
          )}

          {/* Alerta explícita de empate en puestos 1°, 2° o 3° */}
          {meritResult.hasTopThreeTie && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950">
              <Scale size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-extrabold">
                  Empate detectado en el Cuadro de Honor (puesto/s{' '}
                  {meritResult.tiedRanks
                    .filter((r) => r <= 3)
                    .map((r) => `${r}°`)
                    .join(', ')}
                  )
                </p>
                <p className="leading-relaxed">
                  El sistema <strong>no aplica desempates automáticos ocultos</strong>. Todos los
                  estudiantes con igual promedio acumulado se muestran compartiendo la posición para
                  que la Comisión Evaluadora o Dirección resuelva según la normativa vigente.
                </p>
              </div>
            </div>
          )}

          {/* Cuadro de Honor: ABANDERADO/A, PRIMER/A ESCOLTA, SEGUNDO/A ESCOLTA */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {renderHonorSlotCard(
              1,
              'ABANDERADO/A',
              meritResult.abanderadosGroup,
              'border-sky-300/90',
              'text-sky-700'
            )}
            {renderHonorSlotCard(
              2,
              'PRIMER/A ESCOLTA',
              meritResult.primerEscoltaGroup,
              'border-teal-300/90',
              'text-teal-700'
            )}
            {renderHonorSlotCard(
              3,
              'SEGUNDO/A ESCOLTA',
              meritResult.segundoEscoltaGroup,
              'border-cyan-300/90',
              'text-cyan-700'
            )}
          </div>

          {/* Alerta roja cuando existen postulantes con sanciones disciplinarias activas para revisión manual */}
          {candidatesWithActiveSanctions.length > 0 && (
            <div
              role="alert"
              className="bg-red-50/95 border-2 border-red-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-950"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 border border-red-300 text-red-700 flex items-center justify-center shrink-0">
                  <ShieldAlert size={19} />
                </div>
                <div className="space-y-0.5">
                  <p className="font-black text-red-900">
                    Revisión manual requerida: {candidatesWithActiveSanctions.length}{' '}
                    {candidatesWithActiveSanctions.length === 1
                      ? 'estudiante registra'
                      : 'estudiantes registran'}{' '}
                    sanciones disciplinarias activas
                  </p>
                  <p className="text-red-900/85 leading-relaxed">
                    Las sanciones activas se resaltan en rojo en cada fila y dentro de la ficha de
                    evaluación del alumno para su revisión manual. No descuentan puntos del promedio
                    académico.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMeritListFilter('con_sanciones');
                  if (candidatesWithActiveSanctions[0]) {
                    setExpandedCandidateId(candidatesWithActiveSanctions[0].student.id);
                  }
                  meritListSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="px-3.5 py-2.5 min-h-[40px] rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-extrabold whitespace-nowrap transition-colors shrink-0"
              >
                Ver alumnos con sanciones ({candidatesWithActiveSanctions.length})
              </button>
            </div>
          )}

          {/* Resumen de criterios aplicados y filtros del listado */}
          <div
            ref={meritListSectionRef}
            className="aero-glass rounded-2xl border border-white/90 overflow-hidden scroll-mt-6"
          >
            <div className="p-4 sm:p-5 border-b border-sky-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-[#0c2d48]">
                  Orden de Mérito Detallado ({meritResult.evaluatedCount} evaluados)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Cálculo:{' '}
                  <strong>
                    {meritConfig.calculationMode === 'weighted' ? 'Ponderado' : 'Simple'}
                  </strong>{' '}
                  ({meritConfig.decimalPlaces} dec.) · Disciplina:{' '}
                  <strong>
                    {meritConfig.disciplinaryPolicy === 'inform_only'
                      ? 'Solo informativo (no excluye)'
                      : meritConfig.disciplinaryPolicy === 'review_active'
                      ? 'Revisión institucional'
                      : 'Exclusión por tipos seleccionados'}
                  </strong>{' '}
                  · Las sanciones nunca descuentan promedio.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 bg-sky-50/90 p-1 rounded-xl border border-sky-100">
                {(
                  [
                    { id: 'all', label: `Todos (${meritResult.evaluatedCount})`, isAlert: false },
                    {
                      id: 'elegible',
                      label: `Elegibles (${meritResult.eligibleCandidates.length})`,
                      isAlert: false,
                    },
                    {
                      id: 'revision_institucional',
                      label: `Revisión (${meritResult.reviewCandidates.length})`,
                      isAlert: false,
                    },
                    {
                      id: 'no_elegible',
                      label: `No elegibles (${meritResult.ineligibleCandidates.length})`,
                      isAlert: false,
                    },
                    ...(candidatesWithActiveSanctions.length > 0
                      ? [
                          {
                            id: 'con_sanciones' as const,
                            label: `Sanciones activas (${candidatesWithActiveSanctions.length})`,
                            isAlert: true,
                          },
                        ]
                      : []),
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMeritListFilter(f.id)}
                    className={`px-3 py-1.5 min-h-[34px] rounded-lg text-[11px] font-bold transition-colors tabular-nums inline-flex items-center gap-1.5 ${
                      meritListFilter === f.id
                        ? f.isAlert
                          ? 'bg-red-700 text-white shadow-sm border border-red-800'
                          : 'bg-white text-sky-900 shadow-sm border border-sky-200'
                        : f.isAlert
                        ? 'text-red-700 bg-red-50/80 hover:bg-red-100 border border-red-200'
                        : 'text-slate-600 hover:text-sky-900'
                    }`}
                  >
                    {f.isAlert && <ShieldAlert size={12} />}
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Listado responsive (tarjetas móvil + tabla escritorio) */}
            {displayedMeritCandidates.length > 0 ? (
              <>
                <div className="md:hidden divide-y divide-sky-100">
                  {displayedMeritCandidates.map((ev) => {
                    const isExpanded = expandedCandidateId === ev.student.id;
                    return (
                      <div
                        key={ev.student.id}
                        className={`p-4 space-y-3 ${
                          ev.hasActiveSanctionsForManualReview ? 'bg-red-50/40' : 'bg-white/80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">
                              {ev.meritRank !== null ? `${ev.meritRank}° ` : ''}
                              {ev.student.fullName}
                            </p>
                            <p className="text-[11px] text-slate-500 tabular-nums">
                              DNI {ev.student.dni || 'S/D'} · {ev.student.course}° Año ·{' '}
                              {ev.summary.cumulativeCountedSubjects} mat. (
                              {ev.summary.cumulativeCountedYears} años)
                            </p>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="text-lg font-black text-sky-800 block leading-none">
                              {ev.formattedAverage}
                            </span>
                            <span className="text-[10px] font-bold text-slate-500">
                              {ev.summary.cumulativeStatusLabel}
                            </span>
                          </div>
                        </div>

                        {/* Indicador visual compacto de requisitos mínimos de trayectoria + sanciones activas en rojo */}
                        <MeritStudentEligibilityIndicator
                          evaluation={ev}
                          config={meritConfig}
                          variant="compact"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span className="font-bold text-slate-700">
                            {ev.roleAssigned ||
                              (ev.eligibilityStatus === 'elegible'
                                ? 'Elegible'
                                : ev.eligibilityStatus === 'revision_institucional'
                                ? 'Revisión institucional'
                                : 'No cumple criterios')}
                            {ev.isTied ? ' (Empate)' : ''}
                          </span>
                          <span className="text-slate-500 tabular-nums">
                            Pend.: {ev.summary.totalPendingSubjects} · Sanc. activas:{' '}
                            <strong
                              className={
                                ev.hasActiveSanctionsForManualReview
                                  ? 'text-red-700'
                                  : 'text-slate-600'
                              }
                            >
                              {ev.activeDisciplinaryIncidents.length}
                            </strong>
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-sky-100 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedCandidateId(isExpanded ? null : ev.student.id)
                            }
                            className={`text-xs font-extrabold flex items-center gap-1 min-h-[36px] ${
                              ev.hasActiveSanctionsForManualReview
                                ? 'text-red-700'
                                : 'text-sky-700'
                            }`}
                          >
                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            <span>{isExpanded ? 'Ocultar ficha' : 'Ficha y requisitos'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedStudentId(ev.student.id);
                              setActiveSubTab('trajectory');
                            }}
                            className="text-xs font-extrabold text-[#0c2d48] hover:text-sky-700 min-h-[36px]"
                          >
                            Ver trayectoria &rarr;
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="pt-2 border-t border-sky-200/80 space-y-3">
                            <MeritStudentEligibilityIndicator
                              evaluation={ev}
                              config={meritConfig}
                              variant="card"
                              onReviewDiscipline={() =>
                                handleOpenStudentDisciplinaryReview(ev.student.id)
                              }
                              onOpenTrajectory={() => {
                                setSelectedStudentId(ev.student.id);
                                setActiveSubTab('trajectory');
                              }}
                            />
                            <StudentTrajectoryEvolutionChart
                              student={ev.student}
                              summary={ev.summary}
                              meritConfig={meritConfig}
                              schoolInfo={schoolInfo}
                              variant="compact"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto bg-white/85">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-sky-50/95 text-[11px] font-extrabold uppercase tracking-wider text-sky-900 border-b border-sky-100">
                        <th className="py-3 px-3 text-center w-16">Orden</th>
                        <th className="py-3 px-3">Estudiante</th>
                        <th className="py-3 px-2 text-center">Curso</th>
                        <th className="py-3 px-2 text-center">Prom. Acum.</th>
                        <th className="py-3 px-2 text-center">Estado Prom.</th>
                        <th className="py-3 px-2 text-center">Computadas</th>
                        <th className="py-3 px-2 text-center">Pend.</th>
                        <th className="py-3 px-2.5">Req. Trayectoria</th>
                        <th className="py-3 px-2.5">Antec. Disciplinarios</th>
                        <th className="py-3 px-2.5">Elegibilidad / Rol</th>
                        <th className="py-3 px-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {displayedMeritCandidates.map((ev) => {
                        const isExpanded = expandedCandidateId === ev.student.id;
                        const initials = ev.student.fullName
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase();

                        return (
                          <React.Fragment key={ev.student.id}>
                            <tr
                              className={`transition-colors ${
                                ev.hasActiveSanctionsForManualReview
                                  ? 'bg-red-50/35 hover:bg-red-50/65'
                                  : 'hover:bg-sky-50/50'
                              }`}
                            >
                              <td className="py-3 px-3 text-center font-black tabular-nums text-[#0c2d48]">
                                {ev.meritRank !== null ? (
                                  <span>
                                    {ev.meritRank}°
                                    {ev.isTied && (
                                      <span className="block text-[10px] font-extrabold text-amber-700">
                                        Empate
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3 px-3">
                                <p className="font-extrabold text-slate-900">
                                  {ev.student.fullName}
                                </p>
                                <p className="text-[11px] text-slate-500 tabular-nums">
                                  DNI {ev.student.dni || 'S/D'} · ID {ev.student.id}
                                </p>
                              </td>
                              <td className="py-3 px-2 text-center font-bold text-slate-700">
                                {ev.student.course}°
                              </td>
                              <td
                                className="py-3 px-2 text-center font-black text-base text-sky-800 tabular-nums"
                                title={
                                  ev.summary.cumulativeAverage !== null
                                    ? `Precisión completa: ${ev.summary.cumulativeAverage.toFixed(6)}`
                                    : 'Sin calificaciones'
                                }
                              >
                                {ev.formattedAverage}
                              </td>
                              <td className="py-3 px-2 text-center">
                                <span
                                  className={`font-bold ${
                                    ev.summary.cumulativeIsDefinitive
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {ev.summary.cumulativeStatusLabel}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-center tabular-nums text-slate-700">
                                {ev.summary.cumulativeCountedSubjects} mat. (
                                {ev.summary.cumulativeCountedYears} a.)
                              </td>
                              <td className="py-3 px-2 text-center tabular-nums font-bold">
                                <span
                                  className={
                                    ev.summary.totalPendingSubjects > 0
                                      ? 'text-amber-700'
                                      : 'text-emerald-700'
                                  }
                                >
                                  {ev.summary.totalPendingSubjects}
                                </span>
                              </td>
                              <td className="py-3 px-2.5 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-extrabold tabular-nums ${
                                    ev.meetsTrajectoryRequirements
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : 'bg-amber-50 border-amber-300 text-amber-900'
                                  }`}
                                >
                                  {ev.meetsTrajectoryRequirements ? (
                                    <CheckCircle2
                                      size={13}
                                      className="text-emerald-600 shrink-0"
                                    />
                                  ) : (
                                    <XCircle size={13} className="text-rose-600 shrink-0" />
                                  )}
                                  <span>
                                    {ev.meetsTrajectoryRequirements ? 'Cumple' : 'No cumple'} (
                                    {ev.passedTrajectoryChecksCount}/{ev.totalTrajectoryChecksCount}
                                    )
                                  </span>
                                </span>
                              </td>
                              <td className="py-3 px-2.5 whitespace-nowrap tabular-nums">
                                {ev.hasActiveSanctionsForManualReview ? (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedCandidateId(ev.student.id)}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-300 text-red-800 text-[11px] font-extrabold transition-colors"
                                    title="Click para abrir la ficha y revisar en detalle las sanciones activas (no descuentan promedio)"
                                  >
                                    <ShieldAlert size={13} className="text-red-600 shrink-0" />
                                    <span>
                                      {ev.activeDisciplinaryIncidents.length} activa(s) · Revisar
                                    </span>
                                  </button>
                                ) : (
                                  <span className="text-slate-500 font-medium">Sin novedades</span>
                                )}
                              </td>
                              <td className="py-3 px-2.5">
                                <span
                                  className={`font-extrabold ${
                                    ev.roleAssigned
                                      ? 'text-sky-800'
                                      : ev.eligibilityStatus === 'elegible'
                                      ? 'text-emerald-700'
                                      : ev.eligibilityStatus === 'revision_institucional'
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {ev.roleAssigned ||
                                    (ev.eligibilityStatus === 'elegible'
                                      ? 'Elegible'
                                      : ev.eligibilityStatus === 'revision_institucional'
                                      ? 'Revisión institucional'
                                      : 'No elegible')}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedCandidateId(isExpanded ? null : ev.student.id)
                                    }
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition-colors ${
                                      isExpanded
                                        ? 'bg-sky-700 text-white border-sky-800'
                                        : ev.hasActiveSanctionsForManualReview
                                        ? 'bg-red-50 hover:bg-red-100 text-red-800 border-red-300'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                                    }`}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp size={13} />
                                    ) : (
                                      <ClipboardCheck size={13} />
                                    )}
                                    <span>{isExpanded ? 'Cerrar ficha' : 'Ficha alumno'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedStudentId(ev.student.id);
                                      setActiveSubTab('trajectory');
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-[11px] font-extrabold"
                                  >
                                    Trayectoria
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-sky-50/55">
                                <td colSpan={11} className="p-4 sm:p-5">
                                  {/* FICHA DEL ALUMNO DENTRO DE SELECCIÓN DE ABANDERADOS Y ESCOLTAS */}
                                  <div className="bg-white/95 border border-sky-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-sky-100">
                                      <div className="flex items-center gap-3 min-w-0">
                                        {ev.student.photo ? (
                                          <img
                                            src={ev.student.photo}
                                            alt={ev.student.fullName}
                                            className="w-12 h-12 rounded-xl object-cover border border-sky-200 shrink-0"
                                          />
                                        ) : (
                                          <div className="w-12 h-12 rounded-xl bg-sky-100 border border-sky-200 text-sky-800 font-black text-sm flex items-center justify-center shrink-0">
                                            {initials || 'AL'}
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                                              Ficha del Alumno · Selección de Abanderados y Escoltas
                                            </span>
                                            {ev.roleAssigned && (
                                              <span className="px-2 py-0.5 rounded-md bg-sky-100 border border-sky-300 text-sky-900 text-[10px] font-black">
                                                {ev.roleAssigned}
                                                {ev.isTied ? ' (Empate)' : ''}
                                              </span>
                                            )}
                                          </div>
                                          <h4 className="text-base font-extrabold text-[#0c2d48] truncate">
                                            {ev.student.fullName}
                                          </h4>
                                          <p className="text-[11px] text-slate-600 tabular-nums">
                                            DNI {ev.student.dni || 'S/D'} · ID {ev.student.id} ·{' '}
                                            {ev.student.course}° Año · Ingreso{' '}
                                            {ev.trajectory.entryYear} · Prom. Acumulado:{' '}
                                            <strong className="text-sky-800">
                                              {ev.formattedAverage}
                                            </strong>{' '}
                                            ({ev.summary.cumulativeStatusLabel})
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        {onOpenStudentLegajo && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenStudentLegajo(ev.student)}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-extrabold transition-colors"
                                          >
                                            <ExternalLink size={14} />
                                            <span>Abrir Legajo</span>
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => setExpandedCandidateId(null)}
                                          className="inline-flex items-center gap-1 px-3 py-2 min-h-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                                        >
                                          <X size={14} />
                                          <span>Cerrar</span>
                                        </button>
                                      </div>
                                    </div>

                                    <MeritStudentEligibilityIndicator
                                      evaluation={ev}
                                      config={meritConfig}
                                      variant="card"
                                      onReviewDiscipline={() =>
                                        handleOpenStudentDisciplinaryReview(ev.student.id)
                                      }
                                      onOpenTrajectory={() => {
                                        setSelectedStudentId(ev.student.id);
                                        setActiveSubTab('trajectory');
                                      }}
                                    />

                                    <StudentTrajectoryEvolutionChart
                                      student={ev.student}
                                      summary={ev.summary}
                                      meritConfig={meritConfig}
                                      schoolInfo={schoolInfo}
                                      variant="compact"
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-xs text-slate-500">
                No hay estudiantes en esta categoría con los criterios seleccionados.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUB-VISTA 3: CRITERIOS DE CÁLCULO Y ELEGIBILIDAD CONFIGURABLES     */}
      {/* ================================================================= */}
      {activeSubTab === 'criteria' && (
        <div className="space-y-5">
          {/* Acceso rápido al modal dedicado de ponderaciones matemáticas y umbrales disciplinarios */}
          <div className="aero-glass rounded-2xl border border-sky-200/90 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-200 text-sky-700 flex items-center justify-center shrink-0">
                <SlidersHorizontal size={19} />
              </div>
              <div className="space-y-0.5 text-xs">
                <h3 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                  Ajustes Avanzados: Ponderaciones por Período y Umbrales Disciplinarios
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {meritConfig.gradingPeriodWeights?.enabled
                    ? `Ponderación trimestral activa (${meritConfig.gradingPeriodWeights.trimestre1}% / ${meritConfig.gradingPeriodWeights.trimestre2}% / ${meritConfig.gradingPeriodWeights.trimestre3}%${
                        meritConfig.gradingPeriodWeights.finalExamWeight > 0
                          ? ` / Final ${meritConfig.gradingPeriodWeights.finalExamWeight}%`
                          : ''
                      })`
                    : 'Ponderación trimestral desactivada (usa nota final directa)'}
                  {' · '}
                  {meritConfig.courseYearWeights?.enabled
                    ? 'Pesos diferenciados por año (1°–6°) activos'
                    : 'Todos los años 1.0x'}
                  {' · '}
                  Umbral revisión manual: ≥
                  {meritConfig.disciplinaryThresholds?.manualReviewMinActiveCount ?? 1} sanción(es)
                  activa(s).
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openSettingsModal('weights')}
                className="px-3.5 py-2.5 min-h-[40px] rounded-xl bg-white hover:bg-sky-50 border border-sky-200 text-sky-900 text-xs font-extrabold transition-colors"
              >
                Ponderaciones de períodos
              </button>
              <button
                type="button"
                onClick={() => openSettingsModal('discipline')}
                className="px-3.5 py-2.5 min-h-[40px] rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 text-xs font-extrabold transition-colors"
              >
                Umbrales disciplinarios
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Panel A: Motor de cálculo de promedios */}
          <div className="aero-glass rounded-2xl border border-white/90 p-5 sm:p-6 space-y-5">
            <div>
              <h3 className="text-lg font-extrabold text-[#0c2d48]">
                Configuración del Cálculo de Promedios
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Los cálculos internos conservan máxima precisión decimal y actualizan
                automáticamente cada trayectoria y el Orden de Mérito.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700">
                Criterio de cálculo
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    id: 'simple' as const,
                    title: 'Promedio simple por materia',
                    desc: 'Todas las materias computables tienen el mismo peso.',
                  },
                  {
                    id: 'weighted' as const,
                    title: 'Promedio ponderado',
                    desc: 'Habilita la columna "Peso" por materia en cada ciclo lectivo.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateMeritConfig({ ...meritConfig, calculationMode: opt.id })}
                    className={`text-left p-3.5 rounded-xl border transition-all ${
                      meritConfig.calculationMode === opt.id
                        ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-500'
                        : 'bg-white border-sky-100 hover:bg-sky-50/50'
                    }`}
                  >
                    <p className="text-xs font-extrabold text-[#0c2d48]">{opt.title}</p>
                    <p className="text-[11px] text-slate-600 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  Decimales visibles
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([2, 3, 4] as const).map((dec) => (
                    <button
                      key={dec}
                      type="button"
                      onClick={() => onUpdateMeritConfig({ ...meritConfig, decimalPlaces: dec })}
                      className={`py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold tabular-nums border transition-colors ${
                        meritConfig.decimalPlaces === dec
                          ? 'bg-sky-700 text-white border-sky-700'
                          : 'bg-white text-slate-700 border-sky-200 hover:bg-sky-50'
                      }`}
                    >
                      {dec} dec. ({formatDecimalAverage(9.3456, dec)})
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                  Nota mínima de aprobación
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={meritConfig.passingGrade}
                  onChange={(e) =>
                    onUpdateMeritConfig({
                      ...meritConfig,
                      passingGrade: Math.min(10, Math.max(1, Number(e.target.value) || 6)),
                    })
                  }
                  className="w-full px-3.5 py-2.5 min-h-[42px] bg-white border border-sky-200 rounded-xl text-xs font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <label className="flex items-start gap-3 p-3.5 bg-white/90 border border-sky-100 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={meritConfig.includePartialYearsInCumulative}
                onChange={(e) =>
                  onUpdateMeritConfig({
                    ...meritConfig,
                    includePartialYearsInCumulative: e.target.checked,
                  })
                }
                className="mt-0.5 rounded border-sky-300 text-sky-700"
              />
              <span className="text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900 block">
                  Incluir ciclos en curso (parciales) al visualizar el promedio acumulado
                </strong>
                Incluso activado, el promedio acumulado siempre se identificará como{' '}
                <strong>Parcial</strong> hasta que todos los ciclos estén cerrados con notas
                definitivas.
              </span>
            </label>

            <div className="bg-sky-50/80 border border-sky-200 rounded-xl p-3.5 text-xs text-sky-950 flex items-start gap-2">
              <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                El sistema excluye automáticamente materias sin calificación final, materias marcadas
                como eximidas/excluidas y evita duplicar materias con igual denominación dentro del
                mismo ciclo lectivo.
              </p>
            </div>
          </div>

          {/* Panel B: Criterios de Elegibilidad para Abanderados y Escoltas */}
          <div className="aero-glass rounded-2xl border border-white/90 p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-extrabold text-[#0c2d48]">
                  Criterios Institucionales de Elegibilidad
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Ajuste los requisitos según el reglamento jurisdiccional e institucional vigente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onUpdateMeritConfig(DEFAULT_MERIT_ORDER_CONFIG);
                  showToast('Criterios restablecidos a los valores predeterminados.', 'info');
                }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-sky-200 text-[11px] font-bold text-slate-700 shrink-0"
              >
                <RotateCcw size={13} />
                <span>Restablecer</span>
              </button>
            </div>

            {/* Cursos evaluados */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                Cursos incluidos en la evaluación de Abanderados y Escoltas
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_COURSES.map((c) => {
                  const selected = meritConfig.targetCourses.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? meritConfig.targetCourses.filter((x) => x !== c)
                          : [...meritConfig.targetCourses, c].sort();
                        if (next.length === 0) return;
                        onUpdateMeritConfig({ ...meritConfig, targetCourses: next });
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

            {/* Requisitos académicos */}
            <div className="space-y-2.5">
              <label className="flex items-start gap-3 p-3 bg-white/90 border border-sky-100 rounded-xl cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={meritConfig.requireDefinitiveAverage}
                  onChange={(e) =>
                    onUpdateMeritConfig({
                      ...meritConfig,
                      requireDefinitiveAverage: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded border-sky-300 text-sky-700"
                />
                <span>
                  <strong className="text-slate-900 block">
                    Exigir calificaciones definitivas (ciclos cerrados)
                  </strong>
                  Si está desactivado, permite calcular el orden preliminar con promedios parciales.
                </span>
              </label>

              <label className="flex items-start gap-3 p-3 bg-white/90 border border-sky-100 rounded-xl cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={meritConfig.requireCompleteTrajectory}
                  onChange={(e) =>
                    onUpdateMeritConfig({
                      ...meritConfig,
                      requireCompleteTrajectory: e.target.checked,
                    })
                  }
                  className="mt-0.5 rounded border-sky-300 text-sky-700"
                />
                <span>
                  <strong className="text-slate-900 block">
                    Exigir trayectoria escolar completa registrada desde 1.º Año
                  </strong>
                  Verifica que consten todos los cursos desde 1.º hasta el curso actual del alumno.
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white/90 border border-sky-100 rounded-xl p-3">
                  <label className="block text-[11px] font-extrabold text-slate-700 mb-1">
                    Antigüedad mínima en la escuela (años)
                  </label>
                  <select
                    value={meritConfig.minYearsInInstitution}
                    onChange={(e) =>
                      onUpdateMeritConfig({
                        ...meritConfig,
                        minYearsInInstitution: Number(e.target.value) || 1,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-sky-200 rounded-lg text-xs font-bold outline-none"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} año{n > 1 ? 's' : ''} mínimo{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-white/90 border border-sky-100 rounded-xl p-3 space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={meritConfig.requireNoPendingSubjects}
                      onChange={(e) =>
                        onUpdateMeritConfig({
                          ...meritConfig,
                          requireNoPendingSubjects: e.target.checked,
                        })
                      }
                      className="rounded border-sky-300 text-sky-700"
                    />
                    <span>Controlar materias pendientes</span>
                  </label>
                  {meritConfig.requireNoPendingSubjects && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span>Máx. permitidas:</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={meritConfig.maxAllowedPendingSubjects}
                        onChange={(e) =>
                          onUpdateMeritConfig({
                            ...meritConfig,
                            maxAllowedPendingSubjects: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-16 px-2 py-1 bg-slate-50 border border-sky-200 rounded-lg text-center font-bold tabular-nums"
                      />
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 bg-white/90 border border-sky-100 rounded-xl cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={meritConfig.allowRepeatedYears}
                  onChange={(e) =>
                    onUpdateMeritConfig({
                      ...meritConfig,
                      allowRepeatedYears: e.target.checked,
                    })
                  }
                  className="rounded border-sky-300 text-sky-700"
                />
                <span className="font-bold text-slate-800">
                  Permitir elegibilidad de alumnos que registran años repetidos
                </span>
              </label>
            </div>

            {/* Política configurable de Antecedentes Disciplinarios */}
            <div className="pt-3 border-t border-sky-100 space-y-3">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-800">
                  Criterio sobre Antecedentes Disciplinarios
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Las sanciones nunca descuentan puntos del promedio. Defina aquí cómo se evalúan en
                  la elegibilidad según el reglamento de la institución:
                </p>
              </div>

              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'inform_only',
                      title: 'Solo informativo (no excluye automáticamente)',
                      desc: 'Muestra los antecedentes para consulta institucional sin restringir la elegibilidad.',
                    },
                    {
                      id: 'review_active',
                      title: 'Enviar a revisión institucional si hay actuaciones activas',
                      desc: 'Los estudiantes con antecedentes activos se listan aparte para decisión del equipo directivo.',
                    },
                    {
                      id: 'exclude_selected_types',
                      title: 'Excluir únicamente los tipos de sanción que seleccione la institución',
                      desc: 'Permite indicar expresamente qué tipos de sanción afectan la elegibilidad.',
                    },
                  ] as const
                ).map((pol) => (
                  <label
                    key={pol.id}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer text-xs transition-colors ${
                      meritConfig.disciplinaryPolicy === pol.id
                        ? 'bg-sky-50 border-sky-400'
                        : 'bg-white border-sky-100 hover:bg-sky-50/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="disciplinaryPolicy"
                      checked={meritConfig.disciplinaryPolicy === pol.id}
                      onChange={() =>
                        onUpdateMeritConfig({ ...meritConfig, disciplinaryPolicy: pol.id })
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

              {meritConfig.disciplinaryPolicy === 'exclude_selected_types' && (
                <div className="bg-white border border-sky-200 rounded-xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-slate-700">
                    Tipos de sanción que inhabilitan según reglamento escolar:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {SANCTION_TYPES_LIST.map((typeKey) => {
                      const checked = meritConfig.excludedSanctionTypes.includes(typeKey);
                      return (
                        <label
                          key={typeKey}
                          className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? meritConfig.excludedSanctionTypes.filter((t) => t !== typeKey)
                                : [...meritConfig.excludedSanctionTypes, typeKey];
                              onUpdateMeritConfig({
                                ...meritConfig,
                                excludedSanctionTypes: next,
                              });
                            }}
                            className="rounded border-sky-300 text-sky-700"
                          />
                          <span>{SANCTION_TYPE_LABELS[typeKey]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={meritConfig.ignoreAnnulledSanctions}
                  onChange={(e) =>
                    onUpdateMeritConfig({
                      ...meritConfig,
                      ignoreAnnulledSanctions: e.target.checked,
                    })
                  }
                  className="rounded border-sky-300 text-sky-700"
                />
                <span>Ignorar actuaciones disciplinarias en estado &ldquo;Anulada&rdquo;</span>
              </label>
            </div>

            {/* Observaciones normativas */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                Normativa o criterios de desempate institucional (observación interna)
              </label>
              <textarea
                rows={2}
                value={meritConfig.institutionalNotes || ''}
                onChange={(e) =>
                  onUpdateMeritConfig({ ...meritConfig, institutionalNotes: e.target.value })
                }
                placeholder="Ej.: Resolución ministerial vigente o acta de acuerdo escolar para resolución de empates..."
                className="w-full px-3.5 py-2.5 bg-white border border-sky-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-sky-100">
              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 size={14} />
                <span>Guardado automáticamente</span>
              </span>
              <button
                type="button"
                onClick={() => setActiveSubTab('merit')}
                className="aero-btn-primary px-4 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold"
              >
                Ver Orden de Mérito actualizado
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Modal configurable de exportación PDF para Selección de Abanderados y Escoltas */}
      <MeritOrderPdfExportModal
        isOpen={isMeritPdfModalOpen}
        onClose={() => setIsMeritPdfModalOpen(false)}
        meritResult={meritResult}
        config={meritConfig}
        schoolInfo={schoolInfo}
        onExportComplete={(res) =>
          showToast(
            `Acta PDF generada (${res.fileName}): ${res.includedStudentsCount} alumno(s) · ${res.pageCount} página(s).`
          )
        }
      />

      {/* Modal dedicado de configuración de ponderaciones de períodos y umbrales disciplinarios */}
      <TrajectoryMeritSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={meritConfig}
        onSaveConfig={(nextConfig) => {
          onUpdateMeritConfig(nextConfig);
          showToast(
            'Configuración de ponderaciones y umbrales disciplinarios guardada y aplicada al Orden de Mérito.'
          );
        }}
        students={students}
        trajectories={trajectories}
        disciplinaryRecords={disciplinaryRecords}
        currentAcademicYear={currentAcademicYear}
        schoolInfo={schoolInfo}
        initialTab={settingsModalInitialTab}
      />
    </div>
  );
};
