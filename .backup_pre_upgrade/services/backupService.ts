import { Student, Teacher, CourseYear, SchoolInfo, DEFAULT_SCHOOL_INFO, CalendarEvent } from '../types';

export interface DatabaseBackupStats {
  totalStudents: number;
  totalTeachers: number;
  totalExTeachers: number;
  studentsPerCourse: Record<CourseYear, number>;
  totalAttendanceRecords: number;
  totalGradesCount: number;
}

export interface DatabaseBackup {
  schemaVersion: '1.0';
  systemName: string;
  institution: string;
  location: string;
  createdAt: string; // ISO string
  createdAtFormatted: string; // Formato legible en español
  stats: DatabaseBackupStats;
  data: {
    students: Student[];
    teachers: Teacher[];
    exTeachers: Teacher[];
    schoolInfo?: SchoolInfo;
    calendarEvents?: CalendarEvent[];
  };
}

const STORAGE_LAST_BACKUP_KEY = 'bulacios_last_backup_date';
const STORAGE_AUTO_REMINDER_DAYS_KEY = 'bulacios_backup_reminder_days';

/**
 * Calcula estadísticas descriptivas de la base de datos actual para incluirlas en los metadatos del backup.
 */
export const calculateDatabaseStats = (
  students: Student[],
  teachers: Teacher[],
  exTeachers: Teacher[] = []
): DatabaseBackupStats => {
  const studentsPerCourse: Record<CourseYear, number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
    '6': 0,
  };

  let totalAttendanceRecords = 0;
  let totalGradesCount = 0;

  students.forEach((s) => {
    if (studentsPerCourse[s.course] !== undefined) {
      studentsPerCourse[s.course]++;
    }
    totalAttendanceRecords += s.attendance?.length || 0;
    if (s.grades) {
      Object.values(s.grades).forEach((g) => {
        if (g.trimestre1 !== undefined) totalGradesCount++;
        if (g.trimestre2 !== undefined) totalGradesCount++;
        if (g.trimestre3 !== undefined) totalGradesCount++;
        if (g.final !== undefined) totalGradesCount++;
      });
    }
  });

  return {
    totalStudents: students.length,
    totalTeachers: teachers.length,
    totalExTeachers: exTeachers.length,
    studentsPerCourse,
    totalAttendanceRecords,
    totalGradesCount,
  };
};

/**
 * Genera el objeto completo de copia de seguridad con metadatos institucionales y el 100% de los datos.
 */
export const buildDatabaseBackup = (
  students: Student[],
  teachers: Teacher[],
  exTeachers: Teacher[] = [],
  schoolInfo: SchoolInfo = DEFAULT_SCHOOL_INFO,
  calendarEvents?: CalendarEvent[]
): DatabaseBackup => {
  const now = new Date();
  const formattedDate = now.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    schemaVersion: '1.0',
    systemName: `Sistema de Gestión Escolar - ${schoolInfo.name || 'Escuela Secundaria de Los Bulacios'}`,
    institution: schoolInfo.name || 'ESCUELA SECUNDARIA DE LOS BULACIOS',
    location: schoolInfo.address || 'Ruta 306 Km 22 – Los Bulacio – Dpto. Cruz Alta, Tucumán',
    createdAt: now.toISOString(),
    createdAtFormatted: formattedDate,
    stats: calculateDatabaseStats(students, teachers, exTeachers),
    data: {
      students: JSON.parse(JSON.stringify(students)),
      teachers: JSON.parse(JSON.stringify(teachers)),
      exTeachers: JSON.parse(JSON.stringify(exTeachers)),
      schoolInfo: JSON.parse(JSON.stringify(schoolInfo)),
      calendarEvents: calendarEvents ? JSON.parse(JSON.stringify(calendarEvents)) : undefined,
    },
  };
};

/**
 * Descarga el archivo JSON de copia de seguridad en el navegador del usuario y actualiza el timestamp del último respaldo.
 */
export const downloadDatabaseBackupJson = (
  students: Student[],
  teachers: Teacher[],
  exTeachers: Teacher[] = [],
  schoolInfo: SchoolInfo = DEFAULT_SCHOOL_INFO,
  calendarEvents?: CalendarEvent[]
): { fileName: string; sizeKb: string; timestamp: string } => {
  const backup = buildDatabaseBackup(students, teachers, exTeachers, schoolInfo, calendarEvents);
  const jsonContent = JSON.stringify(backup, null, 2);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const fileName = `backup_escuela_bulacios_${year}-${month}-${day}_${hours}${minutes}.json`;

  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Guardar fecha de última copia de seguridad local
  const isoTimestamp = now.toISOString();
  saveLastBackupDate(isoTimestamp);

  const sizeKb = (blob.size / 1024).toFixed(1);

  return {
    fileName,
    sizeKb,
    timestamp: isoTimestamp,
  };
};

/**
 * Obtiene la fecha del último backup descargado desde localStorage.
 */
