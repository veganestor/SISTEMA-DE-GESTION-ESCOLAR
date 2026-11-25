import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Layout } from './components/Layout';
import { StudentManager } from './components/StudentManager';
import { TeacherManager } from './components/TeacherManager';
import { DailyAttendanceTracker } from './components/DailyAttendanceTracker';
import { InstitutionalCalendar } from './components/InstitutionalCalendar';
import { CourseDistributionChart } from './components/CourseDistributionChart';
import { AttendanceBarChart } from './components/AttendanceBarChart';
import { EarlyWarningAlerts } from './components/EarlyWarningAlerts';
import { BackupDashboardCard } from './components/BackupDashboardCard';
import { BackupModal } from './components/BackupModal';
import { SchoolSettingsModal } from './components/SchoolSettingsModal';
import { InitialSetupWizard } from './components/InitialSetupWizard';
import { StudentCarnetsModule } from './components/StudentCarnetsModule';
import { TeacherCarnetsModule } from './components/TeacherCarnetsModule';
import { QRScannerPanel } from './components/QRScannerPanel';
import { CardDesignCenter } from './components/CardDesignCenter';
import { AcademicTrajectoryMeritModule } from './components/AcademicTrajectoryMeritModule';
import { QuickActionsPDFSection } from './components/QuickActionsPDFSection';
import { MonthlyAttendancePdfReportSection } from './components/MonthlyAttendancePdfReportSection';
import { DropoutRateCard } from './components/DropoutRateCard';
import { DashboardNotificationsBanner } from './components/DashboardNotificationsBanner';
import {
  Student,
  Teacher,
  CourseYear,
  SchoolInfo,
  DeviceViewMode,
  CalendarEvent,
  CardDesignConfig,
  IssuedCardRecord,
  StudentTrajectoryProfile,
  DisciplinaryIncident,
  MeritOrderConfig,
  InstitutionalUserProfile,
  AttendanceRecord,
} from './types';
import { calculateAge } from './services/utils';
import { DatabaseBackup } from './services/backupService';
import { migrateLegacyDisciplinaryToStructured } from './services/trajectoryService';
import {
  upsertStudentAttendance,
  buildQRAttendanceFeedback,
  QRAttendanceFeedback,
} from './services/attendanceService';
import { exportAnnualMetricsCSV } from './services/dashboardCsvExport';
import { InternalNotificationActionTarget } from './services/internalNotificationsService';
import {
  STORAGE_KEYS,
  getOrInitInstallationMeta,
  markSetupCompleted,
  reopenInitialSetup,
  loadSchoolInfo,
  loadInstitutionalUsers,
  saveInstitutionalUsers,
  upsertInstitutionalUser,
  loadCardDesignConfig,
  loadIssuedCards,
  loadAcademicTrajectories,
  saveAcademicTrajectories,
  loadDisciplinaryRecords,
  saveDisciplinaryRecords,
  loadMeritOrderConfig,
  saveMeritOrderConfig,
  readJsonStorage,
  writeJsonStorage,
  readStorageItem,
  writeStorageItem,
  loadDismissedDashboardNotifications,
  saveDismissedDashboardNotifications,
  purgeLegacySampleRosterIfNeeded,
  purgeLegacySampleCalendarEventsIfNeeded,
} from './services/storageService';
import {
  Gift,
  CalendarDays,
  PartyPopper,
  GraduationCap,
  Settings,
  IdCard,
  BadgeCheck,
  QrCode,
  Palette,
  Database,
  X,
  Award,
  LogOut,
  Save,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';

const INITIAL_STUDENTS: Student[] = [];
const INITIAL_TEACHERS: Teacher[] = [];
const INITIAL_EX_TEACHERS: Teacher[] = [];
const INITIAL_CALENDAR_EVENTS: CalendarEvent[] = [];

const App: React.FC = () => {
  const [installationMeta, setInstallationMeta] = useState(() => {
    purgeLegacySampleRosterIfNeeded();
    purgeLegacySampleCalendarEventsIfNeeded();
    return getOrInitInstallationMeta();
  });
  const [activeTab, setActiveTab] = useState('reports');
  const [selectedCourseYear, setSelectedCourseYear] = useState<CourseYear>('1');
  const [selectedStudentId, setSelectedStudentId] = useState<string | undefined>(undefined);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | undefined>(undefined);
  const [trajectoryStudentId, setTrajectoryStudentId] = useState<string | undefined>(undefined);
  const [trajectoryInitialSubTab, setTrajectoryInitialSubTab] = useState<'trajectory' | 'merit' | 'criteria'>('trajectory');
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [attendanceFocusDate, setAttendanceFocusDate] = useState<string | undefined>(undefined);
  const [attendanceFocusCourse, setAttendanceFocusCourse] = useState<CourseYear | undefined>(undefined);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [exitNotice, setExitNotice] = useState<string | null>(null);
  const [csvExportNotice, setCsvExportNotice] = useState<string | null>(null);
  const csvNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() =>
    loadDismissedDashboardNotifications()
  );
  const [lastBackupIso, setLastBackupIso] = useState<string | null>(() =>
    readStorageItem(STORAGE_KEYS.LAST_BACKUP_DATE)
  );

  // Modo de visualización adaptativa (Automático, PC, Android, iPhone, Tablet)
  const [deviceMode, setDeviceMode] = useState<DeviceViewMode>(() => {
    const saved = readStorageItem(STORAGE_KEYS.DEVICE_VIEW_MODE) as DeviceViewMode | null;
    return saved || 'responsive';
  });

  // Identidad institucional compartida y usuarios institucionales creados
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(() => loadSchoolInfo());
  const [createdUsers, setCreatedUsers] = useState<InstitutionalUserProfile[]>(() =>
    loadInstitutionalUsers()
  );
  const [activeUserId, setActiveUserId] = useState<string | undefined>(() => {
    const users = loadInstitutionalUsers();
    return users[0]?.id;
  });

  // Registros académicos existentes (100% preservados, lectura segura con fallback)
  const [students, setStudents] = useState<Student[]>(() =>
    readJsonStorage<Student[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS)
  );
  const studentsRef = useRef<Student[]>(students);
  studentsRef.current = students;
  const [teachers, setTeachers] = useState<Teacher[]>(() =>
    readJsonStorage<Teacher[]>(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS)
  );
  const teachersRef = useRef<Teacher[]>(teachers);
  teachersRef.current = teachers;
  const [exTeachers, setExTeachers] = useState<Teacher[]>(() =>
    readJsonStorage<Teacher[]>(STORAGE_KEYS.EX_TEACHERS, INITIAL_EX_TEACHERS)
  );
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() =>
    readJsonStorage<CalendarEvent[]>(STORAGE_KEYS.CALENDAR_EVENTS, INITIAL_CALENDAR_EVENTS)
  );

  // Datos aditivos: personalización visual de carnets y registro de carnets emitidos/revocados
  const [cardConfig, setCardConfig] = useState<CardDesignConfig>(() => loadCardDesignConfig());
  const [issuedCards, setIssuedCards] = useState<IssuedCardRecord[]>(() => loadIssuedCards());

  // Datos aditivos: Trayectoria Académica (1° a 6°), Antecedentes Disciplinarios y Criterios de Orden de Mérito
  const [academicTrajectories, setAcademicTrajectories] = useState<
    Record<string, StudentTrajectoryProfile>
  >(() => loadAcademicTrajectories());
  const [disciplinaryRecords, setDisciplinaryRecords] = useState<DisciplinaryIncident[]>(() =>
    loadDisciplinaryRecords()
  );
  const [meritConfig, setMeritConfig] = useState<MeritOrderConfig>(() => loadMeritOrderConfig());

  // Persistencia local unificada (compatible Web y puente futuro Windows desktopStorage)
  useEffect(() => {
    if (installationMeta.setupCompleted || schoolInfo.isConfigured) {
      writeJsonStorage(STORAGE_KEYS.SCHOOL_INFO, schoolInfo);
    }
    if (typeof document !== 'undefined' && schoolInfo.name && (installationMeta.setupCompleted || schoolInfo.isConfigured)) {
      document.title = `${schoolInfo.name} — Sistema de Gestión Escolar`;
    }
  }, [schoolInfo, installationMeta.setupCompleted]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.STUDENTS, students);
  }, [students]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.TEACHERS, teachers);
  }, [teachers]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.EX_TEACHERS, exTeachers);
  }, [exTeachers]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.CALENDAR_EVENTS, calendarEvents);
  }, [calendarEvents]);

  useEffect(() => {
    writeStorageItem(STORAGE_KEYS.DEVICE_VIEW_MODE, deviceMode);
  }, [deviceMode]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.CARD_DESIGN_CONFIG, cardConfig);
  }, [cardConfig]);

  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.ISSUED_CARDS, issuedCards);
  }, [issuedCards]);

  useEffect(() => {
    saveAcademicTrajectories(academicTrajectories);
  }, [academicTrajectories]);

  useEffect(() => {
    saveDisciplinaryRecords(disciplinaryRecords);
  }, [disciplinaryRecords]);

  useEffect(() => {
    saveMeritOrderConfig(meritConfig);
  }, [meritConfig]);

  useEffect(() => {
    saveDismissedDashboardNotifications(dismissedNotificationIds);
  }, [dismissedNotificationIds]);

  useEffect(() => {
    setLastBackupIso(readStorageItem(STORAGE_KEYS.LAST_BACKUP_DATE));
  }, [isBackupModalOpen]);

  // Asistente de configuración inicial: exige crear un usuario institucional o seleccionar uno ya creado
  const handleCompleteInitialSetup = (configuredInfo: SchoolInfo) => {
    const { users, activeUser } = upsertInstitutionalUser(configuredInfo);
    setCreatedUsers(users);
    setActiveUserId(activeUser.id);
    setSchoolInfo(activeUser.schoolInfo);
    writeJsonStorage(STORAGE_KEYS.SCHOOL_INFO, activeUser.schoolInfo);
    const updatedMeta = markSetupCompleted();
    setInstallationMeta(updatedMeta);
    setExitNotice(null);
  };

  const handleSelectExistingUser = (user: InstitutionalUserProfile) => {
    const { users, activeUser } = upsertInstitutionalUser(user.schoolInfo, user.id);
    setCreatedUsers(users);
    setActiveUserId(activeUser.id);
    setSchoolInfo(activeUser.schoolInfo);
    writeJsonStorage(STORAGE_KEYS.SCHOOL_INFO, activeUser.schoolInfo);
    const updatedMeta = markSetupCompleted();
    setInstallationMeta(updatedMeta);
    setExitNotice(null);
  };

  const handleUpdateSchoolInfo = useCallback(
    (updated: SchoolInfo) => {
      const { users, activeUser } = upsertInstitutionalUser(updated, activeUserId);
      setCreatedUsers(users);
      setActiveUserId(activeUser.id);
      setSchoolInfo(activeUser.schoolInfo);
    },
    [activeUserId]
  );

  // Guardar todos los datos cargados y salir a la Configuración Inicial del Establecimiento
  const handleConfirmExitSystem = useCallback(() => {
    writeJsonStorage(STORAGE_KEYS.SCHOOL_INFO, schoolInfo);
    saveInstitutionalUsers(createdUsers);
    writeJsonStorage(STORAGE_KEYS.STUDENTS, students);
    writeJsonStorage(STORAGE_KEYS.TEACHERS, teachers);
    writeJsonStorage(STORAGE_KEYS.EX_TEACHERS, exTeachers);
    writeJsonStorage(STORAGE_KEYS.CALENDAR_EVENTS, calendarEvents);
    writeStorageItem(STORAGE_KEYS.DEVICE_VIEW_MODE, deviceMode);
    writeJsonStorage(STORAGE_KEYS.CARD_DESIGN_CONFIG, cardConfig);
    writeJsonStorage(STORAGE_KEYS.ISSUED_CARDS, issuedCards);
    saveAcademicTrajectories(academicTrajectories);
    saveDisciplinaryRecords(disciplinaryRecords);
    saveMeritOrderConfig(meritConfig);

    setShowExitConfirmModal(false);
    setIsBackupModalOpen(false);
    setIsSettingsModalOpen(false);
    setActiveTab('reports');
    setExitNotice(
      'Todos los datos cargados fueron guardados correctamente antes de salir del sistema.'
    );

    const updatedMeta = reopenInitialSetup();
    setInstallationMeta(updatedMeta);
  }, [
    schoolInfo,
    createdUsers,
    students,
    teachers,
    exTeachers,
    calendarEvents,
    deviceMode,
    cardConfig,
    issuedCards,
    academicTrajectories,
    disciplinaryRecords,
    meritConfig,
  ]);

  // Handlers del Calendario Institucional
  const handleAddCalendarEvent = (newEvent: CalendarEvent) => {
    setCalendarEvents((prev) => [newEvent, ...prev]);
  };

  const handleUpdateCalendarEvent = (updatedEvent: CalendarEvent) => {
    setCalendarEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));
  };

  const handleDeleteCalendarEvent = (eventId: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  const handleDeleteAllCalendarEvents = useCallback(() => {
    setCalendarEvents([]);
  }, []);

  // Navegación desde gráficos y alertas
  const handleNavigateToCourse = (course: CourseYear) => {
    setSelectedCourseYear(course);
    setActiveTab('students');
  };

  const handleInspectStudent = (student: Student) => {
    setSelectedCourseYear(student.course);
    setSelectedStudentId(student.id);
    setActiveTab('students');
  };

  // Registro automático de asistencia diaria al escanear carnet QR de estudiante
  const handleRegisterStudentAttendanceFromQR = useCallback(
    (
      studentId: string,
      date: string,
      type: AttendanceRecord['type'],
      recordedAtOverride?: string
    ): QRAttendanceFeedback => {
      const evaluated = upsertStudentAttendance(studentsRef.current, {
        studentId,
        date,
        type,
        source: 'qr',
        recordedAt: recordedAtOverride,
        preserveIfSameType: true,
      });

      if (evaluated.outcome === 'registered' || evaluated.outcome === 'updated') {
        const recordedAt = recordedAtOverride || evaluated.record?.recordedAt;
        studentsRef.current = evaluated.students;
        setStudents((prev) => {
          const next = upsertStudentAttendance(prev, {
            studentId,
            date,
            type,
            source: 'qr',
            recordedAt,
            preserveIfSameType: true,
          });
          studentsRef.current = next.students;
          return next.students;
        });
        setAttendanceFocusDate(date);
        if (evaluated.student?.course) {
          setAttendanceFocusCourse(evaluated.student.course);
        }
      }

      return buildQRAttendanceFeedback(evaluated, date);
    },
    []
  );

  const handleOpenAttendanceFromQR = useCallback((course?: CourseYear, date?: string) => {
    if (course) {
      setAttendanceFocusCourse(course);
    }
    if (date) {
      setAttendanceFocusDate(date);
    }
    setActiveTab('attendance');
  }, []);

  // Handlers aditivos de Trayectoria Académica y Antecedentes Disciplinarios
  const handleSaveTrajectory = useCallback((profile: StudentTrajectoryProfile) => {
    setAcademicTrajectories((prev) => ({
      ...prev,
      [profile.studentId]: profile,
    }));
  }, []);

  const handleAddDisciplinaryIncident = useCallback((incident: DisciplinaryIncident) => {
    setDisciplinaryRecords((prev) => [incident, ...prev]);
  }, []);

  const handleUpdateDisciplinaryIncident = useCallback((incident: DisciplinaryIncident) => {
    setDisciplinaryRecords((prev) => prev.map((item) => (item.id === incident.id ? incident : item)));
  }, []);

  const handleDeleteDisciplinaryIncident = useCallback((incidentId: string) => {
    setDisciplinaryRecords((prev) => prev.filter((item) => item.id !== incidentId));
  }, []);

  const handleBatchAddDisciplinaryIncidents = useCallback((incidents: DisciplinaryIncident[]) => {
    if (incidents.length === 0) return;
    setDisciplinaryRecords((prev) => [...incidents, ...prev]);
  }, []);

  const handleMigrateLegacyDisciplinaryForStudent = useCallback(
    (student: Student) => {
      const migrated = migrateLegacyDisciplinaryToStructured(
        student,
        disciplinaryRecords,
        Number(schoolInfo.academicYear) || new Date().getFullYear()
      );
      if (migrated.length > 0) {
        setDisciplinaryRecords((prev) => [...migrated, ...prev]);
      }
    },
    [disciplinaryRecords, schoolInfo.academicYear]
  );

  const handleUpdateSingleStudent = useCallback((updated: Student) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const handleOpenStudentTrajectory = useCallback((student: Student) => {
    setTrajectoryStudentId(student.id);
    setTrajectoryInitialSubTab('trajectory');
    setActiveTab('trajectory-merit');
  }, []);

  const handleRestoreBackup = (backup: DatabaseBackup) => {
    setStudents(backup.data.students);
    setTeachers(backup.data.teachers);
    setExTeachers(backup.data.exTeachers || []);
    if (backup.data.schoolInfo) {
      const mergedSchool: SchoolInfo = {
        ...schoolInfo,
        ...backup.data.schoolInfo,
        installationId: backup.data.schoolInfo.installationId || schoolInfo.installationId,
        isConfigured: true,
        updatedAt: backup.data.schoolInfo.updatedAt || new Date().toISOString(),
      };
      const { users, activeUser } = upsertInstitutionalUser(mergedSchool, activeUserId);
      setCreatedUsers(users);
      setActiveUserId(activeUser.id);
      setSchoolInfo(activeUser.schoolInfo);
    }
    if (backup.data.calendarEvents) {
      setCalendarEvents(backup.data.calendarEvents);
    }
    if (backup.data.cardConfig) {
      setCardConfig(backup.data.cardConfig);
    }
    if (backup.data.issuedCards) {
      setIssuedCards(backup.data.issuedCards);
    }
    if (backup.data.academicTrajectories) {
      setAcademicTrajectories(backup.data.academicTrajectories);
    }
    if (backup.data.disciplinaryRecords) {
      setDisciplinaryRecords(backup.data.disciplinaryRecords);
    }
    if (backup.data.meritConfig) {
      setMeritConfig(backup.data.meritConfig);
    }
  };

  useEffect(() => {
    return () => {
      if (csvNoticeTimerRef.current) {
        clearTimeout(csvNoticeTimerRef.current);
      }
    };
  }, []);

  const handleExportAnnualMetricsCSV = useCallback(() => {
    const result = exportAnnualMetricsCSV({
      students,
      teachers,
      exTeachers,
      issuedCards,
      calendarEvents,
      academicTrajectories,
      schoolInfo,
    });
    if (csvNoticeTimerRef.current) {
      clearTimeout(csvNoticeTimerRef.current);
    }
    setCsvExportNotice(
      `Métricas anuales consolidadas del Ciclo ${result.academicYear} exportadas (${result.rowCount} filas en ${result.fileName}).`
    );
    csvNoticeTimerRef.current = setTimeout(() => {
      setCsvExportNotice(null);
    }, 5000);
  }, [
    students,
    teachers,
    exTeachers,
    issuedCards,
    calendarEvents,
    academicTrajectories,
    schoolInfo,
  ]);

  const handleDismissNotification = useCallback((id: string) => {
    setDismissedNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleDismissAllNotifications = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setDismissedNotificationIds((prev) => Array.from(new Set([...prev, ...ids])));
  }, []);

  const handleRestoreDismissedNotifications = useCallback(() => {
    setDismissedNotificationIds([]);
  }, []);

  const handleNotificationAction = useCallback(
    (target: InternalNotificationActionTarget, targetId?: string) => {
      switch (target) {
        case 'calendar':
          setActiveTab('calendar');
          break;
        case 'attendance':
          setActiveTab('attendance');
          break;
        case 'students':
          setActiveTab('students');
          break;
        case 'teachers':
          setActiveTab('teachers');
          break;
        case 'trajectory-merit':
          setTrajectoryInitialSubTab('trajectory');
          setActiveTab('trajectory-merit');
          break;
        case 'student-cards':
          setActiveTab('student-cards');
          break;
        case 'backup':
          setIsBackupModalOpen(true);
          break;
        case 'student-detail': {
          const matchedStudent = targetId
            ? studentsRef.current.find((s) => s.id === targetId)
            : undefined;
          if (matchedStudent) {
            setSelectedCourseYear(matchedStudent.course);
            setSelectedStudentId(matchedStudent.id);
          }
          setActiveTab('students');
          break;
        }
        case 'teacher-detail': {
          const matchedTeacher = targetId
            ? teachersRef.current.find((t) => t.id === targetId)
            : undefined;
          if (matchedTeacher) {
            setSelectedTeacherId(matchedTeacher.id);
          }
          setActiveTab('teachers');
          break;
        }
      }
    },
    []
  );

  // Cumpleaños del día (alumnos, docentes y personal)
  const todaysBirthdays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;

    return students.filter((student) => {
      const parts = (student.birthDate || '').split('-');
      if (parts.length !== 3) return false;
      const birthMonth = parseInt(parts[1], 10);
      const birthDay = parseInt(parts[2], 10);
      return birthMonth === currentMonth && birthDay === currentDay;
    });
  }, [students]);

  const todaysTeacherBirthdays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;

    return teachers.filter((teacher) => {
      const parts = (teacher.birthDate || '').split('-');
      if (parts.length !== 3) return false;
      const birthMonth = parseInt(parts[1], 10);
      const birthDay = parseInt(parts[2], 10);
      return birthMonth === currentMonth && birthDay === currentDay;
    });
  }, [teachers]);

  // Pantalla de Bienvenida y Configuración Institucional en primera ejecución, sin usuarios creados o al salir del sistema
  if (!installationMeta.setupCompleted || createdUsers.length === 0) {
    return (
      <InitialSetupWizard
        initialSchoolInfo={schoolInfo}
        createdUsers={createdUsers}
        onComplete={handleCompleteInitialSetup}
        onSelectExistingUser={handleSelectExistingUser}
        exitNotice={exitNotice}
      />
    );
  }

  return (
    <>
      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenBackup={() => setIsBackupModalOpen(true)}
        schoolInfo={schoolInfo}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        deviceMode={deviceMode}
        setDeviceMode={setDeviceMode}
        onExitSystem={() => setShowExitConfirmModal(true)}
      >
        {activeTab === 'students' && (
          <StudentManager
            students={students}
            setStudents={setStudents}
            initialCourse={selectedCourseYear}
            initialStudentId={selectedStudentId}
            onClearInitialStudentId={() => setSelectedStudentId(undefined)}
            schoolInfo={schoolInfo}
            academicTrajectories={academicTrajectories}
            disciplinaryRecords={disciplinaryRecords}
            meritConfig={meritConfig}
            onAddDisciplinaryIncident={handleAddDisciplinaryIncident}
            onUpdateDisciplinaryIncident={handleUpdateDisciplinaryIncident}
            onDeleteDisciplinaryIncident={handleDeleteDisciplinaryIncident}
            onMigrateLegacyDisciplinary={handleMigrateLegacyDisciplinaryForStudent}
            onOpenFullTrajectory={handleOpenStudentTrajectory}
          />
        )}

        {activeTab === 'trajectory-merit' && (
          <AcademicTrajectoryMeritModule
            students={students}
            onUpdateStudent={handleUpdateSingleStudent}
            trajectories={academicTrajectories}
            onSaveTrajectory={handleSaveTrajectory}
            onReplaceAllTrajectories={setAcademicTrajectories}
            disciplinaryRecords={disciplinaryRecords}
            onAddIncident={handleAddDisciplinaryIncident}
            onUpdateIncident={handleUpdateDisciplinaryIncident}
            onDeleteIncident={handleDeleteDisciplinaryIncident}
            onBatchAddIncidents={handleBatchAddDisciplinaryIncidents}
            meritConfig={meritConfig}
            onUpdateMeritConfig={setMeritConfig}
            schoolInfo={schoolInfo}
            initialSubTab={trajectoryInitialSubTab}
            initialStudentId={trajectoryStudentId}
            onOpenStudentLegajo={handleInspectStudent}
          />
        )}

        {activeTab === 'attendance' && (
          <DailyAttendanceTracker
            students={students}
            setStudents={setStudents}
            schoolInfo={schoolInfo}
            initialCourse={attendanceFocusCourse || selectedCourseYear}
            initialDate={attendanceFocusDate}
            onOpenQRScanner={() => setActiveTab('qr-scanner')}
            onOpenMonthlyReport={() => setActiveTab('monthly-attendance')}
          />
        )}

        {activeTab === 'monthly-attendance' && (
          <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
            <div className="aero-glass rounded-[28px] p-5 sm:p-7 border border-white/90 shadow-md space-y-1">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
                {schoolInfo.name} · Ciclo {schoolInfo.academicYear}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Reporte Mensual Consolidado de Asistencia
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Consulte el porcentaje de asistencia mensual por curso y alumno, revise el detalle de faltas registradas y exporte el informe oficial en PDF.
              </p>
            </div>
            <MonthlyAttendancePdfReportSection
              students={students}
              schoolInfo={schoolInfo}
              onInspectStudent={handleInspectStudent}
              onNavigateToAttendance={() => setActiveTab('attendance')}
            />
          </div>
        )}

        {activeTab === 'teachers' && (
          <TeacherManager
            teachers={teachers}
            setTeachers={setTeachers}
            exTeachers={exTeachers}
            setExTeachers={setExTeachers}
            schoolInfo={schoolInfo}
            initialTeacherId={selectedTeacherId}
            onClearInitialTeacherId={() => setSelectedTeacherId(undefined)}
          />
        )}

        {activeTab === 'calendar' && (
          <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
            <div className="aero-glass rounded-[28px] p-5 sm:p-7 border border-white/90 shadow-md space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
                {schoolInfo.name} • Ciclo {schoolInfo.academicYear}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Calendario Escolar y Agenda Institucional
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Registro y visualización de eventos institucionales, fechas de exámenes y reuniones de padres
              </p>
            </div>
            <InstitutionalCalendar
              events={calendarEvents}
              onAddEvent={handleAddCalendarEvent}
              onUpdateEvent={handleUpdateCalendarEvent}
              onDeleteEvent={handleDeleteCalendarEvent}
              onDeleteAllEvents={handleDeleteAllCalendarEvents}
            />
          </div>
        )}

        {activeTab === 'student-cards' && (
          <StudentCarnetsModule
            students={students}
            schoolInfo={schoolInfo}
            cardConfig={cardConfig}
            issuedCards={issuedCards}
            onUpsertIssuedCards={setIssuedCards}
            onOpenDesigner={() => setActiveTab('card-designer')}
          />
        )}

        {activeTab === 'teacher-cards' && (
          <TeacherCarnetsModule
            teachers={teachers}
            schoolInfo={schoolInfo}
            cardConfig={cardConfig}
            issuedCards={issuedCards}
            onUpsertIssuedCards={setIssuedCards}
            onOpenDesigner={() => setActiveTab('card-designer')}
          />
        )}

        {(activeTab === 'qr-scanner' || activeTab === 'guardian-portal') && (
          <QRScannerPanel
            students={students}
            teachers={teachers}
            issuedCards={issuedCards}
            calendarEvents={calendarEvents}
            schoolInfo={schoolInfo}
            initialSection={activeTab === 'guardian-portal' ? 'guardian-portal' : 'scanner'}
            onInspectStudent={handleInspectStudent}
            onOpenTeachersTab={() => setActiveTab('teachers')}
            onRegisterStudentAttendance={handleRegisterStudentAttendanceFromQR}
            onOpenAttendanceTracker={handleOpenAttendanceFromQR}
          />
        )}

        {activeTab === 'card-designer' && (
          <CardDesignCenter
            schoolInfo={schoolInfo}
            config={cardConfig}
            onSaveConfig={setCardConfig}
            sampleStudent={students[0]}
            sampleTeacher={teachers[0]}
          />
        )}

        {activeTab === 'settings' && (
          <div className="pb-12 animate-in fade-in duration-300">
            <SchoolSettingsModal
              isOpen={true}
              embedded={true}
              onClose={() => setActiveTab('reports')}
              schoolInfo={schoolInfo}
              onSave={handleUpdateSchoolInfo}
            />
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-8 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
            {/* Hero Dashboard Frutiger Aero */}
            <div className="aero-glass rounded-[30px] p-5 sm:p-7 border border-white/90 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-sky-200 p-1.5 shadow-md shrink-0 hidden sm:flex items-center justify-center overflow-hidden">
                  <img
                    src={schoolInfo.logo || '/aero-emblem.png'}
                    alt={`Escudo ${schoolInfo.name}`}
                    className="w-full h-full object-contain rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
                    {schoolInfo.institutionType || 'Establecimiento Educativo'} • Ciclo Lectivo {schoolInfo.academicYear}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                    Panel de Control Institucional
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium">
                    {schoolInfo.name} — Resumen académico, asistencias, credenciales QR y respaldo local
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="aero-btn-primary flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold shadow-sm"
                >
                  <Settings size={15} />
                  <span>Configuración Institucional</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportAnnualMetricsCSV}
                  className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-xl text-xs font-extrabold shadow-sm transition-all active:scale-[0.98]"
                  title="Exportar archivo CSV consolidado con población estudiantil, planta docente, asistencia y tasa de deserción anual"
                >
                  {csvExportNotice ? (
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  ) : (
                    <FileSpreadsheet size={15} className="text-sky-700" />
                  )}
                  <span>{csvExportNotice ? 'CSV Exportado' : 'Exportar Métricas (.CSV)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBackupModalOpen(true)}
                  className="aero-btn-emerald flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold shadow-sm"
                >
                  <Database size={15} />
                  <span>Backup (.JSON)</span>
                </button>
              </div>
            </div>

            {csvExportNotice && (
              <div
                role="status"
                className="px-4 py-3 rounded-2xl bg-emerald-50/95 border border-emerald-200 text-emerald-950 text-xs font-bold flex items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate">{csvExportNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCsvExportNotice(null)}
                  className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700 shrink-0"
                  aria-label="Cerrar aviso de exportación CSV"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Sistema de Notificaciones Internas (Banner persistente y lista no intrusiva) */}
            <DashboardNotificationsBanner
              students={students}
              teachers={teachers}
              calendarEvents={calendarEvents}
              disciplinaryRecords={disciplinaryRecords}
              issuedCards={issuedCards}
              academicTrajectories={academicTrajectories}
              schoolInfo={schoolInfo}
              lastBackupIso={lastBackupIso}
              dismissedIds={dismissedNotificationIds}
              onDismissNotification={handleDismissNotification}
              onDismissAll={handleDismissAllNotifications}
              onRestoreDismissed={handleRestoreDismissedNotifications}
              onNavigateAction={handleNotificationAction}
            />

            {/* Accesos Rápidos a Carnets, Lector QR y Personalización */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[
                {
                  tab: 'student-cards',
                  title: 'Carnets Alumnos',
                  sub: 'Emisión individual y por lote PDF',
                  icon: <IdCard size={22} className="text-sky-600" />,
                  tint: 'from-sky-50 to-cyan-50 border-sky-200/90',
                },
                {
                  tab: 'teacher-cards',
                  title: 'Carnets Docentes',
                  sub: 'Credenciales de planta funcional',
                  icon: <BadgeCheck size={22} className="text-teal-600" />,
                  tint: 'from-teal-50 to-emerald-50 border-teal-200/90',
                },
                {
                  tab: 'qr-scanner',
                  title: 'Lector QR',
                  sub: 'Verificar con cámara o imagen',
                  icon: <QrCode size={22} className="text-emerald-600" />,
                  tint: 'from-emerald-50 to-sky-50 border-emerald-200/90',
                },
                {
                  tab: 'card-designer',
                  title: 'Diseño Carnets',
                  sub: 'Colores, formato CR80 y dorso',
                  icon: <Palette size={22} className="text-cyan-600" />,
                  tint: 'from-cyan-50 to-white border-cyan-200/90',
                },
              ].map((card) => (
                <button
                  key={card.tab}
                  type="button"
                  onClick={() => setActiveTab(card.tab)}
                  className={`text-left p-4 rounded-2xl bg-gradient-to-br ${card.tint} border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-start gap-3 min-h-[82px]`}
                >
                  <div className="p-2.5 rounded-xl bg-white shadow-sm border border-white shrink-0">
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight">{card.title}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{card.sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Acceso Directo Aditivo: Trayectoria Académica (1° a 6°) y Orden de Mérito */}
            <div className="aero-glass rounded-2xl p-4 sm:p-5 border border-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-sky-100/90 text-sky-700 border border-sky-200 shrink-0">
                  <Award size={22} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-[#0c2d48]">
                    Trayectoria Académica (1.º a 6.º Año) y Orden de Mérito
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Seguimiento escolar histórico, cálculo automático de promedios, antecedentes
                    disciplinarios y Selección de Abanderados y Escoltas.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTrajectoryInitialSubTab('trajectory');
                    setActiveTab('trajectory-merit');
                  }}
                  className="px-3.5 py-2.5 min-h-[42px] bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 rounded-xl text-xs font-extrabold transition-colors"
                >
                  Ver Trayectorias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrajectoryInitialSubTab('merit');
                    setActiveTab('trajectory-merit');
                  }}
                  className="aero-btn-primary px-4 py-2.5 min-h-[42px] rounded-xl text-xs font-extrabold"
                >
                  Abanderados y Escoltas
                </button>
              </div>
            </div>

            {/* Acciones Rápidas: Generación de PDFs de Listados de Alumnos por Curso en 1 Clic */}
            <QuickActionsPDFSection students={students} schoolInfo={schoolInfo} />

            {/* Reporte Mensual Consolidado de Asistencia en PDF */}
            <MonthlyAttendancePdfReportSection
              students={students}
              schoolInfo={schoolInfo}
              onInspectStudent={handleInspectStudent}
              onNavigateToAttendance={() => setActiveTab('attendance')}
            />

            {/* Notificación de Cumpleaños (Alumnos, Docentes y Personal) */}
            {(todaysBirthdays.length > 0 || todaysTeacherBirthdays.length > 0) ? (
              <div className="bg-gradient-to-r from-amber-50/95 via-yellow-50/95 to-sky-50/80 border-2 border-amber-200 rounded-[28px] p-6 sm:p-7 shadow-md flex flex-col md:flex-row items-center gap-6">
                <div className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg transform -rotate-3 shrink-0">
                  <Gift size={36} />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                    <PartyPopper size={20} className="text-amber-600" />
                    <h3 className="text-lg sm:text-xl font-extrabold text-amber-950 uppercase tracking-tight">
                      ¡Hoy celebramos cumpleaños!
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-amber-800 font-medium">
                    Integrantes de la comunidad educativa que cumplen años hoy{' '}
                    {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} (clic para abrir legajo o perfil):
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-2.5 justify-center md:justify-start">
                    {todaysBirthdays.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => handleInspectStudent(student)}
                        className="bg-white hover:bg-sky-50 px-4 py-2 rounded-2xl border border-amber-200 hover:border-sky-300 shadow-sm flex items-center gap-2.5 transition-colors"
                        title={`Abrir legajo de ${student.fullName}`}
                      >
                        <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-extrabold text-xs">
                          {student.fullName.charAt(0)}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-slate-800">
                          {student.fullName}{' '}
                          <span className="text-amber-700 ml-1">
                            · {student.course}° Año · {calculateAge(student.birthDate)} años
                          </span>
                        </span>
                      </button>
                    ))}
                    {todaysTeacherBirthdays.map((teacher) => (
                      <button
                        key={teacher.id}
                        type="button"
                        onClick={() => handleNotificationAction('teacher-detail', teacher.id)}
                        className="bg-white hover:bg-sky-50 px-4 py-2 rounded-2xl border border-amber-200 hover:border-sky-300 shadow-sm flex items-center gap-2.5 transition-colors"
                        title={`Abrir perfil de ${teacher.fullName}`}
                      >
                        <span className="w-7 h-7 rounded-full bg-sky-100 text-sky-900 flex items-center justify-center font-extrabold text-xs">
                          {teacher.fullName.charAt(0)}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-slate-800">
                          {teacher.fullName}{' '}
                          <span className="text-sky-800 ml-1">
                            · {teacher.role || 'Docente'} · {calculateAge(teacher.birthDate)} años
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="aero-glass-soft border-2 border-dashed border-sky-200/90 rounded-[26px] p-6 flex flex-col items-center justify-center text-sky-700/60">
                <CalendarDays size={32} className="mb-2 opacity-60" />
                <p className="font-bold uppercase tracking-widest text-[11px]">
                  No hay cumpleaños registrados para el día de hoy
                </p>
              </div>
            )}

            {/* Métricas Generales (KPIs con tabular-nums) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full">
              <div className="aero-glass p-6 rounded-3xl border border-white/90 border-b-4 border-b-sky-500 hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] font-extrabold text-sky-700 uppercase tracking-widest mb-1.5">
                  Población Estudiantil
                </p>
                <h3 className="font-extrabold text-4xl sm:text-5xl text-sky-700 tabular-nums">
                  {students.length}
                </h3>
                <p className="text-slate-600 mt-1.5 font-semibold text-xs sm:text-sm">Alumnos Matriculados</p>
              </div>
              <div className="aero-glass p-6 rounded-3xl border border-white/90 border-b-4 border-b-emerald-500 hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] font-extrabold text-teal-700 uppercase tracking-widest mb-1.5">
                  Planta Funcional
                </p>
                <h3 className="font-extrabold text-4xl sm:text-5xl text-emerald-600 tabular-nums">
                  {teachers.length}
                </h3>
                <p className="text-slate-600 mt-1.5 font-semibold text-xs sm:text-sm">Docentes en Ejercicio</p>
              </div>
              <div className="aero-glass p-6 rounded-3xl border border-white/90 border-b-4 border-b-cyan-500 hover:-translate-y-0.5 transition-transform">
                <p className="text-[11px] font-extrabold text-cyan-800 uppercase tracking-widest mb-1.5">
                  Desvinculaciones / Carnets
                </p>
                <div className="flex items-baseline gap-3">
                  <h3 className="font-extrabold text-4xl sm:text-5xl text-cyan-700 tabular-nums">
                    {exTeachers.length}
                  </h3>
                  <span className="text-xs font-bold text-slate-500">
                    • {issuedCards.filter((c) => c.status === 'vigente').length} carnets vigentes
                  </span>
                </div>
                <p className="text-slate-600 mt-1.5 font-semibold text-xs sm:text-sm">Historial Ex-Docentes</p>
              </div>
            </div>

            {/* Tarjeta Visual: Tasa de Deserción Escolar */}
            <DropoutRateCard
              students={students}
              academicTrajectories={academicTrajectories}
              schoolInfo={schoolInfo}
              onInspectStudent={handleInspectStudent}
              onNavigateToCourse={handleNavigateToCourse}
            />

            {/* Calendario Interactivo en el Dashboard */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-sky-200/80 pb-3">
                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                    <CalendarDays className="text-sky-600" size={24} />
                    <span>Calendario Interactivo Institucional</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 font-medium">
                    Registro y visualización de eventos escolares, fechas de exámenes y reuniones de padres
                  </p>
                </div>
              </div>
              <InstitutionalCalendar
                events={calendarEvents}
                onAddEvent={handleAddCalendarEvent}
                onUpdateEvent={handleUpdateCalendarEvent}
                onDeleteEvent={handleDeleteCalendarEvent}
                onDeleteAllEvents={handleDeleteAllCalendarEvents}
              />
            </div>

            {/* Módulo de Respaldo y Copia de Seguridad */}
            <BackupDashboardCard
              students={students}
              teachers={teachers}
              exTeachers={exTeachers}
              schoolInfo={schoolInfo}
              calendarEvents={calendarEvents}
              cardConfig={cardConfig}
              issuedCards={issuedCards}
              academicTrajectories={academicTrajectories}
              disciplinaryRecords={disciplinaryRecords}
              meritConfig={meritConfig}
              onOpenBackupModal={() => setIsBackupModalOpen(true)}
              onBackupCompleted={(timestamp) => setLastBackupIso(timestamp)}
            />

            {/* Gráfico de Anillos: Distribución de Alumnos por Año Lectivo */}
            <CourseDistributionChart
              students={students}
              onNavigateToCourse={handleNavigateToCourse}
              onNavigateToStudents={() => setActiveTab('students')}
            />

            {/* Gráfico de Barras: Comparativa de Asistencia Promedio por Año Lectivo */}
            <AttendanceBarChart
              students={students}
              schoolInfo={schoolInfo}
              onNavigateToCourse={handleNavigateToCourse}
              onNavigateToAttendance={() => setActiveTab('attendance')}
            />

            {/* Sección de Alerta Temprana */}
            <EarlyWarningAlerts
              students={students}
              schoolInfo={schoolInfo}
              onInspectStudent={handleInspectStudent}
              onNavigateToCourse={handleNavigateToCourse}
            />

            {/* Compromiso Educativo (100% Dinámico) */}
            <div className="aero-header text-white p-7 sm:p-9 rounded-[34px] shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-15 pointer-events-none">
                <GraduationCap size={120} />
              </div>
              <div className="relative z-10 space-y-4">
                <h4 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight">
                  Compromiso Educativo
                </h4>
                <p className="text-sky-50 leading-relaxed font-medium text-sm sm:text-base max-w-4xl">
                  &ldquo;{schoolInfo.name} se compromete día a día con la formación integral de nuestros estudiantes en {schoolInfo.address}. Este sistema centralizado optimiza la toma de decisiones pedagógicas y administrativas para acompañar una educación de calidad en el Ciclo Lectivo {schoolInfo.academicYear}.&rdquo;
                </p>
                <div className="pt-2 flex flex-wrap gap-2.5 text-xs font-bold">
                  <span className="bg-white/15 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/25">
                    Gestión de Boletines Digitales
                  </span>
                  <span className="bg-white/15 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/25">
                    Control Diario de Asistencia
                  </span>
                  <span className="bg-white/15 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/25">
                    Legajo Único e Impresión PDF
                  </span>
                  <span className="bg-white/15 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/25">
                    Carnets Escolares con QR
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Layout>

      {/* Modal de Confirmación para Guardar y Salir del Sistema */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="aero-glass rounded-3xl max-w-md w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
                <LogOut size={22} />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  ¿Salir del sistema?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se guardarán de forma segura todos los datos cargados (alumnos, docentes, calificaciones, asistencias, trayectoria académica, calendario, carnets y configuración) y regresará a la pantalla <strong>Configuración Inicial del Establecimiento</strong>.
                </p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExitSystem}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
              >
                <Save size={15} />
                <span>Guardar y Salir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Backup y Restauración de Base de Datos */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        students={students}
        teachers={teachers}
        exTeachers={exTeachers}
        schoolInfo={schoolInfo}
        calendarEvents={calendarEvents}
        cardConfig={cardConfig}
        issuedCards={issuedCards}
        academicTrajectories={academicTrajectories}
        disciplinaryRecords={disciplinaryRecords}
        meritConfig={meritConfig}
        onRestoreBackup={handleRestoreBackup}
        onBackupCompleted={(timestamp) => setLastBackupIso(timestamp)}
      />

      {/* Modal de Configuración Rápida de Datos de la Escuela */}
      <SchoolSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        schoolInfo={schoolInfo}
        onSave={handleUpdateSchoolInfo}
      />
    </>
  );
};

export default App;
