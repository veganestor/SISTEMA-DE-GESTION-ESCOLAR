import {
  SchoolInfo,
  DEFAULT_SCHOOL_INFO,
  InstitutionalUserProfile,
  CardDesignConfig,
  DEFAULT_CARD_DESIGN_CONFIG,
  IssuedCardRecord,
  StudentTrajectoryProfile,
  DisciplinaryIncident,
  MeritOrderConfig,
  DEFAULT_MERIT_ORDER_CONFIG,
  DEFAULT_GRADING_PERIOD_WEIGHTS,
  DEFAULT_COURSE_YEAR_WEIGHTS,
  DEFAULT_DISCIPLINARY_THRESHOLDS,
} from '../types';

/**
 * Capa de persistencia desacoplada preparada tanto para entorno Web (localStorage)
 * como para futura versión de escritorio Windows (Electron / Tauri), donde un bridge
 * nativo `window.desktopStorage` guarda los datos en `%APPDATA%/<App>/userData`
 * fuera de la carpeta de instalación para que no se pierdan al actualizar o reinstalar.
 */
interface DesktopStorageBridge {
  getItemSync?: (key: string) => string | null;
  setItemSync?: (key: string, value: string) => void;
  getDataDirectory?: () => string;
}

declare global {
  interface Window {
    desktopStorage?: DesktopStorageBridge;
  }
}

export const STORAGE_KEYS = {
  SCHOOL_INFO: 'bulacios_school_info',
  STUDENTS: 'bulacios_students',
  TEACHERS: 'bulacios_teachers',
  EX_TEACHERS: 'bulacios_ex_teachers',
  CALENDAR_EVENTS: 'bulacios_calendar_events',
  DEVICE_VIEW_MODE: 'bulacios_device_view_mode',
  LAST_BACKUP_DATE: 'bulacios_last_backup_date',
  // Claves aditivas
  CARD_DESIGN_CONFIG: 'bulacios_card_design_config',
  ISSUED_CARDS: 'bulacios_issued_cards',
  INSTALLATION_META: 'bulacios_installation_meta',
  INSTITUTIONAL_USERS: 'bulacios_institutional_users',
  // Claves aditivas: Trayectoria Académica, Antecedentes Disciplinarios y Orden de Mérito
  ACADEMIC_TRAJECTORIES: 'bulacios_academic_trajectories',
  DISCIPLINARY_RECORDS: 'bulacios_disciplinary_records',
  MERIT_ORDER_CONFIG: 'bulacios_merit_order_config',
  TRAJECTORY_MIGRATION_SNAPSHOT: 'bulacios_trajectory_migration_snapshot',
  // Clave aditiva: estado de lectura/archivo de notificaciones internas del Panel de Control
  DASHBOARD_DISMISSED_NOTIFICATIONS: 'bulacios_dashboard_dismissed_notifications',
  // Marca de limpieza única de registros de prueba heredados
  CLEAN_ROSTER_V1: 'bulacios_clean_roster_v1',
  CLEAN_CALENDAR_V1: 'bulacios_clean_calendar_v1',
} as const;

export interface InstallationMeta {
  installationId: string;
  schemaVersion: string;
  setupCompleted: boolean;
  createdAt: string;
  storageMode: 'web-local' | 'desktop-user-data';
}

/**
 * Retorna la fecha local actual en formato YYYY-MM-DD sin desplazamiento UTC.
 * Corrige el desfase de toISOString() en Argentina (UTC-3) después de las 21:00 hs.
 */
export const getLocalTodayISO = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const readStorageItem = (key: string): string | null => {
  try {
    if (typeof window !== 'undefined' && window.desktopStorage?.getItemSync) {
      return window.desktopStorage.getItemSync(key);
    }
    return localStorage.getItem(key);
  } catch (err) {
    console.error(`[storageService] Error leyendo clave "${key}":`, err);
    return null;
  }
};

export const writeStorageItem = (key: string, value: string): boolean => {
  try {
    if (typeof window !== 'undefined' && window.desktopStorage?.setItemSync) {
      window.desktopStorage.setItemSync(key, value);
    }
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.error(`[storageService] Error guardando clave "${key}":`, err);
    return false;
  }
};

