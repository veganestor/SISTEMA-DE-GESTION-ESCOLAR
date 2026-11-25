import { AttendanceRecord, CourseYear, Student } from '../types';
import { QRVerificationResult } from './qrService';

export type QRAttendanceOutcome =
  | 'registered'
  | 'updated'
  | 'already_registered'
  | 'skipped_disabled'
  | 'blocked_expired'
  | 'blocked_revoked'
  | 'not_student'
  | 'student_not_found';

export interface QRAttendanceFeedback {
  outcome: QRAttendanceOutcome;
  studentId?: string;
  studentName?: string;
  course?: CourseYear;
  date: string;
  status?: AttendanceRecord['type'];
  previousStatus?: AttendanceRecord['type'];
  recordedAt?: string;
  message: string;
}

export interface UpsertAttendanceParams {
  studentId: string;
  date: string;
  type: AttendanceRecord['type'];
  source?: 'manual' | 'qr';
  recordedAt?: string;
  justified?: boolean;
  reason?: string;
  preserveIfSameType?: boolean;
}

export interface UpsertAttendanceResult {
  students: Student[];
  outcome: 'registered' | 'updated' | 'already_registered' | 'student_not_found';
  student?: Student;
  previousRecord?: AttendanceRecord;
  record?: AttendanceRecord;
}

export const formatLocalTimeHHMM = (date: Date = new Date()): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const getAttendanceStatusLabel = (type: AttendanceRecord['type']): string => {
  switch (type) {
    case 'presente':
      return 'Presente';
    case 'tarde':
      return 'Tardanza';
    case 'ausente':
      return 'Ausente';
  }
};

/**
 * Inserta o actualiza el registro de asistencia diario de un estudiante para una fecha ISO (YYYY-MM-DD),
 * garantizando un único registro por fecha y evitando sobrescrituras innecesarias ante escaneos duplicados.
 */
export const upsertStudentAttendance = (
  students: Student[],
  params: UpsertAttendanceParams
): UpsertAttendanceResult => {
  const {
    studentId,
    date,
    type,
    source = 'qr',
    recordedAt = formatLocalTimeHHMM(),
    justified = false,
    reason,
    preserveIfSameType = true,
  } = params;

  const target = students.find((s) => s.id === studentId);
  if (!target) {
    return {
      students,
      outcome: 'student_not_found',
    };
  }

  const currentAttendance = Array.isArray(target.attendance) ? target.attendance : [];
  const previousRecord = currentAttendance.find((a) => a.date === date);

  if (previousRecord && previousRecord.type === type && preserveIfSameType) {
    return {
      students,
      outcome: 'already_registered',
      student: target,
      previousRecord,
      record: previousRecord,
    };
  }

  const newRecord: AttendanceRecord = {
    date,
    type,
    justified: type === 'ausente' ? justified : false,
    reason,
    source,
    recordedAt,
  };

  const nextStudents = students.map((s) => {
    if (s.id !== studentId) return s;
    const filtered = (Array.isArray(s.attendance) ? s.attendance : []).filter(
      (a) => a.date !== date
    );
    return {
      ...s,
      attendance: [...filtered, newRecord],
    };
  });

  const updatedStudent = nextStudents.find((s) => s.id === studentId);

  return {
    students: nextStudents,
    outcome: previousRecord ? 'updated' : 'registered',
    student: updatedStudent,
    previousRecord,
    record: newRecord,
  };
};

/**
 * Construye el mensaje descriptivo del resultado de registrar asistencia por QR.
 */
export const buildQRAttendanceFeedback = (
  result: UpsertAttendanceResult,
  date: string
): QRAttendanceFeedback => {
  const status = result.record?.type;
  const recordedAt = result.record?.recordedAt;
  const studentName = result.student?.fullName;
  const course = result.student?.course;

  if (result.outcome === 'student_not_found' || !result.student || !status) {
    return {
      outcome: 'student_not_found',
      date,
      message: 'No se encontró al estudiante en la matrícula local para registrar la asistencia.',
    };
  }

  const statusText = getAttendanceStatusLabel(status);
  const timeSuffix = recordedAt ? ` a las ${recordedAt} hs` : '';

  if (result.outcome === 'already_registered') {
    const prevTime = result.previousRecord?.recordedAt
      ? ` (${result.previousRecord.recordedAt} hs)`
      : '';
    return {
      outcome: 'already_registered',
      studentId: result.student.id,
      studentName,
      course,
      date,
      status,
      previousStatus: result.previousRecord?.type,
      recordedAt: result.previousRecord?.recordedAt,
      message: `${studentName} ya tenía registrada asistencia como ${statusText} para el ${date}${prevTime}. No se crearon duplicados.`,
    };
  }

  if (result.outcome === 'updated' && result.previousRecord) {
    const prevText = getAttendanceStatusLabel(result.previousRecord.type);
    return {
      outcome: 'updated',
      studentId: result.student.id,
      studentName,
      course,
      date,
      status,
      previousStatus: result.previousRecord.type,
      recordedAt,
      message: `Asistencia actualizada de ${prevText} a ${statusText} para ${studentName} (${date}${timeSuffix}). Sincronizada con Control de Asistencia.`,
    };
  }

  return {
    outcome: 'registered',
    studentId: result.student.id,
    studentName,
    course,
    date,
    status,
    recordedAt,
    message: `Asistencia registrada como ${statusText} para ${studentName} (${date}${timeSuffix}). Actualizada en Control de Asistencia.`,
  };
};

