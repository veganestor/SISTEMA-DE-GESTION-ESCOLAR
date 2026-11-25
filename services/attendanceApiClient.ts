import type {
  AttendanceMovementRecord,
  AuditLogRecord,
  AuthUserSession,
  DailyAttendanceStatusSummary,
  ExitType,
  Guardian,
  GuardianChildSnapshot,
  QRScanBackendResponse,
  ScheduleConfigPayload,
  ShiftType,
  StudentGuardianLink,
  UserRole,
} from '../shared/attendanceDomain';
import type { CalendarEvent, CourseYear, IssuedCardRecord, Student } from '../types';

// Strictly held in JS memory only (never localStorage) to satisfy session token security rules.
let inMemoryToken: string | null = null;
let inMemoryUser: AuthUserSession | null = null;
const authListeners = new Set<(user: AuthUserSession | null) => void>();

export function getInMemorySession(): { token: string | null; user: AuthUserSession | null } {
  return { token: inMemoryToken, user: inMemoryUser };
}

export function setInMemorySession(token: string | null, user: AuthUserSession | null): void {
  inMemoryToken = token;
  inMemoryUser = user;
  for (const listener of authListeners) {
    listener(user);
  }
}

export function clearInMemorySession(): void {
  setInMemorySession(null, null);
}

export function subscribeAuthSession(listener: (user: AuthUserSession | null) => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(path, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string; message?: string };

  if (res.status === 401 && inMemoryToken) {
    clearInMemorySession();
  }

  if (!res.ok && !(data && 'code' in data)) {
    const errMsg = data?.error || data?.message || `Error HTTP ${res.status}`;
    throw new Error(errMsg);
  }
  return data;
}

export async function fetchAuthStatus(): Promise<{
  hasAdmin: boolean;
  requiresBootstrapPasscode: boolean;
}> {
  return apiRequest('/api/auth/status');
}

export async function bootstrapInitialAdmin(payload: {
  fullName: string;
  username: string;
  email: string;
  password: string;
  bootstrapPasscode?: string;
}): Promise<AuthUserSession> {
  const data = await apiRequest<{ ok: boolean; token: string; user: AuthUserSession }>(
    '/api/auth/bootstrap-admin',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  setInMemorySession(data.token, data.user);
  return data.user;
}

export async function loginBackendUser(
  username: string,
  password: string
): Promise<AuthUserSession> {
  const data = await apiRequest<{ ok: boolean; token: string; user: AuthUserSession }>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }
  );
  setInMemorySession(data.token, data.user);
  return data.user;
}

export async function logoutBackendSession(): Promise<void> {
  if (inMemoryToken) {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }
  clearInMemorySession();
}

export async function recoverAdminWithPasscode(payload: {
  username: string;
  newPassword: string;
  bootstrapPasscode: string;
}): Promise<AuthUserSession> {
  const data = await apiRequest<{ ok: boolean; token: string; user: AuthUserSession }>(
    '/api/auth/admin-passcode-reset',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  setInMemorySession(data.token, data.user);
  return data.user;
}

export async function syncAppContextToBackend(params: {
  students: Student[];
  issuedCards: IssuedCardRecord[];
  calendarEvents: CalendarEvent[];
}): Promise<void> {
  if (!inMemoryToken || !inMemoryUser || inMemoryUser.role === 'tutor') return;
  const calendarHolidays = params.calendarEvents
    .filter((ev) => ev.type === 'feriado')
    .map((ev) => ({ id: ev.id, date: ev.date, title: ev.title }));

  await apiRequest('/api/attendance-system/sync-context', {
    method: 'POST',
    body: JSON.stringify({
      students: params.students.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        dni: s.dni,
        course: s.course,
        division: s.division || 'A',
        enrollmentStatus: s.enrollmentStatus || 'regular',
        photo: s.photo || '',
      })),
      issuedCards: params.issuedCards.map((c) => ({
        cardNumber: c.cardNumber,
        personId: c.personId,
        personType: c.personType,
        status: c.status,
        validUntil: c.validUntil,
        revokeReason: c.revokeReason || '',
      })),
      calendarHolidays,
    }),
  });
}

