import {
  SchoolInfo,
  DEFAULT_SCHOOL_INFO,
  CardDesignConfig,
  DEFAULT_CARD_DESIGN_CONFIG,
  IssuedCardRecord,
  PushSubscriptionPreferences,
  DEFAULT_PUSH_PREFERENCES,
  PushAlertHistoryItem,
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
  PUSH_PREFERENCES: 'bulacios_push_preferences',
  PUSH_NOTIFIED_LOG: 'bulacios_push_notified_log',
  PUSH_ALERT_HISTORY: 'bulacios_push_alert_history',
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

  const hasExistingSchoolConfig = Boolean(readStorageItem(STORAGE_KEYS.SCHOOL_INFO));
  const meta: InstallationMeta = {
    installationId: generateUUID(),
    schemaVersion: '2.0',
    // Si es primera ejecución limpia, muestra el asistente de bienvenida institucional
    setupCompleted: hasExistingSchoolConfig,
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

export const loadPushPreferences = (): PushSubscriptionPreferences => {
  const saved = readJsonStorage<Partial<PushSubscriptionPreferences> | null>(
    STORAGE_KEYS.PUSH_PREFERENCES,
    null
  );
  if (!saved) return DEFAULT_PUSH_PREFERENCES;
  return {
    ...DEFAULT_PUSH_PREFERENCES,
    ...saved,
    categories:
      Array.isArray(saved.categories) && saved.categories.length > 0
        ? saved.categories
        : DEFAULT_PUSH_PREFERENCES.categories,
    courses:
      Array.isArray(saved.courses) && saved.courses.length > 0
        ? saved.courses
        : DEFAULT_PUSH_PREFERENCES.courses,
  };
};

export const savePushPreferences = (prefs: PushSubscriptionPreferences): boolean => {
  return writeJsonStorage(STORAGE_KEYS.PUSH_PREFERENCES, prefs);
};

export const loadNotifiedEventMap = (): Record<string, string> => {
  const saved = readJsonStorage<Record<string, string>>(STORAGE_KEYS.PUSH_NOTIFIED_LOG, {});
  return saved && typeof saved === 'object' ? saved : {};
};

export const saveNotifiedEventMap = (map: Record<string, string>): boolean => {
  return writeJsonStorage(STORAGE_KEYS.PUSH_NOTIFIED_LOG, map);
};

export const loadPushAlertHistory = (): PushAlertHistoryItem[] => {
  const saved = readJsonStorage<PushAlertHistoryItem[]>(STORAGE_KEYS.PUSH_ALERT_HISTORY, []);
  return Array.isArray(saved) ? saved.slice(0, 100) : [];
};

export const savePushAlertHistory = (items: PushAlertHistoryItem[]): boolean => {
  return writeJsonStorage(STORAGE_KEYS.PUSH_ALERT_HISTORY, items.slice(0, 100));
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