export const readJsonStorage = <T>(key: string, fallback: T): T => {
  const raw = readStorageItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJsonStorage = <T>(key: string, value: T): boolean => {
  try {
    return writeStorageItem(key, JSON.stringify(value));
  } catch {
    return false;
  }
};

const isExplicitlyCreatedSchoolInfo = (saved: Partial<SchoolInfo> | null): saved is SchoolInfo => {
  if (!saved || !saved.name || !saved.name.trim()) return false;
  if (!saved.isConfigured) return false;
  if (saved.updatedAt) return true;
  return saved.name.trim() !== DEFAULT_SCHOOL_INFO.name;
};

/**
 * Obtiene o inicializa los metadatos únicos de esta instalación.
 * Si el usuario ya tenía datos previos guardados en localStorage, preserva su estado sin borrar nada.
 */
export const getOrInitInstallationMeta = (): InstallationMeta => {
  const existing = readJsonStorage<InstallationMeta | null>(STORAGE_KEYS.INSTALLATION_META, null);
  const storageMode: InstallationMeta['storageMode'] =
    typeof window !== 'undefined' && window.desktopStorage ? 'desktop-user-data' : 'web-local';

  if (existing && existing.installationId) {
    return { ...existing, storageMode };
  }

  const savedSchool = readJsonStorage<Partial<SchoolInfo> | null>(STORAGE_KEYS.SCHOOL_INFO, null);
  const existingUsers = readJsonStorage<InstitutionalUserProfile[] | null>(
    STORAGE_KEYS.INSTITUTIONAL_USERS,
    null
  );
  const hasExistingConfiguredUser =
    (Array.isArray(existingUsers) && existingUsers.length > 0) ||
    isExplicitlyCreatedSchoolInfo(savedSchool);
  const meta: InstallationMeta = {
    installationId: generateUUID(),
    schemaVersion: '2.0',
    // Si es primera ejecución limpia o no existen usuarios creados, muestra la configuración inicial
    setupCompleted: hasExistingConfiguredUser,
    createdAt: new Date().toISOString(),
    storageMode,
  };
  writeJsonStorage(STORAGE_KEYS.INSTALLATION_META, meta);
  return meta;
};

export const markSetupCompleted = (): InstallationMeta => {
  const current = getOrInitInstallationMeta();
  const updated: InstallationMeta = { ...current, setupCompleted: true };
  writeJsonStorage(STORAGE_KEYS.INSTALLATION_META, updated);
  return updated;
};

export const reopenInitialSetup = (): InstallationMeta => {
  const current = getOrInitInstallationMeta();
  const updated: InstallationMeta = { ...current, setupCompleted: false };
  writeJsonStorage(STORAGE_KEYS.INSTALLATION_META, updated);
  return updated;
};

export const loadSchoolInfo = (): SchoolInfo => {
  const meta = getOrInitInstallationMeta();
  const saved = readJsonStorage<Partial<SchoolInfo> | null>(STORAGE_KEYS.SCHOOL_INFO, null);
  if (!saved) {
    return {
      ...DEFAULT_SCHOOL_INFO,
      installationId: meta.installationId,
    };
  }
  return {
    ...DEFAULT_SCHOOL_INFO,
    ...saved,
    installationId: saved.installationId || meta.installationId,
  };
};

export const saveInstitutionalUsers = (users: InstitutionalUserProfile[]): boolean => {
  return writeJsonStorage(STORAGE_KEYS.INSTITUTIONAL_USERS, users);
};

export const loadInstitutionalUsers = (): InstitutionalUserProfile[] => {
  const raw = readJsonStorage<InstitutionalUserProfile[] | null>(
    STORAGE_KEYS.INSTITUTIONAL_USERS,
    null
  );

  if (Array.isArray(raw)) {
    return raw
      .filter((u) => u && u.id && u.schoolInfo && typeof u.schoolInfo.name === 'string' && u.schoolInfo.name.trim() !== '')
      .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''));
  }

  // Migración compatible: si ya existía una institución guardada explícitamente antes de esta actualización, preservarla como usuario creado
  const savedSchool = readJsonStorage<Partial<SchoolInfo> | null>(STORAGE_KEYS.SCHOOL_INFO, null);
  if (isExplicitlyCreatedSchoolInfo(savedSchool)) {
    const nowIso = savedSchool.updatedAt || new Date().toISOString();
    const migrated: InstitutionalUserProfile = {
      id: generateUUID(),
      schoolInfo: {
        ...savedSchool,
        name: savedSchool.name.trim(),
        isConfigured: true,
      },
      createdAt: nowIso,
      lastUsedAt: nowIso,
    };
    saveInstitutionalUsers([migrated]);
    return [migrated];
  }

  return [];
};

