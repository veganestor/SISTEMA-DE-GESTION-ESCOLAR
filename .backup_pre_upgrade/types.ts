
export type CourseYear = '1' | '2' | '3' | '4' | '5' | '6';

export interface SchoolInfo {
  name: string;
  address: string;
  phone: string;
  academicYear: number | string;
  cue?: string;
  email?: string;
  province?: string;
  locality?: string;
  principalName?: string;
}

export const DEFAULT_SCHOOL_INFO: SchoolInfo = {
  name: 'ESCUELA SECUNDARIA DE LOS BULACIOS',
  address: 'Ruta 306 Km 22 – Los Bulacio – Dpto. Cruz Alta',
  phone: '381-4567890',
  academicYear: 2026,
  cue: '9001234-00',
  email: 'secundaria.losbulacios@educaciontuc.gov.ar',
  province: 'Tucumán',
  locality: 'Los Bulacio, Dpto. Cruz Alta',
  principalName: 'Dirección Escolar',
};

export interface Grade {
  trimestre1?: number;
  trimestre2?: number;
  trimestre3?: number;
  final?: number;
}

export interface AttendanceRecord {
  date: string; // ISO string YYYY-MM-DD
  type: 'presente' | 'ausente' | 'tarde';
  justified?: boolean;
  reason?: string; // Motivo de la inasistencia o tardanza
}

export interface MedicalRecord {
  treatments: string;
  medications: string;
  notes: string;
}

export interface Student {
  id: string;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  dni: string;
  address: string;
  course: CourseYear;
  grades: Record<string, Grade>; // Key is subject name
  attendance: AttendanceRecord[];
  medical: MedicalRecord;
  disciplinary: string[]; // Llamados de atención
  photo?: string; // Foto de perfil del alumno (URL o base64)
}

export type DeviceViewMode = 'responsive' | 'pc' | 'android' | 'iphone' | 'tablet';

export type CalendarEventType = 'institucional' | 'examen' | 'reunion_padres' | 'feriado';

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  type: CalendarEventType;
  description?: string;
  targetCourse: CourseYear | 'all';
  location?: string;
  isHighPriority?: boolean;
}

export interface LicenseRecord {
  type: string;
  from: string;
  to: string;
  presentationDate: string;
  licenseCode: string;
}

export interface TeacherAttendance {
  date: string;
  type: 'licencia' | 'ausente_injustificado' | 'permiso' | 'compensatorio';
  licenseCode?: string;
  notes?: string;
  licenseDetails?: LicenseRecord;
}

export interface Teacher {
  id: string;
  fullName: string;
  dni: string;
  birthDate: string;
  legajo: string;
  entryDate: string;
  exitDate?: string;
  address: string;
  hours: number;
  phone: string;
  email: string;
  assignedCourses: { course: CourseYear; subject: string }[];
  attendance: TeacherAttendance[];
}

export const SUBJECTS_BY_YEAR: Record<CourseYear, string[]> = {
  '1': [
    'LENGUA Y LITERATURA 1', 'LENGUA EXTRANJERA 1', 'MATEMÁTICA 1', 'HISTORIA 1',
    'GEOGRAFÍA 1', 'BIOLOGÍA 1', 'FÍSICA 1', 'EDUCACIÓN ARTÍSTICA 1',
    'EDUCACIÓN FÍSICA 1', 'FORMACIÓN ÉTICA 1 / FORMACIÓN RELIGIOSA 1'
  ],
  '2': [
    'LENGUA Y LITERATURA 2', 'LENGUA EXTRANJERA 2', 'MATEMÁTICA 2', 'HISTORIA 2',
    'GEOGRAFÍA 2', 'BIOLOGÍA 2', 'FÍSICA 2', 'QUÍMICA 1', 'EDUCACIÓN ARTÍSTICA 2',
    'EDUCACIÓN TECNOLÓGICA 1', 'EDUCACIÓN FÍSICA 2', 'FORMACIÓN ÉTICA 2 / FORMACIÓN RELIGIOSA 2'
  ],
  '3': [
    'LENGUA Y LITERATURA 3', 'LENGUA EXTRANJERA 3', 'MATEMÁTICA 3', 'HISTORIA 3',
    'GEOGRAFÍA 3', 'BIOLOGÍA 3', 'CONSTRUCCIÓN DE CIUDADANÍA', 'QUÍMICA 2',
    'EDUCACIÓN ARTÍSTICA 3', 'EDUCACIÓN TECNOLÓGICA 2', 'EDUCACIÓN FÍSICA 3',
    'FORMACIÓN ÉTICA 3 / FORMACIÓN RELIGIOSA 3'
  ],
  '4': [
    'LENGUA Y LITERATURA 4', 'LENGUA EXTRANJERA 4', 'MATEMÁTICA 4', 'HISTORIA 4',
    'GEOGRAFÍA 4', 'EDUCACIÓN FÍSICA 4', 'SALUD Y ADOLESCENCIA', 'BIOLOGÍA 4',
    'QUÍMICA 3', 'SISTEMA AGROAMBIENTALES', 'FÍSICA 3'
  ],
  '5': [
    'LENGUA Y LITERATURA 5', 'LENGUA EXTRANJERA 5', 'MATEMÁTICA 5', 'HISTORIA 5',
    'GEOGRAFÍA 5', 'EDUCACIÓN FÍSICA 5', 'POLÍTICA Y CIUDADANÍA',
    'TECNOLOGÍA DE LA INFORMACIÓN Y DE LA COMUNICACIÓN', 'GESTIÓN AGRO AMBIENTALES',
    'PRODUCCIÓN VEGETAL', 'CIENCIAS DE LA TIERRA'
  ],
  '6': [
    'LENGUA Y LITERATURA 6', 'LENGUA EXTRANJERA 6', 'MATEMÁTICA 6', 'ECONOMÍA',
    'ARTE Y ESTÉTICA CONTEMPORÁNEAS', 'EDUCACIÓN FÍSICA 6', 'TRABAJO Y CIUDADANÍA',
    'FILOSOFÍA', 'BIOTECNOLOGÍA', 'PRODUCCIÓN ANIMAL', 'PROYECTO TECNOLÓGICO AGROPECUARIO'
  ]
};
