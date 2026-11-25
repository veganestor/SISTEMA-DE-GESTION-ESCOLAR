import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CourseYear, QRPayloadV1 } from '../types';
import type {
  AttendanceEntryStatus,
  AttendanceMovementRecord,
  AuthUserSession,
  DailyAttendanceStatusSummary,
  ExitType,
  QRScanBackendResponse,
  ShiftType,
} from '../shared/attendanceDomain';
import { runInTransaction } from './db';
import { recordAuditLog } from './auth';
import {
  classifyEntryStatus,
  evaluateSchoolDay,
  isValidHHMM,
  isValidISODate,
  resolveEffectiveSchedule,
  timeToMinutes,
} from './scheduleEngine';

export function parseQRPayloadStrict(rawQr: string): {
  valid: boolean;
  payload?: QRPayloadV1;
  error?: string;
} {
  const trimmed = (rawQr || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'El código QR está vacío o no pudo leerse.' };
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<QRPayloadV1>;
    if (!parsed || parsed.v !== '1.0' || !parsed.uid || !parsed.cardNo || !parsed.type) {
      return {
        valid: false,
        error: 'El código QR escaneado no corresponde al formato oficial de credencial escolar.',
      };
    }
    if (parsed.type !== 'student') {
      return {
        valid: false,
        error: 'La credencial escaneada no pertenece a un estudiante activo.',
      };
    }
    return { valid: true, payload: parsed as QRPayloadV1 };
  } catch {
    return {
      valid: false,
      error: 'Código QR inválido: contenido corrupto o formato desconocido.',
    };
  }
}

interface StudentRow {
  id: string;
  full_name: string;
  dni: string;
  course: CourseYear;
  division: string;
  enrollment_status: string;
  photo: string;
  default_shift: ShiftType;
  is_active: number;
}

function resolveStudentAndCard(
  db: DatabaseSync,
  rawQr: string,
  attendanceDate: string
):
  | {
      ok: true;
      student: StudentRow;
      cardNumber: string;
    }
  | {
      ok: false;
      code: QRScanBackendResponse['code'];
      message: string;
    } {
  const parsed = parseQRPayloadStrict(rawQr);
  if (!parsed.valid || !parsed.payload) {
    return {
      ok: false,
      code: 'INVALID_QR',
      message: parsed.error || 'Código QR inválido.',
    };
  }

  const payload = parsed.payload;

  const cardRow = db
    .prepare(
      `SELECT card_number, person_id, person_type, status, valid_until, revoke_reason
       FROM issued_cards_registry
       WHERE card_number = ?`
    )
    .get(payload.cardNo) as
    | {
        card_number: string;
        person_id: string;
        person_type: string;
        status: string;
        valid_until: string;
        revoke_reason: string;
      }
    | undefined;

  if (cardRow) {
    if (cardRow.person_id !== payload.uid || cardRow.person_type !== 'student') {
      return {
        ok: false,
        code: 'INVALID_QR',
        message: 'La credencial QR no coincide con el titular registrado en la institución.',
      };
    }
    if (cardRow.status === 'anulado' || cardRow.status === 'reemplazado') {
      return {
        ok: false,
        code: 'CARD_REVOKED',
        message:
          cardRow.status === 'anulado'
            ? `Carnet ${cardRow.card_number} anulado${
                cardRow.revoke_reason ? ` (${cardRow.revoke_reason})` : ''
              }. Acceso denegado.`
            : `Carnet ${cardRow.card_number} reemplazado por una emisión más reciente.`,
      };
    }
    if (cardRow.valid_until && cardRow.valid_until < attendanceDate) {
      return {
        ok: false,
        code: 'CARD_REVOKED',
        message: `La credencial ${cardRow.card_number} venció el ${cardRow.valid_until}.`,
      };
    }
  } else if (payload.validUntil && payload.validUntil < attendanceDate) {
    return {
      ok: false,
      code: 'CARD_REVOKED',
      message: `La credencial ${payload.cardNo} venció el ${payload.validUntil}.`,
    };
  }

  const studentRow = db
    .prepare(
      `SELECT id, full_name, dni, course, division, enrollment_status, photo, default_shift, is_active
       FROM students_registry
       WHERE id = ?`
    )
    .get(payload.uid) as unknown as StudentRow | undefined;

  if (!studentRow || studentRow.is_active !== 1) {
    return {
      ok: false,
      code: 'STUDENT_NOT_FOUND',
      message: 'El alumno del código QR no se encuentra registrado o activo en la matrícula escolar.',
    };
  }

  return {
    ok: true,
    student: studentRow,
    cardNumber: payload.cardNo,
  };
}