export const upsertInstitutionalUser = (
  schoolInfo: SchoolInfo,
  existingUserId?: string
): { users: InstitutionalUserProfile[]; activeUser: InstitutionalUserProfile } => {
  const currentUsers = loadInstitutionalUsers();
  const nowIso = new Date().toISOString();
  const normalizedName = schoolInfo.name.trim().toLowerCase();
  const normalizedCue = (schoolInfo.cue || '').trim().toLowerCase();

  const cleanSchoolInfo: SchoolInfo = {
    ...schoolInfo,
    name: schoolInfo.name.trim(),
    isConfigured: true,
    updatedAt: schoolInfo.updatedAt || nowIso,
  };

  let matchIndex = -1;
  if (existingUserId) {
    matchIndex = currentUsers.findIndex((u) => u.id === existingUserId);
  }
  if (matchIndex === -1) {
    matchIndex = currentUsers.findIndex(
      (u) =>
        u.schoolInfo.name.trim().toLowerCase() === normalizedName &&
        (u.schoolInfo.cue || '').trim().toLowerCase() === normalizedCue
    );
  }

  let activeUser: InstitutionalUserProfile;
  let nextUsers: InstitutionalUserProfile[];

  if (matchIndex >= 0) {
    const prev = currentUsers[matchIndex];
    activeUser = {
      ...prev,
      schoolInfo: cleanSchoolInfo,
      lastUsedAt: nowIso,
    };
    nextUsers = [
      activeUser,
      ...currentUsers.filter((_, idx) => idx !== matchIndex),
    ];
  } else {
    activeUser = {
      id: generateUUID(),
      schoolInfo: cleanSchoolInfo,
      createdAt: nowIso,
      lastUsedAt: nowIso,
    };
    nextUsers = [activeUser, ...currentUsers];
  }

  saveInstitutionalUsers(nextUsers);
  return { users: nextUsers, activeUser };
};

export const loadCardDesignConfig = (): CardDesignConfig => {
  const saved = readJsonStorage<Partial<CardDesignConfig> | null>(STORAGE_KEYS.CARD_DESIGN_CONFIG, null);
  if (!saved) return DEFAULT_CARD_DESIGN_CONFIG;
  return {
    ...DEFAULT_CARD_DESIGN_CONFIG,
    ...saved,
  };
};

export const loadIssuedCards = (): IssuedCardRecord[] => {
  const saved = readJsonStorage<IssuedCardRecord[]>(STORAGE_KEYS.ISSUED_CARDS, []);
  return Array.isArray(saved) ? saved : [];
};

export const loadAcademicTrajectories = (): Record<string, StudentTrajectoryProfile> => {
  const saved = readJsonStorage<Record<string, StudentTrajectoryProfile>>(
    STORAGE_KEYS.ACADEMIC_TRAJECTORIES,
    {}
  );
  return saved && typeof saved === 'object' ? saved : {};
};

export const saveAcademicTrajectories = (
  trajectories: Record<string, StudentTrajectoryProfile>
): boolean => {
  return writeJsonStorage(STORAGE_KEYS.ACADEMIC_TRAJECTORIES, trajectories);
};

export const loadDisciplinaryRecords = (): DisciplinaryIncident[] => {
  const saved = readJsonStorage<DisciplinaryIncident[]>(
    STORAGE_KEYS.DISCIPLINARY_RECORDS,
    []
  );
  return Array.isArray(saved) ? saved : [];
};

export const saveDisciplinaryRecords = (records: DisciplinaryIncident[]): boolean => {
  return writeJsonStorage(STORAGE_KEYS.DISCIPLINARY_RECORDS, records);
};

