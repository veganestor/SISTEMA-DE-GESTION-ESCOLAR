import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, createIsolatedTestDatabase } from '../server/db';
import { createAttendanceApp } from '../server/app';
import {
  PROJECT_ROOT,
  loadProjectDotEnv,
  resolveAndValidateDbPath,
  validateAdminPasscodeIfConfigured,
  validateSessionSecretIfConfigured,
  validateStartupEnvironment,
} from '../server/envConfig';

interface TestHarness {
  baseUrl: string;
  db: DatabaseSync;
  close: () => Promise<void>;
}

async function startHarness(): Promise<TestHarness> {
  const db = createIsolatedTestDatabase();
  const app = createAttendanceApp(db);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };

  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    db,
    close: () =>
      new Promise<void>((resolve, reject) => {
        db.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function api<T = Record<string, unknown>>(
  baseUrl: string,
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

function makeStudentQR(studentId: string, name: string, cardNo: string, validUntil = '2026-12-31') {
  return JSON.stringify({
    v: '1.0',
    uid: studentId,
    type: 'student',
    name,
    inst: 'ESCUELA SECUNDARIA DE LOS BULACIOS',
    role: '1° Año',
    cardNo,
    year: '2026',
    validUntil,
    signed: false,
  });
}

test('Sistema Integral de Asistencia QR — Ingresos, Tardanzas, Ausencias, Retiros y Portal Familiar', async () => {
  const h = await startHarness();

  try {
    // Health endpoint returns clean status without communications channels metadata
    const health = await api<{ ok: boolean; hasAdmin: boolean; channels?: unknown }>(
      h.baseUrl,
      '/api/health'
    );
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.equal(health.data.channels, undefined);

    // Bootstrap Admin + Create Preceptor + Sync Students/Cards
    const boot = await api<{ token: string }>(h.baseUrl, '/api/auth/bootstrap-admin', {
      method: 'POST',
      body: {
        fullName: 'Director Prueba',
        username: 'director_test',
        email: 'dir@escuela.edu.ar',
        password: 'Password123!',
      },
    });
    assert.equal(boot.status, 201);
    const adminToken = boot.data.token;

    await api(h.baseUrl, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Preceptor Mañana',
        username: 'preceptor_tm',
        password: 'Password123!',
        role: 'preceptor',
      },
    });
    const precLogin = await api<{ token: string }>(h.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'preceptor_tm', password: 'Password123!' },
    });
    const precToken = precLogin.data.token;

    // Sync 4 students and issued cards (including 1 revoked card)
    await api(h.baseUrl, '/api/attendance-system/sync-context', {
      method: 'POST',
      token: adminToken,
      body: {
        students: [
          { id: 'stu-juan', fullName: 'Juan Pérez', dni: '45111222', course: '1', division: 'A' },
          { id: 'stu-ana', fullName: 'Ana Pérez', dni: '46111333', course: '3', division: 'B' },
          { id: 'stu-lucas', fullName: 'Lucas Gómez', dni: '45999888', course: '2', division: 'A' },
          { id: 'stu-sofia', fullName: 'Sofía Díaz', dni: '47000111', course: '1', division: 'A' },
        ],
        issuedCards: [
          { cardNumber: 'EST-2026-0001', personId: 'stu-juan', personType: 'student', status: 'vigente', validUntil: '2026-12-31' },
          { cardNumber: 'EST-2026-0002', personId: 'stu-ana', personType: 'student', status: 'vigente', validUntil: '2026-12-31' },
          { cardNumber: 'EST-2026-0003', personId: 'stu-lucas', personType: 'student', status: 'vigente', validUntil: '2026-12-31' },
          { cardNumber: 'EST-2026-0004', personId: 'stu-sofia', personType: 'student', status: 'vigente', validUntil: '2026-12-31' },
          { cardNumber: 'EST-2026-REV', personId: 'stu-juan', personType: 'student', status: 'anulado', validUntil: '2026-12-31', revokeReason: 'Extravío' },
        ],
        calendarHolidays: [{ id: 'hol-1', date: '2026-05-25', title: 'Revolución de Mayo' }],
      },
    });

    // Configure shift schedule (Mañana: entry 07:30, punctuality 07:35 + 5 min = 07:40, exit 12:30, close 09:30)
    await api(h.baseUrl, '/api/schedules/shift/manana', {
      method: 'PUT',
      token: adminToken,
      body: {
        label: 'Turno Mañana',
        entryTime: '07:30',
        punctualityCutoffTime: '07:35',
        toleranceMinutes: 5,
        exitTime: '12:30',
        absenceCloseTime: '09:30',
        enabled: true,
      },
    });

    // Create Guardians (María Pérez = mom of Juan & Ana; Carlos Pérez = dad of Juan; Pedro Díaz = Sofía's dad)
    const gMaria = await api<{ guardian: { id: string } }>(h.baseUrl, '/api/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'María Pérez',
        dni: '28111222',
        phone: '+5493815000001',
        email: 'maria.perez@example.com',
      },
    });
    const mariaId = gMaria.data.guardian.id;

    const gCarlos = await api<{ guardian: { id: string } }>(h.baseUrl, '/api/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Carlos Pérez',
        dni: '27111222',
        phone: '+5493815000002',
        email: 'carlos.perez@example.com',
      },
    });
    const carlosId = gCarlos.data.guardian.id;

    const gPedro = await api<{ guardian: { id: string } }>(h.baseUrl, '/api/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Pedro Díaz',
        dni: '29555444',
        phone: '+5493815000003',
        email: 'pedro.diaz@example.com',
      },
    });
    const pedroId = gPedro.data.guardian.id;

    // Link guardians: Juan -> Maria (pickup=true) & Carlos (pickup=false)
    const linkJuanMaria = await api<{ linkId: string }>(h.baseUrl, '/api/students/stu-juan/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        guardianId: mariaId,
        relationship: 'Madre',
        isPrimary: true,
        authorizedPickup: true,
      },
    });
    const mariaJuanLinkId = linkJuanMaria.data.linkId;

    const linkJuanCarlos = await api<{ linkId: string }>(h.baseUrl, '/api/students/stu-juan/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        guardianId: carlosId,
        relationship: 'Padre',
        isPrimary: false,
        authorizedPickup: false,
      },
    });
    const carlosJuanLinkId = linkJuanCarlos.data.linkId;

    // Ana -> Maria (multi-child guardian test)
    await api(h.baseUrl, '/api/students/stu-ana/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        guardianId: mariaId,
        relationship: 'Madre',
        isPrimary: true,
        authorizedPickup: true,
      },
    });

    // Sofia -> Pedro
    await api(h.baseUrl, '/api/students/stu-sofia/guardians', {
      method: 'POST',
      token: adminToken,
      body: {
        guardianId: pedroId,
        relationship: 'Padre',
        isPrimary: true,
        authorizedPickup: true,
      },
    });

    // Create guardian user accounts (Maria & Pedro)
    await api(h.baseUrl, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'María Pérez',
        username: 'tutor_maria',
        password: 'Password123!',
        role: 'tutor',
        guardianId: mariaId,
      },
    });
    await api(h.baseUrl, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Pedro Díaz',
        username: 'tutor_pedro',
        password: 'Password123!',
        role: 'tutor',
        guardianId: pedroId,
      },
    });

    const mariaLogin = await api<{ token: string }>(h.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'tutor_maria', password: 'Password123!' },
    });
    const mariaToken = mariaLogin.data.token;

    const pedroLogin = await api<{ token: string }>(h.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { username: 'tutor_pedro', password: 'Password123!' },
    });
    const pedroToken = pedroLogin.data.token;

    const juanQr = makeStudentQR('stu-juan', 'Juan Pérez', 'EST-2026-0001');
    const anaQr = makeStudentQR('stu-ana', 'Ana Pérez', 'EST-2026-0002');
    const lucasQr = makeStudentQR('stu-lucas', 'Lucas Gómez', 'EST-2026-0003');
    const revokedQr = makeStudentQR('stu-juan', 'Juan Pérez', 'EST-2026-REV');
    const schoolDate = '2026-11-23'; // Monday

    // -----------------------------------------------------------------------
    // TEST 1: Punctual entry
    // -----------------------------------------------------------------------
    const t1 = await api<{
      ok: boolean;
      code: string;
      movement: { attendanceStatus: string };
    }>(h.baseUrl, '/api/attendance-qr/entry', {
      method: 'POST',
      token: precToken,
      body: { qrRaw: juanQr, attendanceDate: schoolDate, recordedTime: '07:32', shift: 'manana' },
    });
    assert.equal(t1.status, 201);
    assert.equal(t1.data.ok, true);
    assert.equal(t1.data.movement.attendanceStatus, 'presente');

    // -----------------------------------------------------------------------
    // TEST 2: Duplicate entry scan blocked (never creates 2nd record or auto-exit)
    // -----------------------------------------------------------------------
    const t2Dup = await api<{ ok: boolean; code: string; dailySummary: { exitTime: string | null } }>(
      h.baseUrl,
      '/api/attendance-qr/entry',
      {
        method: 'POST',
        token: precToken,
        body: { qrRaw: juanQr, attendanceDate: schoolDate, recordedTime: '07:33', shift: 'manana' },
      }
    );
    assert.equal(t2Dup.status, 400);
    assert.equal(t2Dup.data.ok, false);
    assert.equal(t2Dup.data.code, 'DUPLICATE_ENTRY_BLOCKED');
    assert.equal(t2Dup.data.dailySummary.exitTime, null);

    // -----------------------------------------------------------------------
    // TEST 3: Late entry (TARDE)
    // -----------------------------------------------------------------------
    const t3Late = await api<{
      ok: boolean;
      movement: { attendanceStatus: string };
    }>(h.baseUrl, '/api/attendance-qr/entry', {
      method: 'POST',
      token: precToken,
      body: { qrRaw: anaQr, attendanceDate: schoolDate, recordedTime: '07:48', shift: 'manana' },
    });
    assert.equal(t3Late.status, 201);
    assert.equal(t3Late.data.movement.attendanceStatus, 'tarde');

    // -----------------------------------------------------------------------
    // TEST 4: Habitual exit recorded
    // -----------------------------------------------------------------------
    const t4 = await api<{
      ok: boolean;
      code: string;
    }>(h.baseUrl, '/api/attendance-qr/exit', {
      method: 'POST',
      token: precToken,
      body: {
        qrRaw: anaQr,
        attendanceDate: schoolDate,
        recordedTime: '12:30',
        exitType: 'habitual',
        withdrawalReason: 'Fin de jornada',
        authorizedPersonName: 'Salida regular',
      },
    });
    assert.equal(t4.status, 201);
    assert.equal(t4.data.code, 'EXIT_REGISTERED');

    // -----------------------------------------------------------------------
    // TEST 5: Early withdrawal — rejects unauthorized guardian, accepts authorized guardian
    // -----------------------------------------------------------------------
    const t5Denied = await api<{ ok: boolean; code: string }>(
      h.baseUrl,
      '/api/attendance-qr/exit',
      {
        method: 'POST',
        token: precToken,
        body: {
          qrRaw: juanQr,
          attendanceDate: schoolDate,
          recordedTime: '10:30',
          exitType: 'retiro_anticipado',
          withdrawalReason: 'Turno médico',
          authorizedPersonName: 'Carlos Pérez',
          guardianLinkId: carlosJuanLinkId,
        },
      }
    );
    assert.equal(t5Denied.status, 400);
    assert.equal(t5Denied.data.code, 'UNAUTHORIZED_PICKUP');

    const t5Allowed = await api<{
      ok: boolean;
      code: string;
    }>(h.baseUrl, '/api/attendance-qr/exit', {
      method: 'POST',
      token: precToken,
      body: {
        qrRaw: juanQr,
        attendanceDate: schoolDate,
        recordedTime: '10:30',
        exitType: 'retiro_anticipado',
        withdrawalReason: 'Turno médico odontológico',
        authorizedPersonName: 'María Pérez',
        guardianLinkId: mariaJuanLinkId,
      },
    });
    assert.equal(t5Allowed.status, 201);
    assert.equal(t5Allowed.data.code, 'EXIT_REGISTERED');

    // -----------------------------------------------------------------------
    // TEST 6: Exit attempt without prior entry blocked
    // -----------------------------------------------------------------------
    const t6 = await api<{ ok: boolean; code: string }>(h.baseUrl, '/api/attendance-qr/exit', {
      method: 'POST',
      token: precToken,
      body: {
        qrRaw: lucasQr,
        attendanceDate: schoolDate,
        recordedTime: '12:15',
        exitType: 'habitual',
        withdrawalReason: 'Salida',
        authorizedPersonName: 'Tutor',
      },
    });
    assert.equal(t6.status, 400);
    assert.equal(t6.data.code, 'EXIT_WITHOUT_ENTRY_BLOCKED');

    // -----------------------------------------------------------------------
    // TEST 7: Invalid / unknown / revoked QRs rejected
    // -----------------------------------------------------------------------
    const t7Invalid = await api<{ ok: boolean; code: string }>(
      h.baseUrl,
      '/api/attendance-qr/entry',
      {
        method: 'POST',
        token: precToken,
        body: { qrRaw: 'QR_CORRUPTO_123', attendanceDate: schoolDate, recordedTime: '07:35' },
      }
    );
    assert.equal(t7Invalid.status, 400);
    assert.equal(t7Invalid.data.code, 'INVALID_QR');

    const t7Revoked = await api<{ ok: boolean; code: string }>(
      h.baseUrl,
      '/api/attendance-qr/entry',
      {
        method: 'POST',
        token: precToken,
        body: { qrRaw: revokedQr, attendanceDate: schoolDate, recordedTime: '07:35' },
      }
    );
    assert.equal(t7Revoked.status, 400);
    assert.equal(t7Revoked.data.code, 'CARD_REVOKED');

    const t7UnknownStudent = await api<{ ok: boolean; code: string }>(
      h.baseUrl,
      '/api/attendance-qr/entry',
      {
        method: 'POST',
        token: precToken,
        body: {
          qrRaw: makeStudentQR('stu-inexistente', 'Fantasma', 'EST-9999'),
          attendanceDate: schoolDate,
          recordedTime: '07:35',
        },
      }
    );
    assert.equal(t7UnknownStudent.status, 400);
    assert.equal(t7UnknownStudent.data.code, 'STUDENT_NOT_FOUND');

    // -----------------------------------------------------------------------
    // TEST 8: Absence close-out blocked on holidays & before cutoff, works after cutoff
    // -----------------------------------------------------------------------
    const t8Holiday = await api<{ skippedNonSchoolDay: boolean; markedAbsentCount: number }>(
      h.baseUrl,
      '/api/attendance-qr/finalize-absences',
      {
        method: 'POST',
        token: adminToken,
        body: { attendanceDate: '2026-05-25', currentTimeHHMM: '11:00' },
      }
    );
    assert.equal(t8Holiday.data.skippedNonSchoolDay, true);
    assert.equal(t8Holiday.data.markedAbsentCount, 0);

    const t8BeforeCutoff = await api<{ markedAbsentCount: number; skippedBeforeCutoffCount: number }>(
      h.baseUrl,
      '/api/attendance-qr/finalize-absences',
      {
        method: 'POST',
        token: adminToken,
        body: { attendanceDate: schoolDate, currentTimeHHMM: '09:00' },
      }
    );
    assert.equal(t8BeforeCutoff.data.markedAbsentCount, 0);
    assert.equal(t8BeforeCutoff.data.skippedBeforeCutoffCount, 2); // Lucas & Sofia

    const t8AfterCutoff = await api<{
      markedAbsentCount: number;
      absentStudentIds: string[];
    }>(h.baseUrl, '/api/attendance-qr/finalize-absences', {
      method: 'POST',
      token: adminToken,
      body: { attendanceDate: schoolDate, currentTimeHHMM: '09:35' },
    });
    assert.equal(t8AfterCutoff.data.markedAbsentCount, 2);
    assert.ok(t8AfterCutoff.data.absentStudentIds.includes('stu-sofia'));

    // -----------------------------------------------------------------------
    // TEST 9: Guardian with multiple children switches/views both children
    // -----------------------------------------------------------------------
    const t9 = await api<{ children: { studentId: string; fullName: string }[] }>(
      h.baseUrl,
      `/api/guardian-portal/children?date=${schoolDate}`,
      { token: mariaToken }
    );
    assert.equal(t9.status, 200);
    assert.equal(t9.data.children.length, 2);
    const ids = t9.data.children.map((c) => c.studentId).sort();
    assert.deepEqual(ids, ['stu-ana', 'stu-juan']);

    // -----------------------------------------------------------------------
    // TEST 10: Unauthorized guardian blocked from accessing unrelated student's records
    // -----------------------------------------------------------------------
    const t10Child = await api(h.baseUrl, '/api/guardian-portal/children/stu-juan', {
      token: pedroToken,
    });
    assert.equal(t10Child.status, 403);

    const t10CrossGuardian = await api(
      h.baseUrl,
      `/api/guardian-portal/children?guardianId=${mariaId}`,
      { token: pedroToken }
    );
    assert.equal(t10CrossGuardian.status, 403);

    const t10StudentAtt = await api(h.baseUrl, '/api/students/stu-juan/attendance-summary', {
      token: pedroToken,
    });
    assert.equal(t10StudentAtt.status, 403);

    // -----------------------------------------------------------------------
    // TEST 11: Daily KPIs and movement report work cleanly after communications removal
    // -----------------------------------------------------------------------
    const daily = await api<{
      ok: boolean;
      kpis: { presentes: number; tardes: number; ausentes: number; salidasRegistradas: number };
      movements: unknown[];
    }>(h.baseUrl, `/api/attendance-qr/daily?date=${schoolDate}`, { token: precToken });
    assert.equal(daily.status, 200);
    assert.equal(daily.data.kpis.presentes, 1);
    assert.equal(daily.data.kpis.tardes, 1);
    assert.equal(daily.data.kpis.ausentes, 2);
    assert.equal(daily.data.kpis.salidasRegistradas, 2);

    // Removed communication endpoints must return 404
    const removedCommConfig = await api(h.baseUrl, '/api/communications/config', { token: adminToken });
    assert.equal(removedCommConfig.status, 404);
    const removedCommLogs = await api(h.baseUrl, '/api/communications/logs', { token: adminToken });
    assert.equal(removedCommLogs.status, 404);
  } finally {
    await h.close();
  }
});

