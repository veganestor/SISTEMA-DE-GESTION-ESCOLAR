import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureProjectDotEnvLoaded, resolveAndValidateDbPath } from './envConfig';

let sharedDb: DatabaseSync | null = null;
let sharedDbPath: string | null = null;

export interface SchemaMigrationDefinition {
  version: string;
  description: string;
  sql: string;
}

export interface AppliedMigrationRecord {
  version: string;
  description: string;
  applied_at: string;
}

/**
 * Esquema SQL base organizado por dominio:
 * 1. Registros de estudiantes y credenciales QR
 * 2. Usuarios institucionales y tutores
 * 3. Horarios escolares y calendario de días no lectivos
 * 4. Asistencias diarias consolidadas
 * 5. Movimientos de entrada/salida (QR / manual)
 * 6. Logs de auditoría
 */
export const CORE_SCHEMA_SQL = `
  -- =========================================================================
  -- 1. REGISTROS DE ESTUDIANTES Y CREDENCIALES
  -- =========================================================================
  CREATE TABLE IF NOT EXISTS students_registry (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    dni TEXT NOT NULL DEFAULT '',
    course TEXT NOT NULL,
    division TEXT NOT NULL DEFAULT 'A',
    enrollment_status TEXT NOT NULL DEFAULT 'regular',
    photo TEXT DEFAULT '',
    default_shift TEXT NOT NULL DEFAULT 'manana' CHECK (default_shift IN ('manana','tarde','vespertino')),
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issued_cards_registry (
    card_number TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    person_type TEXT NOT NULL CHECK (person_type IN ('student','teacher')),
    status TEXT NOT NULL CHECK (status IN ('vigente','anulado','reemplazado')),
    valid_until TEXT NOT NULL,
    revoke_reason TEXT DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_issued_cards_person
    ON issued_cards_registry(person_id, person_type);

  -- =========================================================================
  -- 2. USUARIOS Y TUTORES AUTORIZADOS
  -- =========================================================================
  CREATE TABLE IF NOT EXISTS guardians (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    dni TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    notes TEXT DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','preceptor','docente','tutor')),
    password_hash TEXT NOT NULL,
    guardian_id TEXT REFERENCES guardians(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS student_guardians (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students_registry(id) ON DELETE CASCADE,
    guardian_id TEXT NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'Tutor/a',
    is_primary INTEGER NOT NULL DEFAULT 0,
    authorized_pickup INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE(student_id, guardian_id)
  );

  CREATE INDEX IF NOT EXISTS idx_student_guardians_student
    ON student_guardians(student_id);
  CREATE INDEX IF NOT EXISTS idx_student_guardians_guardian
    ON student_guardians(guardian_id);

  -- =========================================================================
  -- 3. HORARIOS Y CALENDARIO ESCOLAR
  -- =========================================================================
  CREATE TABLE IF NOT EXISTS shift_schedules (
    shift TEXT PRIMARY KEY CHECK (shift IN ('manana','tarde','vespertino')),
    label TEXT NOT NULL,
    entry_time TEXT NOT NULL,
    punctuality_cutoff_time TEXT NOT NULL,
    tolerance_minutes INTEGER NOT NULL DEFAULT 5,
    exit_time TEXT NOT NULL,
    absence_close_time TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS course_schedule_overrides (
    id TEXT PRIMARY KEY,
    course TEXT NOT NULL,
    division TEXT NOT NULL DEFAULT '',
    shift TEXT NOT NULL CHECK (shift IN ('manana','tarde','vespertino')),
    entry_time TEXT NOT NULL,
    punctuality_cutoff_time TEXT NOT NULL,
    tolerance_minutes INTEGER NOT NULL DEFAULT 5,
    exit_time TEXT NOT NULL,
    absence_close_time TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE(course, division, shift)
  );

  CREATE TABLE IF NOT EXISTS non_school_days (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','calendar')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS school_calendar_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- =========================================================================
  -- 4. ASISTENCIAS DIARIAS
  -- =========================================================================
  CREATE TABLE IF NOT EXISTS daily_attendance_summary (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students_registry(id) ON DELETE CASCADE,
    attendance_date TEXT NOT NULL,
    shift TEXT NOT NULL CHECK (shift IN ('manana','tarde','vespertino')),
    entry_status TEXT CHECK (entry_status IN ('presente','tarde','ausente')),
    entry_time TEXT,
    entry_movement_id TEXT,
    exit_time TEXT,
    exit_type TEXT CHECK (exit_type IN ('habitual','retiro_anticipado','retiro_excepcional')),
    exit_movement_id TEXT,
    authorized_person_name TEXT,
    withdrawal_reason TEXT,
    absence_finalized INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(student_id, attendance_date)
  );

  CREATE INDEX IF NOT EXISTS idx_daily_att_date
    ON daily_attendance_summary(attendance_date);

  -- =========================================================================
  -- 5. MOVIMIENTOS DE ENTRADA / SALIDA
  -- =========================================================================
  CREATE TABLE IF NOT EXISTS attendance_movements (
    id TEXT PRIMARY KEY,
    event_unique_key TEXT NOT NULL UNIQUE,
    student_id TEXT NOT NULL REFERENCES students_registry(id) ON DELETE CASCADE,
    attendance_date TEXT NOT NULL,
    movement_kind TEXT NOT NULL CHECK (movement_kind IN ('ingreso','salida')),
    attendance_status TEXT CHECK (attendance_status IN ('presente','tarde','ausente')),
    exit_type TEXT CHECK (exit_type IN ('habitual','retiro_anticipado','retiro_excepcional')),
    recorded_time TEXT NOT NULL,
    shift TEXT NOT NULL CHECK (shift IN ('manana','tarde','vespertino')),
    course TEXT NOT NULL,
    division TEXT NOT NULL DEFAULT '',
    operator_user_id TEXT NOT NULL,
    operator_name TEXT NOT NULL,
    withdrawal_reason TEXT DEFAULT '',
    authorized_person_name TEXT DEFAULT '',
    authorized_person_dni TEXT DEFAULT '',
    guardian_link_id TEXT,
    observations TEXT DEFAULT '',
    card_number TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_movements_student_date
    ON attendance_movements(student_id, attendance_date);
  CREATE INDEX IF NOT EXISTS idx_movements_date
    ON attendance_movements(attendance_date);

  -- =========================================================================
  -- 6. LOGS DE AUDITORÍA
  -- =========================================================================
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_created
    ON audit_logs(created_at);
`;

