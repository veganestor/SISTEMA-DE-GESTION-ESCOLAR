import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(THIS_DIR, '..');
export const DEFAULT_RELATIVE_DB_PATH = path.join('data', 'attendance.db');

const WEAK_PLACEHOLDER_PATTERNS = [
  'changeme',
  'change-me',
  'example',
  'placeholder',
  'replace_me',
  'replaceme',
  'your_secret',
  'your-secret',
  'tu_secreto',
  'secret_key',
  'session_secret',
  'supersecret',
  'password',
  'contraseña',
  'default',
  '123456',
  'abcdef',
  'qwerty',
  'admin123',
  'test_secret',
];

export interface ValidatedEnvConfig {
  dbPath: string;
  dbFromEnv: boolean;
  sessionSecretMode: 'env' | 'ephemeral';
  adminPasscodeConfigured: boolean;
  envFileLoaded: boolean;
}

let dotEnvLoaded = false;
let dotEnvAttempted = false;

function isPlatformPlaceholderFlag(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === '0' || normalized === 'true' || normalized === 'false';
}

/**
 * Loads key=value pairs from <PROJECT_ROOT>/.env if the file exists.
 * Never overrides real non-empty variables injected by the host runtime,
 * except boolean/flag placeholders (e.g. "1") on ATTENDANCE_DB_PATH.
 */
export function loadProjectDotEnv(customRoot = PROJECT_ROOT): boolean {
  const envPath = path.resolve(customRoot, '.env');
  if (customRoot === PROJECT_ROOT) {
    dotEnvAttempted = true;
  }
  if (!fs.existsSync(envPath)) {
    return false;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let val = line.slice(eqIndex + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }

    const existing = process.env[key];
    const shouldOverridePlaceholderDb =
      key === 'ATTENDANCE_DB_PATH' && isPlatformPlaceholderFlag(existing) && val.length > 0;

    if (shouldOverridePlaceholderDb) {
      console.warn(
        `[Config] ATTENDANCE_DB_PATH del entorno contenía un valor marcador inválido ("${existing?.trim()}"). Se utilizará "${val}" desde .env.`
      );
      process.env[key] = val;
    } else if (existing === undefined || existing.trim() === '') {
      process.env[key] = val;
    }
  }

  if (customRoot === PROJECT_ROOT) {
    dotEnvLoaded = true;
  }
  return true;
}

export function ensureProjectDotEnvLoaded(): boolean {
  if (!dotEnvAttempted) {
    return loadProjectDotEnv(PROJECT_ROOT);
  }
  return dotEnvLoaded;
}

function isWeakOrPredictableSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;

  // Reject single-character repetition or very low entropy
  const uniqueChars = new Set(normalized).size;
  if (uniqueChars < 8) return true;

  for (const pattern of WEAK_PLACEHOLDER_PATTERNS) {
    if (normalized === pattern || normalized.includes(pattern)) {
      return true;
    }
  }

  return false;
}

function isInsideDirectory(candidatePath: string, parentDir: string): boolean {
  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedParent = path.resolve(parentDir);
  return (
    resolvedCandidate === resolvedParent ||
    resolvedCandidate.startsWith(resolvedParent + path.sep)
  );
}