test('Migración 002 elimina tablas y columnas de avisos heredadas preservando asistencia QR', () => {
  const legacyDb = new DatabaseSync(':memory:');
  legacyDb.exec(`
    CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES ('001_qr_attendance_and_guardian_comms', 'Initial schema', '2026-11-23T00:00:00Z');
    CREATE TABLE attendance_movements (id TEXT PRIMARY KEY, student_id TEXT NOT NULL);
    INSERT INTO attendance_movements VALUES ('mov-1', 'stu-1');
    CREATE TABLE guardians (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      dni TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      whatsapp_number TEXT DEFAULT '',
      email TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO guardians VALUES ('g-1', 'Tutor Legacy', '123', '555', '549555', 'a@b.c', '', '2026-01-01', '2026-01-01');
    CREATE TABLE student_guardians (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      guardian_id TEXT NOT NULL,
      relationship TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 1,
      authorized_pickup INTEGER NOT NULL DEFAULT 1,
      receive_attendance_alerts INTEGER NOT NULL DEFAULT 1,
      receive_whatsapp INTEGER NOT NULL DEFAULT 1,
      receive_email INTEGER NOT NULL DEFAULT 1,
      receive_in_app INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE communication_settings (id INTEGER PRIMARY KEY);
    CREATE TABLE communication_templates (event_type TEXT PRIMARY KEY);
    CREATE TABLE communication_logs (id TEXT PRIMARY KEY);
    CREATE TABLE in_app_notifications (id TEXT PRIMARY KEY, guardian_id TEXT);
  `);

  applyMigrations(legacyDb);

  const tables = (
    legacyDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]
  ).map((t) => t.name);

  assert.ok(tables.includes('attendance_movements'));
  assert.ok(tables.includes('guardians'));
  assert.ok(!tables.includes('communication_settings'));
  assert.ok(!tables.includes('communication_templates'));
  assert.ok(!tables.includes('communication_logs'));
  assert.ok(!tables.includes('in_app_notifications'));

  const gCols = (
    legacyDb.prepare(`PRAGMA table_info(guardians)`).all() as { name: string }[]
  ).map((c) => c.name);
  assert.ok(!gCols.includes('whatsapp_number'));

  const sgCols = (
    legacyDb.prepare(`PRAGMA table_info(student_guardians)`).all() as { name: string }[]
  ).map((c) => c.name);
  assert.ok(!sgCols.includes('receive_attendance_alerts'));
  assert.ok(!sgCols.includes('receive_whatsapp'));
  assert.ok(!sgCols.includes('receive_email'));
  assert.ok(!sgCols.includes('receive_in_app'));

  const preserved = legacyDb.prepare(`SELECT id FROM attendance_movements WHERE id = 'mov-1'`).get();
  assert.ok(preserved, 'Los registros de asistencia QR existentes se conservan intactos');

  legacyDb.close();
});