export async function fetchScheduleConfig(): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>('/api/schedules');
  return data.config;
}

export async function updateShiftSchedule(
  shift: ShiftType,
  payload: {
    label: string;
    entryTime: string;
    punctualityCutoffTime: string;
    toleranceMinutes: number;
    exitTime: string;
    absenceCloseTime: string;
    enabled: boolean;
  }
): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>(
    `/api/schedules/shift/${shift}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
  return data.config;
}

export async function upsertCourseScheduleOverride(payload: {
  course: CourseYear;
  division: string;
  shift: ShiftType;
  entryTime: string;
  punctualityCutoffTime: string;
  toleranceMinutes: number;
  exitTime: string;
  absenceCloseTime: string;
  active: boolean;
}): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>(
    '/api/schedules/overrides',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return data.config;
}

export async function deleteCourseScheduleOverride(id: string): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>(
    `/api/schedules/overrides/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  return data.config;
}

export async function addNonSchoolDay(date: string, reason: string): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>(
    '/api/schedules/non-school-days',
    {
      method: 'POST',
      body: JSON.stringify({ date, reason }),
    }
  );
  return data.config;
}

export async function deleteNonSchoolDay(id: string): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>(
    `/api/schedules/non-school-days/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  return data.config;
}

export async function updateWeekendRule(
  weekendIsNonSchoolDay: boolean
): Promise<ScheduleConfigPayload> {
  const data = await apiRequest<{ ok: boolean; config: ScheduleConfigPayload }>(
    '/api/schedules/weekend-rule',
    {
      method: 'PUT',
      body: JSON.stringify({ weekendIsNonSchoolDay }),
    }
  );
  return data.config;
}

export async function scanQREntry(payload: {
  qrRaw: string;
  attendanceDate: string;
  recordedTime: string;
  shift?: ShiftType;
  observations?: string;
}): Promise<QRScanBackendResponse> {
  return apiRequest<QRScanBackendResponse>('/api/attendance-qr/entry', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function scanQRExit(payload: {
  qrRaw: string;
  attendanceDate: string;
  recordedTime: string;
  exitType: ExitType;
  withdrawalReason: string;
  authorizedPersonName: string;
  authorizedPersonDni?: string;
  guardianLinkId?: string | null;
  observations?: string;
}): Promise<QRScanBackendResponse> {
  return apiRequest<QRScanBackendResponse>('/api/attendance-qr/exit', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function finalizeAbsencesNow(payload: {
  attendanceDate: string;
  currentTimeHHMM: string;
  shiftFilter?: ShiftType;
}): Promise<{
  ok: boolean;
  skippedNonSchoolDay?: boolean;
  nonSchoolReason?: string;
  evaluatedCount: number;
  markedAbsentCount: number;
  skippedBeforeCutoffCount: number;
  absentStudentIds: string[];
}> {
  return apiRequest('/api/attendance-qr/finalize-absences', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function manualAdjustDailyAttendance(payload: {
  studentId: string;
  attendanceDate: string;
  entryStatus: 'presente' | 'tarde' | 'ausente';
  reason: string;
}): Promise<void> {
  await apiRequest('/api/attendance-qr/manual-adjust', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function fetchDailyAttendanceBoard(params: {
  date: string;
  course?: string;
  division?: string;
  shift?: string;
  status?: string;
}): Promise<{
  date: string;
  kpis: {
    totalActive: number;
    ingresaron: number;
    presentes: number;
    tardes: number;
    ausentes: number;
    enEstablecimiento: number;
    salidasRegistradas: number;
  };
  summaries: DailyAttendanceStatusSummary[];
  movements: AttendanceMovementRecord[];
}> {
  const qs = new URLSearchParams();
  qs.set('date', params.date);
  if (params.course) qs.set('course', params.course);
  if (params.division) qs.set('division', params.division);
  if (params.shift) qs.set('shift', params.shift);
  if (params.status) qs.set('status', params.status);

  return apiRequest(`/api/attendance-qr/daily?${qs.toString()}`);
}

export async function fetchMovementsReport(params: {
  from?: string;
  to?: string;
  course?: string;
  division?: string;
  shift?: string;
  studentId?: string;
  status?: string;
}): Promise<AttendanceMovementRecord[]> {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.course) qs.set('course', params.course);
  if (params.division) qs.set('division', params.division);
  if (params.shift) qs.set('shift', params.shift);
  if (params.studentId) qs.set('studentId', params.studentId);
  if (params.status) qs.set('status', params.status);

  const data = await apiRequest<{ ok: boolean; movements: AttendanceMovementRecord[] }>(
    `/api/attendance-qr/movements-report?${qs.toString()}`
  );
  return data.movements;
}

export interface GuardianWithLinks extends Guardian {
  linkedStudents: {
    linkId: string;
    studentId: string;
    studentName: string;
    course: string;
    division: string;
    relationship: string;
    isPrimary: boolean;
    authorizedPickup: boolean;
  }[];
}

export async function fetchGuardians(): Promise<GuardianWithLinks[]> {
  const data = await apiRequest<{ ok: boolean; guardians: GuardianWithLinks[] }>('/api/guardians');
  return data.guardians;
}

export async function createGuardian(payload: {
  fullName: string;
  dni: string;
  phone: string;
  email: string;
  notes?: string;
}): Promise<Guardian> {
  const data = await apiRequest<{ ok: boolean; guardian: Guardian }>('/api/guardians', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.guardian;
}

export async function updateGuardian(
  id: string,
  payload: {
    fullName: string;
    dni: string;
    phone: string;
    email: string;
    notes?: string;
  }
): Promise<void> {
  await apiRequest(`/api/guardians/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchStudentGuardians(studentId: string): Promise<StudentGuardianLink[]> {
  const data = await apiRequest<{ ok: boolean; links: StudentGuardianLink[] }>(
    `/api/students/${encodeURIComponent(studentId)}/guardians`
  );
  return data.links;
}

export async function linkGuardianToStudent(
  studentId: string,
  payload: {
    guardianId: string;
    relationship: string;
    isPrimary: boolean;
    authorizedPickup: boolean;
  }
): Promise<void> {
  await apiRequest(`/api/students/${encodeURIComponent(studentId)}/guardians`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateStudentGuardianLink(
  linkId: string,
  payload: Partial<{
    relationship: string;
    isPrimary: boolean;
    authorizedPickup: boolean;
  }>
): Promise<void> {
  await apiRequest(`/api/student-guardians/${encodeURIComponent(linkId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteStudentGuardianLink(linkId: string): Promise<void> {
  await apiRequest(`/api/student-guardians/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
  });
}

export async function updateStudentShift(
  studentId: string,
  defaultShift: ShiftType,
  division?: string
): Promise<void> {
  await apiRequest(`/api/students/${encodeURIComponent(studentId)}/shift`, {
    method: 'PATCH',
    body: JSON.stringify({ defaultShift, division }),
  });
}

export async function fetchStudentBackendAttendance(studentId: string): Promise<{
  movements: AttendanceMovementRecord[];
}> {
  return apiRequest(`/api/students/${encodeURIComponent(studentId)}/attendance-summary`);
}

export async function fetchUsersList(): Promise<
  (AuthUserSession & { guardianName?: string; isActive: boolean; createdAt: string })[]
> {
  const data = await apiRequest<{
    ok: boolean;
    users: (AuthUserSession & { guardianName?: string; isActive: boolean; createdAt: string })[];
  }>('/api/users');
  return data.users;
}

export async function createBackendUser(payload: {
  username: string;
  password: string;
  fullName: string;
  email: string;
  role: UserRole;
  guardianId?: string | null;
}): Promise<void> {
  await apiRequest('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function toggleUserActiveStatus(id: string, isActive: boolean): Promise<void> {
  await apiRequest(`/api/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

export async function fetchGuardianPortalChildren(
  date: string,
  guardianIdOverride?: string
): Promise<{ guardianId: string; children: GuardianChildSnapshot[] }> {
  const qs = new URLSearchParams({ date });
  if (guardianIdOverride) qs.set('guardianId', guardianIdOverride);
  return apiRequest(`/api/guardian-portal/children?${qs.toString()}`);
}

export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  const data = await apiRequest<{ ok: boolean; logs: AuditLogRecord[] }>('/api/audit-logs');
  return data.logs;
}
