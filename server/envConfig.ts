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
  warnings: string[];
}

let dotEnvLoaded = false;
let dotEnvAttempted = false;

function isPlatformPlaceholderFlag(value: string | undefined): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === '0' ||
    normalized === 'true' ||
    normalized === 'false' ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === 'none'
  );
}

/**
 * Loads key=value pairs from <PROJECT_ROOT>/.env if the file exists.
 * Never overrides real non-empty variables injected by the host runtime,
 * except invalid placeholder flags on ATTENDANCE_DB_PATH.
 * Safe against missing, unreadable, directory, or malformed .env files.
 */
export function loadProjectDotEnv(customRoot = PROJECT_ROOT): boolean {
  const envPath = path.resolve(customRoot, '.env');
  if (customRoot === PROJECT_ROOT) {
    dotEnvAttempted = true;
  }

  let content: string;
  try {
    if (!fs.existsSync(envPath)) {
      return false;
    }
    const stat = fs.statSync(envPath);
    if (!stat.isFile()) {
      console.warn(
        `[Config] Se omitió "${envPath}" porque no es un archivo regular. El servidor continuará con las variables del entorno.`
      );
      return false;
    }
    content = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Config] No se pudo leer el archivo .env (${envPath}): ${detail}. El servidor continuará con las variables del entorno y valores seguros por defecto.`
    );
    return false;
  }

  // Strip optional UTF-8 BOM from first line
  const normalizedContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  for (const rawLine of normalizedContent.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) {
      line = line.slice('export '.length).trim();
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let val = line.slice(eqIndex + 1).trim();
    const isQuoted =
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2);
    if (isQuoted) {
      val = val.slice(1, -1);
    } else {
      const inlineCommentIdx = val.search(/\s+#/);
      if (inlineCommentIdx !== -1) {
        val = val.slice(0, inlineCommentIdx).trim();
      }
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

function isWeakOrPredictableSecret(value: string, minUniqueChars = 8): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;

  // Reject single-character repetition or very low entropy
  const uniqueChars = new Set(normalized).size;
  if (uniqueChars < minUniqueChars) return true;

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
 * Non-throwing fail-closed reader for SESSION_SECRET at request/runtime.
 * Never accepts a weak or short secret and never crashes an active server.
 */
export function readValidatedSessionSecretSafe(): {
  configured: boolean;
  secret?: string;
} {
  try {
    return validateSessionSecretIfConfigured();
  } catch {
    return { configured: false };
  }
}

/**
 * Validates that a candidate admin passcode meets minimum length and entropy requirements
 * and does not match weak/default placeholder patterns.
 */
export function validateAdminPasscodeStrength(candidate: string): string {
  const raw = String(candidate || '').trim();
  if (raw.length < 8) {
    throw new Error(
      'Configuración inválida de ATTENDANCE_ADMIN_PASSCODE: si se define, debe tener al menos 8 caracteres seguros.'
    );
  }

  if (isWeakOrPredictableSecret(raw, 5)) {
    throw new Error(
      'Configuración inválida de ATTENDANCE_ADMIN_PASSCODE: no se permiten códigos predeterminados o predecibles.'
    );
  }

  return raw;
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

  const validated = validateAdminPasscodeStrength(raw);

  return {
    configured: true,
    digest: crypto.createHash('sha256').update(validated, 'utf8').digest(),
  };
}

/**
 * Non-throwing fail-closed reader for ATTENDANCE_ADMIN_PASSCODE at request/runtime.
 * Never accepts a weak or short passcode and never crashes an active server.
 */
export function readValidatedAdminPasscodeSafe(): {
  configured: boolean;
  digest?: Buffer;
} {
  try {
    return validateAdminPasscodeIfConfigured();
  } catch {
    return { configured: false };
  }
}

/**
 * Constant-time verification of a user-supplied admin passcode against ATTENDANCE_ADMIN_PASSCODE.
 */
export function verifyAdminPasscodeConstantTime(candidatePasscode: string): boolean {
  const status = readValidatedAdminPasscodeSafe();
  if (!status.configured || !status.digest) return false;
  const candidate = String(candidatePasscode || '').trim();
  if (!candidate) return false;
  const candidateDigest = crypto.createHash('sha256').update(candidate, 'utf8').digest();
  return crypto.timingSafeEqual(candidateDigest, status.digest);
}

/**
 * Loads .env if present and validates all server environment variables before startup.
 * Fails safely when optional variables are absent or malformed: weak secrets are rejected
 * (never used) and replaced with secure runtime fallbacks so the application starts cleanly.
 */
export function validateStartupEnvironment(): ValidatedEnvConfig {
  const warnings: string[] = [];
  const loaded = loadProjectDotEnv();

  // 1. Validate / resolve ATTENDANCE_DB_PATH with safe fallback to persistent default path
  let dbPath: string;
  let dbFromEnv = false;
  const rawDbEnv = process.env.ATTENDANCE_DB_PATH?.trim();

  if (rawDbEnv && isPlatformPlaceholderFlag(rawDbEnv)) {
    const msg = `[Config] ATTENDANCE_DB_PATH contenía un marcador inválido ("${rawDbEnv}"); se utilizará la ruta persistente "${DEFAULT_RELATIVE_DB_PATH}".`;
    console.warn(msg);
    warnings.push(msg);
    delete process.env.ATTENDANCE_DB_PATH;
    dbPath = resolveAndValidateDbPath();
  } else {
    try {
      dbPath = resolveAndValidateDbPath();
      dbFromEnv = Boolean(rawDbEnv);
    } catch (err) {
      if (rawDbEnv) {
        const detail = err instanceof Error ? err.message : String(err);
        const msg = `[Config] ATTENDANCE_DB_PATH inválido (${detail}). Se utilizará la ruta persistente por defecto "${DEFAULT_RELATIVE_DB_PATH}".`;
        console.warn(msg);
        warnings.push(msg);
        delete process.env.ATTENDANCE_DB_PATH;
        dbPath = resolveAndValidateDbPath();
        dbFromEnv = false;
      } else {
        throw err;
      }
    }
  }

  // 2. Validate SESSION_SECRET (fail-closed: reject weak/invalid values and use CSPRNG fallback)
  let sessionSecretMode: 'env' | 'ephemeral' = 'ephemeral';
  if (isPlatformPlaceholderFlag(process.env.SESSION_SECRET)) {
    const msg =
      '[Config] SESSION_SECRET en el entorno contenía un marcador no válido; se rechaza y se utilizará una clave aleatoria efímera CSPRNG en memoria (configure un secreto real >= 32 caracteres para persistir sesiones).';
    console.warn(msg);
    warnings.push(msg);
    delete process.env.SESSION_SECRET;
  } else {
    try {
      const sessionCheck = validateSessionSecretIfConfigured();
      sessionSecretMode = sessionCheck.configured ? 'env' : 'ephemeral';
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const msg = `[Config] ${detail} Se descarta el valor inválido y se utilizará una clave aleatoria efímera CSPRNG en memoria.`;
      console.warn(msg);
      warnings.push(msg);
      delete process.env.SESSION_SECRET;
      sessionSecretMode = 'ephemeral';
    }
  }

  // 3. Validate ATTENDANCE_ADMIN_PASSCODE (fail-closed: reject weak/invalid values; rely on initial-setup hash)
  let adminPasscodeConfigured = false;
  if (isPlatformPlaceholderFlag(process.env.ATTENDANCE_ADMIN_PASSCODE)) {
    const msg =
      '[Config] ATTENDANCE_ADMIN_PASSCODE en el entorno contenía un marcador no válido; se rechaza y se deshabilita el código administrativo de entorno hasta configurar un valor seguro (>= 8 caracteres).';
    console.warn(msg);
    warnings.push(msg);
    delete process.env.ATTENDANCE_ADMIN_PASSCODE;
  } else {
    try {
      const adminCheck = validateAdminPasscodeIfConfigured();
      adminPasscodeConfigured = adminCheck.configured;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const msg = `[Config] ${detail} Se descarta el valor inválido del entorno; el sistema continuará con la autenticación administrativa segura almacenada en el servidor.`;
      console.warn(msg);
      warnings.push(msg);
      delete process.env.ATTENDANCE_ADMIN_PASSCODE;
      adminPasscodeConfigured = false;
    }
  }

  return {
    dbPath,
    dbFromEnv,
    sessionSecretMode,
    adminPasscodeConfigured,
    envFileLoaded: loaded || dotEnvLoaded,
    warnings,
  };
}