test('Validación de ATTENDANCE_DB_PATH, SESSION_SECRET y ATTENDANCE_ADMIN_PASSCODE + Sesiones y Acceso Admin', async () => {
  const prevDbPath = process.env.ATTENDANCE_DB_PATH;
  const prevSecret = process.env.SESSION_SECRET;
  const prevPasscode = process.env.ATTENDANCE_ADMIN_PASSCODE;

  try {
    // 1. ATTENDANCE_DB_PATH: loads from .env, auto-creates missing dirs, verifies R/W, rejects temporary paths
    delete process.env.ATTENDANCE_DB_PATH;
    const defaultResolved = resolveAndValidateDbPath();
    assert.equal(defaultResolved, path.resolve(PROJECT_ROOT, 'data', 'attendance.db'));
    assert.equal(fs.existsSync(path.dirname(defaultResolved)), true);

    const tempEnvRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sge-env-test-'));
    try {
      const nestedRelDb = path.join('nested', 'db-dir', 'attendance-test.db');
      fs.writeFileSync(
        path.join(tempEnvRoot, '.env'),
        `ATTENDANCE_DB_PATH=${nestedRelDb}\n`,
        'utf8'
      );
      delete process.env.ATTENDANCE_DB_PATH;
      assert.equal(loadProjectDotEnv(tempEnvRoot), true);
      assert.equal(process.env.ATTENDANCE_DB_PATH, nestedRelDb);

      const nestedTarget = path.join(PROJECT_ROOT, 'data', '.test-auto-mkdir', 'sub', 'test.db');
      process.env.ATTENDANCE_DB_PATH = nestedTarget;
      const autoCreatedPath = resolveAndValidateDbPath();
      assert.equal(autoCreatedPath, nestedTarget);
      assert.equal(fs.existsSync(path.dirname(nestedTarget)), true);
    } finally {
      fs.rmSync(tempEnvRoot, { recursive: true, force: true });
      fs.rmSync(path.join(PROJECT_ROOT, 'data', '.test-auto-mkdir'), {
        recursive: true,
        force: true,
      });
    }

    process.env.ATTENDANCE_DB_PATH = path.join(os.tmpdir(), 'temp-bad.db');
    assert.throws(() => resolveAndValidateDbPath(), /directorio temporal/i);

    process.env.ATTENDANCE_DB_PATH = 'file::memory:?cache=shared';
    assert.throws(() => resolveAndValidateDbPath(), /:memory:/i);
    delete process.env.ATTENDANCE_DB_PATH;

    // 2. SESSION_SECRET: rejects short/weak/example keys and accepts CSPRNG 256-bit secret
    process.env.SESSION_SECRET = 'short-secret';
    assert.throws(() => validateSessionSecretIfConfigured(), /al menos 32 caracteres/i);

    process.env.SESSION_SECRET = 'changeme_example_secret_123456789012345';
    assert.throws(() => validateSessionSecretIfConfigured(), /claves débiles/i);

    const strongSecret = crypto.randomBytes(32).toString('hex');
    process.env.SESSION_SECRET = strongSecret;
    const validatedSecret = validateSessionSecretIfConfigured();
    assert.equal(validatedSecret.configured, true);
    assert.equal(validatedSecret.secret, strongSecret);

    // 3. ATTENDANCE_ADMIN_PASSCODE: rejects weak defaults/repetitive strings, accepts strong server passcodes
    process.env.ATTENDANCE_ADMIN_PASSCODE = '1234';
    assert.throws(() => validateAdminPasscodeIfConfigured(), /al menos 8 caracteres/i);

    process.env.ATTENDANCE_ADMIN_PASSCODE = 'admin123';
    assert.throws(() => validateAdminPasscodeIfConfigured(), /predeterminados/i);

    process.env.ATTENDANCE_ADMIN_PASSCODE = 'aaaaaaaa';
    assert.throws(() => validateAdminPasscodeIfConfigured(), /predeterminados/i);

    process.env.ATTENDANCE_ADMIN_PASSCODE = 'Esc2026!';
    assert.equal(validateAdminPasscodeIfConfigured().configured, true);

    const strongPasscode = `Adm-${crypto.randomBytes(12).toString('hex')}`;
    process.env.ATTENDANCE_ADMIN_PASSCODE = strongPasscode;
    assert.equal(validateAdminPasscodeIfConfigured().configured, true);

    // 3b. Startup handles platform placeholder flags ('1') securely without weakening secret validation
    process.env.ATTENDANCE_DB_PATH = '1';
    process.env.SESSION_SECRET = '1';
    process.env.ATTENDANCE_ADMIN_PASSCODE = '1';
    const sanitizedStartup = validateStartupEnvironment();
    assert.equal(sanitizedStartup.dbPath, path.resolve(PROJECT_ROOT, 'data', 'attendance.db'));
    assert.equal(sanitizedStartup.sessionSecretMode, 'ephemeral');
    assert.equal(sanitizedStartup.adminPasscodeConfigured, false);
    assert.equal(process.env.SESSION_SECRET, undefined);
    assert.equal(process.env.ATTENDANCE_ADMIN_PASSCODE, undefined);

    process.env.SESSION_SECRET = strongSecret;
    process.env.ATTENDANCE_ADMIN_PASSCODE = strongPasscode;
    delete process.env.ATTENDANCE_DB_PATH;

    // 4. End-to-end session & admin passcode verification against HTTP app
    const h = await startHarness();
    try {
      const statusRes = await api<{ hasAdmin: boolean; requiresBootstrapPasscode: boolean }>(
        h.baseUrl,
        '/api/auth/status'
      );
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.data.requiresBootstrapPasscode, true);

      // Wrong passcode rejected with 403
      const badBoot = await api(h.baseUrl, '/api/auth/bootstrap-admin', {
        method: 'POST',
        body: {
          fullName: 'Director Test',
          username: 'admin_env',
          email: 'dir@escuela.edu.ar',
          password: 'InitialPassword1!',
          bootstrapPasscode: 'wrong-passcode-value',
        },
      });
      assert.equal(badBoot.status, 403);

      // Correct passcode creates admin + signs token using SESSION_SECRET
      const goodBoot = await api<{ ok: boolean; token: string }>(
        h.baseUrl,
        '/api/auth/bootstrap-admin',
        {
          method: 'POST',
          body: {
            fullName: 'Director Test',
            username: 'admin_env',
            email: 'dir@escuela.edu.ar',
            password: 'InitialPassword1!',
            bootstrapPasscode: strongPasscode,
          },
        }
      );
      assert.equal(goodBoot.status, 201);
      const token1 = goodBoot.data.token;

      // Second concurrent admin login gets independent session token2
      const login2 = await api<{ ok: boolean; token: string }>(h.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'admin_env', password: 'InitialPassword1!' },
      });
      assert.equal(login2.status, 200);
      const token2 = login2.data.token;

      // Logout token1 -> token1 revoked, token2 stays valid (no unnecessary invalidation)
      const logout1 = await api(h.baseUrl, '/api/auth/logout', { method: 'POST', token: token1 });
      assert.equal(logout1.status, 200);
      const me1 = await api(h.baseUrl, '/api/auth/me', { token: token1 });
      assert.equal(me1.status, 401);
      const me2 = await api(h.baseUrl, '/api/auth/me', { token: token2 });
      assert.equal(me2.status, 200);

      // Admin passcode recovery works only with valid server passcode
      const badReset = await api(h.baseUrl, '/api/auth/admin-passcode-reset', {
        method: 'POST',
        body: {
          username: 'admin_env',
          newPassword: 'UpdatedPassword2!',
          bootstrapPasscode: 'bad-code',
        },
      });
      assert.equal(badReset.status, 403);

      const goodReset = await api<{ ok: boolean; token: string }>(
        h.baseUrl,
        '/api/auth/admin-passcode-reset',
        {
          method: 'POST',
          body: {
            username: 'admin_env',
            newPassword: 'UpdatedPassword2!',
            bootstrapPasscode: strongPasscode,
          },
        }
      );
      assert.equal(goodReset.status, 200);

      // New password logs in cleanly
      const relogin = await api<{ ok: boolean }>(h.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'admin_env', password: 'UpdatedPassword2!' },
      });
      assert.equal(relogin.status, 200);
    } finally {
      await h.close();
    }
  } finally {
    if (prevDbPath === undefined) delete process.env.ATTENDANCE_DB_PATH;
    else process.env.ATTENDANCE_DB_PATH = prevDbPath;
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
    if (prevPasscode === undefined) delete process.env.ATTENDANCE_ADMIN_PASSCODE;
    else process.env.ATTENDANCE_ADMIN_PASSCODE = prevPasscode;
  }
});