export function getDailySummaryForStudentDate(
  db: DatabaseSync,
  studentId: string,
  attendanceDate: string
): DailyAttendanceStatusSummary | null {
  const row = db
    .prepare(
      `SELECT d.*, s.full_name, s.course, s.division, s.photo
       FROM daily_attendance_summary d
       JOIN students_registry s ON s.id = d.student_id
       WHERE d.student_id = ? AND d.attendance_date = ?`
    )
    .get(studentId, attendanceDate) as
    | {
        student_id: string;
        full_name: string;
        course: CourseYear;
        division: string;
        photo: string;
        attendance_date: string;
        shift: ShiftType;
        entry_status: AttendanceEntryStatus | null;
        entry_time: string | null;
        exit_time: string | null;
        exit_type: ExitType | null;
        authorized_person_name: string | null;
        withdrawal_reason: string | null;
        absence_finalized: number;
      }
    | undefined;

  if (!row) return null;

  return {
    studentId: row.student_id,
    studentName: row.full_name,
    course: row.course,
    division: row.division,
    photo: row.photo || undefined,
    attendanceDate: row.attendance_date,
    shift: row.shift,
    entryStatus: row.entry_status,
    entryTime: row.entry_time,
    exitTime: row.exit_time,
    exitType: row.exit_type,
    authorizedPersonName: row.authorized_person_name,
    withdrawalReason: row.withdrawal_reason,
    inPremises: Boolean(row.entry_time && !row.exit_time && row.entry_status !== 'ausente'),
    absenceFinalized: row.absence_finalized === 1,
  };
}

function mapMovementRow(r: Record<string, unknown>): AttendanceMovementRecord {
  return {
    id: String(r.id),
    eventUniqueKey: String(r.event_unique_key),
    studentId: String(r.student_id),
    studentName: r.student_name ? String(r.student_name) : undefined,
    course: r.course ? (String(r.course) as CourseYear) : undefined,
    division: r.division ? String(r.division) : undefined,
    attendanceDate: String(r.attendance_date),
    movementKind: String(r.movement_kind) as AttendanceMovementRecord['movementKind'],
    attendanceStatus: r.attendance_status
      ? (String(r.attendance_status) as AttendanceEntryStatus)
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
  };
}

export interface RegisterEntryInput {
  qrRaw: string;
  attendanceDate: string;
  recordedTime: string;
  shift?: ShiftType;
  observations?: string;
}