/**
 * Evalúa si un resultado de verificación QR puede registrar asistencia automáticamente
 * o si debe informar un bloqueo/omisión al operador.
 */
export const evaluateNonRegisteredQRFeedback = (
  verification: QRVerificationResult,
  date: string,
  autoRegisterEnabled: boolean
): QRAttendanceFeedback | null => {
  if (!verification.validFormat || !verification.payload) {
    return null;
  }

  if (verification.payload.type === 'teacher') {
    return {
      outcome: 'not_student',
      date,
      message:
        'Credencial docente verificada. El registro automático de asistencia diaria por QR aplica únicamente a estudiantes.',
    };
  }

  if (!verification.matchedStudent) {
    return {
      outcome: 'student_not_found',
      date,
      message:
        'El carnet estudiantil no coincide con ningún alumno activo en la base local. No se registró asistencia.',
    };
  }

  if (verification.status === 'anulado' || verification.status === 'reemplazado') {
    return {
      outcome: 'blocked_revoked',
      studentId: verification.matchedStudent.id,
      studentName: verification.matchedStudent.fullName,
      course: verification.matchedStudent.course,
      date,
      message:
        verification.status === 'anulado'
          ? 'Carnet anulado/revocado: la asistencia no fue registrada automáticamente.'
          : 'Carnet reemplazado por una emisión más reciente: la asistencia no fue registrada automáticamente.',
    };
  }

  if (verification.status === 'vencido') {
    return {
      outcome: 'blocked_expired',
      studentId: verification.matchedStudent.id,
      studentName: verification.matchedStudent.fullName,
      course: verification.matchedStudent.course,
      date,
      message:
        'Carnet vencido: la asistencia no se registró automáticamente. Puede registrarla manualmente si autoriza el ingreso.',
    };
  }

  if (!autoRegisterEnabled) {
    return {
      outcome: 'skipped_disabled',
      studentId: verification.matchedStudent.id,
      studentName: verification.matchedStudent.fullName,
      course: verification.matchedStudent.course,
      date,
      message:
        'Modo solo verificación activo: presione "Registrar Presente" o "Registrar Tarde" si desea cargar la asistencia.',
    };
  }

  return null;
};

export interface QRAttendanceDateSummary {
  totalQrCount: number;
  presentCount: number;
  lateCount: number;
  byCourse: { course: CourseYear; count: number }[];
  entries: {
    studentId: string;
    studentName: string;
    course: CourseYear;
    type: AttendanceRecord['type'];
    recordedAt?: string;
  }[];
}

/**
 * Resume todas las asistencias registradas por QR para una fecha dada (YYYY-MM-DD).
 */
export const getQRAttendanceSummaryForDate = (
  students: Student[],
  date: string
): QRAttendanceDateSummary => {
  const courseCounts = new Map<CourseYear, number>();
  const entries: QRAttendanceDateSummary['entries'] = [];
  let presentCount = 0;
  let lateCount = 0;

  for (const student of students) {
    const rec = Array.isArray(student.attendance)
      ? student.attendance.find((a) => a.date === date && a.source === 'qr')
      : undefined;
    if (!rec) continue;

    if (rec.type === 'presente') presentCount++;
    if (rec.type === 'tarde') lateCount++;
    courseCounts.set(student.course, (courseCounts.get(student.course) || 0) + 1);
    entries.push({
      studentId: student.id,
      studentName: student.fullName,
      course: student.course,
      type: rec.type,
      recordedAt: rec.recordedAt,
    });
  }

  entries.sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));

  const byCourse = (['1', '2', '3', '4', '5', '6'] as CourseYear[])
    .filter((course) => (courseCounts.get(course) || 0) > 0)
    .map((course) => ({ course, count: courseCounts.get(course) || 0 }));

  return {
    totalQrCount: entries.length,
    presentCount,
    lateCount,
    byCourse,
    entries,
  };
};