test('Middleware requireAuth y requireRoles protege todas las rutas escolares y restringe usuarios/logs solo a admin', async () => {
  const h = await startHarness();

  try {
    // 1. Unauthenticated requests must receive 401 on all protected API routes
    const unauthenticatedGets = [
      '/api/auth/me',
      '/api/users',
      '/api/audit-logs',
      '/api/schedules',
      '/api/students-registry',
      '/api/guardians',
      '/api/students/stu-1/guardians',
      '/api/students/stu-1/attendance-summary',
      '/api/attendance-qr/daily',
      '/api/attendance-qr/movements-report',
      '/api/guardian-portal/children',
      '/api/guardian-portal/children/stu-1',
    ];
    for (const route of unauthenticatedGets) {
      const res = await api(h.baseUrl, route);
      assert.equal(res.status, 401, `GET ${route} sin token debe responder 401`);
    }

    const unauthenticatedMutations: { path: string; method: string }[] = [
      { path: '/api/auth/logout', method: 'POST' },
      { path: '/api/users', method: 'POST' },
      { path: '/api/users/u-1/status', method: 'PATCH' },
      { path: '/api/attendance-system/sync-context', method: 'POST' },
      { path: '/api/students/stu-1/shift', method: 'PATCH' },
      { path: '/api/schedules/shift/manana', method: 'PUT' },
      { path: '/api/schedules/overrides', method: 'POST' },
      { path: '/api/schedules/overrides/ovr-1', method: 'DELETE' },
      { path: '/api/schedules/non-school-days', method: 'POST' },
      { path: '/api/schedules/non-school-days/nsd-1', method: 'DELETE' },
      { path: '/api/schedules/weekend-rule', method: 'PUT' },
      { path: '/api/guardians', method: 'POST' },
      { path: '/api/guardians/grd-1', method: 'PUT' },
      { path: '/api/students/stu-1/guardians', method: 'POST' },
      { path: '/api/student-guardians/sg-1', method: 'PUT' },
      { path: '/api/student-guardians/sg-1', method: 'DELETE' },
      { path: '/api/attendance-qr/entry', method: 'POST' },
      { path: '/api/attendance-qr/exit', method: 'POST' },
      { path: '/api/attendance-qr/finalize-absences', method: 'POST' },
      { path: '/api/attendance-qr/manual-adjust', method: 'PATCH' },
    ];
    for (const { path: route, method } of unauthenticatedMutations) {
      const res = await api(h.baseUrl, route, { method, body: {} });
      assert.equal(res.status, 401, `${method} ${route} sin token debe responder 401`);
    }

    // 2. Bootstrap Admin + create preceptor, docente, guardian & tutor
    const boot = await api<{ token: string }>(h.baseUrl, '/api/auth/bootstrap-admin', {
      method: 'POST',
      body: {
        fullName: 'Admin Institucional',
        username: 'admin_rbac',
        email: 'admin@escuela.edu.ar',
        password: 'Password123!',
      },
    });
    assert.equal(boot.status, 201);
    const adminToken = boot.data.token;

    await api(h.baseUrl, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Preceptor RBAC',
        username: 'preceptor_rbac',
        password: 'Password123!',
        role: 'preceptor',
      },
    });
    const preceptorUserRes = await api<{ users: { id: string; username: string }[] }>(
      h.baseUrl,
      '/api/users',
      { token: adminToken }
    );
    assert.equal(preceptorUserRes.status, 200);
    const preceptorId = preceptorUserRes.data.users.find((u) => u.username === 'preceptor_rbac')!.id;

    await api(h.baseUrl, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Docente RBAC',
        username: 'docente_rbac',
        password: 'Password123!',
        role: 'docente',
      },
    });

    const guardianRes = await api<{ guardian: { id: string } }>(h.baseUrl, '/api/guardians', {
      method: 'POST',
      token: adminToken,
      body: { fullName: 'Tutor RBAC', dni: '30111222', phone: '381555111', email: 't@escuela.edu.ar' },
    });
    const guardianId = guardianRes.data.guardian.id;

    await api(h.baseUrl, '/api/users', {
      method: 'POST',
      token: adminToken,
      body: {
        fullName: 'Tutor RBAC',
        username: 'tutor_rbac',
        password: 'Password123!',
        role: 'tutor',
        guardianId,
      },
    });

    const precToken = (
      await api<{ token: string }>(h.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'preceptor_rbac', password: 'Password123!' },
      })
    ).data.token;
    const docToken = (
      await api<{ token: string }>(h.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'docente_rbac', password: 'Password123!' },
      })
    ).data.token;
    const tutorToken = (
      await api<{ token: string }>(h.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'tutor_rbac', password: 'Password123!' },
      })
    ).data.token;

    // 3. Only admin can access user configuration and audit logs
    for (const [roleName, token] of [
      ['preceptor', precToken],
      ['docente', docToken],
      ['tutor', tutorToken],
    ] as const) {
      assert.equal(
        (await api(h.baseUrl, '/api/users', { token })).status,
        403,
        `${roleName} no debe acceder a GET /api/users`
      );
      assert.equal(
        (
          await api(h.baseUrl, '/api/users', {
            method: 'POST',
            token,
            body: { username: 'otro', password: 'Password123!', fullName: 'Otro User', role: 'docente' },
          })
        ).status,
        403,
        `${roleName} no debe crear usuarios`
      );
      assert.equal(
        (
          await api(h.baseUrl, `/api/users/${preceptorId}/status`, {
            method: 'PATCH',
            token,
            body: { isActive: false },
          })
        ).status,
        403,
        `${roleName} no debe cambiar estado de usuarios`
      );
      assert.equal(
        (await api(h.baseUrl, '/api/audit-logs', { token })).status,
        403,
        `${roleName} no debe acceder a GET /api/audit-logs`
      );
      assert.equal(
        (
          await api(h.baseUrl, '/api/schedules/weekend-rule', {
            method: 'PUT',
            token,
            body: { weekendIsNonSchoolDay: true },
          })
        ).status,
        403,
        `${roleName} no debe modificar reglas de calendario/horarios`
      );
    }

    // Admin can toggle status and inspect audit logs (including USUARIO_DESACTIVADO)
    const toggleOff = await api(h.baseUrl, `/api/users/${preceptorId}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: false },
    });
    assert.equal(toggleOff.status, 200);
    assert.equal(
      (await api(h.baseUrl, '/api/auth/me', { token: precToken })).status,
      401,
      'Usuario desactivado debe ser rechazado por requireAuth'
    );
    await api(h.baseUrl, `/api/users/${preceptorId}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { isActive: true },
    });

    const auditAdmin = await api<{ ok: boolean; logs: { action: string }[] }>(
      h.baseUrl,
      '/api/audit-logs',
      { token: adminToken }
    );
    assert.equal(auditAdmin.status, 200);
    assert.ok(auditAdmin.data.logs.some((l) => l.action === 'USUARIO_DESACTIVADO'));

    // 4. Role isolation checks for docente & tutor across school endpoints
    assert.equal((await api(h.baseUrl, '/api/schedules', { token: docToken })).status, 200);
    assert.equal((await api(h.baseUrl, '/api/schedules', { token: tutorToken })).status, 403);
    assert.equal((await api(h.baseUrl, '/api/students-registry', { token: tutorToken })).status, 403);
    assert.equal((await api(h.baseUrl, '/api/guardians', { token: tutorToken })).status, 403);
    assert.equal((await api(h.baseUrl, '/api/attendance-qr/daily', { token: tutorToken })).status, 403);
    assert.equal(
      (await api(h.baseUrl, '/api/guardian-portal/children', { token: docToken })).status,
      403
    );
    assert.equal(
      (
        await api(h.baseUrl, '/api/attendance-qr/finalize-absences', {
          method: 'POST',
          token: docToken,
          body: {},
        })
      ).status,
      403
    );
    assert.equal(
      (
        await api(h.baseUrl, '/api/attendance-qr/manual-adjust', {
          method: 'PATCH',
          token: docToken,
          body: {},
        })
      ).status,
      403
    );
  } finally {
    await h.close();
  }
});