export const getLastBackupDate = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_LAST_BACKUP_KEY);
  } catch {
    return null;
  }
};

/**
 * Guarda la fecha del último backup descargado en localStorage.
 */
export const saveLastBackupDate = (isoDate: string): void => {
  try {
    localStorage.setItem(STORAGE_LAST_BACKUP_KEY, isoDate);
  } catch (e) {
    console.error('Error al guardar fecha de backup en localStorage:', e);
  }
};

/**
 * Calcula el estado de vigencia del backup para alertas de 'Alerta / Recordatorio Automático'.
 */
export const getBackupStatus = (lastBackupIso: string | null): {
  status: 'safe' | 'warning' | 'danger';
  label: string;
  badgeClass: string;
  timeDescription: string;
  daysPassed: number;
} => {
  if (!lastBackupIso) {
    return {
      status: 'danger',
      label: 'Sin copias registradas',
      badgeClass: 'bg-red-100 text-red-700 border-red-200',
      timeDescription: 'Nunca se ha descargado un archivo de respaldo en este equipo.',
      daysPassed: 999,
    };
  }

  const lastDate = new Date(lastBackupIso);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  let timeDescription = '';
  if (diffHours < 1) {
    timeDescription = 'Hace menos de una hora';
  } else if (diffHours < 24) {
    timeDescription = `Hace ${diffHours} hora${diffHours === 1 ? '' : 's'}`;
  } else if (diffDays === 1) {
    timeDescription = 'Ayer';
  } else {
    timeDescription = `Hace ${diffDays} días`;
  }

  if (diffDays <= 3) {
    return {
      status: 'safe',
      label: 'Copia al día',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      timeDescription,
      daysPassed: diffDays,
    };
  }

  if (diffDays <= 7) {
    return {
      status: 'warning',
      label: 'Recomendado actualizar',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
      timeDescription,
      daysPassed: diffDays,
    };
  }

  return {
    status: 'danger',
    label: 'Copia desactualizada',
    badgeClass: 'bg-red-100 text-red-800 border-red-300',
    timeDescription,
    daysPassed: diffDays,
  };
};

/**
 * Valida un archivo JSON subido por el usuario para verificar si cumple la estructura de respaldo de la institución.
 */
export const validateBackupContent = (
  rawJson: string
): {
  success: boolean;
  message?: string;
  parsedBackup?: DatabaseBackup;
} => {
  try {
    const data = JSON.parse(rawJson);

    // Puede ser el formato enriquecido con data.students y data.teachers
    let studentsArray: Student[] | null = null;
    let teachersArray: Teacher[] | null = null;
    let exTeachersArray: Teacher[] = [];

    if (data.data && Array.isArray(data.data.students) && Array.isArray(data.data.teachers)) {
      studentsArray = data.data.students;
      teachersArray = data.data.teachers;
      if (Array.isArray(data.data.exTeachers)) {
        exTeachersArray = data.data.exTeachers;
      }
    } else if (Array.isArray(data.students) && Array.isArray(data.teachers)) {
      // Formato alternativo plano
      studentsArray = data.students;
      teachersArray = data.teachers;
      if (Array.isArray(data.exTeachers)) {
        exTeachersArray = data.exTeachers;
      }
    }

    if (!studentsArray || !teachersArray) {
      return {
        success: false,
        message: 'El archivo JSON no contiene las colecciones obligatorias ("alumnos" y "docentes").',
      };
    }

    // Validar integridad mínima de los registros
    const invalidStudent = studentsArray.find((s) => !s || typeof s !== 'object' || !s.fullName);
    if (invalidStudent) {
      return {
        success: false,
        message: 'El archivo contiene registros de estudiantes dañados o con formato incorrecto.',
      };
    }

    const invalidTeacher = teachersArray.find((t) => !t || typeof t !== 'object' || !t.fullName);
    if (invalidTeacher) {
      return {
        success: false,
        message: 'El archivo contiene registros de docentes dañados o con formato incorrecto.',
      };
    }

    const stats = calculateDatabaseStats(studentsArray, teachersArray, exTeachersArray);

    const verifiedBackup: DatabaseBackup = {
      schemaVersion: '1.0',
      systemName: data.systemName || 'Sistema de Gestión Escolar - Escuela Secundaria de Los Bulacios',
      institution: data.institution || 'ESCUELA SECUNDARIA DE LOS BULACIOS',
      location: data.location || 'Ruta 306 Km 22 – Los Bulacio',
      createdAt: data.createdAt || new Date().toISOString(),
      createdAtFormatted: data.createdAtFormatted || new Date().toLocaleString('es-AR'),
      stats: data.stats || stats,
      data: {
        students: studentsArray,
        teachers: teachersArray,
        exTeachers: exTeachersArray,
      },
    };

    return {
      success: true,
      parsedBackup: verifiedBackup,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Error al interpretar el archivo JSON: ${err?.message || 'Formato no válido'}`,
    };
  }
};
