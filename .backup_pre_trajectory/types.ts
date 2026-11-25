export type CourseYear = '1' | '2' | '3' | '4' | '5' | '6';

export type InstitutionType =
  | 'Jardín de Infantes'
  | 'Escuela Primaria'
  | 'Escuela Secundaria'
  | 'Instituto Superior'
  | 'Escuela Técnica / Agrotécnica'
  | 'Otra Institución';

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
  // Campos aditivos de Configuración Institucional (compatibles con versiones previas)
  institutionType?: InstitutionType;
  institutionNumber?: string;
  logo?: string; // Escudo o logotipo en DataURL (PNG/JPG/WebP/SVG)
  isConfigured?: boolean;
  installationId?: string;
  updatedAt?: string;
}

export const DEFAULT_SCHOOL_INFO: SchoolInfo = {
  name: 'ESCUELA SECUNDARIA DE LOS BULACIOS',
  institutionType: 'Escuela Secundaria',
  institutionNumber: '',
  address: 'Ruta 306 Km 22 – Los Bulacio – Dpto. Cruz Alta',
  phone: '381-4567890',
  academicYear: 2026,
  cue: '9001234-00',
  email: 'secundaria.losbulacios@educaciontuc.gov.ar',
  province: 'Tucumán',
  locality: 'Los Bulacio, Dpto. Cruz Alta',
  principalName: 'Dirección Escolar',
  logo: undefined,
  isConfigured: false,
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
  division?: string; // División opcional (ej. "A", "B", "Única")
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
  // Campos aditivos opcionales (compatibles con registros existentes)
  photo?: string;
  role?: string; // Cargo o función (ej. "Docente Titular", "Profesor/a", "Preceptor/a")
}

// ============================================================================
// TIPOS ADITIVOS: CARNETS ESCOLARES, PERSONALIZACIÓN Y SISTEMA QR
// ============================================================================

export type CardOrientation = 'horizontal' | 'vertical';
export type CardSizePreset = 'cr80' | 'large'; // CR80 = 85.6 x 54 mm | large = 95 x 60 mm
export type CardFontFamily = 'jakarta' | 'dm' | 'classic';
export type CardLayoutPreset = 'aero-wave' | 'crystal-clean' | 'emerald-nature';

export interface CardDesignConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  orientation: CardOrientation;
  sizePreset: CardSizePreset;
  fontFamily: CardFontFamily;
  layoutPreset: CardLayoutPreset;
  // Campos visibles configurables
  showStudentPhoto: boolean;
  showStudentDivision: boolean;
  showStudentDniMasked: boolean;
  showTeacherPhoto: boolean;
  showTeacherDni: boolean;
  showTeacherSubjects: boolean;
  showContactOnBack: boolean;
  // Textos y vigencias configurables
  validityDate: string; // YYYY-MM-DD
  studentCardTitle: string;
  teacherCardTitle: string;
  backUsageLegend: string;
  backEmergencyNote: string;
  // Preferencias QR
  includeMaskedDniInQr: boolean;
}

export const DEFAULT_CARD_DESIGN_CONFIG: CardDesignConfig = {
  primaryColor: '#0284c7', // Sky Aero
  secondaryColor: '#06b6d4', // Cyan brillante
  accentColor: '#10b981', // Verde agua luminoso
  orientation: 'horizontal',
  sizePreset: 'cr80',
  fontFamily: 'jakarta',
  layoutPreset: 'aero-wave',
  showStudentPhoto: true,
  showStudentDivision: true,
  showStudentDniMasked: false,
  showTeacherPhoto: true,
  showTeacherDni: false,
  showTeacherSubjects: true,
  showContactOnBack: true,
  validityDate: '2026-12-31',
  studentCardTitle: 'CREDENCIAL ESTUDIANTIL',
  teacherCardTitle: 'CREDENCIAL DOCENTE',
  backUsageLegend:
    'Este carnet es personal e intransferible. Acredita la pertenencia a la institución educativa durante el ciclo lectivo vigente. En caso de extravío, devolver en Secretaría Escolar.',
  backEmergencyNote: 'Consultas administrativas y verificación en Secretaría de la Institución.',
  includeMaskedDniInQr: false,
};

/**
 * Sobrescritura puramente visual para un carnet individual.
 * Nunca modifica el registro original en `students` ni `teachers`.
 */
export interface CardVisualOverride {
  displayName?: string;
  displayPhoto?: string;
  hidePhoto?: boolean;
  customSubtitle?: string; // ej. División "A" o Cargo "Profesor Titular"
  customArea?: string;
  customValidityDate?: string;
}

export type IssuedCardStatus = 'vigente' | 'anulado' | 'reemplazado';

export interface IssuedCardRecord {
  cardNumber: string; // ej. EST-2026-0001 o DOC-2026-0001
  personId: string;
  personType: 'student' | 'teacher';
  issuedAt: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD
  academicYear: string;
  status: IssuedCardStatus;
  reissueCount: number;
  revokedAt?: string;
  revokeReason?: string;
  snapshotName: string;
  snapshotRoleOrCourse: string;
  visualOverride?: CardVisualOverride;
}

/**
 * Carga útil estructurada y versionada del código QR.
 * Por privacidad de menores, nunca almacena domicilio, teléfono personal, ficha médica ni datos familiares.
 */
export interface QRPayloadV1 {
  v: '1.0';
  uid: string; // ID interno institucional del registro
  type: 'student' | 'teacher';
  name: string;
  inst: string;
  instId?: string; // CUE o N° institucional
  role: string; // Curso/Año para alumno, o Cargo/Área para docente
  cardNo: string;
  year: string;
  validUntil: string;
  dniRef?: string; // Opcional: solo últimos dígitos o autorizado en docente
  signed: false; // Transparencia técnica explícita: sin firma criptográfica de servidor
}

// ============================================================================
// TIPOS ADITIVOS: NOTIFICACIONES PUSH EN SERVICE WORKER (ALERTAS ESCOLARES)
// ============================================================================

export type PushPermissionStatus = 'default' | 'granted' | 'denied' | 'unsupported';

export type PushDeliveryMode = 'web-push-vapid' | 'service-worker-local';

export interface PushSubscriptionPreferences {
  enabled: boolean;
  subscribedAt?: string;
  categories: CalendarEventType[];
  courses: (CourseYear | 'all')[];
  advanceDays: number; // 0 = mismo día, 1, 3, 7 días de anticipación
  notifyOnNewEvent: boolean;
  deliveryMode: PushDeliveryMode;
  vapidEndpoint?: string;
  lastCheckedAt?: string;
}

export const DEFAULT_PUSH_PREFERENCES: PushSubscriptionPreferences = {
  enabled: false,
  categories: ['examen', 'reunion_padres', 'institucional'],
  courses: ['all'],
  advanceDays: 3,
  notifyOnNewEvent: true,
  deliveryMode: 'service-worker-local',
};

export interface PushAlertHistoryItem {
  id: string;
  eventId?: string;
  eventDate?: string;
  category: CalendarEventType | 'test';
  title: string;
  body: string;
  sentAt: string;
  via: 'service-worker' | 'in-app-fallback';
  read: boolean;
  readAt?: string;
  course?: CourseYear | 'all';
  location?: string;
}

export interface InstitutionalNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  data?: {
    url?: string;
    tab?: string;
    eventId?: string;
    eventDate?: string;
    category?: CalendarEventType | 'test';
    schoolName?: string;
  };
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