test('Configuración inicial del código de administrador sin variable de entorno + precedencia de ATTENDANCE_ADMIN_PASSCODE', async () => {
  const prevPasscode = process.env.ATTENDANCE_ADMIN_PASSCODE;
  delete process.env.ATTENDANCE_ADMIN_PASSCODE;

  const h = await startHarness();
  try {
    // 1. Sin env var ni admin inicial: requiresBootstrapPasscode=false, adminPasscodeConfigured=false
    const st0 = await api<{
      hasAdmin: boolean;
      requiresBootstrapPasscode: boolean;
      adminPasscodeConfigured: boolean;
      adminPasscodeSource: string;
    }>(h.baseUrl, '/api/auth/status');
    assert.equal(st0.status, 200);
    assert.equal(st0.data.hasAdmin, false);
    assert.equal(st0.data.requiresBootstrapPasscode, false);
    assert.equal(st0.data.adminPasscodeConfigured, false);
    assert.equal(st0.data.adminPasscodeSource, 'none');

    // 2. Código inicial débil es rechazado con 400
    const weakBoot = await api(h.baseUrl, '/api/auth/bootstrap-admin', {
      method: 'POST',
      body: {
        fullName: 'Dirección Escolar',
        username: 'dir_init',
        email: 'dir@escuela.edu.ar',
        password: 'Password123!',
        initialAdminPasscode: 'admin123',
      },
    });
    assert.equal(weakBoot.status, 400);

    // 3. Alta inicial válida con código privado de administrador almacenado con hash scrypt en servidor
    const initialCode = 'Bulacios#2026!';
    const goodBoot = await api<{ ok: boolean; token: string }>(
      h.baseUrl,
      '/api/auth/bootstrap-admin',
      {
        method: 'POST',
        body: {
          fullName: 'Dirección Escolar',
          username: 'dir_init',
          email: 'dir@escuela.edu.ar',
          password: 'Password123!',
          initialAdminPasscode: initialCode,
        },
      }
    );
    assert.equal(goodBoot.status, 201);
    const adminToken = goodBoot.data.token;

    // Verificar que no se guarda en texto plano en SQLite
    const rawRow = h.db
      .prepare(`SELECT value_json FROM school_calendar_settings WHERE key = 'admin_passcode_hash'`)
      .get() as { value_json: string } | undefined;
    assert.ok(rawRow?.value_json);
    assert.equal(rawRow!.value_json.includes(initialCode), false);

    // /api/auth/status refleja adminPasscodeConfigured=true (source=initial_setup)
    const st1 = await api<{
      hasAdmin: boolean;
      requiresBootstrapPasscode: boolean;
      adminPasscodeConfigured: boolean;
      adminPasscodeSource: string;
    }>(h.baseUrl, '/api/auth/status');
    assert.equal(st1.data.hasAdmin, true);
    assert.equal(st1.data.requiresBootstrapPasscode, false);
    assert.equal(st1.data.adminPasscodeConfigured, true);
    assert.equal(st1.data.adminPasscodeSource, 'initial_setup');

    // 4. Recuperación administrativa funciona solo con el código privado configurado
    const wrongRecovery = await api(h.baseUrl, '/api/auth/admin-passcode-reset', {
      method: 'POST',
      body: {
        username: 'dir_init',
        newPassword: 'NewPassword456!',
        bootstrapPasscode: 'ClaveIncorrecta99',
      },
    });
    assert.equal(wrongRecovery.status, 403);

    const goodRecovery = await api<{ ok: boolean; token: string }>(
      h.baseUrl,
      '/api/auth/admin-passcode-reset',
      {
        method: 'POST',
        body: {
          username: 'dir_init',
          newPassword: 'NewPassword456!',
          bootstrapPasscode: initialCode,
        },
      }
    );
    assert.equal(goodRecovery.status, 200);

    // 5. Rotación protegida en POST /api/auth/admin-passcode (solo admin + contraseña actual válida)
    assert.equal(
      (await api(h.baseUrl, '/api/auth/admin-passcode', { method: 'POST', body: {} })).status,
      401
    );
    const wrongCurrent = await api(h.baseUrl, '/api/auth/admin-passcode', {
      method: 'POST',
      token: adminToken,
      body: { currentPassword: 'WrongPassword!', newAdminPasscode: 'NuevoCod#2026!' },
    });
    assert.equal(wrongCurrent.status, 403);

    const rotated = await api(h.baseUrl, '/api/auth/admin-passcode', {
      method: 'POST',
      token: adminToken,
      body: { currentPassword: 'NewPassword456!', newAdminPasscode: 'NuevoCod#2026!' },
    });
    assert.equal(rotated.status, 200);

    // 6. Si ATTENDANCE_ADMIN_PASSCODE se define en el entorno, SIEMPRE prevalece sobre el hash local
    const envOverrideCode = `EnvOverride-${crypto.randomBytes(8).toString('hex')}`;
    process.env.ATTENDANCE_ADMIN_PASSCODE = envOverrideCode;

    const stEnv = await api<{ adminPasscodeSource: string }>(h.baseUrl, '/api/auth/status');
    assert.equal(stEnv.data.adminPasscodeSource, 'env');

    const localBlockedByEnv = await api(h.baseUrl, '/api/auth/admin-passcode-reset', {
      method: 'POST',
      body: {
        username: 'dir_init',
        newPassword: 'AnotherPassword789!',
        bootstrapPasscode: 'NuevoCod#2026!',
      },
    });
    assert.equal(localBlockedByEnv.status, 403);

    const envAccepted = await api(h.baseUrl, '/api/auth/admin-passcode-reset', {
      method: 'POST',
      body: {
        username: 'dir_init',
        newPassword: 'AnotherPassword789!',
        bootstrapPasscode: envOverrideCode,
      },
    });
    assert.equal(envAccepted.status, 200);

    const rotateBlockedByEnv = await api(h.baseUrl, '/api/auth/admin-passcode', {
      method: 'POST',
      token: adminToken,
      body: { currentPassword: 'AnotherPassword789!', newAdminPasscode: 'OtroCod#2026!' },
    });
    assert.equal(rotateBlockedByEnv.status, 409);
  } finally {
    if (prevPasscode === undefined) delete process.env.ATTENDANCE_ADMIN_PASSCODE;
    else process.env.ATTENDANCE_ADMIN_PASSCODE = prevPasscode;
    await h.close();
  }
});

