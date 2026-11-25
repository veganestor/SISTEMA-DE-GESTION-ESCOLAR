
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Student,
  CourseYear,
  SUBJECTS_BY_YEAR,
  AttendanceRecord,
  Grade,
  SchoolInfo,
  DEFAULT_SCHOOL_INFO,
  StudentTrajectoryProfile,
  DisciplinaryIncident,
  MeritOrderConfig,
  DEFAULT_MERIT_ORDER_CONFIG,
  StudentEnrollmentStatus,
} from '../types';
import { calculateAge, getPromotionStatus, exportBulletinToExcel, generateStudentPDFReport } from '../services/utils';
import { getLocalTodayISO, compressImageFileToDataUrl } from '../services/storageService';
import { ENROLLMENT_STATUS_LABELS } from '../services/dropoutRateService';
import {
  resolveStudentTrajectory,
  calculateStudentTrajectorySummary,
  evaluateStudentMeritEligibility,
  YEAR_CONDITION_LABELS,
  MOVEMENT_TYPE_LABELS,
} from '../services/trajectoryService';
import { exportStudentTrajectoryPDF } from '../services/trajectoryPdfExport';
import { 
  ArrowLeft, Save, AlertTriangle, Printer, FileDown, Plus, 
  HeartPulse, ShieldAlert, GraduationCap, User, Calendar, 
  ChevronLeft, ChevronRight, Info, CheckCircle2, XCircle, Clock,
  BarChart as BarChartIcon, LineChart as LineChartIcon, Trash2, Eye, Camera, FolderOpen, Globe,
  Award, Sparkles, Image as ImageIcon, ChevronDown, BookOpen, ExternalLink
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { StudentAttendanceCalendar } from './StudentAttendanceCalendar';
import { OfficialReportCardModal } from './OfficialReportCardModal';
import { StudentGradesEvolutionChart } from './StudentGradesEvolutionChart';
import { DisciplinaryRecordsPanel } from './DisciplinaryRecordsPanel';
import { MeritStudentEligibilityIndicator } from './MeritStudentEligibilityIndicator';
import { StudentTrajectoryEvolutionChart } from './StudentTrajectoryEvolutionChart';
import { StudentQRAttendanceSection } from './StudentQRAttendanceSection';

interface StudentDetailProps {
  student: Student;
  onBack: () => void;
  onUpdate: (s: Student) => void;
  onDelete?: (id: string) => void;
  schoolInfo?: SchoolInfo;
  trajectoryProfile?: StudentTrajectoryProfile;
  disciplinaryIncidents?: DisciplinaryIncident[];
  meritConfig?: MeritOrderConfig;
  onAddDisciplinaryIncident?: (incident: DisciplinaryIncident) => void;
  onUpdateDisciplinaryIncident?: (incident: DisciplinaryIncident) => void;
  onDeleteDisciplinaryIncident?: (incidentId: string) => void;
  onMigrateLegacyDisciplinary?: () => void;
  onOpenFullTrajectory?: (student: Student) => void;
}

export const StudentDetail: React.FC<StudentDetailProps> = ({ 
  student, 
  onBack, 
  onUpdate, 
  onDelete,
  schoolInfo = DEFAULT_SCHOOL_INFO,
  trajectoryProfile,
  disciplinaryIncidents = [],
  meritConfig = DEFAULT_MERIT_ORDER_CONFIG,
  onAddDisciplinaryIncident,
  onUpdateDisciplinaryIncident,
  onDeleteDisciplinaryIncident,
  onMigrateLegacyDisciplinary,
  onOpenFullTrajectory,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'grades' | 'trajectory' | 'calendar' | 'attendance' | 'medical' | 'discipline'>('info');
  const [isEditing, setIsEditing] = useState<boolean>(
    () => student.fullName === 'Nuevo Alumno' && !student.dni
  );
  const [tempStudent, setTempStudent] = useState<Student>({ ...student });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showReportCardModal, setShowReportCardModal] = useState(false);
  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [showPhotoUrlModal, setShowPhotoUrlModal] = useState(false);
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [showRemovePhotoConfirm, setShowRemovePhotoConfirm] = useState(false);
  const [manualAttendanceModal, setManualAttendanceModal] = useState<{
    type: 'ausente' | 'tarde';
    reason: string;
  } | null>(null);
  const [showDisciplineModal, setShowDisciplineModal] = useState(false);
  const [disciplineInput, setDisciplineInput] = useState('');

  useEffect(() => {
    setTempStudent({ ...student });
    if (student.fullName === 'Nuevo Alumno' && !student.dni) {
      setIsEditing(true);
    }
  }, [student]);

  // Referencias para carga de archivos fotográficos
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Estados para el Calendario
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const subjects = SUBJECTS_BY_YEAR[tempStudent.course];
  const promotion = getPromotionStatus(tempStudent);

  const currentAcademicYear = Number(schoolInfo.academicYear) || new Date().getFullYear();
  const resolvedTrajectory = useMemo(
    () =>
      resolveStudentTrajectory(
        tempStudent,
        trajectoryProfile,
        currentAcademicYear,
        meritConfig.passingGrade
      ),
    [tempStudent, trajectoryProfile, currentAcademicYear, meritConfig.passingGrade]
  );

  const trajectorySummary = useMemo(
    () =>
      calculateStudentTrajectorySummary(
        tempStudent,
        resolvedTrajectory,
        disciplinaryIncidents,
        meritConfig
      ),
    [tempStudent, resolvedTrajectory, disciplinaryIncidents, meritConfig]
  );

  const studentMeritEligibility = useMemo(
    () =>
      evaluateStudentMeritEligibility(
        tempStudent,
        resolvedTrajectory,
        disciplinaryIncidents,
        meritConfig,
        trajectorySummary
      ),
    [tempStudent, resolvedTrajectory, disciplinaryIncidents, meritConfig, trajectorySummary]
  );

  const handleSave = () => {
    onUpdate(tempStudent);
    setIsEditing(false);
  };

  const getGradeColor = (val?: number) => {
    if (val === undefined) return 'text-gray-300';
    if (val >= 1 && val <= 3) return 'text-red-600 font-black';
    if (val >= 4 && val <= 5) return 'text-amber-600 font-black';
    if (val >= 6 && val <= 10) return 'text-blue-600 font-black';
    return 'text-gray-800';
  };

  // La nota final se calcula automáticamente como promedio de las notas del 1°, 2° y 3° trimestre (no editable manualmente)
  const handleGradeChange = (
    subject: string,
    field: 'trimestre1' | 'trimestre2' | 'trimestre3',
    value: string
  ) => {
    const num = parseFloat(value);
    const newGrades = { ...tempStudent.grades };
    if (!newGrades[subject]) newGrades[subject] = {};
    if (isNaN(num)) {
       delete newGrades[subject][field];
    } else {
       newGrades[subject] = { ...newGrades[subject], [field]: Math.min(10, Math.max(1, num)) };
    }

    // Cálculo automático del promedio de los trimestres (1°, 2° y 3° trimestre)
    const t1 = newGrades[subject].trimestre1;
    const t2 = newGrades[subject].trimestre2;
    const t3 = newGrades[subject].trimestre3;
    const validTrimesters = [t1, t2, t3].filter((n): n is number => typeof n === 'number' && !isNaN(n));
    if (validTrimesters.length > 0) {
      const sum = validTrimesters.reduce((acc, curr) => acc + curr, 0);
      newGrades[subject].final = Math.round(sum / validTrimesters.length);
    } else {
      delete newGrades[subject].final;
    }

    setTempStudent({ ...tempStudent, grades: newGrades });
  };

  // Recalcular todos los promedios finales según los 3 trimestres
  const handleRecalculateAllFinalGrades = () => {
    const newGrades = { ...tempStudent.grades };
    subjects.forEach((subject) => {
      const g = newGrades[subject];
      if (g) {
        const trimesters = [g.trimestre1, g.trimestre2, g.trimestre3].filter(
          (n): n is number => typeof n === 'number' && !isNaN(n)
        );
        if (trimesters.length > 0) {
          const sum = trimesters.reduce((a, b) => a + b, 0);
          newGrades[subject] = {
            ...g,
            final: Math.round(sum / trimesters.length),
          };
        } else {
          const { final: _removed, ...rest } = g;
          newGrades[subject] = rest;
        }
      }
    });
    setTempStudent({ ...tempStudent, grades: newGrades });
  };

  // Manejo de Fotos del Alumno (con compresión automática para proteger localStorage)
  const handlePhotoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoFeedback({ type: 'error', text: 'Seleccione un archivo de imagen válido (JPG, PNG, WebP).' });
      e.target.value = '';
      return;
    }

    try {
      const dataUrl = await compressImageFileToDataUrl(file, 480, 0.84);
      const updated = { ...tempStudent, photo: dataUrl };
      setTempStudent(updated);
      onUpdate(updated);
      setIsPhotoMenuOpen(false);
      setPhotoFeedback({ type: 'success', text: 'Fotografía actualizada correctamente.' });
      setTimeout(() => setPhotoFeedback(null), 3000);
    } catch {
      setPhotoFeedback({ type: 'error', text: 'No se pudo procesar la imagen seleccionada.' });
    }
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    setIsPhotoMenuOpen(false);
    setShowRemovePhotoConfirm(true);
  };

  const confirmRemovePhoto = () => {
    const updated = { ...tempStudent, photo: undefined };
    setTempStudent(updated);
    onUpdate(updated);
    setShowRemovePhotoConfirm(false);
    setPhotoFeedback({ type: 'success', text: 'Fotografía eliminada del legajo.' });
    setTimeout(() => setPhotoFeedback(null), 2500);
  };

  const handleUrlPhoto = () => {
    setIsPhotoMenuOpen(false);
    setPhotoUrlInput(tempStudent.photo?.startsWith('http') ? tempStudent.photo : '');
    setShowPhotoUrlModal(true);
  };

  const confirmUrlPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = photoUrlInput.trim();
    if (!cleaned) return;
    const updated = { ...tempStudent, photo: cleaned };
    setTempStudent(updated);
    onUpdate(updated);
    setShowPhotoUrlModal(false);
    setPhotoUrlInput('');
  };

  const addAttendance = (type: AttendanceRecord['type'], justified: boolean = false, reason?: string) => {
    const newRecord: AttendanceRecord = {
      date: getLocalTodayISO(),
      type,
      justified,
      reason
    };
    setTempStudent({
      ...tempStudent,
      attendance: [...tempStudent.attendance, newRecord]
    });
  };

  const handleManualAttendance = (type: AttendanceRecord['type']) => {
    if (type === 'ausente' || type === 'tarde') {
      setManualAttendanceModal({ type, reason: '' });
      return;
    }
    addAttendance(type, false, undefined);
  };

  const confirmManualAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAttendanceModal) return;
    addAttendance(
      manualAttendanceModal.type,
      false,
      manualAttendanceModal.reason.trim() || undefined
    );
    setManualAttendanceModal(null);
  };

  const confirmAddDiscipline = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = disciplineInput.trim();
    if (!cleaned) return;
    setTempStudent({
      ...tempStudent,
      disciplinary: [...tempStudent.disciplinary, `${new Date().toLocaleDateString('es-AR')}: ${cleaned}`],
    });
    setDisciplineInput('');
    setShowDisciplineModal(false);
  };

  // Lógica de Calendario
  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    // Ajuste para que la semana empiece en Lunes (0=Dom, 1=Lun...)
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push(dateStr);
    }
    return days;
  }, [viewDate]);

  const getAttendanceForDate = (dateStr: string) => {
    return tempStudent.attendance.find(a => a.date === dateStr);
  };

  const selectedAttendanceInfo = useMemo(() => {
    if (!selectedCalendarDate) return null;
    return getAttendanceForDate(selectedCalendarDate);
  }, [selectedCalendarDate, tempStudent.attendance]);

  // Estadísticas del mes actual
  const monthStats = useMemo(() => {
    const month = viewDate.getMonth() + 1;
    const year = viewDate.getFullYear();
    const records = tempStudent.attendance.filter(a => {
        const [rYear, rMonth] = a.date.split('-').map(Number);
        return rYear === year && rMonth === month;
    });

    return {
        presentes: records.filter(r => r.type === 'presente').length,
        ausentes: records.filter(r => r.type === 'ausente').length,
        tardes: records.filter(r => r.type === 'tarde').length,
        total: records.length
    };
  }, [viewDate, tempStudent.attendance]);

  // Estadísticas mensuales para el gráfico de barras
  const monthlyAttendanceData = useMemo(() => {
    const year = schoolInfo.academicYear || new Date().getFullYear();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    
    return monthNames.map((name, index) => {
      const monthIndex = index + 1;
      const records = tempStudent.attendance.filter(a => {
        const [rYear, rMonth] = a.date.split('-').map(Number);
        return rYear === year && rMonth === monthIndex;
      });

      return {
        name,
        Presentes: records.filter(r => r.type === 'presente').length,
        Ausentes: records.filter(r => r.type === 'ausente').length,
        Tardes: records.filter(r => r.type === 'tarde').length,
      };
    });
  }, [tempStudent.attendance, schoolInfo.academicYear]);

  // Estadísticas generales para el gráfico de torta
  const gradeStats = subjects.reduce((acc, sub) => {
    const final = tempStudent.grades[sub]?.final;
    if (final === undefined) return acc;
    if (final <= 3) acc.aplazados++;
    else if (final <= 5) acc.desaprobados++;
    else acc.aprobados++;
    return acc;
  }, { aplazados: 0, desaprobados: 0, aprobados: 0 });

  const chartData = [
    { name: 'Aplazados (1-3)', value: gradeStats.aplazados, color: '#DC2626' },
    { name: 'Desaprobados (4-5)', value: gradeStats.desaprobados, color: '#16A34A' },
    { name: 'Aprobados (6-10)', value: gradeStats.aprobados, color: '#2563EB' },
  ].filter(d => d.value > 0);

  // Estadísticas globales de asistencia para el reporte impreso
  const globalAttendanceStats = useMemo(() => {
    const records = tempStudent.attendance || [];
    const total = records.length;
    const presentes = records.filter(r => r.type === 'presente').length;
    const ausentes = records.filter(r => r.type === 'ausente').length;
    const ausentesJustificados = records.filter(r => r.type === 'ausente' && r.justified).length;
    const ausentesInjustificados = ausentes - ausentesJustificados;
    const tardes = records.filter(r => r.type === 'tarde').length;
    const percent = total > 0 ? Math.round(((presentes + (tardes * 0.5)) / total) * 100) : 100;
    return {
      total,
      presentes,
      ausentes,
      ausentesJustificados,
      ausentesInjustificados,
      tardes,
      percent
    };
  }, [tempStudent.attendance]);

  // Resumen académico de calificaciones para el reporte impreso
  const academicGradesSummary = useMemo(() => {
    let totalPoints = 0;
    let gradedSubjects = 0;
    let passedCount = 0;
    let failedCount = 0;

    subjects.forEach(subject => {
      const final = tempStudent.grades[subject]?.final;
      if (typeof final === 'number') {
        totalPoints += final;
        gradedSubjects++;
        if (final >= 6) {
          passedCount++;
        } else {
          failedCount++;
        }
      }
    });

    const average = gradedSubjects > 0 ? (totalPoints / gradedSubjects).toFixed(2) : '-';
    return { average, gradedSubjects, passedCount, failedCount };
  }, [subjects, tempStudent.grades]);

  // Función para impresión optimizada con estilos CSS de index.html y nombre sugerido de archivo PDF
  const handlePrintOptimizedLegajo = () => {
    const originalTitle = document.title;
    const cleanName = tempStudent.fullName.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
    const cleanDni = tempStudent.dni ? tempStudent.dni.trim().replace(/[^0-9]/g, '') : 'SDNI';
    const currentYear = schoolInfo.academicYear || new Date().getFullYear();

    // Al asignar document.title antes de llamar a print(), los navegadores (Chrome, Edge, Safari, Android)
    // nombran automáticamente el archivo PDF con este título institucional al elegir "Guardar como PDF"
    document.title = `Legajo_Oficial_${cleanName}_DNI_${cleanDni}_Ciclo_${currentYear}`;

    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };

    window.addEventListener('afterprint', restoreTitle);

    window.print();

    // Respaldo de seguridad para restaurar título tras 2.5 segundos
    setTimeout(restoreTitle, 2500);
  };

  // Plantilla oficial formateada para impresión en papel (A4)
  const renderPrintProfileSheet = () => {
    const cycle = Number(tempStudent.course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado (Agropecuaria)';
    const currentYear = schoolInfo.academicYear || new Date().getFullYear();
    const todayFormatted = new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return (
      <div className="student-print-sheet bg-white text-slate-900 p-2 sm:p-6 print:p-0 max-w-4xl mx-auto">
        {/* Encabezado Institucional de la Escuela */}
        <div className="print-section border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {schoolInfo.logo ? (
                <img
                  src={schoolInfo.logo}
                  alt={schoolInfo.name}
                  className="w-12 h-12 rounded-xl object-contain border border-slate-400 bg-white p-0.5 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full border-2 border-slate-900 flex flex-col items-center justify-center font-black text-[10px] leading-tight text-slate-900 bg-slate-50 shrink-0">
                  <span>ESC.</span>
                  <span>SEC.</span>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  {schoolInfo.province ? `Provincia de ${schoolInfo.province} • Ministerio de Educación` : 'Ministerio de Educación'}
                </p>
                <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                  {schoolInfo.name}
                </h1>
                <p className="text-[10px] text-slate-600 font-medium">
                  {schoolInfo.address}
                  {schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : ''}
                  {schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}
                </p>
              </div>
            </div>
            <div className="text-right border-l-2 border-slate-300 pl-4 shrink-0">
              <span className="inline-block bg-slate-100 text-slate-800 border border-slate-400 text-[10px] font-black px-2 py-0.5 uppercase tracking-wider">
                Legajo Único Escolar
              </span>
              <p className="text-[10px] font-bold text-slate-700 mt-1">
                Ciclo Lectivo: <strong className="text-slate-900">{currentYear}</strong>
              </p>
              <p className="text-[10px] text-slate-500">
                Fecha de Emisión: {todayFormatted}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-300 text-center">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">
              Ficha Académica Integral y Registro de Alumno
            </h2>
          </div>
        </div>

        {/* 1. Datos Personales y Filiatorios */}
        <div className="print-section mb-3">
          <div className="bg-slate-100 border border-slate-400 px-3 py-1 font-black text-[10px] uppercase tracking-wider text-slate-800 flex justify-between items-center">
            <span>1. Datos Filiatorios y de Matrícula</span>
            <span className="font-mono text-[9px] text-slate-600 font-normal">Matrícula: {tempStudent.id} • Condición: REGULAR</span>
          </div>
          <div className="flex border-x border-b border-slate-400">
            {/* Foto Oficial del Alumno */}
            <div className="w-24 shrink-0 border-r border-slate-400 p-2 flex flex-col items-center justify-center bg-slate-50 text-center">
              {tempStudent.photo ? (
                <img 
                  src={tempStudent.photo} 
                  alt={tempStudent.fullName} 
                  className="w-20 h-24 object-cover border border-slate-400 shadow-xs" 
                />
              ) : (
                <div className="w-20 h-24 border border-dashed border-slate-400 flex flex-col items-center justify-center text-slate-400 bg-white">
                  <User size={28} className="text-slate-300" />
                  <span className="text-[7.5px] font-bold mt-1 uppercase text-slate-400 text-center leading-tight">FOTO 4x4</span>
                </div>
              )}
              <span className="text-[7px] font-bold text-slate-600 mt-1 uppercase tracking-wider">Foto Oficial</span>
            </div>

            {/* Tabla de Datos Filiatorios */}
            <table className="print-table flex-1 m-0 border-0 text-xs">
              <tbody>
                <tr>
                  <td className="bg-slate-50 font-bold w-1/4">Apellido y Nombre:</td>
                  <td className="font-black text-slate-900 w-1/4">{tempStudent.fullName}</td>
                  <td className="bg-slate-50 font-bold w-1/4">D.N.I. N°:</td>
                  <td className="font-bold w-1/4">{tempStudent.dni || 'Sin registrar'}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 font-bold">Fecha de Nacimiento:</td>
                  <td>{tempStudent.birthDate || 'No informada'} ({calculateAge(tempStudent.birthDate)} años)</td>
                  <td className="bg-slate-50 font-bold">Curso y Ciclo:</td>
                  <td><strong>{tempStudent.course}° Año</strong> – {cycle}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 font-bold">Domicilio Declarado:</td>
                  <td>{tempStudent.address || 'No declarado'}</td>
                  <td className="bg-slate-50 font-bold">Situación Académica:</td>
                  <td>
                    <span className={`font-black uppercase ${promotion.status === 'Repite' ? 'text-red-700' : 'text-slate-900'}`}>
                      {promotion.status}
                    </span>
                    {promotion.failedCount > 0 ? ` (${promotion.failedCount} adeudadas)` : ' (Promovido / Regular)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Situación de Asistencia y Presencialidad */}
        <div className="print-section mb-4">
          <div className="bg-slate-100 border border-slate-400 px-3 py-1 font-black text-[10px] uppercase tracking-wider text-slate-800">
            2. Situación de Asistencia y Presencialidad
          </div>
          <table className="print-table w-full text-center text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th>Jornadas Computadas</th>
                <th>Días Presente</th>
                <th>Ausencias Justificadas</th>
                <th>Ausencias Injustificadas</th>
                <th>Tardanzas</th>
                <th>% Asistencia Efectiva</th>
                <th>Condición Reglamentaria</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-bold">{globalAttendanceStats.total}</td>
                <td className="font-bold text-slate-900">{globalAttendanceStats.presentes}</td>
                <td>{globalAttendanceStats.ausentesJustificados}</td>
                <td className={globalAttendanceStats.ausentesInjustificados > 0 ? 'font-bold text-red-700' : ''}>
                  {globalAttendanceStats.ausentesInjustificados}
                </td>
                <td>{globalAttendanceStats.tardes}</td>
                <td className="font-black text-sm text-slate-900">
                  {globalAttendanceStats.percent}%
                </td>
                <td className="font-bold text-[10px]">
                  {globalAttendanceStats.percent >= 80 ? (
                    <span className="text-emerald-800">REGULAR (&ge; 80%)</span>
                  ) : (
                    <span className="text-red-700">EN RIESGO (&gt; 20% inasistencias)</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 3. Registro de Calificaciones por Espacio Curricular */}
        <div className="print-section mb-4">
          <div className="bg-slate-100 border border-slate-400 px-3 py-1 font-black text-[10px] uppercase tracking-wider text-slate-800">
            3. Registro de Calificaciones por Espacio Curricular
          </div>
          <table className="print-table w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-center w-8">N°</th>
                <th className="text-left">Espacio Curricular</th>
                <th className="text-center w-24">1° Trimestre</th>
                <th className="text-center w-24">2° Trimestre</th>
                <th className="text-center w-24">3° Trimestre</th>
                <th className="text-center w-24 bg-slate-200">Nota Final</th>
                <th className="text-center w-28">Estado</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subject, idx) => {
                const grade = tempStudent.grades[subject] || {};
                const final = grade.final;
                let statusLabel = 'En Curso';
                let statusClass = 'text-slate-600';

                if (typeof final === 'number') {
                  if (final >= 6) {
                    statusLabel = 'Aprobado';
                    statusClass = 'font-bold text-slate-900';
                  } else {
                    statusLabel = 'Pendiente';
                    statusClass = 'font-bold text-red-700';
                  }
                }

                return (
                  <tr key={subject} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="text-center text-slate-500 font-mono text-[10px]">{idx + 1}</td>
                    <td className="text-left font-medium text-slate-900">{subject}</td>
                    <td className="text-center font-mono">{grade.trimestre1 ?? '-'}</td>
                    <td className="text-center font-mono">{grade.trimestre2 ?? '-'}</td>
                    <td className="text-center font-mono">{grade.trimestre3 ?? '-'}</td>
                    <td className="text-center font-mono font-bold bg-slate-100/80">{final ?? '-'}</td>
                    <td className={`text-center text-[10px] ${statusClass}`}>{statusLabel}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                <td colSpan={2} className="text-left pl-3 uppercase text-[10px]">
                  Resumen de Acreditación
                </td>
                <td colSpan={3} className="text-right pr-2 text-[10px]">
                  Aprobadas: <strong>{academicGradesSummary.passedCount}</strong> / Desaprobadas: <strong>{academicGradesSummary.failedCount}</strong>
                </td>
                <td className="text-center font-mono font-black text-xs bg-slate-200">
                  {academicGradesSummary.average}
                </td>
                <td className="text-center text-[10px] font-black uppercase">
                  {promotion.status}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 4. Ficha Médica y 5. Disciplina en grilla para aprovechar la hoja */}
        <div className="print-section grid grid-cols-2 gap-3 mb-4">
          <div className="border border-slate-300">
            <div className="bg-slate-100 border-b border-slate-300 px-2 py-1 font-black text-[9px] uppercase tracking-wider text-slate-800">
              4. Antecedentes Médicos y Sanitarios
            </div>
            <div className="p-2 space-y-1.5 text-[10px]">
              <div>
                <span className="font-bold text-slate-600 block">Tratamientos Médicos:</span>
                <p className="text-slate-900">{tempStudent.medical?.treatments || 'Ninguno informado'}</p>
              </div>
              <div>
                <span className="font-bold text-slate-600 block">Medicación Prescrita:</span>
                <p className="text-slate-900">{tempStudent.medical?.medications || 'Sin medicación informada'}</p>
              </div>
              <div>
                <span className="font-bold text-slate-600 block">Observaciones / Alergias:</span>
                <p className="text-slate-900">{tempStudent.medical?.notes || 'Sin observaciones médicas registradas'}</p>
              </div>
            </div>
          </div>

          <div className="border border-slate-300">
            <div className="bg-slate-100 border-b border-slate-300 px-2 py-1 font-black text-[9px] uppercase tracking-wider text-slate-800">
              5. Historial Disciplinario y Convivencia
            </div>
            <div className="p-2 text-[10px]">
              {tempStudent.disciplinary && tempStudent.disciplinary.length > 0 ? (
                <ul className="list-disc list-inside space-y-1 text-slate-800">
                  {tempStudent.disciplinary.map((item, idx) => (
                    <li key={idx} className="leading-snug">{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600 italic py-2 text-center">
                  Conducta ejemplar. Sin sanciones ni registros de disciplina en el ciclo lectivo.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 6. Espacio Oficial de Firmas */}
        <div className="print-section print-avoid-break mt-6 pt-4 border-t border-slate-400">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center">
              <div className="w-40 border-b border-slate-700 mb-1 h-8"></div>
              <span className="font-bold text-[10px] uppercase text-slate-800">Firma Preceptor/a</span>
              <span className="text-[8px] text-slate-500">Aclaración y DNI</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-40 border-b border-slate-700 mb-1 h-8"></div>
              <span className="font-bold text-[10px] uppercase text-slate-800">{schoolInfo.principalName || 'Firma y Sello Dirección'}</span>
              <span className="text-[8px] text-slate-500">{schoolInfo.name}</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-40 border-b border-slate-700 mb-1 h-8"></div>
              <span className="font-bold text-[10px] uppercase text-slate-800">Firma Padre / Tutor</span>
              <span className="text-[8px] text-slate-500">Notificación Recibida</span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-slate-200 text-center text-[8px] text-slate-500">
            Documento institucional oficial emitido por el Sistema de Gestión Escolar • {schoolInfo.name} • {schoolInfo.address}.
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print aero-glass p-4 sm:p-6 rounded-2xl">
        <div className="flex items-center gap-4 sm:gap-5">
          <button onClick={onBack} className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center bg-sky-100/80 hover:bg-sky-200/80 rounded-full text-sky-800 transition-all shrink-0">
            <ArrowLeft size={22} />
          </button>
          
          {/* Foto o Avatar en cabecera */}
          {tempStudent.photo ? (
            <img 
              src={tempStudent.photo} 
              alt={tempStudent.fullName} 
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-blue-500 shadow-md shrink-0" 
            />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-blue-100 text-blue-900 font-black text-xl sm:text-2xl flex items-center justify-center border-2 border-blue-200 shadow-sm shrink-0">
              {tempStudent.fullName.charAt(0)}
            </div>
          )}

          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-blue-900 tracking-tight leading-tight">{student.fullName}</h2>
            <p className="text-xs sm:text-sm font-bold text-gray-500 uppercase tracking-widest mt-0.5">
              {student.course}° Año • DNI: {student.dni || 'Sin registrar'} • {calculateAge(student.birthDate)} años
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button 
                type="button"
                onClick={() => setShowReportCardModal(true)} 
                className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-blue-950 rounded-xl transition-all font-black text-xs shadow-md active:scale-95"
                title="Visualizar y descargar Libreta Oficial de Calificaciones institucional"
            >
                <Award size={16} />
                <span>LIBRETA OFICIAL</span>
            </button>
            <button 
                onClick={() => generateStudentPDFReport(tempStudent, schoolInfo)} 
                className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all font-bold text-xs shadow-md active:scale-95"
                title="Generar y descargar informe resumen en formato PDF"
            >
                <FileDown size={16} />
                <span className="hidden sm:inline">REPORTE PDF</span>
            </button>
            <button 
                onClick={() => setShowPrintPreview(true)} 
                className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all font-bold text-xs shadow-sm"
                title="Vista previa del legajo listo para imprimir en papel"
            >
                <Eye size={16} />
                <span className="hidden sm:inline">VISTA PREVIA</span>
            </button>
            <button 
                type="button"
                onClick={handlePrintOptimizedLegajo} 
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl transition-all font-bold text-xs shadow-md active:scale-95"
                title="Imprimir legajo escolar del alumno o Guardar como PDF con estilos CSS oficiales (A4)"
            >
                <Printer size={16} />
                <span>IMPRIMIR / PDF</span>
            </button>
          {isEditing ? (
            <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg transition-all font-bold text-xs">
              <Save size={16} /> GUARDAR
            </button>
          ) : (
            <button onClick={() => setIsEditing(true)} className="px-5 py-2.5 bg-white border-2 border-blue-600 text-blue-600 rounded-xl hover:bg-blue-50 transition-all font-bold text-xs">
              EDITAR
            </button>
          )}
          {onDelete && (
            <button 
              type="button"
              onClick={() => setShowDeleteModal(true)} 
              className="flex items-center gap-1.5 px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-bold text-xs shadow-md active:scale-95"
              title="Eliminar este alumno del sistema"
            >
              <Trash2 size={15} />
              <span className="hidden sm:inline">Eliminar</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Vista interactiva en pantalla (oculta automáticamente durante impresión) */}
      <div className="student-screen-view no-print space-y-6">
        <div className="flex border-b-2 border-gray-100 gap-1 overflow-x-auto">
        {(['info', 'grades', 'trajectory', 'calendar', 'attendance', 'medical', 'discipline'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 md:px-7 py-4 font-black text-xs uppercase tracking-widest transition-all relative shrink-0 ${
              activeTab === tab ? 'text-blue-700 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab === 'info' && 'Información'}
            {tab === 'grades' && 'Calificaciones'}
            {tab === 'trajectory' && 'Trayectoria'}
            {tab === 'calendar' && 'Calendario de Asistencia'}
            {tab === 'attendance' && 'Planilla y Cómputo'}
            {tab === 'medical' && 'Médico'}
            {tab === 'discipline' && 'Disciplina'}
            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-700" />}
          </button>
        ))}
      </div>

      <div className="aero-glass rounded-2xl p-4 sm:p-8 min-h-[650px]">
        {photoFeedback && (
          <div
            className={`mb-5 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between gap-3 border ${
              photoFeedback.type === 'error'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            <span>{photoFeedback.text}</span>
            <button type="button" onClick={() => setPhotoFeedback(null)} className="underline">
              Cerrar
            </button>
          </div>
        )}
        {activeTab === 'info' && (
          <div className="grid md:grid-cols-2 gap-10 lg:gap-16 animate-in fade-in duration-500">
            {/* Inputs ocultos para adjuntar foto */}
            <input 
              type="file" 
              ref={photoFileInputRef} 
              accept="image/*" 
              className="hidden" 
              onChange={handlePhotoFileSelect} 
            />
            <input 
              type="file" 
              ref={cameraInputRef} 
              accept="image/*" 
              capture="user" 
              className="hidden" 
              onChange={handlePhotoFileSelect} 
            />

            <div className="space-y-8">
              {/* Sección de Fotografía del Alumno con Menú Desplegable */}
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  {/* Contenedor de la Foto */}
                  <div className="relative group shrink-0">
                    {tempStudent.photo ? (
                      <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl overflow-hidden border-4 border-white shadow-xl bg-slate-200">
                        <img 
                          src={tempStudent.photo} 
                          alt={tempStudent.fullName} 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                    ) : (
                      <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-3xl border-4 border-dashed border-blue-200 bg-blue-50/70 flex flex-col items-center justify-center text-blue-400 shadow-inner">
                        <ImageIcon size={36} className="mb-1" />
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">Sin Foto</span>
                      </div>
                    )}
                    {tempStudent.photo && (
                      <span className="absolute bottom-1 right-1 bg-emerald-500 text-white p-1.5 rounded-full shadow-md" title="Foto cargada">
                        <CheckCircle2 size={14} />
                      </span>
                    )}
                  </div>

                  {/* Información y Menú Desplegable */}
                  <div className="flex-1 text-center sm:text-left space-y-2 relative">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">
                      Fotografía del Estudiante
                    </span>
                    <h4 className="font-black text-lg text-blue-950">
                      {tempStudent.photo ? 'Foto de Perfil Registrada' : 'Adjuntar Fotografía Oficial'}
                    </h4>
                    <p className="text-xs text-gray-500 font-medium leading-relaxed">
                      Seleccione una foto desde una carpeta de su equipo (computadora o celular) para la credencial y ficha del alumno.
                    </p>

                    {/* Botón con Menú Desplegable */}
                    <div className="relative inline-block text-left pt-1">
                      <button
                        type="button"
                        onClick={() => setIsPhotoMenuOpen(!isPhotoMenuOpen)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95"
                      >
                        <Camera size={16} className="text-amber-300" />
                        <span>{tempStudent.photo ? 'Opciones de Foto' : 'Adjuntar Foto del Alumno'}</span>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${isPhotoMenuOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Menú Desplegable */}
                      {isPhotoMenuOpen && (
                        <div className="absolute left-0 sm:left-auto right-auto sm:right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 py-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                          <div className="px-4 py-2 border-b border-gray-100">
                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                              Opciones de Fotografía
                            </p>
                          </div>

                          {/* Opción 1: Carpeta del equipo */}
                          <button
                            type="button"
                            onClick={() => {
                              photoFileInputRef.current?.click();
                              setIsPhotoMenuOpen(false);
                            }}
                            className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-blue-50 transition-colors group"
                          >
                            <div className="p-2 rounded-xl bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                              <FolderOpen size={18} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900 leading-tight">
                                Seleccionar desde carpeta del equipo...
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Abre el explorador de archivos local (PNG, JPG, WebP)
                              </p>
                            </div>
                          </button>

                          {/* Opción 2: Cámara */}
                          <button
                            type="button"
                            onClick={() => {
                              cameraInputRef.current?.click();
                              setIsPhotoMenuOpen(false);
                            }}
                            className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-emerald-50 transition-colors group"
                          >
                            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                              <Camera size={18} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900 leading-tight">
                                Tomar foto con la cámara
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Cámara integrada de celular, tablet o notebook
                              </p>
                            </div>
                          </button>

                          {/* Opción 3: Enlace URL */}
                          <button
                            type="button"
                            onClick={handleUrlPhoto}
                            className="w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-purple-50 transition-colors group"
                          >
                            <div className="p-2 rounded-xl bg-purple-100 text-purple-700 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                              <Globe size={18} />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900 leading-tight">
                                Pegar enlace / URL de imagen...
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Vincular imagen alojada en la web
                              </p>
                            </div>
                          </button>

                          {/* Opción 4: Quitar foto */}
                          {tempStudent.photo && (
                            <div className="pt-1 mt-1 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={handleRemovePhoto}
                                className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-red-50 text-red-600 transition-colors"
                              >
                                <Trash2 size={16} />
                                <span className="text-xs font-bold">Quitar foto actual</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <h3 className="font-black text-2xl text-blue-900 flex items-center gap-3"><User size={28}/> Datos Personales</h3>
              <div className="grid grid-cols-1 gap-8">
                <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Nombre Completo</label>
                  {isEditing ? <input className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-xl font-bold bg-transparent" value={tempStudent.fullName} onChange={e => setTempStudent({...tempStudent, fullName: e.target.value})} /> : <span className="text-xl font-bold text-gray-900">{student.fullName}</span>}
                </div>
                <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">DNI</label>
                  {isEditing ? <input className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-xl font-bold bg-transparent" value={tempStudent.dni} onChange={e => setTempStudent({...tempStudent, dni: e.target.value})} /> : <span className="text-xl font-bold text-gray-900">{student.dni}</span>}
                </div>
                <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fecha de Nacimiento</label>
                  {isEditing ? <input type="date" className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-xl font-bold bg-transparent" value={tempStudent.birthDate} onChange={e => setTempStudent({...tempStudent, birthDate: e.target.value})} /> : <span className="text-xl font-bold text-gray-900">{student.birthDate}</span>}
                </div>
                <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Domicilio Declarado</label>
                  {isEditing ? <input className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-xl font-bold bg-transparent" value={tempStudent.address} onChange={e => setTempStudent({...tempStudent, address: e.target.value})} /> : <span className="text-xl font-bold text-gray-900">{student.address}</span>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Curso</label>
                    {isEditing ? (
                      <select
                        className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-lg font-bold bg-transparent text-gray-900"
                        value={tempStudent.course}
                        onChange={(e) => setTempStudent({ ...tempStudent, course: e.target.value as CourseYear })}
                      >
                        {(['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((yr) => (
                          <option key={yr} value={yr}>{yr}° Año</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xl font-bold text-gray-900">{student.course}° Año</span>
                    )}
                  </div>
                  <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">División</label>
                    {isEditing ? (
                      <input
                        className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-lg font-bold bg-transparent uppercase"
                        placeholder="Ej: A"
                        value={tempStudent.division || ''}
                        onChange={(e) => setTempStudent({ ...tempStudent, division: e.target.value.toUpperCase() })}
                      />
                    ) : (
                      <span className="text-xl font-bold text-gray-900">{student.division || 'Única'}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col border-l-4 border-blue-100 pl-4 py-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                    Estado de Matriculación (Ciclo Lectivo)
                  </label>
                  {isEditing ? (
                    <select
                      value={tempStudent.enrollmentStatus || 'regular'}
                      onChange={(e) =>
                        setTempStudent({
                          ...tempStudent,
                          enrollmentStatus: e.target.value as StudentEnrollmentStatus,
                          enrollmentStatusDate: getLocalTodayISO(),
                        })
                      }
                      className="border-b-2 border-gray-200 focus:border-blue-500 outline-none py-2 text-lg font-bold bg-transparent text-gray-900"
                    >
                      {(Object.keys(ENROLLMENT_STATUS_LABELS) as StudentEnrollmentStatus[]).map(
                        (statusKey) => (
                          <option key={statusKey} value={statusKey}>
                            {ENROLLMENT_STATUS_LABELS[statusKey]}
                          </option>
                        )
                      )}
                    </select>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-xl text-xs font-extrabold border ${
                          student.enrollmentStatus === 'baja_abandono'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : student.enrollmentStatus === 'pase_saliente'
                            ? 'bg-orange-50 text-orange-800 border-orange-200'
                            : student.enrollmentStatus === 'en_riesgo'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : student.enrollmentStatus === 'egresado'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        {ENROLLMENT_STATUS_LABELS[student.enrollmentStatus || 'regular']}
                      </span>
                      {student.enrollmentStatusDate && (
                        <span className="text-xs text-gray-400 font-semibold">
                          Actualizado: {student.enrollmentStatusDate}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="space-y-8">
                <h3 className="font-black text-2xl text-blue-900 flex items-center gap-3"><GraduationCap size={28}/> Situación Académica</h3>
                <div className={`p-8 rounded-3xl border-2 shadow-sm transition-all flex flex-col items-center text-center ${promotion.status === 'Repite' ? 'bg-red-50 border-red-200 text-red-700' : promotion.status === 'Promocionado' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                    <AlertTriangle size={48} className="mb-4" />
                    <p className="font-black text-4xl uppercase tracking-tighter mb-2">{promotion.status}</p>
                    <p className="text-sm font-bold opacity-80 mb-4 italic">Espacios curriculares adeudados: {promotion.failedCount}</p>
                    <div className="bg-white/50 p-4 rounded-2xl text-xs font-medium leading-relaxed">
                      {promotion.status === 'Repite' ? '⚠️ Al adeudar 3 o más espacios curriculares, el alumno debe recursar el año lectivo.' : '✅ Cumple con las condiciones de permanencia o promoción.'}
                    </div>
                    <button
                      onClick={() => generateStudentPDFReport(tempStudent, schoolInfo)}
                      className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 min-h-[44px] px-4 bg-white/90 hover:bg-white text-gray-800 font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all border border-gray-200 hover:shadow"
                    >
                      <FileDown size={15} /> Descargar Informe PDF de Situación
                    </button>
                </div>
                
                {chartData.length > 0 && (
                  <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 shadow-inner">
                    <p className="text-[10px] font-black text-center text-gray-400 uppercase tracking-[0.2em] mb-6">Rendimiento por Escala</p>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value">
                            {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />)}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 15px 30px -10px rgba(0,0,0,0.1)' }} />
                          <Legend verticalAlign="bottom" iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50/50 p-5 rounded-3xl border border-blue-100 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 block">
                        Seguimiento Individual
                      </span>
                      <p className="text-sm font-black text-gray-900">
                        Calendario Mensual de Asistencia
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('calendar')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <span>Ver Calendario</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                <div className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100 shadow-sm flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md">
                      <LineChartIcon size={20} />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                        Trayectoria Académica
                      </span>
                      <p className="text-sm font-black text-gray-900">
                        Evolución de Calificaciones por Trimestre
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('grades')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <span>Ver Gráfico</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <StudentAttendanceCalendar
            student={tempStudent}
            onUpdateAttendance={(newAttendance) => {
              const updated = { ...tempStudent, attendance: newAttendance };
              setTempStudent(updated);
              onUpdate(updated);
            }}
            isEditing={isEditing}
          />
        )}

        {activeTab === 'grades' && (
          <div className="animate-in slide-in-from-right-4 duration-500 space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 no-print">
               <div>
                 <h3 className="font-black text-2xl text-blue-900">Panel de Calificaciones</h3>
                 <p className="text-xs text-gray-500 font-medium mt-0.5">
                   La nota final es el promedio ponderado de las calificaciones obtenidas en el 1°, 2° y 3° trimestre.
                 </p>
               </div>
               <div className="flex flex-wrap items-center gap-2.5">
                 <button
                   type="button"
                   onClick={handleRecalculateAllFinalGrades}
                   className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-900 hover:bg-blue-100 rounded-xl font-black text-xs uppercase tracking-wider transition-all border border-blue-200 shadow-sm active:scale-95"
                   title="Recalcular automáticamente la Nota Final de todas las materias como el promedio de los 3 trimestres"
                 >
                   <Sparkles size={15} className="text-amber-500" />
                   <span>Recalcular Promedios</span>
                 </button>
                 <button 
                   onClick={() => setShowReportCardModal(true)}
                   className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-blue-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95"
                   title="Visualizar e imprimir la Libreta Oficial de Calificaciones"
                 >
                   <Award size={15} />
                   <span>Libreta Oficial</span>
                 </button>
                 <button 
                   onClick={() => generateStudentPDFReport(tempStudent, schoolInfo)}
                   className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-700 rounded-xl hover:bg-rose-100 font-black text-xs uppercase tracking-widest transition-all shadow-sm border border-rose-200"
                   title="Descargar resumen en formato PDF"
                 >
                   <FileDown size={15} />
                   <span>REPORTE PDF</span>
                 </button>
                 <button 
                   onClick={() => exportBulletinToExcel(tempStudent, schoolInfo)}
                   className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 font-black text-xs uppercase tracking-widest transition-all shadow-sm border border-green-200"
                 >
                   <FileDown size={15} />
                   <span>BOLETÍN (.XLSX)</span>
                 </button>
               </div>
            </div>

            {/* Banner explicativo del régimen de promedio */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-md">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h4 className="font-black text-xs uppercase tracking-wider text-blue-950">
                    Cálculo Automático de Nota Final por Promedio
                  </h4>
                  <p className="text-xs text-blue-900 font-medium">
                    En cada espacio curricular, la <strong>Nota Final</strong> equivale al <strong>promedio exacto de las calificaciones del 1° Trimestre, 2° Trimestre y 3° Trimestre</strong> (escala 1 a 10, aprobación con 6 o más).
                  </p>
                </div>
              </div>
              <span className="bg-white px-3 py-1.5 rounded-xl border border-blue-200 text-blue-900 font-black text-xs shrink-0 shadow-sm">
                Aprobación: ≥ 6
              </span>
            </div>

            {/* Gráfico de Líneas Recharts: Evolución de Calificaciones a lo largo de los Trimestres */}
            <StudentGradesEvolutionChart student={tempStudent} schoolInfo={schoolInfo} />

            <div className="overflow-x-auto rounded-3xl border-2 border-gray-100 shadow-sm bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-blue-900 text-white uppercase text-[10px] font-black tracking-[0.15em]">
                    <th className="p-4 sm:p-5 text-left w-1/3">Espacio Curricular</th>
                    <th className="p-4 sm:p-5 text-center">1° Trimestre</th>
                    <th className="p-4 sm:p-5 text-center">2° Trimestre</th>
                    <th className="p-4 sm:p-5 text-center">3° Trimestre</th>
                    <th className="p-4 sm:p-5 text-center bg-blue-950">
                      Nota Final (Promedio)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subjects.map(subject => {
                    const grade = tempStudent.grades[subject] || {};
                    const t1 = grade.trimestre1;
                    const t2 = grade.trimestre2;
                    const t3 = grade.trimestre3;
                    const trimesters = [t1, t2, t3].filter((n): n is number => typeof n === 'number' && !isNaN(n));
                    const rawAverage = trimesters.length > 0
                      ? trimesters.reduce((a, b) => a + b, 0) / trimesters.length
                      : null;
                    const exactAverage = rawAverage !== null ? rawAverage.toFixed(1) : null;
                    const computedFinal = rawAverage !== null ? Math.round(rawAverage) : undefined;

                    return (
                      <tr key={subject} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-4 sm:p-5 font-bold text-gray-800 text-xs sm:text-sm">{subject}</td>
                        
                        {/* Trimestres 1, 2 y 3 */}
                        {(['trimestre1', 'trimestre2', 'trimestre3'] as const).map((field) => (
                          <td key={field} className="p-3 text-center">
                            {isEditing ? (
                              <input 
                                type="number" 
                                className={`w-16 text-center border-b-2 border-transparent focus:border-blue-500 bg-transparent py-2 font-black text-lg ${getGradeColor(grade[field])}`}
                                value={grade[field] ?? ''}
                                onChange={(e) => handleGradeChange(subject, field, e.target.value)}
                                min="1" max="10"
                                placeholder="-"
                              />
                            ) : (
                              <span className={`text-lg sm:text-xl font-bold ${getGradeColor(grade[field])}`}>
                                {grade[field] ?? '-'}
                              </span>
                            )}
                          </td>
                        ))}

                        {/* Nota Final (solo cálculo automático del promedio de los tres trimestres) */}
                        <td
                          className="p-3 text-center bg-blue-50/40 select-none"
                          title="Calculado automáticamente a partir del promedio del 1°, 2° y 3° trimestre"
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span className={`text-lg sm:text-xl font-black ${getGradeColor(computedFinal)}`}>
                              {computedFinal ?? '-'}
                            </span>
                            {exactAverage && (
                              <span className={`text-[10px] ${isEditing ? 'text-blue-700 font-black' : 'text-gray-500 font-bold'}`}>
                                Promedio: {exactAverage}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="animate-in slide-in-from-right-4 duration-500 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
               <div>
                  <h3 className="font-black text-2xl text-blue-900 flex items-center gap-3">
                    <Calendar className="text-blue-600" /> Monitor de Presencialidad
                  </h3>
                  <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">
                    Visualización del Ciclo Lectivo por Calendario
                  </p>
               </div>
               <div className="flex gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100">
                 <button onClick={() => addAttendance('presente')} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 text-[10px] font-black uppercase tracking-widest transition-all">Presente</button>
                 <button onClick={() => handleManualAttendance('tarde')} className="bg-yellow-500 text-white px-5 py-2.5 rounded-xl hover:bg-yellow-600 text-[10px] font-black uppercase tracking-widest transition-all">Tarde</button>
                 <button onClick={() => handleManualAttendance('ausente')} className="bg-red-500 text-white px-5 py-2.5 rounded-xl hover:bg-red-600 text-[10px] font-black uppercase tracking-widest transition-all">Ausente</button>
               </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
               {[{ label: 'TOTAL MES', val: monthStats.total, color: '#111827' },
                 { label: 'PRESENTES', val: monthStats.presentes, color: '#2563EB' },
                 { label: 'AUSENTES', val: monthStats.ausentes, color: '#DC2626' },
                 { label: 'TARDE', val: monthStats.tardes, color: '#EAB308' }].map(stat => (
                 <div key={stat.label} className="p-6 rounded-2xl border-2 border-gray-50 text-center shadow-sm bg-white" style={{ borderBottom: `4px solid ${stat.color}` }}>
                    <span className="block text-4xl font-black" style={{ color: stat.color }}>{stat.val}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest mt-1 block opacity-60">{stat.label}</span>
                 </div>
               ))}
            </div>

            {/* Nuevo Gráfico de Barras Mensual */}
            <div className="bg-white border-2 border-gray-100 rounded-3xl p-8 shadow-sm no-print">
               <div className="flex items-center gap-3 mb-6">
                  <BarChartIcon className="text-blue-600" size={20} />
                  <h4 className="text-lg font-black text-blue-900 uppercase tracking-tight">Historial de Asistencia Mensual ({schoolInfo.academicYear || new Date().getFullYear()})</h4>
               </div>
               <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={monthlyAttendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 15px 30px -10px rgba(0,0,0,0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                        <Bar dataKey="Presentes" fill="#2563EB" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Ausentes" fill="#DC2626" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Tardes" fill="#EAB308" radius={[4, 4, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-8 bg-white border-2 border-gray-100 rounded-3xl p-8 shadow-sm">
                    {/* Header del Calendario */}
                    <div className="flex items-center justify-between mb-8">
                        <button 
                            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))}
                            className="p-3 hover:bg-gray-100 rounded-2xl transition-all"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <h4 className="text-xl font-black text-gray-800 uppercase tracking-widest">
                            {viewDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                        </h4>
                        <button 
                            onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))}
                            className="p-3 hover:bg-gray-100 rounded-2xl transition-all"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    {/* Grilla del Calendario */}
                    <div className="grid grid-cols-7 gap-3">
                        {['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'].map(d => (
                            <div key={d} className="text-center text-[10px] font-black text-gray-400 pb-4">{d}</div>
                        ))}
                        {calendarDays.map((dateStr, idx) => {
                            if (!dateStr) return <div key={idx} className="h-16 md:h-24 bg-gray-50/30 rounded-2xl" />;
                            
                            const att = getAttendanceForDate(dateStr);
                            const isToday = dateStr === getLocalTodayISO();
                            const isSelected = selectedCalendarDate === dateStr;

                            return (
                                <div 
                                    key={dateStr}
                                    onClick={() => setSelectedCalendarDate(dateStr)}
                                    className={`
                                        h-16 md:h-24 rounded-2xl border-2 cursor-pointer transition-all flex flex-col items-center justify-center relative group
                                        ${isSelected ? 'border-blue-600 ring-4 ring-blue-50' : 'border-gray-50 hover:border-blue-200'}
                                        ${isToday ? 'bg-blue-50/50' : 'bg-white'}
                                    `}
                                >
                                    <span className={`text-sm md:text-lg font-black ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                                        {dateStr.split('-')[2]}
                                    </span>
                                    {att && (
                                        <div className={`
                                            w-3 h-3 md:w-5 md:h-5 rounded-full absolute bottom-2 right-2 animate-in zoom-in
                                            ${att.type === 'presente' ? 'bg-blue-600' : att.type === 'ausente' ? 'bg-red-600' : 'bg-yellow-500'}
                                        `} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Panel de Detalle de Día */}
                <div className="lg:col-span-4 space-y-6">
                    {selectedCalendarDate ? (
                        <div className="bg-blue-900 text-white rounded-[32px] p-8 shadow-xl animate-in slide-in-from-right-4">
                            <h5 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2">Detalle de Jornada</h5>
                            <p className="text-2xl font-black mb-8 leading-tight">
                                {new Date(selectedCalendarDate + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </p>
                            
                            {selectedAttendanceInfo ? (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 bg-white/10 p-4 rounded-2xl border border-white/10">
                                        <div className={`p-3 rounded-xl bg-white text-blue-900`}>
                                            {selectedAttendanceInfo.type === 'presente' ? <CheckCircle2 /> : selectedAttendanceInfo.type === 'ausente' ? <XCircle /> : <Clock />}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-widest opacity-60">Condición</p>
                                            <p className="text-lg font-black uppercase">{selectedAttendanceInfo.type}</p>
                                        </div>
                                    </div>

                                    {(selectedAttendanceInfo.type === 'ausente' || selectedAttendanceInfo.type === 'tarde') && (
                                        <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-2">
                                            <div className="flex items-center gap-2 text-yellow-400">
                                                <Info size={16} />
                                                <span className="text-[10px] font-black uppercase">Observaciones / Motivo</span>
                                            </div>
                                            <p className="text-sm font-medium italic text-blue-100">
                                                {selectedAttendanceInfo.reason || 'No se cargó un motivo específico para este registro.'}
                                            </p>
                                        </div>
                                    )}

                                    {selectedAttendanceInfo.justified && (
                                        <div className="px-4 py-2 bg-green-500/20 text-green-300 rounded-xl text-[10px] font-black uppercase tracking-widest text-center border border-green-500/30">
                                            Inasistencia Justificada
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-10 opacity-40 italic font-medium">
                                    <p className="text-sm">No existen registros administrativos para esta fecha seleccionada.</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-gray-50 border-4 border-dashed border-gray-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center space-y-4 h-full min-h-[400px]">
                            <div className="bg-white p-6 rounded-full shadow-sm">
                                <Info size={48} className="text-gray-200" />
                            </div>
                            <p className="text-gray-300 font-bold uppercase text-xs tracking-widest leading-relaxed">
                                Seleccione un día del calendario <br/> para ver los detalles de asistencia
                            </p>
                        </div>
                    )}
                </div>
            </div>
            <StudentQRAttendanceSection student={tempStudent} />
          </div>
        )}

        {activeTab === 'medical' && (
           <div className="animate-in slide-in-from-right-4 duration-500 space-y-10">
             <div className="flex items-center gap-4 border-l-8 border-blue-600 pl-6 py-2">
                <HeartPulse size={36} className="text-blue-600"/>
                <h3 className="text-3xl font-black text-blue-900 uppercase tracking-tight">Ficha Médica y Sanitaria</h3>
             </div>
             <div className="grid gap-10">
               <div className="bg-blue-50/30 p-8 rounded-3xl border-2 border-blue-100 shadow-sm relative">
                  <label className="absolute -top-4 left-8 px-4 py-1 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full">Tratamientos Vigentes</label>
                  {isEditing ? (
                    <textarea className="w-full bg-white border-2 border-blue-100 rounded-2xl p-6 focus:ring-4 focus:ring-blue-100 outline-none text-gray-700 font-medium" rows={5} value={tempStudent.medical.treatments} onChange={e => setTempStudent({...tempStudent, medical: {...tempStudent.medical, treatments: e.target.value}})} placeholder="Describa diagnósticos y tratamientos actuales..." />
                  ) : <div className="min-h-[120px] text-gray-700 leading-relaxed font-bold text-lg">{student.medical.treatments || 'No se declaran tratamientos específicos.'}</div>}
               </div>
               <div className="bg-red-50/30 p-8 rounded-3xl border-2 border-red-100 shadow-sm relative">
                  <label className="absolute -top-4 left-8 px-4 py-1 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-full">Medicación Requerida</label>
                  {isEditing ? (
                    <textarea className="w-full bg-white border-2 border-red-100 rounded-2xl p-6 focus:ring-4 focus:ring-red-100 outline-none text-gray-700 font-medium" rows={5} value={tempStudent.medical.medications} onChange={e => setTempStudent({...tempStudent, medical: {...tempStudent.medical, medications: e.target.value}})} placeholder="Indique fármacos, dosis y horarios si corresponde..." />
                  ) : <div className="min-h-[120px] text-gray-700 leading-relaxed font-bold text-lg">{student.medical.medications || 'No requiere administración de medicación en horario escolar.'}</div>}
               </div>
             </div>
           </div>
        )}

        {activeTab === 'trajectory' && (
          <div className="animate-in fade-in duration-300 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-[#0c2d48] flex items-center gap-2">
                  <BookOpen size={22} className="text-sky-600" />
                  <span>Trayectoria Escolar (1.º a 6.º Año)</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                  ID {tempStudent.id} · DNI {tempStudent.dni || 'S/D'} · Año de ingreso:{' '}
                  <strong>{resolvedTrajectory.entryYear}</strong> · Curso actual:{' '}
                  <strong>{tempStudent.course}° Año</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportStudentTrajectoryPDF(
                      tempStudent,
                      resolvedTrajectory,
                      trajectorySummary,
                      disciplinaryIncidents.filter((i) => i.studentId === tempStudent.id),
                      meritConfig,
                      schoolInfo
                    )
                  }
                  className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                >
                  <FileDown size={15} className="text-sky-700" />
                  <span>Exportar Ficha PDF</span>
                </button>
                {onOpenFullTrajectory && (
                  <button
                    type="button"
                    onClick={() => onOpenFullTrajectory(tempStudent)}
                    className="aero-btn-primary flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold"
                  >
                    <ExternalLink size={15} />
                    <span>Gestionar Trayectoria y Orden de Mérito</span>
                  </button>
                )}
              </div>
            </div>

            {/* Indicador visual de requisitos mínimos institucionales de trayectoria y sanciones activas */}
            <MeritStudentEligibilityIndicator
              evaluation={studentMeritEligibility}
              config={meritConfig}
              variant="card"
              onReviewDiscipline={() => setActiveTab('discipline')}
            />

            {/* Los 3 promedios por separado */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/95 rounded-2xl border border-sky-100 p-4 space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-700">
                  Promedio Anual ({trajectorySummary.currentYearSummary?.course || tempStudent.course}° Año)
                </span>
                <p className="text-3xl font-black text-[#0c2d48] tabular-nums">
                  {trajectorySummary.currentYearSummary?.formattedAverage || '—'}
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {trajectorySummary.currentYearSummary?.statusLabel || 'Sin calificaciones'} ·{' '}
                  {trajectorySummary.currentYearSummary?.countedSubjects || 0}/
                  {trajectorySummary.currentYearSummary?.totalApplicableSubjects || 0} materias
                </p>
              </div>

              <div className="bg-white/95 rounded-2xl border border-sky-100 p-4 space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-teal-700">
                  Promedio General Acumulado
                </span>
                <p className="text-3xl font-black text-sky-800 tabular-nums">
                  {trajectorySummary.formattedCumulativeAverage}
                </p>
                <p className="text-xs text-slate-600 tabular-nums">
                  {trajectorySummary.cumulativeStatusLabel} ·{' '}
                  {trajectorySummary.cumulativeCountedSubjects} calif. en{' '}
                  {trajectorySummary.cumulativeCountedYears} ciclo(s)
                </p>
              </div>

              <div className="bg-white/95 rounded-2xl border border-sky-100 p-4 space-y-1">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">
                  Promedio Final (6.º Año)
                </span>
                <p className="text-3xl font-black text-emerald-700 tabular-nums">
                  {trajectorySummary.formattedFinalSixthYearAverage}
                </p>
                <p className="text-xs text-slate-600">
                  {trajectorySummary.finalSixthYearStatusLabel}
                </p>
              </div>
            </div>

            {/* Gráfico de líneas: evolución de promedios anuales 1.º a 6.º Año */}
            <StudentTrajectoryEvolutionChart
              student={tempStudent}
              summary={trajectorySummary}
              meritConfig={meritConfig}
              schoolInfo={schoolInfo}
              variant="full"
            />

            {/* Tabla resumen por año lectivo */}
            <div className="bg-white/95 rounded-2xl border border-sky-100 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-sky-50 text-[11px] font-extrabold uppercase tracking-wider text-sky-900 border-b border-sky-100">
                    <th className="py-3 px-4">Ciclo</th>
                    <th className="py-3 px-3">Curso</th>
                    <th className="py-3 px-3">Condición</th>
                    <th className="py-3 px-3 text-center">Promedio Anual</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-3 text-center">Computadas</th>
                    <th className="py-3 px-3 text-center">Pendientes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs tabular-nums">
                  {trajectorySummary.yearSummaries.map((ys) => (
                    <tr key={ys.yearId} className="hover:bg-sky-50/40">
                      <td className="py-2.5 px-4 font-bold text-slate-800">{ys.academicYear}</td>
                      <td className="py-2.5 px-3 font-bold text-sky-900">
                        {ys.course}° Año{ys.isRepeatedYear ? ' (Rep.)' : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {YEAR_CONDITION_LABELS[ys.condition]}
                      </td>
                      <td className="py-2.5 px-3 text-center font-black text-[#0c2d48]">
                        {ys.formattedAverage}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`font-bold ${
                            ys.isDefinitive ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {ys.statusLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600">
                        {ys.countedSubjects}/{ys.totalApplicableSubjects}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        <span
                          className={
                            ys.pendingAccreditationCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                          }
                        >
                          {ys.pendingAccreditationCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resolvedTrajectory.movements.length > 0 && (
              <div className="bg-white/90 rounded-2xl border border-sky-100 p-4 space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-800">
                  Historial de movimientos académicos
                </h4>
                <div className="divide-y divide-slate-100 text-xs">
                  {[...resolvedTrajectory.movements].reverse().map((m) => (
                    <div key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900">
                          {MOVEMENT_TYPE_LABELS[m.type]}
                        </span>{' '}
                        <span className="text-slate-500 tabular-nums">({m.date})</span>
                        <span className="text-slate-600"> — {m.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'discipline' && (
           <div className="animate-in slide-in-from-right-4 duration-500 space-y-10">
              {/* Sección estructurada aditiva: Antecedentes disciplinarios */}
              {onAddDisciplinaryIncident &&
                onUpdateDisciplinaryIncident &&
                onDeleteDisciplinaryIncident && (
                  <div className="pb-8 border-b border-sky-200/80">
                    <DisciplinaryRecordsPanel
                      student={tempStudent}
                      incidents={disciplinaryIncidents}
                      onAddIncident={onAddDisciplinaryIncident}
                      onUpdateIncident={onUpdateDisciplinaryIncident}
                      onDeleteIncident={onDeleteDisciplinaryIncident}
                      onMigrateLegacy={onMigrateLegacyDisciplinary}
                      currentAcademicYear={currentAcademicYear}
                      defaultAuthority={schoolInfo.principalName || 'Dirección Escolar'}
                    />
                  </div>
                )}

              <div className="flex justify-between items-center border-l-8 border-red-600 pl-6 py-2">
                 <div className="flex items-center gap-4">
                    <ShieldAlert size={36} className="text-red-600"/>
                    <h3 className="text-3xl font-black text-blue-900 uppercase tracking-tight">Llamados de Atención</h3>
                 </div>
                 {isEditing && (
                   <button 
                     type="button"
                     onClick={() => {
                       setDisciplineInput('');
                       setShowDisciplineModal(true);
                     }}
                     className="flex items-center gap-3 px-6 py-3 min-h-[44px] bg-red-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl active:scale-95"
                   >
                     <Plus size={18} /> REGISTRAR NOVEDAD
                   </button>
                 )}
              </div>
              <div className="space-y-6">
                {tempStudent.disciplinary.length > 0 ? [...tempStudent.disciplinary].reverse().map((note, idx) => (
                  <div key={idx} className="p-8 bg-white border-l-8 border-red-600 rounded-2xl shadow-md flex gap-6 items-start transition-all hover:translate-x-2">
                    <div className="bg-red-100 p-3 rounded-full text-red-600">
                      <AlertTriangle size={24} />
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900 font-bold text-lg leading-relaxed">{note}</p>
                    </div>
                  </div>
                )) : (
                  <div className="p-20 text-center bg-gray-50 rounded-3xl border-4 border-dashed border-gray-100 text-gray-400 italic font-black text-xl">
                    CONDUCTA EJEMPLAR. SIN REGISTROS DE DISCIPLINA.
                  </div>
                )}
              </div>
           </div>
        )}
        </div>
      </div>

      {/* 2. Vista dedicada de impresión en papel (se activa y renderiza al imprimir) */}
      <div className="print-only">
        {renderPrintProfileSheet()}
      </div>

      {/* 3. Modal de Vista Previa de Impresión en Pantalla */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <Printer className="text-blue-700" size={20} />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Vista Previa de Impresión • Legajo Escolar Oficial (A4)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {tempStudent.fullName} • {tempStudent.course}° Año • DNI: {tempStudent.dni || 'Sin registrar'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintOptimizedLegajo}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
                  title="Abre la ventana de impresión para imprimir en papel o Guardar como PDF"
                >
                  <Printer size={15} /> Imprimir / Guardar como PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(false)}
                  className="px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all"
                  title="Cerrar vista previa"
                >
                  Cerrar
                </button>
              </div>
            </div>

            {/* Banner de Ayuda para Guardar como PDF */}
            <div className="bg-blue-50/90 border-b border-blue-200 px-6 py-2.5 flex items-center justify-between text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-blue-700 shrink-0" />
                <span>
                  <strong>Tip de exportación:</strong> Para generar el PDF oficial, seleccione el destino <strong>"Guardar como PDF"</strong> en el cuadro de impresión. Utilizará automáticamente los estilos CSS de A4 con fotos, calificaciones y asistencias.
                </span>
              </div>
              <button
                type="button"
                onClick={() => generateStudentPDFReport(tempStudent, schoolInfo)}
                className="hidden sm:flex items-center gap-1.5 text-blue-700 hover:text-blue-950 font-bold hover:underline ml-4 shrink-0 text-xs"
                title="Descargar también versión directa jsPDF"
              >
                <FileDown size={14} /> Descarga directa jsPDF
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-200/70">
              <div className="bg-white p-6 sm:p-8 shadow-xl max-w-3xl mx-auto border border-slate-300">
                {renderPrintProfileSheet()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para Eliminar Alumno */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200 no-print">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-7 space-y-6 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-inner">
              <Trash2 size={32} />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">¿Eliminar Alumno?</h3>
              <p className="text-sm text-gray-600 font-medium">
                ¿Está seguro que desea eliminar a <strong className="text-gray-900">{student.fullName}</strong> (DNI: {student.dni || 'Sin DNI'}) de {student.course}° Año?
              </p>
              <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl font-semibold">
                ⚠️ Esta acción borrará permanentemente sus calificaciones, asistencias y ficha médica.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  onDelete?.(student.id);
                }}
                className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-600/30 transition-all active:scale-95"
              >
                Eliminar Alumno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Libreta Oficial de Calificaciones */}
      <OfficialReportCardModal
        student={tempStudent}
        isOpen={showReportCardModal}
        onClose={() => setShowReportCardModal(false)}
        schoolInfo={schoolInfo}
      />

      {/* Modal en la app: Enlace URL de fotografía */}
      {showPhotoUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print">
          <form
            onSubmit={confirmUrlPhoto}
            className="aero-glass bg-white/95 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-sky-200"
          >
            <h3 className="text-lg font-black text-[#0c2d48]">Enlace de Fotografía del Estudiante</h3>
            <p className="text-xs text-slate-600">
              Pegue la dirección web (URL) directa de una imagen JPG, PNG o WebP.
            </p>
            <input
              type="url"
              required
              autoFocus
              value={photoUrlInput}
              onChange={(e) => setPhotoUrlInput(e.target.value)}
              placeholder="https://ejemplo.com/foto-alumno.jpg"
              className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500 outline-none text-sm bg-white"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPhotoUrlModal(false)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 min-h-[44px] aero-btn-primary rounded-xl text-xs font-black"
              >
                Guardar Foto
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal en la app: Confirmar eliminación de foto */}
      {showRemovePhotoConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print">
          <div className="aero-glass bg-white/95 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-rose-200 text-center">
            <h3 className="text-lg font-black text-[#0c2d48]">¿Quitar foto del alumno?</h3>
            <p className="text-xs text-slate-600">
              Se eliminará la imagen actual del legajo y de las credenciales del estudiante.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRemovePhotoConfirm(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRemovePhoto}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs"
              >
                Sí, quitar foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal en la app: Motivo de tardanza / inasistencia */}
      {manualAttendanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print">
          <form
            onSubmit={confirmManualAttendance}
            className="aero-glass bg-white/95 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-sky-200"
          >
            <h3 className="text-lg font-black text-[#0c2d48]">
              Registrar {manualAttendanceModal.type === 'ausente' ? 'Inasistencia' : 'Tardanza'}
            </h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Motivo / Observación (opcional)
              </label>
              <input
                type="text"
                autoFocus
                value={manualAttendanceModal.reason}
                onChange={(e) =>
                  setManualAttendanceModal({ ...manualAttendanceModal, reason: e.target.value })
                }
                placeholder="Ej: Certificado médico, demora familiar..."
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-slate-200 focus:ring-2 focus:ring-sky-500 outline-none text-sm bg-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManualAttendanceModal(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 min-h-[44px] aero-btn-primary rounded-xl text-xs font-black"
              >
                Registrar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal en la app: Registrar llamado de atención */}
      {showDisciplineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 no-print">
          <form
            onSubmit={confirmAddDiscipline}
            className="aero-glass bg-white/95 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-rose-200"
          >
            <h3 className="text-lg font-black text-[#0c2d48]">Nuevo Registro Disciplinario</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Motivo del llamado de atención *
              </label>
              <textarea
                rows={3}
                required
                autoFocus
                value={disciplineInput}
                onChange={(e) => setDisciplineInput(e.target.value)}
                placeholder="Describa el hecho o llamado de atención..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-rose-500 outline-none text-sm bg-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDisciplineModal(false)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black"
              >
                Guardar Registro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
