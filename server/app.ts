import crypto from 'node:crypto';
import express, { type Express } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { CourseYear } from '../types';
import type {
  AuditLogRecord,
  DailyAttendanceStatusSummary,
  ExitType,
  GuardianChildSnapshot,
  ShiftType,
  StudentGuardianLink,
  UserRole,
} from '../shared/attendanceDomain';
import {
  createAuthMiddleware,
  hasAnyAdminUser,
  hashPassword,
  issueAuthToken,
  recordAuditLog,
  revokeAuthToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth';
import { runInTransaction } from './db';
import {
  readValidatedAdminPasscodeSafe,
  readValidatedSessionSecretSafe,
  validateAdminPasscodeStrength,
  verifyAdminPasscodeConstantTime,
} from './envConfig';
import {
  getScheduleConfig,
  isValidHHMM,
  isValidISODate,
} from './scheduleEngine';
import {
  finalizeDailyAbsences,
  getDailySummaryForStudentDate,
  registerEntryByQR,
  registerExitByQR,
} from './attendanceEngine';

function isValidRole(role: string): role is UserRole {
  return role === 'admin' || role === 'preceptor' || role === 'docente' || role === 'tutor';
}

function isValidShift(shift: string): shift is ShiftType {
  return shift === 'manana' || shift === 'tarde' || shift === 'vespertino';
}

const ADMIN_PASSCODE_SETTING_KEY = 'admin_passcode_hash';

function loadStoredAdminPasscodeHash(db: DatabaseSync): string | null {
  try {
    const row = db
      .prepare(`SELECT value_json FROM school_calendar_settings WHERE key = ?`)
      .get(ADMIN_PASSCODE_SETTING_KEY) as { value_json: string } | undefined;
    if (!row?.value_json) return null;
    const parsed = JSON.parse(row.value_json) as { hash?: string };
    return typeof parsed?.hash === 'string' && parsed.hash.includes(':') ? parsed.hash : null;
  } catch {
    return null;
  }
}

function saveStoredAdminPasscodeHash(db: DatabaseSync, hash: string, nowIso: string): void {
  db.prepare(
    `INSERT INTO school_calendar_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(ADMIN_PASSCODE_SETTING_KEY, JSON.stringify({ hash, configuredAt: nowIso }), nowIso);
}

function getAdminPasscodeStatus(db: DatabaseSync): {
  configured: boolean;
  source: 'env' | 'initial_setup' | 'none';
} {
  const envStatus = readValidatedAdminPasscodeSafe();
  if (envStatus.configured) {
    return { configured: true, source: 'env' };
  }
  if (loadStoredAdminPasscodeHash(db)) {
    return { configured: true, source: 'initial_setup' };
  }
  return { configured: false, source: 'none' };
}

function verifyServerAdminPasscode(db: DatabaseSync, candidatePasscode: string): boolean {
  const envStatus = readValidatedAdminPasscodeSafe();
  if (envStatus.configured) {
    // Environment variable always overrides any claimed fallback hash
    return verifyAdminPasscodeConstantTime(candidatePasscode);
  }
  const storedHash = loadStoredAdminPasscodeHash(db);
  if (!storedHash) return false;
  const candidate = String(candidatePasscode || '').trim();
  if (!candidate) return false;
  return verifyPassword(candidate, storedHash);
}

function guardianOwnsStudent(
  db: DatabaseSync,
  guardianId: string | null | undefined,
  studentId: string
): boolean {
  if (!guardianId) return false;
  const row = db
    .prepare(
      `SELECT 1 FROM student_guardians sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.guardian_id = ? AND sg.student_id = ? AND g.is_active = 1`
    )
    .get(guardianId, studentId);
  return Boolean(row);
}

function buildGuardianChildSnapshot(
  db: DatabaseSync,
  guardianId: string,
  studentId: string,
  todayISO: string
): GuardianChildSnapshot | null {
  const link = db
    .prepare(
      `SELECT sg.relationship, sg.authorized_pickup,
              s.id, s.full_name, s.dni, s.course, s.division, s.photo
       FROM student_guardians sg
       JOIN students_registry s ON s.id = sg.student_id
       WHERE sg.guardian_id = ? AND sg.student_id = ?`
    )
    .get(guardianId, studentId) as
    | {
        relationship: string;
        authorized_pickup: number;
        id: string;
        full_name: string;
        dni: string;
        course: CourseYear;
        division: string;
        photo: string;
      }
    | undefined;

  if (!link) return null;

  const todayStatus = getDailySummaryForStudentDate(db, studentId, todayISO);

  const movRows = db
    .prepare(
      `SELECT m.*, s.full_name AS student_name
       FROM attendance_movements m
       JOIN students_registry s ON s.id = m.student_id
       WHERE m.student_id = ?
       ORDER BY m.attendance_date DESC, m.recorded_time DESC, m.created_at DESC
       LIMIT 120`
    )
    .all(studentId) as Record<string, unknown>[];

  const movements = movRows.map((r) => ({
    id: String(r.id),
    eventUniqueKey: String(r.event_unique_key),
    studentId: String(r.student_id),
    studentName: String(r.student_name),
    course: String(r.course) as CourseYear,
    division: String(r.division),
    attendanceDate: String(r.attendance_date),
    movementKind: String(r.movement_kind) as 'ingreso' | 'salida',
    attendanceStatus: r.attendance_status
      ? (String(r.attendance_status) as 'presente' | 'tarde' | 'ausente')
      : undefined,
    exitType: r.exit_type ? (String(r.exit_type) as ExitType) : undefined,
    recordedTime: String(r.recorded_time),
    shift: String(r.shift) as ShiftType,
    operatorUserId: String(r.operator_user_id),
    operatorName: String(r.operator_name),
    withdrawalReason: r.withdrawal_reason ? String(r.withdrawal_reason) : undefined,
    authorizedPersonName: r.authorized_person_name ? String(r.authorized_person_name) : undefined,
    authorizedPersonDni: r.authorized_person_dni ? String(r.authorized_person_dni) : undefined,
    guardianLinkId: r.guardian_link_id ? String(r.guardian_link_id) : null,
    observations: r.observations ? String(r.observations) : undefined,
    cardNumber: r.card_number ? String(r.card_number) : undefined,
    createdAt: String(r.created_at),
  }));

  const summaryRows = db
    .prepare(
      `SELECT entry_status, exit_type
       FROM daily_attendance_summary
       WHERE student_id = ?`
    )
    .all(studentId) as { entry_status: string | null; exit_type: string | null }[];

  const totalRecordedDays = summaryRows.length;
  const presentCount = summaryRows.filter((s) => s.entry_status === 'presente').length;
  const lateCount = summaryRows.filter((s) => s.entry_status === 'tarde').length;
  const absentCount = summaryRows.filter((s) => s.entry_status === 'ausente').length;
  const earlyWithdrawalsCount = summaryRows.filter((s) => s.exit_type === 'retiro_anticipado').length;
  const attendancePercent =
    totalRecordedDays > 0
      ? Math.round(((presentCount + lateCount * 0.5) / totalRecordedDays) * 100)
      : 100;

  return {
    studentId: link.id,
    fullName: link.full_name,
    dni: link.dni,
    course: link.course,
    division: link.division,
    photo: link.photo || undefined,
    relationship: link.relationship,
    authorizedPickup: link.authorized_pickup === 1,
    todayStatus,
    movements,
    stats: {
      totalRecordedDays,
      presentCount,
      lateCount,
      absentCount,
      earlyWithdrawalsCount,
      attendancePercent,
    },
  };
}

export function createAttendanceApp(db: DatabaseSync): Express {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  const { requireAuth, requireRoles } = createAuthMiddleware(db);

  app.get('/api/health', (_req, res) => {
    let dbConnected = false;
    try {
      const probe = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
      dbConnected = probe?.ok === 1;
    } catch {
      dbConnected = false;
    }

    const sessionStatus = readValidatedSessionSecretSafe();
    const envAdminFallback = readValidatedAdminPasscodeSafe();
    const adminPassStatus = dbConnected
      ? getAdminPasscodeStatus(db)
      : {
          configured: envAdminFallback.configured,
          source: envAdminFallback.configured ? ('env' as const) : ('none' as const),
        };

    res.status(dbConnected ? 200 : 503).json({
      ok: dbConnected,
      dbConnected,
      hasAdmin: dbConnected ? hasAnyAdminUser(db) : false,
      configStatus: {
        sessionMode: sessionStatus.configured ? 'env' : 'ephemeral',
        adminPasscodeConfigured: adminPassStatus.configured,
        adminPasscodeSource: adminPassStatus.source,
      },
    });
  });

  app.get('/api/auth/status', (_req, res) => {
    const envPassStatus = readValidatedAdminPasscodeSafe();
    const effectivePassStatus = getAdminPasscodeStatus(db);
    res.json({
      ok: true,
      hasAdmin: hasAnyAdminUser(db),
      requiresBootstrapPasscode: envPassStatus.configured,
      adminPasscodeConfigured: effectivePassStatus.configured,
      adminPasscodeSource: effectivePassStatus.source,
    });
  });

  app.post('/api/auth/bootstrap-admin', (req, res) => {
    const { username, password, fullName, email, bootstrapPasscode, initialAdminPasscode } =
      (req.body || {}) as {
        username?: string;
        password?: string;
        fullName?: string;
        email?: string;
        bootstrapPasscode?: string;
        initialAdminPasscode?: string;
      };

    if (hasAnyAdminUser(db)) {
      res.status(409).json({
        ok: false,
        error: 'El usuario administrador inicial ya fue configurado. Inicie sesión con sus credenciales.',
      });
      return;
    }

    const adminPassStatus = readValidatedAdminPasscodeSafe();
    if (adminPassStatus.configured) {
      if (!verifyAdminPasscodeConstantTime(String(bootstrapPasscode || ''))) {
        res.status(403).json({
          ok: false,
          error: 'Código de activación inicial incorrecto.',
        });
        return;
      }
    }

    let initialPasscodeHash: string | null = null;
    if (!adminPassStatus.configured && initialAdminPasscode !== undefined) {
      const trimmedInitial = String(initialAdminPasscode).trim();
      if (trimmedInitial.length > 0) {
        try {
          const validatedCode = validateAdminPasscodeStrength(trimmedInitial);
          initialPasscodeHash = hashPassword(validatedCode);
        } catch (err) {
          res.status(400).json({
            ok: false,
            error:
              err instanceof Error
                ? err.message
                : 'El código privado de administrador debe tener al menos 8 caracteres seguros y no ser predecible.',
          });
          return;
        }
      }
    }

    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanFullName = String(fullName || '').trim();
    const cleanPassword = String(password || '');
    const cleanEmail = String(email || '').trim();

    if (cleanUsername.length < 3 || cleanFullName.length < 3 || cleanPassword.length < 6) {
      res.status(400).json({
        ok: false,
        error: 'Complete nombre completo, usuario (mín. 3 caracteres) y contraseña (mín. 6 caracteres).',
      });
      return;
    }

    const userId = `usr_${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const passwordHash = hashPassword(cleanPassword);

    try {
      runInTransaction(db, () => {
        if (hasAnyAdminUser(db)) {
          throw new Error('ADMIN_EXISTS');
        }
        db.prepare(
          `INSERT INTO app_users
            (id, username, email, full_name, role, password_hash, guardian_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'admin', ?, NULL, 1, ?, ?)`
        ).run(userId, cleanUsername, cleanEmail, cleanFullName, passwordHash, nowIso, nowIso);

        if (initialPasscodeHash) {
          saveStoredAdminPasscodeHash(db, initialPasscodeHash, nowIso);
        }

        recordAuditLog(
          db,
          { id: userId, fullName: cleanFullName, role: 'admin' },
          'ADMIN_BOOTSTRAP',
          'app_user',
          userId,
          {
            username: cleanUsername,
            adminPasscodeConfiguredOnBootstrap: Boolean(initialPasscodeHash),
          }
        );
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ADMIN_EXISTS') {
        res.status(409).json({ ok: false, error: 'El administrador ya existe.' });
        return;
      }
      res.status(400).json({ ok: false, error: 'No se pudo crear el administrador inicial.' });
      return;
    }

    const token = issueAuthToken(userId, 'admin');
    res.status(201).json({
      ok: true,
      token,
      user: {
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        fullName: cleanFullName,
        role: 'admin' as UserRole,
        guardianId: null,
      },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = (req.body || {}) as {
      username?: string;
      password?: string;
    };
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanUser || !cleanPass) {
      res.status(400).json({ ok: false, error: 'Ingrese usuario y contraseña.' });
      return;
    }

    const row = db
      .prepare(
        `SELECT id, username, email, full_name, role, password_hash, guardian_id, is_active
         FROM app_users
         WHERE LOWER(username) = ?`
      )
      .get(cleanUser) as
      | {
          id: string;
          username: string;
          email: string;
          full_name: string;
          role: UserRole;
          password_hash: string;
          guardian_id: string | null;
          is_active: number;
        }
      | undefined;

    if (!row || row.is_active !== 1 || !verifyPassword(cleanPass, row.password_hash)) {
      res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
      return;
    }

    const token = issueAuthToken(row.id, row.role);
    res.json({
      ok: true,
      token,
      user: {
        id: row.id,
        username: row.username,
        email: row.email,
        fullName: row.full_name,
        role: row.role,
        guardianId: row.guardian_id,
      },
    });
  });

  app.post('/api/auth/admin-passcode-reset', (req, res) => {
    const adminPassStatus = getAdminPasscodeStatus(db);
    if (!adminPassStatus.configured) {
      res.status(403).json({
        ok: false,
        error: 'El código administrativo del servidor no está configurado en este entorno.',
      });
      return;
    }

    const { bootstrapPasscode, username, newPassword } = (req.body || {}) as {
      bootstrapPasscode?: string;
      username?: string;
      newPassword?: string;
    };

    if (!verifyServerAdminPasscode(db, String(bootstrapPasscode || ''))) {
      res.status(403).json({
        ok: false,
        error: 'Código administrativo del servidor incorrecto.',
      });
      return;
    }

    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanPass = String(newPassword || '');
    if (!cleanUser || cleanPass.length < 6) {
      res.status(400).json({
        ok: false,
        error: 'Ingrese el usuario administrador y una nueva contraseña (mínimo 6 caracteres).',
      });
      return;
    }

    const adminRow = db
      .prepare(
        `SELECT id, username, email, full_name, role, guardian_id, is_active
         FROM app_users
         WHERE LOWER(username) = ? AND role = 'admin'`
      )
      .get(cleanUser) as
      | {
          id: string;
          username: string;
          email: string;
          full_name: string;
          role: UserRole;
          guardian_id: string | null;
          is_active: number;
        }
      | undefined;

    if (!adminRow || adminRow.is_active !== 1) {
      res.status(404).json({
        ok: false,
        error: 'No se encontró una cuenta de administrador activa con ese usuario.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const newHash = hashPassword(cleanPass);

    runInTransaction(db, () => {
      db.prepare(`UPDATE app_users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
        newHash,
        nowIso,
        adminRow.id
      );

      recordAuditLog(
        db,
        { id: adminRow.id, fullName: adminRow.full_name, role: 'admin' },
        'ADMIN_PASSCODE_OVERRIDE',
        'app_user',
        adminRow.id,
        { username: adminRow.username, source: adminPassStatus.source }
      );
    });

    const token = issueAuthToken(adminRow.id, 'admin');
    res.json({
      ok: true,
      token,
      user: {
        id: adminRow.id,
        username: adminRow.username,
        email: adminRow.email,
        fullName: adminRow.full_name,
        role: adminRow.role,
        guardianId: adminRow.guardian_id,
      },
    });
  });

  app.post(
    '/api/auth/admin-passcode',
    requireAuth,
    requireRoles(['admin']),
    (req: AuthenticatedRequest, res) => {
      if (readValidatedAdminPasscodeSafe().configured) {
        res.status(409).json({
          ok: false,
          error:
            'El código administrativo está gestionado por variable de entorno del servidor (ATTENDANCE_ADMIN_PASSCODE) y prevalece sobre la configuración local.',
        });
        return;
      }

      const { currentPassword, newAdminPasscode } = (req.body || {}) as {
        currentPassword?: string;
        newAdminPasscode?: string;
      };

      const actor = req.authUser!;
      const adminRow = db
        .prepare(`SELECT password_hash FROM app_users WHERE id = ? AND is_active = 1`)
        .get(actor.id) as { password_hash: string } | undefined;

      if (!adminRow || !verifyPassword(String(currentPassword || ''), adminRow.password_hash)) {
        res.status(403).json({
          ok: false,
          error: 'La contraseña actual del administrador es incorrecta.',
        });
        return;
      }

      let validatedCode: string;
      try {
        validatedCode = validateAdminPasscodeStrength(String(newAdminPasscode || ''));
      } catch (err) {
        res.status(400).json({
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'El código privado de administrador debe tener al menos 8 caracteres seguros y no ser predecible.',
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const hashedCode = hashPassword(validatedCode);

      runInTransaction(db, () => {
        saveStoredAdminPasscodeHash(db, hashedCode, nowIso);
        recordAuditLog(
          db,
          { id: actor.id, fullName: actor.fullName, role: actor.role },
          'ADMIN_PASSCODE_CONFIGURED',
          'security_settings',
          ADMIN_PASSCODE_SETTING_KEY,
          { source: 'initial_setup' }
        );
      });

      res.json({ ok: true, adminPasscodeConfigured: true, adminPasscodeSource: 'initial_setup' });
    }
  );

  app.post(
    '/api/auth/logout',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente', 'tutor']),
    (req, res) => {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (token) {
        revokeAuthToken(token);
      }
      res.json({ ok: true });
    }
  );

  app.get(
    '/api/auth/me',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente', 'tutor']),
    (req: AuthenticatedRequest, res) => {
      res.json({ ok: true, user: req.authUser });
    }
  );

  // =========================================================================
  // Gestión de Usuarios y Roles (Admin)
  // =========================================================================
  app.get('/api/users', requireAuth, requireRoles(['admin']), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.email, u.full_name, u.role, u.guardian_id, u.is_active, u.created_at,
                g.full_name AS guardian_name
         FROM app_users u
         LEFT JOIN guardians g ON g.id = u.guardian_id
         ORDER BY u.created_at DESC`
      )
      .all() as {
      id: string;
      username: string;
      email: string;
      full_name: string;
      role: UserRole;
      guardian_id: string | null;
      is_active: number;
      created_at: string;
      guardian_name: string | null;
    }[];

    res.json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id,
        username: r.username,
        email: r.email,
        fullName: r.full_name,
        role: r.role,
        guardianId: r.guardian_id,
        guardianName: r.guardian_name || undefined,
        isActive: r.is_active === 1,
        createdAt: r.created_at,
      })),
    });
  });

  app.post('/api/users', requireAuth, requireRoles(['admin']), (req: AuthenticatedRequest, res) => {
    const { username, password, fullName, email, role, guardianId } = (req.body || {}) as {
      username?: string;
      password?: string;
      fullName?: string;
      email?: string;
      role?: string;
      guardianId?: string | null;
    };

    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanFullName = String(fullName || '').trim();
    const cleanPassword = String(password || '');
    const cleanEmail = String(email || '').trim();
    const cleanRole = String(role || '');

    if (
      cleanUsername.length < 3 ||
      cleanFullName.length < 3 ||
      cleanPassword.length < 6 ||
      !isValidRole(cleanRole)
    ) {
      res.status(400).json({
        ok: false,
        error: 'Datos inválidos: verifique usuario, nombre, rol y contraseña (mín. 6 caracteres).',
      });
      return;
    }

    if (cleanRole === 'tutor') {
      if (!guardianId) {
        res.status(400).json({
          ok: false,
          error: 'Un usuario con rol Padre/Tutor debe vincularse a un tutor registrado.',
        });
        return;
      }
      const gExists = db
        .prepare(`SELECT id FROM guardians WHERE id = ? AND is_active = 1`)
        .get(guardianId);
      if (!gExists) {
        res.status(404).json({ ok: false, error: 'El tutor vinculado no existe o está inactivo.' });
        return;
      }
    }

    const exists = db
      .prepare(`SELECT id FROM app_users WHERE LOWER(username) = ?`)
      .get(cleanUsername);
    if (exists) {
      res.status(409).json({ ok: false, error: 'Ya existe un usuario con ese nombre de acceso.' });
      return;
    }

    const id = `usr_${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const actor = req.authUser!;

    runInTransaction(db, () => {
      db.prepare(
        `INSERT INTO app_users
          (id, username, email, full_name, role, password_hash, guardian_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        id,
        cleanUsername,
        cleanEmail,
        cleanFullName,
        cleanRole,
        hashPassword(cleanPassword),
        cleanRole === 'tutor' ? guardianId || null : null,
        nowIso,
        nowIso
      );

      recordAuditLog(
        db,
        { id: actor.id, fullName: actor.fullName, role: actor.role },
        'USUARIO_CREADO',
        'app_user',
        id,
        { username: cleanUsername, role: cleanRole, guardianId: guardianId || null }
      );
    });

    res.status(201).json({
      ok: true,
      user: {
        id,
        username: cleanUsername,
        email: cleanEmail,
        fullName: cleanFullName,
        role: cleanRole,
        guardianId: cleanRole === 'tutor' ? guardianId || null : null,
        isActive: true,
      },
    });
  });

  app.patch(
    '/api/users/:id/status',
    requireAuth,
    requireRoles(['admin']),
    (req: AuthenticatedRequest, res) => {
      const targetId = String(req.params.id || '');
      const { isActive } = (req.body || {}) as { isActive?: boolean };
      if (targetId === req.authUser?.id && isActive === false) {
        res.status(400).json({ ok: false, error: 'No puede desactivar su propia sesión.' });
        return;
      }

      const actor = req.authUser!;
      const existing = db
        .prepare(`SELECT id, username FROM app_users WHERE id = ?`)
        .get(targetId) as { id: string; username: string } | undefined;
      if (!existing) {
        res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
        return;
      }

      runInTransaction(db, () => {
        db.prepare(`UPDATE app_users SET is_active = ?, updated_at = ? WHERE id = ?`).run(
          isActive ? 1 : 0,
          new Date().toISOString(),
          targetId
        );

        recordAuditLog(
          db,
          { id: actor.id, fullName: actor.fullName, role: actor.role },
          isActive ? 'USUARIO_ACTIVADO' : 'USUARIO_DESACTIVADO',
          'app_user',
          targetId,
          { username: existing.username, isActive: Boolean(isActive) }
        );
      });

      res.json({ ok: true });
    }
  );

  // =========================================================================
  // Sincronización del Padrón Escolar y Calendario Lectivo desde App
  // =========================================================================
  app.post(
    '/api/attendance-system/sync-context',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    (req: AuthenticatedRequest, res) => {
      const { students, issuedCards, calendarHolidays } = (req.body || {}) as {
        students?: {
          id: string;
          fullName: string;
          dni?: string;
          course: CourseYear;
          division?: string;
          enrollmentStatus?: string;
          photo?: string;
          defaultShift?: ShiftType;
        }[];
        issuedCards?: {
          cardNumber: string;
          personId: string;
          personType: 'student' | 'teacher';
          status: 'vigente' | 'anulado' | 'reemplazado';
          validUntil: string;
          revokeReason?: string;
        }[];
        calendarHolidays?: { id: string; date: string; title: string }[];
      };

      const nowIso = new Date().toISOString();

      runInTransaction(db, () => {
        if (Array.isArray(students)) {
          const upsertStudent = db.prepare(`
            INSERT INTO students_registry
              (id, full_name, dni, course, division, enrollment_status, photo, default_shift, is_active, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
              full_name = excluded.full_name,
              dni = excluded.dni,
              course = excluded.course,
              division = CASE WHEN excluded.division <> '' THEN excluded.division ELSE students_registry.division END,
              enrollment_status = excluded.enrollment_status,
              photo = COALESCE(NULLIF(excluded.photo, ''), students_registry.photo),
              is_active = 1,
              updated_at = excluded.updated_at
          `);

          for (const st of students) {
            if (!st?.id || !st?.fullName) continue;
            const shiftVal = st.defaultShift && isValidShift(st.defaultShift) ? st.defaultShift : 'manana';
            upsertStudent.run(
              st.id,
              st.fullName.trim(),
              (st.dni || '').trim(),
              st.course || '1',
              (st.division || 'A').trim(),
              st.enrollmentStatus || 'regular',
              st.photo || '',
              shiftVal,
              nowIso
            );
          }
        }

        if (Array.isArray(issuedCards)) {
          const upsertCard = db.prepare(`
            INSERT INTO issued_cards_registry
              (card_number, person_id, person_type, status, valid_until, revoke_reason, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(card_number) DO UPDATE SET
              person_id = excluded.person_id,
              person_type = excluded.person_type,
              status = excluded.status,
              valid_until = excluded.valid_until,
              revoke_reason = excluded.revoke_reason,
              updated_at = excluded.updated_at
          `);

          for (const card of issuedCards) {
            if (!card?.cardNumber || !card?.personId) continue;
            upsertCard.run(
              card.cardNumber,
              card.personId,
              card.personType || 'student',
              card.status || 'vigente',
              card.validUntil || '2026-12-31',
              card.revokeReason || '',
              nowIso
            );
          }
        }

        if (Array.isArray(calendarHolidays)) {
          db.prepare(`DELETE FROM non_school_days WHERE source = 'calendar'`).run();
          const insertHoliday = db.prepare(`
            INSERT OR IGNORE INTO non_school_days (id, date, reason, source, created_at)
            VALUES (?, ?, ?, 'calendar', ?)
          `);
          for (const hol of calendarHolidays) {
            if (hol?.date && isValidISODate(hol.date)) {
              insertHoliday.run(
                `cal_${hol.id || crypto.randomUUID()}`,
                hol.date,
                hol.title || 'Feriado / Día no lectivo del calendario escolar',
                nowIso
              );
            }
          }
        }
      });

      res.json({ ok: true });
    }
  );

  app.get(
    '/api/students-registry',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    (_req, res) => {
      const rows = db
        .prepare(
          `SELECT id, full_name, dni, course, division, enrollment_status, photo, default_shift
           FROM students_registry
           WHERE is_active = 1
           ORDER BY course ASC, full_name ASC`
        )
        .all() as {
        id: string;
        full_name: string;
        dni: string;
        course: CourseYear;
        division: string;
        enrollment_status: string;
        photo: string;
        default_shift: ShiftType;
      }[];

      res.json({
        ok: true,
        students: rows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          dni: r.dni,
          course: r.course,
          division: r.division,
          enrollmentStatus: r.enrollment_status,
          photo: r.photo || undefined,
          defaultShift: r.default_shift,
        })),
      });
    }
  );

  app.patch(
    '/api/students/:studentId/shift',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req: AuthenticatedRequest, res) => {
      const studentId = String(req.params.studentId || '');
      const { defaultShift, division } = (req.body || {}) as {
        defaultShift?: string;
        division?: string;
      };
      if (defaultShift && !isValidShift(defaultShift)) {
        res.status(400).json({ ok: false, error: 'Turno inválido.' });
        return;
      }

      db.prepare(
        `UPDATE students_registry
         SET default_shift = COALESCE(?, default_shift),
             division = COALESCE(?, division),
             updated_at = ?
         WHERE id = ?`
      ).run(defaultShift || null, division !== undefined ? division.trim() : null, new Date().toISOString(), studentId);

      res.json({ ok: true });
    }
  );

  // =========================================================================
  // Configuración de Horarios, Turnos y Días No Lectivos
  // =========================================================================
  app.get(
    '/api/schedules',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    (_req, res) => {
      res.json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  app.put(
    '/api/schedules/shift/:shift',
    requireAuth,
    requireRoles(['admin']),
    (req: AuthenticatedRequest, res) => {
      const shift = String(req.params.shift || '');
      if (!isValidShift(shift)) {
        res.status(400).json({ ok: false, error: 'Turno inválido.' });
        return;
      }
      const {
        label,
        entryTime,
        punctualityCutoffTime,
        toleranceMinutes,
        exitTime,
        absenceCloseTime,
        enabled,
      } = (req.body || {}) as {
        label?: string;
        entryTime?: string;
        punctualityCutoffTime?: string;
        toleranceMinutes?: number;
        exitTime?: string;
        absenceCloseTime?: string;
        enabled?: boolean;
      };

      if (
        !entryTime ||
        !isValidHHMM(entryTime) ||
        !punctualityCutoffTime ||
        !isValidHHMM(punctualityCutoffTime) ||
        !exitTime ||
        !isValidHHMM(exitTime) ||
        !absenceCloseTime ||
        !isValidHHMM(absenceCloseTime)
      ) {
        res.status(400).json({ ok: false, error: 'Todos los horarios deben tener formato HH:MM.' });
        return;
      }

      const actor = req.authUser!;
      const nowIso = new Date().toISOString();

      runInTransaction(db, () => {
        db.prepare(
          `UPDATE shift_schedules
           SET label = ?, entry_time = ?, punctuality_cutoff_time = ?, tolerance_minutes = ?, exit_time = ?, absence_close_time = ?, enabled = ?, updated_at = ?
           WHERE shift = ?`
        ).run(
          (label || `Turno ${shift}`).trim(),
          entryTime,
          punctualityCutoffTime,
          Math.max(0, Math.min(120, Number(toleranceMinutes || 0))),
          exitTime,
          absenceCloseTime,
          enabled === false ? 0 : 1,
          nowIso,
          shift
        );

        recordAuditLog(
          db,
          { id: actor.id, fullName: actor.fullName, role: actor.role },
          'HORARIO_TURNO_ACTUALIZADO',
          'shift_schedule',
          shift,
          { entryTime, punctualityCutoffTime, toleranceMinutes, exitTime, absenceCloseTime }
        );
      });

      res.json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  app.post(
    '/api/schedules/overrides',
    requireAuth,
    requireRoles(['admin']),
    (req: AuthenticatedRequest, res) => {
      const {
        course,
        division,
        shift,
        entryTime,
        punctualityCutoffTime,
        toleranceMinutes,
        exitTime,
        absenceCloseTime,
        active,
      } = (req.body || {}) as {
        course?: CourseYear;
        division?: string;
        shift?: string;
        entryTime?: string;
        punctualityCutoffTime?: string;
        toleranceMinutes?: number;
        exitTime?: string;
        absenceCloseTime?: string;
        active?: boolean;
      };

      if (
        !course ||
        !shift ||
        !isValidShift(shift) ||
        !entryTime ||
        !isValidHHMM(entryTime) ||
        !punctualityCutoffTime ||
        !isValidHHMM(punctualityCutoffTime) ||
        !exitTime ||
        !isValidHHMM(exitTime) ||
        !absenceCloseTime ||
        !isValidHHMM(absenceCloseTime)
      ) {
        res.status(400).json({ ok: false, error: 'Datos de excepción horaria inválidos.' });
        return;
      }

      const id = `ovr_${crypto.randomUUID()}`;
      const cleanDiv = (division || '').trim().toUpperCase();
      const nowIso = new Date().toISOString();
      const actor = req.authUser!;

      runInTransaction(db, () => {
        db.prepare(
          `INSERT INTO course_schedule_overrides
            (id, course, division, shift, entry_time, punctuality_cutoff_time, tolerance_minutes, exit_time, absence_close_time, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(course, division, shift) DO UPDATE SET
            entry_time = excluded.entry_time,
            punctuality_cutoff_time = excluded.punctuality_cutoff_time,
            tolerance_minutes = excluded.tolerance_minutes,
            exit_time = excluded.exit_time,
            absence_close_time = excluded.absence_close_time,
            active = excluded.active,
            updated_at = excluded.updated_at`
        ).run(
          id,
          course,
          cleanDiv,
          shift,
          entryTime,
          punctualityCutoffTime,
          Math.max(0, Math.min(120, Number(toleranceMinutes || 0))),
          exitTime,
          absenceCloseTime,
          active === false ? 0 : 1,
          nowIso
        );

        recordAuditLog(
          db,
          { id: actor.id, fullName: actor.fullName, role: actor.role },
          'EXCEPCION_HORARIA_GUARDADA',
          'course_schedule_override',
          `${course}:${cleanDiv}:${shift}`,
          { entryTime, punctualityCutoffTime, toleranceMinutes, exitTime, absenceCloseTime }
        );
      });

      res.status(201).json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  app.delete(
    '/api/schedules/overrides/:id',
    requireAuth,
    requireRoles(['admin']),
    (req: AuthenticatedRequest, res) => {
      db.prepare(`DELETE FROM course_schedule_overrides WHERE id = ?`).run(String(req.params.id || ''));
      res.json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  app.post(
    '/api/schedules/non-school-days',
    requireAuth,
    requireRoles(['admin']),
    (req: AuthenticatedRequest, res) => {
      const { date, reason } = (req.body || {}) as { date?: string; reason?: string };
      if (!date || !isValidISODate(date) || !String(reason || '').trim()) {
        res.status(400).json({ ok: false, error: 'Indique fecha válida (YYYY-MM-DD) y motivo.' });
        return;
      }

      const id = `nsd_${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO non_school_days (id, date, reason, source, created_at)
         VALUES (?, ?, ?, 'manual', ?)
         ON CONFLICT(date) DO UPDATE SET reason = excluded.reason, source = 'manual'`
      ).run(id, date, String(reason).trim(), new Date().toISOString());

      res.status(201).json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  app.delete(
    '/api/schedules/non-school-days/:id',
    requireAuth,
    requireRoles(['admin']),
    (req, res) => {
      db.prepare(`DELETE FROM non_school_days WHERE id = ?`).run(String(req.params.id || ''));
      res.json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  app.put(
    '/api/schedules/weekend-rule',
    requireAuth,
    requireRoles(['admin']),
    (req, res) => {
      const { weekendIsNonSchoolDay } = (req.body || {}) as { weekendIsNonSchoolDay?: boolean };
      db.prepare(
        `INSERT INTO school_calendar_settings (key, value_json, updated_at)
         VALUES ('weekend_is_non_school_day', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      ).run(JSON.stringify(Boolean(weekendIsNonSchoolDay)), new Date().toISOString());

      res.json({ ok: true, config: getScheduleConfig(db) });
    }
  );

  // =========================================================================
  // Padres / Tutores y Vínculos con Estudiantes
  // =========================================================================
  app.get(
    '/api/guardians',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    (_req, res) => {
      const gRows = db
        .prepare(`SELECT * FROM guardians WHERE is_active = 1 ORDER BY full_name ASC`)
        .all() as {
        id: string;
        full_name: string;
        dni: string;
        phone: string;
        email: string;
        notes: string;
        is_active: number;
        created_at: string;
        updated_at: string;
      }[];

      const linkRows = db
        .prepare(
          `SELECT sg.*, s.full_name AS student_name, s.course, s.division
           FROM student_guardians sg
           JOIN students_registry s ON s.id = sg.student_id`
        )
        .all() as {
        id: string;
        student_id: string;
        guardian_id: string;
        relationship: string;
        is_primary: number;
        authorized_pickup: number;
        student_name: string;
        course: string;
        division: string;
      }[];

      res.json({
        ok: true,
        guardians: gRows.map((g) => ({
          id: g.id,
          fullName: g.full_name,
          dni: g.dni,
          phone: g.phone,
          email: g.email,
          notes: g.notes,
          isActive: g.is_active === 1,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          linkedStudents: linkRows
            .filter((l) => l.guardian_id === g.id)
            .map((l) => ({
              linkId: l.id,
              studentId: l.student_id,
              studentName: l.student_name,
              course: l.course,
              division: l.division,
              relationship: l.relationship,
              isPrimary: l.is_primary === 1,
              authorizedPickup: l.authorized_pickup === 1,
            })),
        })),
      });
    }
  );

  app.post(
    '/api/guardians',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req: AuthenticatedRequest, res) => {
      const { fullName, dni, phone, email, notes } = (req.body || {}) as {
        fullName?: string;
        dni?: string;
        phone?: string;
        email?: string;
        notes?: string;
      };
      if (!String(fullName || '').trim()) {
        res.status(400).json({ ok: false, error: 'El nombre completo del padre o tutor es obligatorio.' });
        return;
      }

      const id = `grd_${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const actor = req.authUser!;

      runInTransaction(db, () => {
        db.prepare(
          `INSERT INTO guardians
            (id, full_name, dni, phone, email, notes, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).run(
          id,
          String(fullName).trim(),
          String(dni || '').trim(),
          String(phone || '').trim(),
          String(email || '').trim(),
          String(notes || '').trim(),
          nowIso,
          nowIso
        );

        recordAuditLog(
          db,
          { id: actor.id, fullName: actor.fullName, role: actor.role },
          'TUTOR_REGISTRADO',
          'guardian',
          id,
          { fullName: String(fullName).trim() }
        );
      });

      res.status(201).json({
        ok: true,
        guardian: {
          id,
          fullName: String(fullName).trim(),
          dni: String(dni || '').trim(),
          phone: String(phone || '').trim(),
          email: String(email || '').trim(),
          notes: String(notes || '').trim(),
          isActive: true,
        },
      });
    }
  );

  app.put(
    '/api/guardians/:id',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req, res) => {
      const id = String(req.params.id || '');
      const { fullName, dni, phone, email, notes } = (req.body || {}) as {
        fullName?: string;
        dni?: string;
        phone?: string;
        email?: string;
        notes?: string;
      };
      if (!String(fullName || '').trim()) {
        res.status(400).json({ ok: false, error: 'El nombre completo es obligatorio.' });
        return;
      }

      db.prepare(
        `UPDATE guardians
         SET full_name = ?, dni = ?, phone = ?, email = ?, notes = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        String(fullName).trim(),
        String(dni || '').trim(),
        String(phone || '').trim(),
        String(email || '').trim(),
        String(notes || '').trim(),
        new Date().toISOString(),
        id
      );
      res.json({ ok: true });
    }
  );

  app.get(
    '/api/students/:studentId/guardians',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente', 'tutor']),
    (req: AuthenticatedRequest, res) => {
      const studentId = String(req.params.studentId || '');
      const user = req.authUser!;
      if (user.role === 'tutor' && !guardianOwnsStudent(db, user.guardianId, studentId)) {
        res.status(403).json({ ok: false, error: 'Acceso denegado a los tutores de este alumno.' });
        return;
      }

    const rows = db
      .prepare(
        `SELECT sg.*, g.full_name, g.dni, g.phone, g.email, g.notes, g.is_active
         FROM student_guardians sg
         JOIN guardians g ON g.id = sg.guardian_id
         WHERE sg.student_id = ? AND g.is_active = 1
         ORDER BY sg.is_primary DESC, g.full_name ASC`
      )
      .all(studentId) as {
      id: string;
      student_id: string;
      guardian_id: string;
      relationship: string;
      is_primary: number;
      authorized_pickup: number;
      full_name: string;
      dni: string;
      phone: string;
      email: string;
      notes: string;
      is_active: number;
    }[];

    const links: StudentGuardianLink[] = rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      guardianId: r.guardian_id,
      relationship: r.relationship,
      isPrimary: r.is_primary === 1,
      authorizedPickup: r.authorized_pickup === 1,
      guardian: {
        id: r.guardian_id,
        fullName: r.full_name,
        dni: r.dni,
        phone: r.phone,
        email: r.email,
        notes: r.notes,
        isActive: r.is_active === 1,
      },
    }));

    res.json({ ok: true, links });
  });

  app.post(
    '/api/students/:studentId/guardians',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req: AuthenticatedRequest, res) => {
      const studentId = String(req.params.studentId || '');
      const {
        guardianId,
        relationship,
        isPrimary,
        authorizedPickup,
      } = (req.body || {}) as {
        guardianId?: string;
        relationship?: string;
        isPrimary?: boolean;
        authorizedPickup?: boolean;
      };

      if (!guardianId) {
        res.status(400).json({ ok: false, error: 'Seleccione un padre o tutor válido.' });
        return;
      }

      const stExists = db.prepare(`SELECT id FROM students_registry WHERE id = ?`).get(studentId);
      const grdExists = db.prepare(`SELECT id FROM guardians WHERE id = ?`).get(guardianId);
      if (!stExists || !grdExists) {
        res.status(404).json({ ok: false, error: 'Estudiante o tutor no encontrado en el padrón.' });
        return;
      }

      const id = `sg_${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();

      db.prepare(
        `INSERT INTO student_guardians
          (id, student_id, guardian_id, relationship, is_primary, authorized_pickup, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, guardian_id) DO UPDATE SET
          relationship = excluded.relationship,
          is_primary = excluded.is_primary,
          authorized_pickup = excluded.authorized_pickup`
      ).run(
        id,
        studentId,
        guardianId,
        String(relationship || 'Padre / Madre / Tutor').trim(),
        isPrimary ? 1 : 0,
        authorizedPickup !== false ? 1 : 0,
        nowIso
      );

      res.status(201).json({ ok: true, linkId: id });
    }
  );

  app.put(
    '/api/student-guardians/:linkId',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req, res) => {
      const linkId = String(req.params.linkId || '');
      const {
        relationship,
        isPrimary,
        authorizedPickup,
      } = (req.body || {}) as {
        relationship?: string;
        isPrimary?: boolean;
        authorizedPickup?: boolean;
      };

      db.prepare(
        `UPDATE student_guardians
         SET relationship = COALESCE(?, relationship),
             is_primary = COALESCE(?, is_primary),
             authorized_pickup = COALESCE(?, authorized_pickup)
         WHERE id = ?`
      ).run(
        relationship !== undefined ? String(relationship).trim() : null,
        isPrimary !== undefined ? (isPrimary ? 1 : 0) : null,
        authorizedPickup !== undefined ? (authorizedPickup ? 1 : 0) : null,
        linkId
      );

      res.json({ ok: true });
    }
  );

  app.delete(
    '/api/student-guardians/:linkId',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req, res) => {
      db.prepare(`DELETE FROM student_guardians WHERE id = ?`).run(String(req.params.linkId || ''));
      res.json({ ok: true });
    }
  );

  // =========================================================================
  // Operaciones de Control de Asistencia por QR (INGRESO, SALIDA, AUSENCIAS)
  // =========================================================================
  app.post(
    '/api/attendance-qr/entry',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    async (req: AuthenticatedRequest, res) => {
      const { qrRaw, attendanceDate, recordedTime, shift, observations } = (req.body || {}) as {
        qrRaw?: string;
        attendanceDate?: string;
        recordedTime?: string;
        shift?: ShiftType;
        observations?: string;
      };

      const result = await registerEntryByQR(
        db,
        {
          qrRaw: String(qrRaw || ''),
          attendanceDate: String(attendanceDate || ''),
          recordedTime: String(recordedTime || ''),
          shift,
          observations,
        },
        req.authUser!
      );

      res.status(result.ok ? 201 : 400).json(result);
    }
  );

  app.post(
    '/api/attendance-qr/exit',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    async (req: AuthenticatedRequest, res) => {
      const {
        qrRaw,
        attendanceDate,
        recordedTime,
        exitType,
        withdrawalReason,
        authorizedPersonName,
        authorizedPersonDni,
        guardianLinkId,
        observations,
      } = (req.body || {}) as {
        qrRaw?: string;
        attendanceDate?: string;
        recordedTime?: string;
        exitType?: ExitType;
        withdrawalReason?: string;
        authorizedPersonName?: string;
        authorizedPersonDni?: string;
        guardianLinkId?: string | null;
        observations?: string;
      };

      const result = await registerExitByQR(
        db,
        {
          qrRaw: String(qrRaw || ''),
          attendanceDate: String(attendanceDate || ''),
          recordedTime: String(recordedTime || ''),
          exitType: exitType || 'habitual',
          withdrawalReason: String(withdrawalReason || ''),
          authorizedPersonName: String(authorizedPersonName || ''),
          authorizedPersonDni,
          guardianLinkId,
          observations,
        },
        req.authUser!
      );

      res.status(result.ok ? 201 : 400).json(result);
    }
  );

  app.post(
    '/api/attendance-qr/finalize-absences',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    async (req: AuthenticatedRequest, res) => {
      const { attendanceDate, currentTimeHHMM, shiftFilter } = (req.body || {}) as {
        attendanceDate?: string;
        currentTimeHHMM?: string;
        shiftFilter?: ShiftType;
      };

      const result = await finalizeDailyAbsences(
        db,
        {
          attendanceDate: String(attendanceDate || ''),
          currentTimeHHMM: String(currentTimeHHMM || ''),
          shiftFilter,
        },
        req.authUser!
      );

      res.status(result.ok || result.skippedNonSchoolDay ? 200 : 400).json(result);
    }
  );

  app.patch(
    '/api/attendance-qr/manual-adjust',
    requireAuth,
    requireRoles(['admin', 'preceptor']),
    (req: AuthenticatedRequest, res) => {
      const { studentId, attendanceDate, entryStatus, reason } = (req.body || {}) as {
        studentId?: string;
        attendanceDate?: string;
        entryStatus?: 'presente' | 'tarde' | 'ausente';
        reason?: string;
      };

      if (!studentId || !attendanceDate || !isValidISODate(attendanceDate) || !entryStatus) {
        res.status(400).json({ ok: false, error: 'Datos de corrección inválidos.' });
        return;
      }

      const actor = req.authUser!;
      const nowIso = new Date().toISOString();

      runInTransaction(db, () => {
        const st = db
          .prepare(`SELECT default_shift FROM students_registry WHERE id = ?`)
          .get(studentId) as { default_shift: ShiftType } | undefined;
        if (!st) {
          throw new Error('STUDENT_NOT_FOUND');
        }

        const existing = db
          .prepare(
            `SELECT id, entry_status FROM daily_attendance_summary WHERE student_id = ? AND attendance_date = ?`
          )
          .get(studentId, attendanceDate) as { id: string; entry_status: string | null } | undefined;

        if (existing) {
          db.prepare(
            `UPDATE daily_attendance_summary SET entry_status = ?, updated_at = ? WHERE id = ?`
          ).run(entryStatus, nowIso, existing.id);
        } else {
          db.prepare(
            `INSERT INTO daily_attendance_summary
              (id, student_id, attendance_date, shift, entry_status, absence_finalized, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(
            `day_${crypto.randomUUID()}`,
            studentId,
            attendanceDate,
            st.default_shift,
            entryStatus,
            entryStatus === 'ausente' ? 1 : 0,
            nowIso
          );
        }

        recordAuditLog(
          db,
          { id: actor.id, fullName: actor.fullName, role: actor.role },
          'EDICION_MANUAL_ASISTENCIA',
          'daily_attendance_summary',
          `${studentId}:${attendanceDate}`,
          { previousStatus: existing?.entry_status || null, newStatus: entryStatus, reason: reason || '' }
        );
      });

      res.json({ ok: true, summary: getDailySummaryForStudentDate(db, studentId, attendanceDate) });
    }
  );

  app.get(
    '/api/attendance-qr/daily',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    (req, res) => {
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      const courseFilter = String(req.query.course || '').trim();
      const divisionFilter = String(req.query.division || '').trim().toUpperCase();
      const shiftFilter = String(req.query.shift || '').trim();
      const statusFilter = String(req.query.status || '').trim();

      const rows = db
        .prepare(
          `SELECT s.id AS student_id, s.full_name, s.course, s.division, s.photo, s.default_shift,
                  d.shift, d.entry_status, d.entry_time, d.exit_time, d.exit_type,
                  d.authorized_person_name, d.withdrawal_reason, d.absence_finalized
           FROM students_registry s
           LEFT JOIN daily_attendance_summary d
             ON d.student_id = s.id AND d.attendance_date = ?
           WHERE s.is_active = 1
           ORDER BY s.course ASC, s.division ASC, s.full_name ASC`
        )
        .all(date) as {
        student_id: string;
        full_name: string;
        course: CourseYear;
        division: string;
        photo: string;
        default_shift: ShiftType;
        shift: ShiftType | null;
        entry_status: 'presente' | 'tarde' | 'ausente' | null;
        entry_time: string | null;
        exit_time: string | null;
        exit_type: ExitType | null;
        authorized_person_name: string | null;
        withdrawal_reason: string | null;
        absence_finalized: number | null;
      }[];

      const allSummaries: DailyAttendanceStatusSummary[] = rows
        .filter((r) => {
          if (courseFilter && r.course !== courseFilter) return false;
          if (divisionFilter && (r.division || '').toUpperCase() !== divisionFilter) return false;
          const effShift = r.shift || r.default_shift;
          if (shiftFilter && effShift !== shiftFilter) return false;
          if (statusFilter) {
            if (statusFilter === 'en_establecimiento') {
              return Boolean(r.entry_time && !r.exit_time && r.entry_status !== 'ausente');
            }
            if (statusFilter === 'salida_registrada') {
              return Boolean(r.exit_time);
            }
            if (r.entry_status !== statusFilter) return false;
          }
          return true;
        })
        .map((r) => ({
          studentId: r.student_id,
          studentName: r.full_name,
          course: r.course,
          division: r.division,
          photo: r.photo || undefined,
          attendanceDate: date,
          shift: r.shift || r.default_shift,
          entryStatus: r.entry_status,
          entryTime: r.entry_time,
          exitTime: r.exit_time,
          exitType: r.exit_type,
          authorizedPersonName: r.authorized_person_name,
          withdrawalReason: r.withdrawal_reason,
          inPremises: Boolean(r.entry_time && !r.exit_time && r.entry_status !== 'ausente'),
          absenceFinalized: r.absence_finalized === 1,
        }));

      const kpis = {
        totalActive: allSummaries.length,
        ingresaron: allSummaries.filter((s) => s.entryStatus === 'presente' || s.entryStatus === 'tarde').length,
        presentes: allSummaries.filter((s) => s.entryStatus === 'presente').length,
        tardes: allSummaries.filter((s) => s.entryStatus === 'tarde').length,
        ausentes: allSummaries.filter((s) => s.entryStatus === 'ausente').length,
        enEstablecimiento: allSummaries.filter((s) => s.inPremises).length,
        salidasRegistradas: allSummaries.filter((s) => Boolean(s.exitTime)).length,
      };

      const movRows = db
        .prepare(
          `SELECT m.*, s.full_name AS student_name
           FROM attendance_movements m
           JOIN students_registry s ON s.id = m.student_id
           WHERE m.attendance_date = ?
           ORDER BY m.created_at DESC
           LIMIT 250`
        )
        .all(date) as Record<string, unknown>[];

      const movements = movRows.map((r) => ({
        id: String(r.id),
        eventUniqueKey: String(r.event_unique_key),
        studentId: String(r.student_id),
        studentName: String(r.student_name),
        course: String(r.course) as CourseYear,
        division: String(r.division),
        attendanceDate: String(r.attendance_date),
        movementKind: String(r.movement_kind) as 'ingreso' | 'salida',
        attendanceStatus: r.attendance_status
          ? (String(r.attendance_status) as 'presente' | 'tarde' | 'ausente')
          : undefined,
        exitType: r.exit_type ? (String(r.exit_type) as ExitType) : undefined,
        recordedTime: String(r.recorded_time),
        shift: String(r.shift) as ShiftType,
        operatorUserId: String(r.operator_user_id),
        operatorName: String(r.operator_name),
        withdrawalReason: r.withdrawal_reason ? String(r.withdrawal_reason) : undefined,
        authorizedPersonName: r.authorized_person_name ? String(r.authorized_person_name) : undefined,
        authorizedPersonDni: r.authorized_person_dni ? String(r.authorized_person_dni) : undefined,
        guardianLinkId: r.guardian_link_id ? String(r.guardian_link_id) : null,
        observations: r.observations ? String(r.observations) : undefined,
        cardNumber: r.card_number ? String(r.card_number) : undefined,
        createdAt: String(r.created_at),
      }));

      res.json({ ok: true, date, kpis, summaries: allSummaries, movements });
    }
  );

  app.get(
    '/api/attendance-qr/movements-report',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente']),
    (req, res) => {
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const course = String(req.query.course || '').trim();
      const division = String(req.query.division || '').trim().toUpperCase();
      const shift = String(req.query.shift || '').trim();
      const studentId = String(req.query.studentId || '').trim();
      const status = String(req.query.status || '').trim();

      const whereClauses: string[] = ['1=1'];
      const params: (string | number)[] = [];

      if (from) {
        whereClauses.push('m.attendance_date >= ?');
        params.push(from);
      }
      if (to) {
        whereClauses.push('m.attendance_date <= ?');
        params.push(to);
      }
      if (course) {
        whereClauses.push('m.course = ?');
        params.push(course);
      }
      if (division) {
        whereClauses.push('UPPER(m.division) = ?');
        params.push(division);
      }
      if (shift) {
        whereClauses.push('m.shift = ?');
        params.push(shift);
      }
      if (studentId) {
        whereClauses.push('m.student_id = ?');
        params.push(studentId);
      }
      if (status) {
        if (status === 'retiro_anticipado' || status === 'habitual' || status === 'retiro_excepcional') {
          whereClauses.push('m.exit_type = ?');
          params.push(status);
        } else {
          whereClauses.push('m.attendance_status = ?');
          params.push(status);
        }
      }

      const rows = db
        .prepare(
          `SELECT m.*, s.full_name AS student_name
           FROM attendance_movements m
           JOIN students_registry s ON s.id = m.student_id
           WHERE ${whereClauses.join(' AND ')}
           ORDER BY m.attendance_date DESC, m.recorded_time DESC
           LIMIT 500`
        )
        .all(...params) as Record<string, unknown>[];

      res.json({
        ok: true,
        movements: rows.map((r) => ({
          id: String(r.id),
          eventUniqueKey: String(r.event_unique_key),
          studentId: String(r.student_id),
          studentName: String(r.student_name),
          course: String(r.course) as CourseYear,
          division: String(r.division),
          attendanceDate: String(r.attendance_date),
          movementKind: String(r.movement_kind) as 'ingreso' | 'salida',
          attendanceStatus: r.attendance_status
            ? (String(r.attendance_status) as 'presente' | 'tarde' | 'ausente')
            : undefined,
          exitType: r.exit_type ? (String(r.exit_type) as ExitType) : undefined,
          recordedTime: String(r.recorded_time),
          shift: String(r.shift) as ShiftType,
          operatorUserId: String(r.operator_user_id),
          operatorName: String(r.operator_name),
          withdrawalReason: r.withdrawal_reason ? String(r.withdrawal_reason) : undefined,
          authorizedPersonName: r.authorized_person_name ? String(r.authorized_person_name) : undefined,
          authorizedPersonDni: r.authorized_person_dni ? String(r.authorized_person_dni) : undefined,
          guardianLinkId: r.guardian_link_id ? String(r.guardian_link_id) : null,
          observations: r.observations ? String(r.observations) : undefined,
          cardNumber: r.card_number ? String(r.card_number) : undefined,
          createdAt: String(r.created_at),
        })),
      });
    }
  );

  app.get(
    '/api/students/:studentId/attendance-summary',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'docente', 'tutor']),
    (req: AuthenticatedRequest, res) => {
      const studentId = String(req.params.studentId || '');
      const user = req.authUser!;
      if (user.role === 'tutor' && !guardianOwnsStudent(db, user.guardianId, studentId)) {
        res.status(403).json({
          ok: false,
          error: 'No está autorizado a consultar los movimientos de este estudiante.',
        });
        return;
      }

    const movRows = db
      .prepare(
        `SELECT m.*, s.full_name AS student_name
         FROM attendance_movements m
         JOIN students_registry s ON s.id = m.student_id
         WHERE m.student_id = ?
         ORDER BY m.attendance_date DESC, m.recorded_time DESC
         LIMIT 200`
      )
      .all(studentId) as Record<string, unknown>[];

    const summaries = db
      .prepare(
        `SELECT * FROM daily_attendance_summary WHERE student_id = ? ORDER BY attendance_date DESC LIMIT 200`
      )
      .all(studentId) as Record<string, unknown>[];

    res.json({
      ok: true,
      movements: movRows.map((r) => ({
        id: String(r.id),
        eventUniqueKey: String(r.event_unique_key),
        studentId: String(r.student_id),
        studentName: String(r.student_name),
        course: String(r.course) as CourseYear,
        division: String(r.division),
        attendanceDate: String(r.attendance_date),
        movementKind: String(r.movement_kind) as 'ingreso' | 'salida',
        attendanceStatus: r.attendance_status
          ? (String(r.attendance_status) as 'presente' | 'tarde' | 'ausente')
          : undefined,
        exitType: r.exit_type ? (String(r.exit_type) as ExitType) : undefined,
        recordedTime: String(r.recorded_time),
        shift: String(r.shift) as ShiftType,
        operatorUserId: String(r.operator_user_id),
        operatorName: String(r.operator_name),
        withdrawalReason: r.withdrawal_reason ? String(r.withdrawal_reason) : undefined,
        authorizedPersonName: r.authorized_person_name ? String(r.authorized_person_name) : undefined,
        observations: r.observations ? String(r.observations) : undefined,
        createdAt: String(r.created_at),
      })),
      dailySummaries: summaries,
    });
  });

  // =========================================================================
  // Portal de Padres y Tutores ("Asistencia de mis hijos") — Aislamiento estricto
  // =========================================================================
  app.get(
    '/api/guardian-portal/children',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'tutor']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const todayISO = String(req.query.date || new Date().toISOString().slice(0, 10));
      const requestedGuardianId = String(req.query.guardianId || '').trim();

      let effectiveGuardianId: string | null | undefined = user.guardianId;

      if (user.role === 'tutor') {
        if (requestedGuardianId && requestedGuardianId !== user.guardianId) {
          res.status(403).json({
            ok: false,
            error: 'No tiene permisos para consultar los hijos de otro tutor.',
          });
          return;
        }
        if (!effectiveGuardianId) {
          res.status(403).json({ ok: false, error: 'Cuenta de tutor sin vínculo familiar activo.' });
          return;
        }
      } else if (user.role === 'admin' || user.role === 'preceptor') {
        effectiveGuardianId = requestedGuardianId || user.guardianId;
        if (!effectiveGuardianId) {
          res.json({ ok: true, children: [] });
          return;
        }
      } else {
        res.status(403).json({ ok: false, error: 'Rol sin acceso al Portal de Tutores.' });
        return;
      }

      const linkedStudentRows = db
        .prepare(`SELECT student_id FROM student_guardians WHERE guardian_id = ?`)
        .all(effectiveGuardianId) as { student_id: string }[];

      const children: GuardianChildSnapshot[] = [];
      for (const row of linkedStudentRows) {
        const snap = buildGuardianChildSnapshot(db, effectiveGuardianId, row.student_id, todayISO);
        if (snap) children.push(snap);
      }

      res.json({ ok: true, guardianId: effectiveGuardianId, children });
    }
  );

  app.get(
    '/api/guardian-portal/children/:studentId',
    requireAuth,
    requireRoles(['admin', 'preceptor', 'tutor']),
    (req: AuthenticatedRequest, res) => {
      const user = req.authUser!;
      const studentId = String(req.params.studentId || '');
      const todayISO = String(req.query.date || new Date().toISOString().slice(0, 10));
      const requestedGuardianId = String(req.query.guardianId || '').trim();

      let targetGuardianId = user.guardianId;
      if (user.role !== 'tutor' && (user.role === 'admin' || user.role === 'preceptor')) {
        if (requestedGuardianId) targetGuardianId = requestedGuardianId;
      }

      if (user.role === 'tutor' && !guardianOwnsStudent(db, user.guardianId, studentId)) {
        res.status(403).json({
          ok: false,
          error: 'Acceso denegado: este estudiante no está vinculado a su cuenta de padre o tutor.',
        });
        return;
      }

      if (!targetGuardianId) {
        res.status(403).json({ ok: false, error: 'No se especificó un tutor autorizado.' });
        return;
      }

      const snapshot = buildGuardianChildSnapshot(db, targetGuardianId, studentId, todayISO);
      if (!snapshot) {
        res.status(403).json({
          ok: false,
          error: 'El estudiante solicitado no pertenece al grupo familiar del tutor.',
        });
        return;
      }

      res.json({ ok: true, child: snapshot });
    }
  );

  // =========================================================================
  // Auditoría (exclusivo Administrador)
  // =========================================================================
  app.get('/api/audit-logs', requireAuth, requireRoles(['admin']), (_req, res) => {
    const rows = db
      .prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`)
      .all() as {
      id: string;
      actor_user_id: string;
      actor_name: string;
      actor_role: UserRole;
      action: string;
      entity_type: string;
      entity_id: string;
      details_json: string;
      created_at: string;
    }[];

    const logs: AuditLogRecord[] = rows.map((r) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(r.details_json) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return {
        id: r.id,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        details: parsed,
        createdAt: r.created_at,
      };
    });

    res.json({ ok: true, logs });
  });

  return app;
}