test('Manejo robusto en server/envConfig: .env ausente/inválido y fallback seguro ante variables faltantes o malformadas', () => {
  const prevDbPath = process.env.ATTENDANCE_DB_PATH;
  const prevSecret = process.env.SESSION_SECRET;
  const prevPasscode = process.env.ATTENDANCE_ADMIN_PASSCODE;
  const prevCustom = process.env.TEST_BOM_KEY;

  try {
    // 1. Directorio inexistente o .env que es un directorio no detienen la carga
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sge-dotenv-resilience-'));
    try {
      assert.equal(loadProjectDotEnv(path.join(tmpDir, 'missing-dir')), false);

      fs.mkdirSync(path.join(tmpDir, '.env'));
      assert.equal(loadProjectDotEnv(tmpDir), false);
      fs.rmdirSync(path.join(tmpDir, '.env'));

      // 2. .env con UTF-8 BOM, prefijo export y comentarios en línea
      delete process.env.TEST_BOM_KEY;
      fs.writeFileSync(
        path.join(tmpDir, '.env'),
        `\uFEFFexport TEST_BOM_KEY=valor_ok # comentario\n`,
        'utf8'
      );
      assert.equal(loadProjectDotEnv(tmpDir), true);
      assert.equal(process.env.TEST_BOM_KEY, 'valor_ok');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 3. Variables opcionales ausentes: arranque limpio sin errores ni advertencias
    delete process.env.ATTENDANCE_DB_PATH;
    delete process.env.SESSION_SECRET;
    delete process.env.ATTENDANCE_ADMIN_PASSCODE;
    const cleanStartup = validateStartupEnvironment();
    assert.equal(cleanStartup.dbPath, path.resolve(PROJECT_ROOT, 'data', 'attendance.db'));
    assert.equal(cleanStartup.sessionSecretMode, 'ephemeral');
    assert.equal(cleanStartup.adminPasscodeConfigured, false);
    assert.equal(cleanStartup.warnings.length, 0);

    // 4. Variables opcionales con valores inválidos/débiles/temporales: rechaza (fail-closed) y no detiene el servidor
    process.env.ATTENDANCE_DB_PATH = path.join(os.tmpdir(), 'temp-disallowed.db');
    process.env.SESSION_SECRET = 'short-weak';
    process.env.ATTENDANCE_ADMIN_PASSCODE = '123';
    const recoveredStartup = validateStartupEnvironment();
    assert.equal(recoveredStartup.dbPath, path.resolve(PROJECT_ROOT, 'data', 'attendance.db'));
    assert.equal(recoveredStartup.dbFromEnv, false);
    assert.equal(recoveredStartup.sessionSecretMode, 'ephemeral');
    assert.equal(recoveredStartup.adminPasscodeConfigured, false);
    assert.equal(recoveredStartup.warnings.length, 3);
    assert.equal(process.env.ATTENDANCE_DB_PATH, undefined);
    assert.equal(process.env.SESSION_SECRET, undefined);
    assert.equal(process.env.ATTENDANCE_ADMIN_PASSCODE, undefined);
  } finally {
    if (prevDbPath === undefined) delete process.env.ATTENDANCE_DB_PATH;
    else process.env.ATTENDANCE_DB_PATH = prevDbPath;
    if (prevSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSecret;
    if (prevPasscode === undefined) delete process.env.ATTENDANCE_ADMIN_PASSCODE;
    else process.env.ATTENDANCE_ADMIN_PASSCODE = prevPasscode;
    if (prevCustom === undefined) delete process.env.TEST_BOM_KEY;
    else process.env.TEST_BOM_KEY = prevCustom;
  }
});