export const loadMeritOrderConfig = (): MeritOrderConfig => {
  const saved = readJsonStorage<Partial<MeritOrderConfig> | null>(
    STORAGE_KEYS.MERIT_ORDER_CONFIG,
    null
  );
  if (!saved) return DEFAULT_MERIT_ORDER_CONFIG;
  return {
    ...DEFAULT_MERIT_ORDER_CONFIG,
    ...saved,
    gradingPeriodWeights: {
      ...DEFAULT_GRADING_PERIOD_WEIGHTS,
      ...(saved.gradingPeriodWeights || {}),
    },
    courseYearWeights: {
      enabled:
        saved.courseYearWeights?.enabled ?? DEFAULT_COURSE_YEAR_WEIGHTS.enabled,
      weights: {
        ...DEFAULT_COURSE_YEAR_WEIGHTS.weights,
        ...(saved.courseYearWeights?.weights || {}),
      },
    },
    disciplinaryThresholds: {
      ...DEFAULT_DISCIPLINARY_THRESHOLDS,
      ...(saved.disciplinaryThresholds || {}),
    },
    targetCourses:
      Array.isArray(saved.targetCourses) && saved.targetCourses.length > 0
        ? saved.targetCourses
        : DEFAULT_MERIT_ORDER_CONFIG.targetCourses,
    excludedSanctionTypes: Array.isArray(saved.excludedSanctionTypes)
      ? saved.excludedSanctionTypes
      : [],
  };
};

export const saveMeritOrderConfig = (config: MeritOrderConfig): boolean => {
  return writeJsonStorage(STORAGE_KEYS.MERIT_ORDER_CONFIG, config);
};

export interface TrajectoryMigrationSnapshot {
  createdAt: string;
  previousTrajectories: Record<string, StudentTrajectoryProfile>;
  previousDisciplinary: DisciplinaryIncident[];
  reason: string;
}

export const saveTrajectoryMigrationSnapshot = (
  snapshot: TrajectoryMigrationSnapshot
): boolean => {
  return writeJsonStorage(STORAGE_KEYS.TRAJECTORY_MIGRATION_SNAPSHOT, snapshot);
};

export const loadTrajectoryMigrationSnapshot = (): TrajectoryMigrationSnapshot | null => {
  return readJsonStorage<TrajectoryMigrationSnapshot | null>(
    STORAGE_KEYS.TRAJECTORY_MIGRATION_SNAPSHOT,
    null
  );
};

export const loadDismissedDashboardNotifications = (): string[] => {
  const saved = readJsonStorage<string[]>(STORAGE_KEYS.DASHBOARD_DISMISSED_NOTIFICATIONS, []);
  return Array.isArray(saved) ? saved.filter((item) => typeof item === 'string' && item.trim() !== '') : [];
};

export const saveDismissedDashboardNotifications = (ids: string[]): boolean => {
  const unique = Array.from(new Set(ids.filter((item) => typeof item === 'string' && item.trim() !== '')));
  return writeJsonStorage(STORAGE_KEYS.DASHBOARD_DISMISSED_NOTIFICATIONS, unique);
};

const LEGACY_SAMPLE_STUDENT_IDS = new Set([
  'std-101', 'std-102', 'std-103', 'std-104', 'std-105',
  'std-201', 'std-202', 'std-203', 'std-204',
  'std-301', 'std-302', 'std-303',
  'std-401', 'std-402', 'std-403', 'std-404',
  'std-501', 'std-502', 'std-503',
  'std-601', 'std-602',
]);

const LEGACY_SAMPLE_TEACHER_IDS = new Set(['tch-01', 'tch-02', 'tch-03']);

/**
 * Elimina de manera idempotente (una sola vez) los alumnos y docentes de prueba
 * heredados de sesiones previas en almacenamiento local, conservando intacto
 * cualquier integrante real creado por el usuario.
 */
