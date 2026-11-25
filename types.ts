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

export interface InstitutionalUserProfile {
  id: string;
  schoolInfo: SchoolInfo;
  createdAt: string;
  lastUsedAt: string;
}

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
  source?: 'manual' | 'qr';
  recordedAt?: string; // Hora local HH:MM del registro
}

export interface MedicalRecord {
  treatments: string;
  medications: string;
  notes: string;
}

export type StudentEnrollmentStatus =
  | 'regular'
  | 'en_riesgo'
  | 'pase_saliente'
  | 'baja_abandono'
  | 'egresado';

export interface Student {
  id: string;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  dni: string;
  address: string;
  course: CourseYear;
  division?: string; // División opcional (ej. "A", "B", "Única")
  enrollmentStatus?: StudentEnrollmentStatus; // Estado de matriculación del ciclo lectivo
  enrollmentStatusDate?: string; // Fecha YYYY-MM-DD del último cambio de matriculación
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
// TIPOS ADITIVOS: TRAYECTORIA ACADÉMICA, ANTECEDENTES DISCIPLINARIOS Y ORDEN DE MÉRITO
// ============================================================================

export type SubjectAccreditationStatus =
  | 'aprobada'
  | 'desaprobada'
  | 'pendiente'
  | 'en_curso'
  | 'eximida';

export interface AcademicSubjectRecord {
  subject: string;
  trimestre1?: number;
  trimestre2?: number;
  trimestre3?: number;
  finalGrade?: number; // Nota definitiva (1-10)
  isDefinitive: boolean; // Solo computa en promedios definitivos cuando está cerrada
  weight?: number; // Peso opcional (default 1) para promedio ponderado
  status: SubjectAccreditationStatus;
  excludeFromAverage?: boolean; // Excluye materias que no corresponden al período o eximidas
  notes?: string;
}

export type AcademicMovementType =
  | 'ingreso'
  | 'promocion'
  | 'repitencia'
  | 'cambio_curso'
  | 'cambio_division'
  | 'pase_entrada'
  | 'pase_salida'
  | 'egreso'
  | 'otra_situacion';

export interface AcademicMovementRecord {
  id: string;
  date: string; // YYYY-MM-DD
  academicYear: number;
  type: AcademicMovementType;
  fromCourse?: CourseYear;
  toCourse?: CourseYear;
  fromDivision?: string;
  toDivision?: string;
  description: string;
  authority?: string;
  resolutionRef?: string;
}

export type YearTrajectoryCondition =
  | 'en_curso'
  | 'promovido'
  | 'promovido_con_pendientes'
  | 'repitio'
  | 'pase'
  | 'egresado';

export interface AcademicYearTrajectory {
  id: string;
  academicYear: number; // Ciclo lectivo (ej. 2021..2026)
  course: CourseYear; // 1 a 6
  division?: string;
  isRepeatedYear?: boolean;
  isClosed: boolean; // false = ciclo en curso/abierto -> promedio PARCIAL
  condition: YearTrajectoryCondition;
  subjects: AcademicSubjectRecord[];
  pendingSubjects: string[]; // Materias pendientes de acreditación de ese año
  observations?: string;
  updatedAt: string;
}

export interface StudentTrajectoryProfile {
  studentId: string;
  dni: string;
  entryYear: number;
  entryCourse: CourseYear;
  years: AcademicYearTrajectory[];
  movements: AcademicMovementRecord[];
  updatedAt: string;
}

export type DisciplinarySanctionType =
  | 'llamado_atencion_verbal'
  | 'llamado_atencion_escrito'
  | 'apercibimiento'
  | 'acta_compromiso'
  | 'suspension_temporal'
  | 'medida_reparadora'
  | 'otra_medida';

export type DisciplinaryActuationStatus = 'pendiente' | 'resuelta' | 'anulada';

export interface DisciplinaryIncident {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  academicYear: number;
  course: CourseYear;
  sanctionType: DisciplinarySanctionType;
  customSanctionLabel?: string;
  reason: string;
  description: string;
  authority: string;
  status: DisciplinaryActuationStatus;
  resolutionDetails?: string;
  resolutionDate?: string;
  supportingDocRef?: string;
  supportingDocName?: string;
  supportingDocDataUrl?: string;
  migratedFromLegacy?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AverageCalculationMode = 'simple' | 'weighted';
export type DisciplinaryEligibilityPolicy =
  | 'inform_only'
  | 'review_active'
  | 'exclude_selected_types';

export interface GradingPeriodWeights {
  enabled: boolean; // Si está activo, pondera 1°/2°/3° trimestre (y cierre final si >0%)
  trimestre1: number; // Porcentaje (0-100)
  trimestre2: number; // Porcentaje (0-100)
  trimestre3: number; // Porcentaje (0-100)
  finalExamWeight: number; // Porcentaje opcional para instancia final/cierre (0-100)
}

export interface CourseYearWeightsConfig {
  enabled: boolean; // Si está activo, aplica multiplicadores por año lectivo (1° a 6°) en el acumulado
  weights: Record<CourseYear, number>;
}

export interface DisciplinaryThresholdsConfig {
  /** Mínimo de sanciones disciplinarias activas que dispara Revisión Manual de elegibilidad */
  manualReviewMinActiveCount: number;
  /** Ventana temporal en ciclos lectivos (0 = toda la trayectoria 1°–6°; 1 = solo ciclo actual; 2 = últimos 2 ciclos...) */
  manualReviewRecentYearsWindow: number;
  /** Si está activo, cualquier actuación disciplinaria en estado "Pendiente" dispara revisión manual */
  alwaysReviewPendingActuations: boolean;
  /** Cantidad mínima de sanciones de tipos seleccionados para alcanzar el umbral de exclusión */
  exclusionMinSanctionCount: number;
  /** Si está activo, alcanzar el umbral de exclusión dispara Revisión Manual obligatoria en vez de exclusión automática */
  exclusionTriggersManualReviewInsteadOfHardBlock: boolean;
  /** Acumulación total de sanciones activas (cualquier tipo) que dispara escalamiento/revisión crítica (0 = desactivado) */
  maxTotalActiveSanctionsBeforeEscalation: number;
}

export const DEFAULT_GRADING_PERIOD_WEIGHTS: GradingPeriodWeights = {
  enabled: false,
  trimestre1: 30,
  trimestre2: 30,
  trimestre3: 40,
  finalExamWeight: 0,
};

export const DEFAULT_COURSE_YEAR_WEIGHTS: CourseYearWeightsConfig = {
  enabled: false,
  weights: {
    '1': 1,
    '2': 1,
    '3': 1,
    '4': 1,
    '5': 1,
    '6': 1,
  },
};

export const DEFAULT_DISCIPLINARY_THRESHOLDS: DisciplinaryThresholdsConfig = {
  manualReviewMinActiveCount: 1,
  manualReviewRecentYearsWindow: 0,
  alwaysReviewPendingActuations: true,
  exclusionMinSanctionCount: 1,
  exclusionTriggersManualReviewInsteadOfHardBlock: false,
  maxTotalActiveSanctionsBeforeEscalation: 0,
};

export interface MeritOrderConfig {
  calculationMode: AverageCalculationMode;
  decimalPlaces: 2 | 3 | 4;
  passingGrade: number;
  includePartialYearsInCumulative: boolean;
  // Ponderaciones matemáticas por período de calificación y por año de trayectoria
  gradingPeriodWeights?: GradingPeriodWeights;
  courseYearWeights?: CourseYearWeightsConfig;
  // Criterios institucionales configurables para Selección de Abanderados y Escoltas
  targetCourses: CourseYear[];
  requireDefinitiveAverage: boolean;
  requireCompleteTrajectory: boolean;
  minYearsInInstitution: number;
  requireNoPendingSubjects: boolean;
  maxAllowedPendingSubjects: number;
  allowRepeatedYears: boolean;
  disciplinaryPolicy: DisciplinaryEligibilityPolicy;
  excludedSanctionTypes: DisciplinarySanctionType[];
  ignoreAnnulledSanctions: boolean;
  // Umbrales disciplinarios configurables para disparar revisión manual o exclusión
  disciplinaryThresholds?: DisciplinaryThresholdsConfig;
  // Resolución institucional manual opcional (solo para documentar decisión ante empate o revisión)
  institutionalNotes?: string;
}

export const DEFAULT_MERIT_ORDER_CONFIG: MeritOrderConfig = {
  calculationMode: 'simple',
  decimalPlaces: 2,
  passingGrade: 6,
  includePartialYearsInCumulative: true,
  gradingPeriodWeights: { ...DEFAULT_GRADING_PERIOD_WEIGHTS },
  courseYearWeights: {
    enabled: DEFAULT_COURSE_YEAR_WEIGHTS.enabled,
    weights: { ...DEFAULT_COURSE_YEAR_WEIGHTS.weights },
  },
  targetCourses: ['6'],
  requireDefinitiveAverage: true,
  requireCompleteTrajectory: false,
  minYearsInInstitution: 1,
  requireNoPendingSubjects: true,
  maxAllowedPendingSubjects: 0,
  allowRepeatedYears: true,
  // Por defecto: NO excluye automáticamente por sanciones; informa para evaluación institucional
  disciplinaryPolicy: 'inform_only',
  excludedSanctionTypes: [],
  ignoreAnnulledSanctions: true,
  disciplinaryThresholds: { ...DEFAULT_DISCIPLINARY_THRESHOLDS },
  institutionalNotes: '',
};

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
