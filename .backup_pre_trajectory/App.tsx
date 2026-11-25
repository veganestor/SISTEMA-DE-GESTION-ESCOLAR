import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { PushNotificationsModal } from './components/PushNotificationsModal';
import { usePushNotifications } from './hooks/usePushNotifications';
import {
  Student,
  Teacher,
  CourseYear,
  SchoolInfo,
  DeviceViewMode,
  CalendarEvent,
  CardDesignConfig,
  IssuedCardRecord,
} from './types';
import { calculateAge } from './services/utils';
import { DatabaseBackup } from './services/backupService';
import { SAMPLE_STUDENTS, SAMPLE_TEACHERS, SAMPLE_CALENDAR_EVENTS } from './services/sampleData';
import {
  STORAGE_KEYS,
  getOrInitInstallationMeta,
  markSetupCompleted,
  loadSchoolInfo,
  loadCardDesignConfig,
  loadIssuedCards,
  readJsonStorage,
  writeJsonStorage,
  readStorageItem,
  writeStorageItem,
} from './services/storageService';
import {
  Gift,
  CalendarDays,
  PartyPopper,
  GraduationCap,
  RotateCcw,
  Settings,
  IdCard,
  BadgeCheck,
  QrCode,
  Palette,
  Database,
  AlertTriangle,
  BellRing,
  X,
} from 'lucide-react';

const INITIAL_STUDENTS: Student[] = SAMPLE_STUDENTS;
const INITIAL_TEACHERS: Teacher[] = SAMPLE_TEACHERS;
const INITIAL_EX_TEACHERS: Teacher[] = [];

