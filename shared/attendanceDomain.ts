import type { CourseYear } from '../types';

export type UserRole = 'admin' | 'preceptor' | 'docente' | 'tutor';

export type ShiftType = 'manana' | 'tarde' | 'vespertino';

export type MovementKind = 'ingreso' | 'salida';

export type AttendanceEntryStatus = 'presente' | 'tarde' | 'ausente';

export type ExitType = 'habitual' | 'retiro_anticipado' | 'retiro_excepcional';

export interface AuthUserSession {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  guardianId?: string | null;
}

export interface ShiftScheduleConfig {
  shift: ShiftType;
  label: string;
  entryTime: string; // HH:MM
  punctualityCutoffTime: string; // HH:MM
  toleranceMinutes: number;
  exitTime: string; // HH:MM
  absenceCloseTime: string; // HH:MM
  enabled: boolean;
}

export interface CourseScheduleOverride {
  id: string;
  course: CourseYear;
  division: string; // "" applies to whole course, or "A", "B"
  shift: ShiftType;
  entryTime: string;
  punctualityCutoffTime: string;
  toleranceMinutes: number;
  exitTime: string;
  absenceCloseTime: string;
  active: boolean;
}

export interface NonSchoolDayRule {
  id: string;
  date: string; // YYYY-MM-DD
  reason: string;
  source: 'manual' | 'calendar';
}

export interface ScheduleConfigPayload {
  shifts: ShiftScheduleConfig[];
  overrides: CourseScheduleOverride[];
  nonSchoolDays: NonSchoolDayRule[];
  weekendIsNonSchoolDay: boolean;
}

export interface Guardian {
  id: string;
  fullName: string;
  dni: string;
  phone: string;
  email: string;
  notes?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentGuardianLink {
  id: string;
  studentId: string;
  guardianId: string;
  relationship: string;
  isPrimary: boolean;
  authorizedPickup: boolean;
  guardian?: Guardian;
}

export interface AttendanceMovementRecord {
  id: string;
  eventUniqueKey: string;
  studentId: string;
  studentName?: string;
  course?: CourseYear;
  division?: string;
  attendanceDate: string; // YYYY-MM-DD
  movementKind: MovementKind;
  attendanceStatus?: AttendanceEntryStatus;
  exitType?: ExitType;
  recordedTime: string; // HH:MM
  shift: ShiftType;
  operatorUserId: string;
  operatorName: string;
  withdrawalReason?: string;
  authorizedPersonName?: string;
  authorizedPersonDni?: string;
  guardianLinkId?: string | null;
  observations?: string;
  cardNumber?: string;
  createdAt: string;
}

export interface DailyAttendanceStatusSummary {
  studentId: string;
  studentName: string;
  course: CourseYear;
  division: string;
  photo?: string;
  attendanceDate: string;
  shift: ShiftType;
  entryStatus?: AttendanceEntryStatus | null;
  entryTime?: string | null;
  exitTime?: string | null;
  exitType?: ExitType | null;
  authorizedPersonName?: string | null;
  withdrawalReason?: string | null;
  inPremises: boolean;
  absenceFinalized: boolean;
}

export interface AuditLogRecord {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface QRScanBackendResponse {
  ok: boolean;
  code:
    | 'ENTRY_REGISTERED'
    | 'EXIT_REGISTERED'
    | 'DUPLICATE_ENTRY_BLOCKED'
    | 'DUPLICATE_EXIT_BLOCKED'
    | 'EXIT_WITHOUT_ENTRY_BLOCKED'
    | 'INVALID_QR'
    | 'CARD_REVOKED'
    | 'STUDENT_NOT_FOUND'
    | 'UNAUTHORIZED_PICKUP'
    | 'VALIDATION_ERROR';
  message: string;
  student?: {
    id: string;
    fullName: string;
    dni: string;
    course: CourseYear;
    division: string;
    photo?: string;
  };
  movement?: AttendanceMovementRecord;
  dailySummary?: DailyAttendanceStatusSummary;
}

export interface GuardianChildSnapshot {
  studentId: string;
  fullName: string;
  dni: string;
  course: CourseYear;
  division: string;
  photo?: string;
  relationship: string;
  authorizedPickup: boolean;
  todayStatus: DailyAttendanceStatusSummary | null;
  movements: AttendanceMovementRecord[];
  stats: {
    totalRecordedDays: number;
    presentCount: number;
    lateCount: number;
    absentCount: number;
    earlyWithdrawalsCount: number;
    attendancePercent: number;
  };
}
