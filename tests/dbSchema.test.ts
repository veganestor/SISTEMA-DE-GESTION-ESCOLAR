import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMigrations,
  createIsolatedTestDatabase,
  getAppliedMigrations,
  runInTransaction,
} from '../server/db';

test('server/db crea el esquema SQL completo, índices y migraciones idempotentes', () => {
  const db = createIsolatedTestDatabase();
  try {
    // Re-ejecutar migraciones debe ser completamente idempotente
    applyMigrations(db);

    const tables = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`)
        .all() as { name: string }[]
    ).map((r) => r.name);

    const requiredTables = [
      'schema_migrations',
      'app_users',
      'guardians',
      'student_guardians',
      'students_registry',
      'issued_cards_registry',
      'daily_attendance_summary',
      'attendance_movements',
      'audit_logs',
      'shift_schedules',
      'course_schedule_overrides',
      'non_school_days',
      'school_calendar_settings',
    ];

    for (const table of requiredTables) {
      assert.ok(tables.includes(table), `Falta la tabla requerida: ${table}`);
    }

    const applied = getAppliedMigrations(db).map((m) => m.version);
    assert.deepEqual(applied, [
      '001_qr_attendance_and_guardian_comms',
      '002_revert_guardian_communications',
      '003_core_query_indexes',
    ]);

    const indexes = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`)
        .all() as { name: string }[]
    ).map((r) => r.name);

    assert.ok(indexes.includes('idx_app_users_role_active'));
    assert.ok(indexes.includes('idx_students_course_active'));
    assert.ok(indexes.includes('idx_daily_att_date'));
    assert.ok(indexes.includes('idx_movements_student_date'));
    assert.ok(indexes.includes('idx_movements_kind_date'));
    assert.ok(indexes.includes('idx_audit_created'));
    assert.ok(indexes.includes('idx_audit_entity'));
  } finally {
    db.close();
  }
});

test('server/db aplica restricciones relacionales y rollback transaccional correctamente', () => {
  const db = createIsolatedTestDatabase();
  try {
    const now = new Date().toISOString();

    runInTransaction(db, () => {
      db.prepare(
        `INSERT INTO app_users (id, username, email, full_name, role, password_hash, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run('usr_1', 'preceptor1', 'p@escuela.edu.ar', 'Preceptor Uno', 'preceptor', 'salt:hash', now, now);

      db.prepare(
        `INSERT INTO students_registry (id, full_name, dni, course, division, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run('stu_1', 'Pérez Juan', '45111222', '3', 'A', now);

      db.prepare(
        `INSERT INTO daily_attendance_summary
          (id, student_id, attendance_date, shift, entry_status, entry_time, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('att_1', 'stu_1', '2026-11-24', 'manana', 'presente', '07:28', now);

      db.prepare(
        `INSERT INTO attendance_movements
          (id, event_unique_key, student_id, attendance_date, movement_kind, attendance_status, recorded_time, shift, course, division, operator_user_id, operator_name, created_at)
         VALUES (?, ?, ?, ?, 'ingreso', 'presente', '07:28', 'manana', '3', 'A', 'usr_1', 'Preceptor Uno', ?)`
      ).run('mov_1', 'stu_1:2026-11-24:ingreso', 'stu_1', '2026-11-24', now);

      db.prepare(
        `INSERT INTO audit_logs
          (id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run('aud_1', 'usr_1', 'Preceptor Uno', 'preceptor', 'QR_ENTRY', 'attendance_movement', 'mov_1', '{}', now);
    });

    // Verifica que un error dentro de runInTransaction revierte la escritura
    assert.throws(() => {
      runInTransaction(db, () => {
        db.prepare(
          `INSERT INTO students_registry (id, full_name, dni, course, division, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run('stu_rollback', 'No Debe Persistir', '99999999', '1', 'A', now);
        throw new Error('Fallo simulado para rollback');
      });
    }, /Fallo simulado/);

    const rolledBack = db
      .prepare(`SELECT id FROM students_registry WHERE id = 'stu_rollback'`)
      .get();
    assert.equal(rolledBack, undefined);

    // Verifica que las restricciones CHECK rechazan roles inválidos
    assert.throws(() => {
      db.prepare(
        `INSERT INTO app_users (id, username, email, full_name, role, password_hash, is_active, created_at, updated_at)
         VALUES ('usr_bad', 'bad', '', 'Bad', 'super_invalid', 's:h', 1, ?, ?)`
      ).run(now, now);
    });
  } finally {
    db.close();
  }
});