const App: React.FC = () => {
  const [installationMeta, setInstallationMeta] = useState(() => getOrInitInstallationMeta());
  const [activeTab, setActiveTab] = useState('reports');
  const [selectedCourseYear, setSelectedCourseYear] = useState<CourseYear>('1');
  const [selectedStudentId, setSelectedStudentId] = useState<string | undefined>(undefined);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | undefined>(undefined);
  const [showResetSampleConfirm, setShowResetSampleConfirm] = useState(false);

  // Modo de visualización adaptativa (Automático, PC, Android, iPhone, Tablet)
  const [deviceMode, setDeviceMode] = useState<DeviceViewMode>(() => {
    const saved = readStorageItem(STORAGE_KEYS.DEVICE_VIEW_MODE) as DeviceViewMode | null;
    return saved || 'responsive';
  });

  // Identidad institucional compartida
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(() => loadSchoolInfo());

  // Registros académicos existentes (100% preservados, lectura segura con fallback)
  const [students, setStudents] = useState<Student[]>(() =>
    readJsonStorage<Student[]>(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS)
  );
  const [teachers, setTeachers] = useState<Teacher[]>(() =>
    readJsonStorage<Teacher[]>(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS)
  );
  const [exTeachers, setExTeachers] = useState<Teacher[]>(() =>
    readJsonStorage<Teacher[]>(STORAGE_KEYS.EX_TEACHERS, INITIAL_EX_TEACHERS)
  );
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() =>
    readJsonStorage<CalendarEvent[]>(STORAGE_KEYS.CALENDAR_EVENTS, SAMPLE_CALENDAR_EVENTS)
  );

  // Datos aditivos: personalización visual de carnets y registro de carnets emitidos/revocados
  const [cardConfig, setCardConfig] = useState<CardDesignConfig>(() => loadCardDesignConfig());
  const [issuedCards, setIssuedCards] = useState<IssuedCardRecord[]>(() => loadIssuedCards());

  // Persistencia local unificada (compatible Web y puente futuro Windows desktopStorage)
  useEffect(() => {
    writeJsonStorage(STORAGE_KEYS.SCHOOL_INFO, schoolInfo);
    if (typeof document !== 'undefined' && schoolInfo.name) {
      document.title = `${schoolInfo.name} — Sistema de Gestión Escolar`;
    }
  }, [schoolInfo]);

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

  // Asistente de configuración inicial (solo en primera ejecución sin configuración guardada)
  const handleCompleteInitialSetup = (configuredInfo: SchoolInfo) => {
    setSchoolInfo(configuredInfo);
    const updatedMeta = markSetupCompleted();
    setInstallationMeta(updatedMeta);
  };

  const handleSkipInitialSetup = () => {
    setSchoolInfo((prev) => ({ ...prev, isConfigured: true }));
    const updatedMeta = markSetupCompleted();
    setInstallationMeta(updatedMeta);
  };

  // Navegación directa a fecha del Calendario al tocar una notificación Push
  const handleNavigateToCalendarEvent = useCallback((eventDate?: string) => {
    if (eventDate) {
      setCalendarFocusDate(eventDate);
    }
    setActiveTab('calendar');
  }, []);

  // Motor de Notificaciones Push del Service Worker
  const pushNotifications = usePushNotifications({
    calendarEvents,
    schoolInfo,
    onNavigateToCalendarEvent: handleNavigateToCalendarEvent,
  });

  const isPushSubscribed =
    pushNotifications.preferences.enabled &&
    pushNotifications.capabilities.permission === 'granted';

  // Handlers del Calendario Institucional
  const handleAddCalendarEvent = (newEvent: CalendarEvent) => {
    setCalendarEvents((prev) => [newEvent, ...prev]);
    void pushNotifications.notifyOnCreatedEventIfSubscribed(newEvent);
  };

  const handleUpdateCalendarEvent = (updatedEvent: CalendarEvent) => {
    setCalendarEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));
  };

  const handleDeleteCalendarEvent = (eventId: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

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

  const handleConfirmResetSampleData = () => {
    setStudents(SAMPLE_STUDENTS);
    setTeachers(SAMPLE_TEACHERS);
    setCalendarEvents(SAMPLE_CALENDAR_EVENTS);
    setShowResetSampleConfirm(false);
  };

  const handleRestoreBackup = (backup: DatabaseBackup) => {
    setStudents(backup.data.students);
    setTeachers(backup.data.teachers);
    setExTeachers(backup.data.exTeachers || []);
    if (backup.data.schoolInfo) {
      setSchoolInfo((prev) => ({
        ...prev,
        ...backup.data.schoolInfo!,
        installationId: backup.data.schoolInfo!.installationId || prev.installationId,
      }));
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
  };

  // Cumpleaños del día
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

  // Pantalla de Bienvenida y Configuración Institucional en primera ejecución
  if (!installationMeta.setupCompleted) {
    return (
      <InitialSetupWizard
        initialSchoolInfo={schoolInfo}
        onComplete={handleCompleteInitialSetup}
        onSkipWithDefaults={handleSkipInitialSetup}
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
        isPushSubscribed={isPushSubscribed}
        pushAlertCount={
          pushNotifications.unreadCount > 0
            ? pushNotifications.unreadCount
            : isPushSubscribed
            ? pushNotifications.matchingUpcoming.length
            : 0
        }
        onOpenPushAlerts={() => setIsPushModalOpen(true)}
      >
        {activeTab === 'students' && (
          <StudentManager
            students={students}
            setStudents={setStudents}
            initialCourse={selectedCourseYear}
            initialStudentId={selectedStudentId}
            onClearInitialStudentId={() => setSelectedStudentId(undefined)}
            schoolInfo={schoolInfo}
          />
        )}

        {activeTab === 'attendance' && (
          <DailyAttendanceTracker
            students={students}
            setStudents={setStudents}
            schoolInfo={schoolInfo}
            initialCourse={selectedCourseYear}
          />
        )}

        {activeTab === 'teachers' && (
          <TeacherManager
            teachers={teachers}
            setTeachers={setTeachers}
            exTeachers={exTeachers}
            setExTeachers={setExTeachers}
            schoolInfo={schoolInfo}
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
              initialSelectedDate={calendarFocusDate}
              isPushSubscribed={isPushSubscribed}
              pushCategoriesCount={pushNotifications.preferences.categories.length}
              onOpenPushSettings={() => setIsPushModalOpen(true)}
              onSendEventPushAlert={(evt) => {
                void pushNotifications.notifyCalendarEventNow(evt);
              }}
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

        {activeTab === 'qr-scanner' && (
          <QRScannerPanel
            students={students}
            teachers={teachers}
            issuedCards={issuedCards}
            schoolInfo={schoolInfo}
            onInspectStudent={handleInspectStudent}
            onOpenTeachersTab={() => setActiveTab('teachers')}
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
              onSave={(updated) => setSchoolInfo(updated)}
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
                  onClick={() => setIsBackupModalOpen(true)}
                  className="aero-btn-emerald flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold shadow-sm"
                >
                  <Database size={15} />
                  <span>Backup (.JSON)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetSampleConfirm(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] bg-white/90 hover:bg-white text-slate-700 hover:text-sky-900 border border-sky-200 rounded-xl text-xs font-bold shadow-sm transition-all"
                  title="Restaurar datos de muestra iniciales de alumnos y docentes"
                >
                  <RotateCcw size={14} />
                  <span>Datos de Muestra</span>
                </button>
              </div>
            </div>

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

            {/* Notificación de Cumpleaños */}
            {todaysBirthdays.length > 0 ? (
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
                    Los siguientes alumnos cumplen años hoy{' '}
                    {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}:
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-2.5 justify-center md:justify-start">
                    {todaysBirthdays.map((student) => (
                      <div
                        key={student.id}
                        className="bg-white px-4 py-2 rounded-2xl border border-amber-200 shadow-sm flex items-center gap-2.5"
                      >
                        <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-extrabold text-xs">
                          {student.fullName.charAt(0)}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-slate-800">
                          {student.fullName}{' '}
                          <span className="text-amber-700 ml-1">({calculateAge(student.birthDate)} años)</span>
                        </span>
                      </div>
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
                initialSelectedDate={calendarFocusDate}
                isPushSubscribed={isPushSubscribed}
                pushCategoriesCount={pushNotifications.preferences.categories.length}
                onOpenPushSettings={() => setIsPushModalOpen(true)}
                onSendEventPushAlert={(evt) => {
                  void pushNotifications.notifyCalendarEventNow(evt);
                }}
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
              onOpenBackupModal={() => setIsBackupModalOpen(true)}
            />

            {/* Gráfico de Anillos: Distribución de Alumnos por Año Lectivo */}
            <CourseDistributionChart
              students={students}
              onNavigateToCourse={handleNavigateToCourse}
              onLoadSampleData={() => {
                setStudents(SAMPLE_STUDENTS);
                setTeachers(SAMPLE_TEACHERS);
              }}
            />

            {/* Gráfico de Barras: Comparativa de Asistencia Promedio por Año Lectivo */}
            <AttendanceBarChart
              students={students}
              schoolInfo={schoolInfo}
              onNavigateToCourse={handleNavigateToCourse}
              onLoadSampleData={() => {
                setStudents(SAMPLE_STUDENTS);
                setTeachers(SAMPLE_TEACHERS);
              }}
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

      {/* Modal de Confirmación para Restaurar Datos de Muestra (sin window.confirm) */}
      {showResetSampleConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4">
          <div className="aero-glass rounded-3xl max-w-md w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  ¿Restaurar datos de muestra?
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Se reemplazarán los listados actuales de alumnos, docentes y eventos del calendario por los datos de demostración. Su configuración institucional se conservará intacta.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetSampleConfirm(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmResetSampleData}
                className="flex-1 aero-btn-primary py-2.5 min-h-[44px] rounded-xl font-extrabold text-xs"
              >
                Sí, restaurar muestra
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
        onRestoreBackup={handleRestoreBackup}
      />

      {/* Modal de Configuración Rápida de Datos de la Escuela */}
      <SchoolSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        schoolInfo={schoolInfo}
        onSave={(updated) => setSchoolInfo(updated)}
      />

      {/* Modal de Suscripción a Notificaciones Push del Service Worker */}
      <PushNotificationsModal
        isOpen={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        schoolInfo={schoolInfo}
        preferences={pushNotifications.preferences}
        capabilities={pushNotifications.capabilities}
        swHealth={pushNotifications.swHealth}
        history={pushNotifications.history}
        matchingUpcoming={pushNotifications.matchingUpcoming}
        isBusy={pushNotifications.isBusy}
        feedback={pushNotifications.feedback}
        onSubscribe={pushNotifications.subscribe}
        onUnsubscribe={pushNotifications.unsubscribe}
        onToggleCategory={pushNotifications.toggleCategory}
        onToggleCourse={pushNotifications.toggleCourse}
        onSetAdvanceDays={pushNotifications.setAdvanceDays}
        onSetNotifyOnNewEvent={pushNotifications.setNotifyOnNewEvent}
        onSendTestAlert={pushNotifications.sendTestAlert}
        onScanUpcomingNow={pushNotifications.scanUpcomingAlertsNow}
        onMarkAllRead={pushNotifications.markAllRead}
        onMarkHistoryItemRead={pushNotifications.markHistoryItemRead}
        onToggleHistoryItemRead={pushNotifications.toggleHistoryItemRead}
        onDeleteHistoryItem={pushNotifications.deleteHistoryItem}
        onClearHistory={pushNotifications.clearHistory}
        onOpenCalendarEvent={handleNavigateToCalendarEvent}
      />

      {/* Avisos visuales in-app sincronizados con el Service Worker */}
      {pushNotifications.toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-20 md:bottom-5 right-3 sm:right-5 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-24px)] sm:w-96 pointer-events-none no-print"
        >
          {pushNotifications.toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto aero-glass rounded-2xl p-3.5 border-2 border-white shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 border border-sky-200 flex items-center justify-center shrink-0">
                <BellRing size={17} />
              </div>
              <div
                onClick={() => {
                  handleNavigateToCalendarEvent(toast.eventDate);
                  pushNotifications.dismissToast(toast.id);
                }}
                className="flex-1 min-w-0 cursor-pointer"
              >
                <p className="text-xs font-extrabold text-slate-900 leading-snug">
                  {toast.title}
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5 leading-snug line-clamp-2">
                  {toast.body}
                </p>
                <span className="inline-block mt-1 text-[10px] font-bold text-sky-700">
                  {toast.via === 'service-worker'
                    ? 'Enviada por Service Worker • Tocar para ver calendario'
                    : 'Aviso en aplicación • Tocar para ver calendario'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => pushNotifications.dismissToast(toast.id)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg shrink-0"
                aria-label="Cerrar aviso"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default App;