export async function registerEntryByQR(
  db: DatabaseSync,
  input: RegisterEntryInput,
  operator: AuthUserSession
): Promise<QRScanBackendResponse> {
  if (!isValidISODate(input.attendanceDate) || !isValidHHMM(input.recordedTime)) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Fecha u hora de ingreso inválida (use formato YYYY-MM-DD y HH:MM).',
    };
  }

  const resolved = resolveStudentAndCard(db, input.qrRaw, input.attendanceDate);
  if (resolved.ok === false) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
    };
  }

  const { student, cardNumber } = resolved;
  const shift: ShiftType = input.shift || student.default_shift || 'manana';
  const schedule = resolveEffectiveSchedule(db, student.course, student.division, shift);
  const entryStatus = classifyEntryStatus(input.recordedTime, schedule);
  const eventUniqueKey = `ingreso:${student.id}:${input.attendanceDate}`;
  const movementId = `mov_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();

  let duplicateDetected = false;
  let existingSummary: DailyAttendanceStatusSummary | null = null;

  try {
    runInTransaction(db, () => {
      const existing = db
        .prepare(
          `SELECT id, entry_time, entry_status
           FROM daily_attendance_summary
           WHERE student_id = ? AND attendance_date = ?`
        )
        .get(student.id, input.attendanceDate) as
        | { id: string; entry_time: string | null; entry_status: AttendanceEntryStatus | null }
        | undefined;

      if (existing && (existing.entry_time || existing.entry_status === 'presente' || existing.entry_status === 'tarde')) {
        duplicateDetected = true;
        return;
      }

      db.prepare(
        `INSERT INTO attendance_movements
          (id, event_unique_key, student_id, attendance_date, movement_kind, attendance_status, recorded_time, shift, course, division, operator_user_id, operator_name, observations, card_number, created_at)
         VALUES (?, ?, ?, ?, 'ingreso', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        movementId,
        eventUniqueKey,
        student.id,
        input.attendanceDate,
        entryStatus,
        input.recordedTime,
        shift,
        student.course,
        student.division || '',
        operator.id,
        operator.fullName,
        (input.observations || '').trim(),
        cardNumber,
        nowIso
      );

      if (existing) {
        db.prepare(
          `UPDATE daily_attendance_summary
           SET shift = ?, entry_status = ?, entry_time = ?, entry_movement_id = ?, absence_finalized = 0, updated_at = ?
           WHERE id = ?`
        ).run(shift, entryStatus, input.recordedTime, movementId, nowIso, existing.id);
      } else {
        db.prepare(
          `INSERT INTO daily_attendance_summary
            (id, student_id, attendance_date, shift, entry_status, entry_time, entry_movement_id, absence_finalized, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
        ).run(
          `day_${crypto.randomUUID()}`,
          student.id,
          input.attendanceDate,
          shift,
          entryStatus,
          input.recordedTime,
          movementId,
          nowIso
        );
      }

      recordAuditLog(
        db,
        { id: operator.id, fullName: operator.fullName, role: operator.role },
        'QR_INGRESO_REGISTRADO',
        'attendance_movement',
        movementId,
        {
          studentId: student.id,
          studentName: student.full_name,
          attendanceDate: input.attendanceDate,
          recordedTime: input.recordedTime,
          shift,
          entryStatus,
          cardNumber,
        }
      );
    });
  } catch (err) {
    // Handle UNIQUE constraint race cleanly
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      duplicateDetected = true;
    } else {
      throw err;
    }
  }

  existingSummary = getDailySummaryForStudentDate(db, student.id, input.attendanceDate);

  if (duplicateDetected) {
    return {
      ok: false,
      code: 'DUPLICATE_ENTRY_BLOCKED',
      message: `${student.full_name} ya registró su INGRESO hoy a las ${
        existingSummary?.entryTime || '--:--'
      } hs (${existingSummary?.entryStatus === 'tarde' ? 'TARDE' : 'PRESENTE'}). Si desea registrar su retiro, cambie explícitamente a "Registrar salida".`,
      student: {
        id: student.id,
        fullName: student.full_name,
        dni: student.dni,
        course: student.course,
        division: student.division,
        photo: student.photo || undefined,
      },
      dailySummary: existingSummary || undefined,
    };
  }

  const movRow = db
    .prepare(
      `SELECT m.*, s.full_name AS student_name
       FROM attendance_movements m
       JOIN students_registry s ON s.id = m.student_id
       WHERE m.id = ?`
    )
    .get(movementId) as Record<string, unknown>;

  return {
    ok: true,
    code: 'ENTRY_REGISTERED',
    message:
      entryStatus === 'presente'
        ? `Ingreso PRESENTE registrado para ${student.full_name} a las ${input.recordedTime} hs (${schedule.label}).`
        : `Ingreso registrado como TARDE para ${student.full_name} a las ${input.recordedTime} hs (límite ${schedule.punctualityCutoffTime} + ${schedule.toleranceMinutes} min).`,
    student: {
      id: student.id,
      fullName: student.full_name,
      dni: student.dni,
      course: student.course,
      division: student.division,
      photo: student.photo || undefined,
    },
    movement: mapMovementRow(movRow),
    dailySummary: existingSummary || undefined,
  };
}

export interface RegisterExitInput {
  qrRaw: string;
  attendanceDate: string;
  recordedTime: string;
  exitType: ExitType;
  withdrawalReason: string;
  authorizedPersonName: string;
  authorizedPersonDni?: string;
  guardianLinkId?: string | null;
  observations?: string;
}

export async function registerExitByQR(
  db: DatabaseSync,
  input: RegisterExitInput,
  operator: AuthUserSession
): Promise<QRScanBackendResponse> {
  if (!isValidISODate(input.attendanceDate) || !isValidHHMM(input.recordedTime)) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Fecha u hora de salida inválida (use formato YYYY-MM-DD y HH:MM).',
    };
  }

  const resolved = resolveStudentAndCard(db, input.qrRaw, input.attendanceDate);
  if (resolved.ok === false) {
    return {
      ok: false,
      code: resolved.code,
      message: resolved.message,
    };
  }

  const { student, cardNumber } = resolved;
  const studentPublic = {
    id: student.id,
    fullName: student.full_name,
    dni: student.dni,
    course: student.course,
    division: student.division,
    photo: student.photo || undefined,
  };

  const summary = getDailySummaryForStudentDate(db, student.id, input.attendanceDate);
  if (!summary || !summary.entryTime || summary.entryStatus === 'ausente') {
    return {
      ok: false,
      code: 'EXIT_WITHOUT_ENTRY_BLOCKED',
      message: `No se puede registrar SALIDA para ${student.full_name} el ${input.attendanceDate}: el alumno no tiene un ingreso previo registrado en la jornada.`,
      student: studentPublic,
      dailySummary: summary || undefined,
    };
  }

  if (summary.exitTime) {
    return {
      ok: false,
      code: 'DUPLICATE_EXIT_BLOCKED',
      message: `${student.full_name} ya registró su salida a las ${summary.exitTime} hs (${summary.exitType}).`,
      student: studentPublic,
      dailySummary: summary,
    };
  }

  let effectiveAuthorizedName = (input.authorizedPersonName || '').trim();
  let effectiveAuthorizedDni = (input.authorizedPersonDni || '').trim();
  const reasonClean = (input.withdrawalReason || '').trim();

  if (input.exitType === 'retiro_anticipado' || input.exitType === 'retiro_excepcional') {
    if (!reasonClean) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Debe indicar el motivo del retiro para retiros anticipados o excepcionales.',
        student: studentPublic,
        dailySummary: summary,
      };
    }

    if (input.guardianLinkId) {
      const linkRow = db
        .prepare(
          `SELECT sg.id, sg.authorized_pickup, g.full_name, g.dni
           FROM student_guardians sg
           JOIN guardians g ON g.id = sg.guardian_id
           WHERE sg.id = ? AND sg.student_id = ? AND g.is_active = 1`
        )
        .get(input.guardianLinkId, student.id) as
        | { id: string; authorized_pickup: number; full_name: string; dni: string }
        | undefined;

      if (!linkRow) {
        return {
          ok: false,
          code: 'UNAUTHORIZED_PICKUP',
          message: 'El vínculo de tutor seleccionado no pertenece al estudiante.',
          student: studentPublic,
          dailySummary: summary,
        };
      }
      if (linkRow.authorized_pickup !== 1) {
        return {
          ok: false,
          code: 'UNAUTHORIZED_PICKUP',
          message: `${linkRow.full_name} no se encuentra autorizado/a para retirar al alumno según su ficha institucional.`,
          student: studentPublic,
          dailySummary: summary,
        };
      }
      effectiveAuthorizedName = linkRow.full_name;
      effectiveAuthorizedDni = effectiveAuthorizedDni || linkRow.dni;
    } else if (!effectiveAuthorizedName) {
      return {
        ok: false,
        code: 'UNAUTHORIZED_PICKUP',
        message:
          'Protocolo de retiro anticipado: debe seleccionar o consignar el nombre de la persona autorizada que retira al alumno.',
        student: studentPublic,
        dailySummary: summary,
      };
    } else if (input.exitType === 'retiro_anticipado') {
      // Check against registered authorized guardians if the student has linked guardians
      const linkedGuardians = db
        .prepare(
          `SELECT sg.authorized_pickup, g.full_name, g.dni
           FROM student_guardians sg
           JOIN guardians g ON g.id = sg.guardian_id
           WHERE sg.student_id = ? AND g.is_active = 1`
        )
        .all(student.id) as { authorized_pickup: number; full_name: string; dni: string }[];

      if (linkedGuardians.length > 0) {
        const matched = linkedGuardians.find(
          (g) =>
            g.full_name.trim().toLowerCase() === effectiveAuthorizedName.toLowerCase() ||
            (effectiveAuthorizedDni && g.dni && g.dni.trim() === effectiveAuthorizedDni)
        );
        if (matched && matched.authorized_pickup !== 1) {
          return {
            ok: false,
            code: 'UNAUTHORIZED_PICKUP',
            message: `Retiro rechazado: ${matched.full_name} figura como tutor SIN autorización de retiro.`,
            student: studentPublic,
            dailySummary: summary,
          };
        }
        if (!matched && !effectiveAuthorizedDni) {
          return {
            ok: false,
            code: 'UNAUTHORIZED_PICKUP',
            message:
              'La persona ingresada no figura en la nómina de tutores autorizados del alumno. Seleccione un tutor autorizado o registre un retiro excepcional con DNI y justificación.',
            student: studentPublic,
            dailySummary: summary,
          };
        }
      }
    }
  } else if (!effectiveAuthorizedName) {
    effectiveAuthorizedName = 'Salida regular autorizada por establecimiento';
  }

  const eventUniqueKey = `salida:${student.id}:${input.attendanceDate}`;
  const movementId = `mov_${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();

  runInTransaction(db, () => {
    db.prepare(
      `INSERT INTO attendance_movements
        (id, event_unique_key, student_id, attendance_date, movement_kind, exit_type, recorded_time, shift, course, division, operator_user_id, operator_name, withdrawal_reason, authorized_person_name, authorized_person_dni, guardian_link_id, observations, card_number, created_at)
       VALUES (?, ?, ?, ?, 'salida', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      movementId,
      eventUniqueKey,
      student.id,
      input.attendanceDate,
      input.exitType,
      input.recordedTime,
      summary.shift,
      student.course,
      student.division || '',
      operator.id,
      operator.fullName,
      reasonClean || 'Salida habitual de jornada',
      effectiveAuthorizedName,
      effectiveAuthorizedDni,
      input.guardianLinkId || null,
      (input.observations || '').trim(),
      cardNumber,
      nowIso
    );

    db.prepare(
      `UPDATE daily_attendance_summary
       SET exit_time = ?, exit_type = ?, exit_movement_id = ?, authorized_person_name = ?, withdrawal_reason = ?, updated_at = ?
       WHERE student_id = ? AND attendance_date = ?`
    ).run(
      input.recordedTime,
      input.exitType,
      movementId,
      effectiveAuthorizedName,
      reasonClean || 'Salida habitual de jornada',
      nowIso,
      student.id,
      input.attendanceDate
    );

    recordAuditLog(
      db,
      { id: operator.id, fullName: operator.fullName, role: operator.role },
      'QR_SALIDA_REGISTRADA',
      'attendance_movement',
      movementId,
      {
        studentId: student.id,
        studentName: student.full_name,
        attendanceDate: input.attendanceDate,
        recordedTime: input.recordedTime,
        exitType: input.exitType,
        authorizedPersonName: effectiveAuthorizedName,
        withdrawalReason: reasonClean,
      }
    );
  });

  const updatedSummary = getDailySummaryForStudentDate(db, student.id, input.attendanceDate);
  const movRow = db
    .prepare(
      `SELECT m.*, s.full_name AS student_name
       FROM attendance_movements m
       JOIN students_registry s ON s.id = m.student_id
       WHERE m.id = ?`
    )
    .get(movementId) as Record<string, unknown>;

  return {
    ok: true,
    code: 'EXIT_REGISTERED',
    message:
      input.exitType === 'retiro_anticipado'
        ? `Retiro anticipado registrado para ${student.full_name} a las ${input.recordedTime} hs. Retirado por ${effectiveAuthorizedName}.`
        : `Salida (${input.exitType}) registrada para ${student.full_name} a las ${input.recordedTime} hs.`,
    student: studentPublic,
    movement: mapMovementRow(movRow),
    dailySummary: updatedSummary || undefined,
  };
}

export interface FinalizeAbsencesResult {
  ok: boolean;
  skippedNonSchoolDay?: boolean;
  nonSchoolReason?: string;
  evaluatedCount: number;
  markedAbsentCount: number;
  skippedBeforeCutoffCount: number;
  absentStudentIds: string[];
}

export async function finalizeDailyAbsences(
  db: DatabaseSync,
  params: {
    attendanceDate: string;
    currentTimeHHMM: string;
    shiftFilter?: ShiftType;
  },
  operator: AuthUserSession
): Promise<FinalizeAbsencesResult> {
  if (!isValidISODate(params.attendanceDate) || !isValidHHMM(params.currentTimeHHMM)) {
    return {
      ok: false,
      evaluatedCount: 0,
      markedAbsentCount: 0,
      skippedBeforeCutoffCount: 0,
      absentStudentIds: [],
    };
  }

  const dayEval = evaluateSchoolDay(db, params.attendanceDate);
  if (!dayEval.isSchoolDay) {
    return {
      ok: false,
      skippedNonSchoolDay: true,
      nonSchoolReason: dayEval.reason || 'Día no lectivo',
      evaluatedCount: 0,
      markedAbsentCount: 0,
      skippedBeforeCutoffCount: 0,
      absentStudentIds: [],
    };
  }

  const activeStudents = db
    .prepare(
      `SELECT id, full_name, course, division, default_shift
       FROM students_registry
       WHERE is_active = 1 AND enrollment_status IN ('regular', 'en_riesgo')`
    )
    .all() as {
    id: string;
    full_name: string;
    course: CourseYear;
    division: string;
    default_shift: ShiftType;
  }[];

  const currentMinutes = timeToMinutes(params.currentTimeHHMM);
  const absentStudentsToNotify: {
    movementId: string;
    student: { id: string; full_name: string; course: CourseYear; division: string };
    closeTime: string;
  }[] = [];

  let skippedBeforeCutoffCount = 0;
  let evaluatedCount = 0;

  runInTransaction(db, () => {
    const checkDailyStmt = db.prepare(
      `SELECT id, entry_status, entry_time FROM daily_attendance_summary WHERE student_id = ? AND attendance_date = ?`
    );

    for (const st of activeStudents) {
      if (params.shiftFilter && st.default_shift !== params.shiftFilter) {
        continue;
      }
      evaluatedCount++;

      const existing = checkDailyStmt.get(st.id, params.attendanceDate) as
        | { id: string; entry_status: string | null; entry_time: string | null }
        | undefined;

      if (existing && (existing.entry_time || existing.entry_status)) {
        continue;
      }

      const schedule = resolveEffectiveSchedule(db, st.course, st.division, st.default_shift);
      const closeMinutes = timeToMinutes(schedule.absenceCloseTime);
      if (currentMinutes < closeMinutes) {
        skippedBeforeCutoffCount++;
        continue;
      }

      const movId = `mov_${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const eventKey = `ausencia:${st.id}:${params.attendanceDate}`;

      db.prepare(
        `INSERT INTO attendance_movements
          (id, event_unique_key, student_id, attendance_date, movement_kind, attendance_status, recorded_time, shift, course, division, operator_user_id, operator_name, observations, created_at)
         VALUES (?, ?, ?, ?, 'ingreso', 'ausente', ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        movId,
        eventKey,
        st.id,
        params.attendanceDate,
        params.currentTimeHHMM,
        st.default_shift,
        st.course,
        st.division || '',
        operator.id,
        operator.fullName,
        `Cierre automático de control de turno (${schedule.absenceCloseTime} hs)`,
        nowIso
      );

      db.prepare(
        `INSERT INTO daily_attendance_summary
          (id, student_id, attendance_date, shift, entry_status, entry_movement_id, absence_finalized, updated_at)
         VALUES (?, ?, ?, ?, 'ausente', ?, 1, ?)`
      ).run(
        `day_${crypto.randomUUID()}`,
        st.id,
        params.attendanceDate,
        st.default_shift,
        movId,
        nowIso
      );

      absentStudentsToNotify.push({
        movementId: movId,
        student: st,
        closeTime: params.currentTimeHHMM,
      });
    }

    if (absentStudentsToNotify.length > 0) {
      recordAuditLog(
        db,
        { id: operator.id, fullName: operator.fullName, role: operator.role },
        'CIERRE_AUSENCIAS_DIARIAS',
        'daily_attendance_summary',
        params.attendanceDate,
        {
          attendanceDate: params.attendanceDate,
          currentTimeHHMM: params.currentTimeHHMM,
          markedAbsentCount: absentStudentsToNotify.length,
        }
      );
    }
  });

  return {
    ok: true,
    evaluatedCount,
    markedAbsentCount: absentStudentsToNotify.length,
    skippedBeforeCutoffCount,
    absentStudentIds: absentStudentsToNotify.map((a) => a.student.id),
  };
}