function verifyDirectoryReadWriteProbe(dirPath: string): void {
  try {
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw new Error(
      `Permisos insuficientes sobre el directorio de la base de datos (${dirPath}). Se requiere lectura y escritura.`
    );
  }

  const probeName = `.db-rw-probe-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const probePath = path.join(dirPath, probeName);
  let fd: number | null = null;
  try {
    fd = fs.openSync(
      probePath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR,
      0o600
    );
    const writeBuf = Buffer.from('ok', 'utf8');
    fs.writeSync(fd, writeBuf, 0, writeBuf.length, 0);
    const readBuf = Buffer.alloc(writeBuf.length);
    fs.readSync(fd, readBuf, 0, readBuf.length, 0);
    if (readBuf.toString('utf8') !== 'ok') {
      throw new Error('Probe mismatch');
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `El servidor no posee permisos efectivos de lectura/escritura en el directorio de la base de datos (${dirPath}): ${detail}`
    );
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close error
      }
    }
    if (fs.existsSync(probePath)) {
      try {
        fs.unlinkSync(probePath);
      } catch {
        // Ignore unlink error
      }
    }
  }
}

function verifyExistingFileReadWrite(filePath: string, label: string): void {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    throw new Error(
      `Configuración inválida de ATTENDANCE_DB_PATH (${filePath}): apunta a un directorio en lugar de un archivo SQLite.`
    );
  }
  try {
    fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
    const fd = fs.openSync(filePath, 'r+');
    fs.closeSync(fd);
  } catch {
    throw new Error(
      `Permisos insuficientes sobre ${label} (${filePath}). Se requiere lectura y escritura.`
    );
  }
}

/**
 * Resolves and validates ATTENDANCE_DB_PATH so SQLite always points to a persistent,
 * directory-verified, read/write accessible file inside non-temporary storage.
 */
export function resolveAndValidateDbPath(customPath?: string): string {
  if (customPath === ':memory:') {
    return ':memory:';
  }

  ensureProjectDotEnvLoaded();

  const rawCandidate = (customPath ?? process.env.ATTENDANCE_DB_PATH ?? '').trim();
  let rawEnv = rawCandidate;
  if (customPath === undefined && isPlatformPlaceholderFlag(rawCandidate)) {
    console.warn(
      `[Config] ATTENDANCE_DB_PATH contenía un marcador inválido ("${rawCandidate}"); se utilizará la ruta persistente "${DEFAULT_RELATIVE_DB_PATH}".`
    );
    rawEnv = '';
  }
  const effectiveRaw = rawEnv || DEFAULT_RELATIVE_DB_PATH;

  if (effectiveRaw === ':memory:' || effectiveRaw.startsWith('file::memory:')) {
    throw new Error(
      'Configuración inválida de ATTENDANCE_DB_PATH: no se permite ":memory:" en ejecución persistente del servidor.'
    );
  }

  const resolved = path.isAbsolute(effectiveRaw)
    ? path.normalize(effectiveRaw)
    : path.resolve(PROJECT_ROOT, effectiveRaw);

  const tmpDirs = [os.tmpdir(), '/tmp', '/var/tmp'].filter(Boolean);
  for (const tmpDir of tmpDirs) {
    if (isInsideDirectory(resolved, tmpDir)) {
      throw new Error(
        `Configuración inválida de ATTENDANCE_DB_PATH (${resolved}): la base de datos de asistencia no puede ubicarse en un directorio temporal.`
      );
    }
  }

  const parentDir = path.dirname(resolved);
  try {
    fs.mkdirSync(parentDir, { recursive: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `No se pudo crear el directorio de la base de datos (${parentDir}): ${detail}`
    );
  }

  verifyDirectoryReadWriteProbe(parentDir);
  verifyExistingFileReadWrite(resolved, 'el archivo de base de datos');
  verifyExistingFileReadWrite(`${resolved}-wal`, 'el archivo WAL de base de datos');
  verifyExistingFileReadWrite(`${resolved}-shm`, 'el archivo SHM de base de datos');

  return resolved;
}

/**
 * Validates SESSION_SECRET if configured in process.env.
 * Rejects weak, short (<32 chars), or example/predictable values.
 */
export function validateSessionSecretIfConfigured(): {
  configured: boolean;
  secret?: string;
} {
  const raw = process.env.SESSION_SECRET?.trim() ?? '';
  if (!raw) {
    return { configured: false };
  }

  if (raw.length < 32) {
    throw new Error(
      'Configuración inválida de SESSION_SECRET: debe tener al menos 32 caracteres criptográficamente aleatorios (ej. generados con "openssl rand -hex 32").'
    );
  }

  if (isWeakOrPredictableSecret(raw)) {
    throw new Error(
      'Configuración inválida de SESSION_SECRET: no se permiten claves débiles, repetitivas o de ejemplo.'
    );
  }

  return { configured: true, secret: raw };
}

/**
 * Validates ATTENDANCE_ADMIN_PASSCODE if configured in process.env.
 * Rejects short (<8 chars) or trivial/default values.
 */
export function validateAdminPasscodeIfConfigured(): {
  configured: boolean;
  digest?: Buffer;
} {
  const raw = process.env.ATTENDANCE_ADMIN_PASSCODE?.trim() ?? '';
  if (!raw) {
    return { configured: false };
  }

  if (raw.length < 8) {
    throw new Error(
      'Configuración inválida de ATTENDANCE_ADMIN_PASSCODE: si se define, debe tener al menos 8 caracteres seguros.'
    );
  }

  if (isWeakOrPredictableSecret(raw)) {
    throw new Error(
      'Configuración inválida de ATTENDANCE_ADMIN_PASSCODE: no se permiten códigos predeterminados o predecibles.'
    );
  }

  return {
    configured: true,
    digest: crypto.createHash('sha256').update(raw, 'utf8').digest(),
  };
}

/**
 * Constant-time verification of a user-supplied admin passcode against ATTENDANCE_ADMIN_PASSCODE.
 */
export function verifyAdminPasscodeConstantTime(candidatePasscode: string): boolean {
  const status = validateAdminPasscodeIfConfigured();
  if (!status.configured || !status.digest) return false;
  const candidate = String(candidatePasscode || '').trim();
  if (!candidate) return false;
  const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  return crypto.timingSafeEqual(candidateDigest, status.digest);
}

/**
 * Loads .env if present and validates all critical server environment variables before startup.
 */
export function validateStartupEnvironment(): ValidatedEnvConfig {
  const loaded = loadProjectDotEnv();

  if (isPlatformPlaceholderFlag(process.env.SESSION_SECRET)) {
    console.warn(
      '[Config] SESSION_SECRET en el entorno contenía un marcador no válido; se rechaza y se utilizará una clave aleatoria efímera CSPRNG en memoria (configure un secreto real >= 32 caracteres para persistir sesiones).'
    );
    delete process.env.SESSION_SECRET;
  }

  if (isPlatformPlaceholderFlag(process.env.ATTENDANCE_ADMIN_PASSCODE)) {
    console.warn(
      '[Config] ATTENDANCE_ADMIN_PASSCODE en el entorno contenía un marcador no válido; se rechaza y se deshabilita el código administrativo hasta configurar un valor seguro (>= 8 caracteres).'
    );
    delete process.env.ATTENDANCE_ADMIN_PASSCODE;
  }

  const dbPath = resolveAndValidateDbPath();
  const sessionCheck = validateSessionSecretIfConfigured();
  const adminCheck = validateAdminPasscodeIfConfigured();

  return {
    dbPath,
    dbFromEnv: Boolean(
      process.env.ATTENDANCE_DB_PATH?.trim() &&
        !isPlatformPlaceholderFlag(process.env.ATTENDANCE_DB_PATH)
    ),
    sessionSecretMode: sessionCheck.configured ? 'env' : 'ephemeral',
    adminPasscodeConfigured: adminCheck.configured,
    envFileLoaded: loaded || dotEnvLoaded,
  };
}