export const SCHEMA_MIGRATIONS: readonly SchemaMigrationDefinition[] = [
  {
    version: '001_qr_attendance_and_guardian_comms',
    description:
      'Esquema relacional de usuarios, registros de estudiantes, asistencias diarias, movimientos de entrada/salida, horarios y logs de auditoría.',
    sql: CORE_SCHEMA_SQL,
  },
  {
    version: '003_core_query_indexes',
    description:
      'Índices adicionales para consultas frecuentes sobre usuarios activos, matrícula por curso, movimientos de entrada/salida y auditoría.',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_app_users_role_active
        ON app_users(role, is_active);
      CREATE INDEX IF NOT EXISTS idx_students_course_active
        ON students_registry(course, division, is_active);
      CREATE INDEX IF NOT EXISTS idx_movements_kind_date
        ON attendance_movements(movement_kind, attendance_date);
      CREATE INDEX IF NOT EXISTS idx_audit_entity
        ON audit_logs(entity_type, entity_id, created_at);
    `,
  },
];

export function resolveDbPath(customPath?: string): string {
  ensureProjectDotEnvLoaded();
  return resolveAndValidateDbPath(customPath);
}

export function openDatabase(customPath?: string): DatabaseSync {
  ensureProjectDotEnvLoaded();
  const targetPath = resolveAndValidateDbPath(customPath);
  if (sharedDb && sharedDbPath === targetPath) {
    return sharedDb;
  }

  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  const db = new DatabaseSync(targetPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  // Verificar conectividad de lectura/escritura antes de exponer la instancia
  const probe = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
  if (!probe || probe.ok !== 1) {
    throw new Error(`No se pudo verificar la conexión SQLite en ${targetPath}.`);
  }

  applyMigrations(db);
  seedDefaultConfiguration(db);

  sharedDb = db;
  sharedDbPath = targetPath;
  return db;
}

export function closeDatabase(): void {
  if (sharedDb) {
    try {
      sharedDb.close();
    } finally {
      sharedDb = null;
      sharedDbPath = null;
    }
  }
}

export function createIsolatedTestDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  applyMigrations(db);
  seedDefaultConfiguration(db);
  return db;
}

export function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignorar error de rollback si la transacción ya fue cerrada
    }
    throw err;
  }
}

export function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedStmt = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const markStmt = db.prepare(
    'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
  );

  // Migración 001: esquema base de tablas principales
  const initialMigration = SCHEMA_MIGRATIONS[0];
  if (!appliedStmt.get(initialMigration.version)) {
    runInTransaction(db, () => {
      db.exec(initialMigration.sql);
      markStmt.run(
        initialMigration.version,
        initialMigration.description,
        new Date().toISOString()
      );
    });
  }

  // Migración 002: limpieza segura de estructuras heredadas de comunicaciones si existieran
  const revertVersion = '002_revert_guardian_communications';
  if (!appliedStmt.get(revertVersion)) {
    runInTransaction(db, () => {
      db.exec(`
        DROP INDEX IF EXISTS idx_in_app_guardian;
        DROP INDEX IF EXISTS idx_comm_logs_status;
        DROP INDEX IF EXISTS idx_comm_logs_student;
        DROP TABLE IF EXISTS in_app_notifications;
        DROP TABLE IF EXISTS communication_logs;
        DROP TABLE IF EXISTS communication_templates;
        DROP TABLE IF EXISTS communication_settings;
      `);

      const dropColIfExists = (table: string, col: string) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        if (cols.some((c) => c.name === col)) {
          db.exec(`ALTER TABLE ${table} DROP COLUMN ${col};`);
        }
      };

      dropColIfExists('guardians', 'whatsapp_number');
      dropColIfExists('student_guardians', 'receive_attendance_alerts');
      dropColIfExists('student_guardians', 'receive_whatsapp');
      dropColIfExists('student_guardians', 'receive_email');
      dropColIfExists('student_guardians', 'receive_in_app');

      markStmt.run(
        revertVersion,
        'Reversión exclusiva de tablas y columnas de avisos automáticos, WhatsApp, Email y plantillas a tutores.',
        new Date().toISOString()
      );
    });
  }

  // Migración 003+: índices adicionales y evolutivos
  const hasColumns = (table: string, requiredCols: string[]): boolean => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return cols.length > 0 && requiredCols.every((c) => cols.some((col) => col.name === c));
  };

  for (const mig of SCHEMA_MIGRATIONS.slice(1)) {
    if (!appliedStmt.get(mig.version)) {
      runInTransaction(db, () => {
        if (mig.version === '003_core_query_indexes') {
          if (hasColumns('app_users', ['role', 'is_active'])) {
            db.exec(`CREATE INDEX IF NOT EXISTS idx_app_users_role_active ON app_users(role, is_active);`);
          }
          if (hasColumns('students_registry', ['course', 'division', 'is_active'])) {
            db.exec(
              `CREATE INDEX IF NOT EXISTS idx_students_course_active ON students_registry(course, division, is_active);`
            );
          }
          if (hasColumns('attendance_movements', ['movement_kind', 'attendance_date'])) {
            db.exec(
              `CREATE INDEX IF NOT EXISTS idx_movements_kind_date ON attendance_movements(movement_kind, attendance_date);`
            );
          }
          if (hasColumns('audit_logs', ['entity_type', 'entity_id', 'created_at'])) {
            db.exec(
              `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);`
            );
          }
        } else {
          db.exec(mig.sql);
        }
        markStmt.run(mig.version, mig.description, new Date().toISOString());
      });
    }
  }
}

export function getAppliedMigrations(db: DatabaseSync): AppliedMigrationRecord[] {
  return db
    .prepare(
      `SELECT version, description, applied_at
       FROM schema_migrations
       ORDER BY version ASC`
    )
    .all() as unknown as AppliedMigrationRecord[];
}

function seedDefaultConfiguration(db: DatabaseSync): void {
  const now = new Date().toISOString();

  const shiftInsert = db.prepare(`
    INSERT OR IGNORE INTO shift_schedules
      (shift, label, entry_time, punctuality_cutoff_time, tolerance_minutes, exit_time, absence_close_time, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  shiftInsert.run('manana', 'Turno Mañana', '07:30', '07:35', 5, '12:30', '09:30', 1, now);
  shiftInsert.run('tarde', 'Turno Tarde', '13:30', '13:40', 5, '18:15', '15:30', 1, now);
  shiftInsert.run('vespertino', 'Turno Vespertino', '18:30', '18:40', 5, '22:15', '20:00', 1, now);

  db.prepare(`
    INSERT OR IGNORE INTO school_calendar_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
  `).run('weekend_is_non_school_day', JSON.stringify(true), now);
}