export const purgeLegacySampleRosterIfNeeded = (): void => {
  if (typeof window === 'undefined') return;
  if (readStorageItem(STORAGE_KEYS.CLEAN_ROSTER_V1) === 'done') return;

  const savedStudents = readJsonStorage<{ id?: string }[] | null>(STORAGE_KEYS.STUDENTS, null);
  if (Array.isArray(savedStudents)) {
    const cleaned = savedStudents.filter((s) => !s?.id || !LEGACY_SAMPLE_STUDENT_IDS.has(s.id));
    if (cleaned.length !== savedStudents.length) {
      writeJsonStorage(STORAGE_KEYS.STUDENTS, cleaned);
    }
  }

  const savedTeachers = readJsonStorage<{ id?: string }[] | null>(STORAGE_KEYS.TEACHERS, null);
  if (Array.isArray(savedTeachers)) {
    const cleaned = savedTeachers.filter((t) => !t?.id || !LEGACY_SAMPLE_TEACHER_IDS.has(t.id));
    if (cleaned.length !== savedTeachers.length) {
      writeJsonStorage(STORAGE_KEYS.TEACHERS, cleaned);
    }
  }

  const savedExTeachers = readJsonStorage<{ id?: string }[] | null>(STORAGE_KEYS.EX_TEACHERS, null);
  if (Array.isArray(savedExTeachers)) {
    const cleaned = savedExTeachers.filter((t) => !t?.id || !LEGACY_SAMPLE_TEACHER_IDS.has(t.id));
    if (cleaned.length !== savedExTeachers.length) {
      writeJsonStorage(STORAGE_KEYS.EX_TEACHERS, cleaned);
    }
  }

  const savedCards = readJsonStorage<IssuedCardRecord[] | null>(STORAGE_KEYS.ISSUED_CARDS, null);
  if (Array.isArray(savedCards)) {
    const cleaned = savedCards.filter(
      (c) =>
        !c?.personId ||
        (!LEGACY_SAMPLE_STUDENT_IDS.has(c.personId) && !LEGACY_SAMPLE_TEACHER_IDS.has(c.personId))
    );
    if (cleaned.length !== savedCards.length) {
      writeJsonStorage(STORAGE_KEYS.ISSUED_CARDS, cleaned);
    }
  }

  const savedTrajectories = readJsonStorage<Record<string, StudentTrajectoryProfile> | null>(
    STORAGE_KEYS.ACADEMIC_TRAJECTORIES,
    null
  );
  if (savedTrajectories && typeof savedTrajectories === 'object') {
    let changed = false;
    const cleanedTraj: Record<string, StudentTrajectoryProfile> = {};
    Object.entries(savedTrajectories).forEach(([key, val]) => {
      if (LEGACY_SAMPLE_STUDENT_IDS.has(key)) {
        changed = true;
      } else {
        cleanedTraj[key] = val;
      }
    });
    if (changed) {
      writeJsonStorage(STORAGE_KEYS.ACADEMIC_TRAJECTORIES, cleanedTraj);
    }
  }

  const savedIncidents = readJsonStorage<DisciplinaryIncident[] | null>(
    STORAGE_KEYS.DISCIPLINARY_RECORDS,
    null
  );
  if (Array.isArray(savedIncidents)) {
    const cleaned = savedIncidents.filter(
      (inc) => !inc?.studentId || !LEGACY_SAMPLE_STUDENT_IDS.has(inc.studentId)
    );
    if (cleaned.length !== savedIncidents.length) {
      writeJsonStorage(STORAGE_KEYS.DISCIPLINARY_RECORDS, cleaned);
    }
  }

  writeStorageItem(STORAGE_KEYS.CLEAN_ROSTER_V1, 'done');
};

/**
 * Realiza una limpieza única total de eventos heredados del calendario escolar
 * para iniciar sin recordatorios activos de prueba, conservando los nuevos eventos que cree el usuario.
 */
export const purgeLegacySampleCalendarEventsIfNeeded = (): void => {
  if (typeof window === 'undefined') return;
  if (readStorageItem(STORAGE_KEYS.CLEAN_CALENDAR_V1) === 'done') return;

  writeJsonStorage(STORAGE_KEYS.CALENDAR_EVENTS, []);
  writeStorageItem(STORAGE_KEYS.CLEAN_CALENDAR_V1, 'done');
};

/**
 * Redimensiona y comprime una imagen (escudo o foto) a DataURL optimizado
 * para asegurar compatibilidad y no agotar la cuota de almacenamiento local.
 */
export const compressImageFileToDataUrl = (
  file: File,
  maxDimension = 512,
  quality = 0.86
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Seleccione un archivo de imagen válido (PNG, JPG, WebP o SVG).'));
      return;
    }

    // Si es SVG liviano, preservar directamente
    if (file.type === 'image/svg+xml' && file.size <= 150 * 1024) {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo SVG.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Error al leer la imagen seleccionada.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen reconocible.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Preservar transparencia en PNGs (escudos), usar JPEG para fotos grandes
        const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = outMime === 'image/png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
};

export const slugifyFileName = (text: string, fallback = 'institucion'): string => {
  const clean = (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);
  return clean || fallback;
};
