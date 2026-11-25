
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from './components/Layout';
import { StudentManager } from './components/StudentManager';
import { TeacherManager } from './components/TeacherManager';
import { DailyAttendanceTracker } from './components/DailyAttendanceTracker';
import { InstitutionalCalendar } from './components/InstitutionalCalendar';
import { Student, Teacher, CourseYear, SchoolInfo, DEFAULT_SCHOOL_INFO, DeviceViewMode, CalendarEvent } from './types';
import { calculateAge } from './services/utils';
import { CourseDistributionChart } from './components/CourseDistributionChart';
import { AttendanceBarChart } from './components/AttendanceBarChart';
import { EarlyWarningAlerts } from './components/EarlyWarningAlerts';
import { BackupDashboardCard } from './components/BackupDashboardCard';
import { BackupModal } from './components/BackupModal';
import { SchoolSettingsModal } from './components/SchoolSettingsModal';
import { DatabaseBackup } from './services/backupService';
import { SAMPLE_STUDENTS, SAMPLE_TEACHERS, SAMPLE_CALENDAR_EVENTS } from './services/sampleData';
import { Gift, CalendarDays, PartyPopper, GraduationCap, RotateCcw, Settings } from 'lucide-react';

const INITIAL_STUDENTS: Student[] = SAMPLE_STUDENTS;
const INITIAL_TEACHERS: Teacher[] = SAMPLE_TEACHERS;
const INITIAL_EX_TEACHERS: Teacher[] = [];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('reports');
  const [selectedCourseYear, setSelectedCourseYear] = useState<CourseYear>('1');
  const [selectedStudentId, setSelectedStudentId] = useState<string | undefined>(undefined);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Modo de visualización adaptativa (PC, Celular Android, iPhone, Tablet, Automático)
  const [deviceMode, setDeviceMode] = useState<DeviceViewMode>(() => {
    const saved = localStorage.getItem('bulacios_device_view_mode') as DeviceViewMode | null;
    return saved || 'responsive';
  });

  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(() => {
    const saved = localStorage.getItem('bulacios_school_info');
    if (saved) {
      try {
        return { ...DEFAULT_SCHOOL_INFO, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_SCHOOL_INFO;
      }
    }
    return DEFAULT_SCHOOL_INFO;
  });

  const [students, setStudents] = useState<Student[]>(() => {
    const saved = localStorage.getItem('bulacios_students');
    return saved ? JSON.parse(saved) : INITIAL_STUDENTS;
  });
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('bulacios_teachers');
    return saved ? JSON.parse(saved) : INITIAL_TEACHERS;
  });
  const [exTeachers, setExTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('bulacios_ex_teachers');
    return saved ? JSON.parse(saved) : INITIAL_EX_TEACHERS;
  });

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('bulacios_calendar_events');
    return saved ? JSON.parse(saved) : SAMPLE_CALENDAR_EVENTS;
  });

  // Persistence
  useEffect(() => {
    localStorage.setItem('bulacios_school_info', JSON.stringify(schoolInfo));
  }, [schoolInfo]);
  useEffect(() => {
    localStorage.setItem('bulacios_students', JSON.stringify(students));
  }, [students]);

  useEffect(() => {
    localStorage.setItem('bulacios_teachers', JSON.stringify(teachers));
  }, [teachers]);

  useEffect(() => {
    localStorage.setItem('bulacios_ex_teachers', JSON.stringify(exTeachers));
  }, [exTeachers]);

  useEffect(() => {
    localStorage.setItem('bulacios_calendar_events', JSON.stringify(calendarEvents));
  }, [calendarEvents]);

  useEffect(() => {
    localStorage.setItem('bulacios_device_view_mode', deviceMode);
  }, [deviceMode]);

  // Handlers para el Calendario Institucional
  const handleAddCalendarEvent = (newEvent: CalendarEvent) => {
    setCalendarEvents((prev) => [newEvent, ...prev]);
  };

  const handleUpdateCalendarEvent = (updatedEvent: CalendarEvent) => {
    setCalendarEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));
  };

  const handleDeleteCalendarEvent = (eventId: string) => {
    setCalendarEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  // Lógica de navegación desde el gráfico de distribución
  const handleNavigateToCourse = (course: CourseYear) => {
    setSelectedCourseYear(course);
    setActiveTab('students');
  };

  // Navegar a la ficha de un alumno específico desde Alerta Temprana
  const handleInspectStudent = (student: Student) => {
    setSelectedCourseYear(student.course);
    setSelectedStudentId(student.id);
    setActiveTab('students');
  };

  const handleResetSampleData = () => {
    if (window.confirm('¿Desea restaurar los datos de muestra de la institución?')) {
      setStudents(SAMPLE_STUDENTS);
      setTeachers(SAMPLE_TEACHERS);
      setCalendarEvents(SAMPLE_CALENDAR_EVENTS);
    }
  };

  const handleRestoreBackup = (backup: DatabaseBackup) => {
    setStudents(backup.data.students);
    setTeachers(backup.data.teachers);
    setExTeachers(backup.data.exTeachers || []);
    if (backup.data.schoolInfo) {
      setSchoolInfo(backup.data.schoolInfo);
    }
    if (backup.data.calendarEvents) {
      setCalendarEvents(backup.data.calendarEvents);
    }
  };

  // Lógica de cumpleaños
  const todaysBirthdays = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;

    return students.filter(student => {
      const parts = student.birthDate.split('-');
      if (parts.length !== 3) return false;
      const birthMonth = parseInt(parts[1], 10);
      const birthDay = parseInt(parts[2], 10);
      return birthMonth === currentMonth && birthDay === currentDay;
    });
  }, [students]);

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
            <div className="space-y-1">
              <h2 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tight">Calendario Escolar y Agenda Institucional</h2>
              <p className="text-base text-gray-500 font-medium">Registro y visualización de eventos institucionales, fechas de exámenes y reuniones de padres</p>
            </div>
            <InstitutionalCalendar 
              events={calendarEvents}
              onAddEvent={handleAddCalendarEvent}
              onUpdateEvent={handleUpdateCalendarEvent}
              onDeleteEvent={handleDeleteCalendarEvent}
            />
          </div>
        )}
        {activeTab === 'reports' && (
          <div className="space-y-10 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
             <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
               <div className="text-center sm:text-left space-y-1">
                 <h2 className="text-3xl md:text-4xl font-black text-gray-800 tracking-tight">Panel de Control Institucional</h2>
                 <p className="text-base text-gray-500 font-medium">Resumen general y métricas del Ciclo Lectivo {schoolInfo.academicYear}</p>
               </div>
               <div className="flex flex-wrap items-center gap-2">
                 <button
                   onClick={() => setIsSettingsModalOpen(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-sm transition-all"
                   title="Editar datos institucionales de la escuela (nombre, dirección, teléfono, ciclo lectivo)"
                 >
                   <Settings size={14} className="text-amber-300" />
                   <span>Datos de la Escuela</span>
                 </button>
                 <button
                   onClick={() => setIsBackupModalOpen(true)}
                   className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-blue-950 rounded-xl text-xs font-black shadow-sm transition-all"
                   title="Abrir módulo de copia de seguridad y backup automático"
                 >
                   <span>💾 Backup Automático (.JSON)</span>
                 </button>
                 <button
                   onClick={handleResetSampleData}
                   className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-600 hover:text-blue-900 border border-gray-200 rounded-xl text-xs font-bold shadow-sm transition-all"
                   title="Restaurar datos iniciales de alumnos y docentes"
                 >
                   <RotateCcw size={14} />
                   <span>Cargar Datos de Muestra</span>
                 </button>
               </div>
             </div>
             
             {/* Notificación de Cumpleaños */}
             {todaysBirthdays.length > 0 ? (
               <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-[32px] p-8 shadow-sm flex flex-col md:flex-row items-center gap-8 animate-in slide-in-from-top-4 duration-700">
                  <div className="bg-amber-500 text-white p-5 rounded-3xl shadow-lg transform -rotate-6">
                     <Gift size={40} />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                     <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                        <PartyPopper size={20} className="text-amber-600" />
                        <h3 className="text-xl font-black text-amber-900 uppercase tracking-tight">¡Hoy celebramos cumpleaños!</h3>
                     </div>
                     <p className="text-amber-700 font-medium">Los siguientes alumnos cumplen años hoy {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}:</p>
                     <div className="mt-4 flex flex-wrap gap-3 justify-center md:justify-start">
                        {todaysBirthdays.map(student => (
                          <div key={student.id} className="bg-white px-5 py-2.5 rounded-2xl border border-amber-200 shadow-sm flex items-center gap-3 transition-transform hover:scale-105">
                             <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-black text-xs">{student.fullName.charAt(0)}</span>
                             <span className="font-bold text-gray-800">{student.fullName} <span className="text-amber-600 ml-1">({calculateAge(student.birthDate)} años)</span></span>
                          </div>
                        ))}
                     </div>
                  </div>
               </div>
             ) : (
               <div className="bg-white border-2 border-dashed border-gray-100 rounded-[32px] p-8 flex flex-col items-center justify-center text-gray-300">
                  <CalendarDays size={40} className="mb-3 opacity-20" />
                  <p className="font-bold uppercase tracking-widest text-xs">No hay cumpleaños registrados para el día de hoy</p>
               </div>
             )}

             {/* Métricas Generales */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
                <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100 border-b-8 border-b-blue-600 transform hover:-translate-y-1 transition-transform">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Población Estudiantil</p>
                    <h3 className="font-black text-5xl text-blue-600">{students.length}</h3>
                    <p className="text-gray-500 mt-2 font-medium text-sm">Alumnos Matriculados</p>
                </div>
                <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100 border-b-8 border-b-green-600 transform hover:-translate-y-1 transition-transform">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Planta Funcional</p>
                    <h3 className="font-black text-5xl text-green-600">{teachers.length}</h3>
                    <p className="text-gray-500 mt-2 font-medium text-sm">Docentes en Ejercicio</p>
                </div>
                <div className="bg-white p-7 rounded-3xl shadow-sm border border-gray-100 border-b-8 border-b-purple-600 transform hover:-translate-y-1 transition-transform">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Desvinculaciones</p>
                    <h3 className="font-black text-5xl text-purple-600">{exTeachers.length}</h3>
                    <p className="text-gray-500 mt-2 font-medium text-sm">Historial Ex-Docentes</p>
                </div>
             </div>

             {/* Calendario Interactivo en el Dashboard con Recordatorios Visuales */}
             <div className="space-y-4">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-3">
                 <div>
                   <h3 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2.5">
                     <CalendarDays className="text-blue-900" size={26} />
                     <span>Calendario Interactivo Institucional</span>
                   </h3>
                   <p className="text-sm text-gray-500 font-medium">
                     Registro y visualización de eventos escolares, fechas de exámenes y reuniones de padres
                   </p>
                 </div>
               </div>
               <InstitutionalCalendar 
                 events={calendarEvents}
                 onAddEvent={handleAddCalendarEvent}
                 onUpdateEvent={handleUpdateCalendarEvent}
                 onDeleteEvent={handleDeleteCalendarEvent}
               />
             </div>

             {/* Módulo de Respaldo y Copia de Seguridad */}
             <BackupDashboardCard 
                students={students} 
                teachers={teachers} 
                exTeachers={exTeachers} 
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
                onNavigateToCourse={handleNavigateToCourse}
                onLoadSampleData={() => {
                  setStudents(SAMPLE_STUDENTS);
                  setTeachers(SAMPLE_TEACHERS);
                }}
             />

             {/* Sección de Alerta Temprana: Alumnos con más del 20% de Inasistencias */}
             <EarlyWarningAlerts 
                students={students}
                onInspectStudent={handleInspectStudent}
                onNavigateToCourse={handleNavigateToCourse}
             />

             {/* Compromiso Educativo */}
             <div className="bg-blue-900 text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                   <GraduationCap size={120} />
                </div>
                <div className="relative z-10 space-y-4">
                   <h4 className="text-2xl font-black uppercase tracking-tighter italic">Compromiso Educativo</h4>
                   <p className="text-blue-100 leading-relaxed font-medium">
                     "{schoolInfo.name} se compromete día a día con la formación integral de nuestros jóvenes en {schoolInfo.address}. Este sistema centralizado permite optimizar la toma de decisiones pedagógicas y administrativas para asegurar una educación de calidad en el Ciclo Lectivo {schoolInfo.academicYear}."
                   </p>
                   <div className="pt-4 flex flex-wrap gap-4">
                      <div className="bg-blue-800/50 px-4 py-2 rounded-xl text-xs font-bold border border-blue-700">Gestión de Boletines Digitales</div>
                      <div className="bg-blue-800/50 px-4 py-2 rounded-xl text-xs font-bold border border-blue-700">Control Biométrico de Asistencia</div>
                      <div className="bg-blue-800/50 px-4 py-2 rounded-xl text-xs font-bold border border-blue-700">Legajo Único de Alumno</div>
                   </div>
                </div>
             </div>
          </div>
        )}
      </Layout>

      {/* Modal de Backup y Restauración de Base de Datos */}
      <BackupModal 
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        students={students}
        teachers={teachers}
        exTeachers={exTeachers}
        schoolInfo={schoolInfo}
        calendarEvents={calendarEvents}
        onRestoreBackup={handleRestoreBackup}
      />

      {/* Modal de Configuración de Datos de la Escuela */}
      <SchoolSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        schoolInfo={schoolInfo}
        onSave={(updated) => setSchoolInfo(updated)}
      />
    </>
  );
};

export default App;
