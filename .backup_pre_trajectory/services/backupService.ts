import {
  Student,
  Teacher,
  CourseYear,
  SchoolInfo,
  DEFAULT_SCHOOL_INFO,
  CalendarEvent,
  CardDesignConfig,
  IssuedCardRecord,
} from '../types';
import { slugifyFileName } from './storageService';

export interface DatabaseBackupStats {
  totalStudents: number;
  totalTeachers: number;
  totalExTeachers: number;
  studentsPerCourse: Record<CourseYear, number>;
  totalAttendanceRecords: number;
  totalGradesCount: number;
  totalCalendarEvents?: number;
  totalIssuedCards?: number;
}

export interface DatabaseBackup {
  schemaVersion: '1.0' | '2.0';
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
    cardConfig?: CardDesignConfig;
    issuedCards?: IssuedCardRecord[];
  };
}

const STORAGE_LAST_BACKUP_KEY = 'bulacios_last_backup_date';

/**
 * Calcula estadísticas descriptivas de la base de datos actual para incluirlas en los metadatos del backup.
 */
export const calculateDatabaseStats = (
  students: Student[],
  teachers: Teacher[],
  exTeachers: Teacher[] = [],
  calendarEvents?: CalendarEvent[],
  issuedCards?: IssuedCardRecord[]
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
    totalCalendarEvents: calendarEvents?.length || 0,
    totalIssuedCards: issuedCards?.length || 0,
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
  calendarEvents?: CalendarEvent[],
  cardConfig?: CardDesignConfig,
  issuedCards?: IssuedCardRecord[]
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

  const safeSchoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const safeLocation = [schoolInfo.address, schoolInfo.locality, schoolInfo.province]
    .filter(Boolean)
    .join(' • ') || DEFAULT_SCHOOL_INFO.address;

  return {
    schemaVersion: '2.0',
    systemName: `Sistema de Gestión Escolar - ${safeSchoolName}`,
    institution: safeSchoolName,
    location: safeLocation,
    createdAt: now.toISOString(),
    createdAtFormatted: formattedDate,
    stats: calculateDatabaseStats(students, teachers, exTeachers, calendarEvents, issuedCards),
    data: {
      students: JSON.parse(JSON.stringify(students)),
      teachers: JSON.parse(JSON.stringify(teachers)),
      exTeachers: JSON.parse(JSON.stringify(exTeachers)),
      schoolInfo: JSON.parse(JSON.stringify(schoolInfo)),
      calendarEvents: calendarEvents ? JSON.parse(JSON.stringify(calendarEvents)) : undefined,
      cardConfig: cardConfig ? JSON.parse(JSON.stringify(cardConfig)) : undefined,
      issuedCards: issuedCards ? JSON.parse(JSON.stringify(issuedCards)) : undefined,
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
  calendarEvents?: CalendarEvent[],
  cardConfig?: CardDesignConfig,
  issuedCards?: IssuedCardRecord[]
): { fileName: string; sizeKb: string; timestamp: string } => {
  const backup = buildDatabaseBackup(
    students,
    teachers,
    exTeachers,
    schoolInfo,
    calendarEvents,
    cardConfig,
    issuedCards
  );
  const jsonContent = JSON.stringify(backup, null, 2);

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const instSlug = slugifyFileName(schoolInfo.name, 'escuela');
  const fileName = `backup_${instSlug}_${year}-${month}-${day}_${hours}${minutes}.json`;

  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  const isoTimestamp = now.toISOString();
  saveLastBackupDate(isoTimestamp);

  const sizeKb = (blob.size / 1024).toFixed(1);

  return {
    fileName,
    sizeKb,
    timestamp: isoTimestamp,
  };
};

export const getLastBackupDate = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_LAST_BACKUP_KEY);
  } catch {
    return null;
  }
};

export const saveLastBackupDate = (isoDate: string): void => {
  try {
    localStorage.setItem(STORAGE_LAST_BACKUP_KEY, isoDate);
  } catch (e) {
    console.error('Error al guardar fecha de backup en localStorage:', e);
  }
};

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
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
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
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
    timeDescription,
    daysPassed: diffDays,
  };
};

/**
 * Valida un archivo JSON subido por el usuario y conserva TODOS los campos
 * (incluyendo schoolInfo, calendarEvents, cardConfig e issuedCards — corrige pérdida de configuración al restaurar).
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

    let studentsArray: Student[] | null = null;
    let teachersArray: Teacher[] | null = null;
    let exTeachersArray: Teacher[] = [];
    let schoolInfoObj: SchoolInfo | undefined;
    let calendarEventsArray: CalendarEvent[] | undefined;
    let cardConfigObj: CardDesignConfig | undefined;
    let issuedCardsArray: IssuedCardRecord[] | undefined;

    if (data.data && Array.isArray(data.data.students) && Array.isArray(data.data.teachers)) {
      studentsArray = data.data.students;
      teachersArray = data.data.teachers;
      if (Array.isArray(data.data.exTeachers)) {
        exTeachersArray = data.data.exTeachers;
      }
      if (data.data.schoolInfo && typeof data.data.schoolInfo === 'object') {
        schoolInfoObj = { ...DEFAULT_SCHOOL_INFO, ...data.data.schoolInfo };
      }
      if (Array.isArray(data.data.calendarEvents)) {
        calendarEventsArray = data.data.calendarEvents;
      }
      if (data.data.cardConfig && typeof data.data.cardConfig === 'object') {
        cardConfigObj = data.data.cardConfig;
      }
      if (Array.isArray(data.data.issuedCards)) {
        issuedCardsArray = data.data.issuedCards;
      }
    } else if (Array.isArray(data.students) && Array.isArray(data.teachers)) {
      studentsArray = data.students;
      teachersArray = data.teachers;
      if (Array.isArray(data.exTeachers)) {
        exTeachersArray = data.exTeachers;
      }
      if (data.schoolInfo && typeof data.schoolInfo === 'object') {
        schoolInfoObj = { ...DEFAULT_SCHOOL_INFO, ...data.schoolInfo };
      }
      if (Array.isArray(data.calendarEvents)) {
        calendarEventsArray = data.calendarEvents;
      }
    }

    if (!studentsArray || !teachersArray) {
      return {
        success: false,
        message: 'El archivo JSON no contiene las colecciones obligatorias ("students" y "teachers").',
      };
    }

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

    const stats = calculateDatabaseStats(
      studentsArray,
      teachersArray,
      exTeachersArray,
      calendarEventsArray,
      issuedCardsArray
    );

    const verifiedBackup: DatabaseBackup = {
      schemaVersion: data.schemaVersion === '2.0' ? '2.0' : '1.0',
      systemName: data.systemName || `Sistema de Gestión Escolar - ${schoolInfoObj?.name || DEFAULT_SCHOOL_INFO.name}`,
      institution: data.institution || schoolInfoObj?.name || DEFAULT_SCHOOL_INFO.name,
      location: data.location || schoolInfoObj?.address || DEFAULT_SCHOOL_INFO.address,
      createdAt: data.createdAt || new Date().toISOString(),
      createdAtFormatted: data.createdAtFormatted || new Date().toLocaleString('es-AR'),
      stats: data.stats || stats,
      data: {
        students: studentsArray,
        teachers: teachersArray,
        exTeachers: exTeachersArray,
        schoolInfo: schoolInfoObj,
        calendarEvents: calendarEventsArray,
        cardConfig: cardConfigObj,
        issuedCards: issuedCardsArray,
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
