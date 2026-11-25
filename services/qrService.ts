import QRCode from 'qrcode';
import {
  Student,
  Teacher,
  SchoolInfo,
  CardDesignConfig,
  IssuedCardRecord,
  QRPayloadV1,
} from '../types';
import { getLocalTodayISO } from './storageService';

/**
 * Enmascara un DNI dejando visibles solo los últimos 3 dígitos para proteger
 * la privacidad de menores y datos personales dentro de códigos QR impresos.
 */
export const maskDniForPrivacy = (dni?: string): string | undefined => {
  const clean = (dni || '').replace(/[^0-9]/g, '');
  if (clean.length < 4) return undefined;
  return `***${clean.slice(-3)}`;
};

/**
 * Genera el número institucional único de carnet para un estudiante o docente.
 */
export const buildCardNumber = (
  personType: 'student' | 'teacher',
  academicYear: string | number,
  sequenceIndex: number,
  reissueNumber = 1
): string => {
  const prefix = personType === 'student' ? 'EST' : 'DOC';
  const year = String(academicYear || new Date().getFullYear());
  const seq = String(sequenceIndex).padStart(4, '0');
  return reissueNumber > 1 ? `${prefix}-${year}-${seq}-R${reissueNumber}` : `${prefix}-${year}-${seq}`;
};

/**
 * Construye una carga útil QR estructurada y versionada (v1.0) respetando privacidad por diseño:
 * - NO incluye dirección/domicilio, teléfono personal, ficha médica ni datos familiares.
 * - Marca explícitamente `signed: false` para transparencia: el QR sin servidor ni firma
 *   criptográfica es estrictamente informativo y de verificación local.
 */
export const buildStudentQRPayload = (
  student: Student,
  schoolInfo: SchoolInfo,
  cardRecord: IssuedCardRecord,
  config: CardDesignConfig
): QRPayloadV1 => {
  const displayName = cardRecord.visualOverride?.displayName?.trim() || student.fullName;
  const divisionText = cardRecord.visualOverride?.customSubtitle?.trim()
    || (student.division ? `Div. ${student.division}` : '');
  const roleLabel = `${student.course}° Año${divisionText ? ` • ${divisionText}` : ''}`;

  const payload: QRPayloadV1 = {
    v: '1.0',
    uid: student.id,
    type: 'student',
    name: displayName,
    inst: schoolInfo.name,
    instId: schoolInfo.cue || schoolInfo.institutionNumber || undefined,
    role: roleLabel,
    cardNo: cardRecord.cardNumber,
    year: String(cardRecord.academicYear || schoolInfo.academicYear),
    validUntil: cardRecord.visualOverride?.customValidityDate || cardRecord.validUntil || config.validityDate,
    signed: false,
  };

  if (config.includeMaskedDniInQr) {
    const masked = maskDniForPrivacy(student.dni);
    if (masked) payload.dniRef = masked;
  }

  return payload;
};

export const buildTeacherQRPayload = (
  teacher: Teacher,
  schoolInfo: SchoolInfo,
  cardRecord: IssuedCardRecord,
  config: CardDesignConfig
): QRPayloadV1 => {
  const displayName = cardRecord.visualOverride?.displayName?.trim() || teacher.fullName;
  const roleLabel = cardRecord.visualOverride?.customSubtitle?.trim() || teacher.role || 'Personal Docente';
  const areaLabel = cardRecord.visualOverride?.customArea?.trim()
    || (teacher.assignedCourses?.length
      ? Array.from(new Set(teacher.assignedCourses.map((c) => c.subject))).slice(0, 2).join(', ')
      : '');

  const payload: QRPayloadV1 = {
    v: '1.0',
    uid: teacher.id,
    type: 'teacher',
    name: displayName,
    inst: schoolInfo.name,
    instId: schoolInfo.cue || schoolInfo.institutionNumber || undefined,
    role: areaLabel ? `${roleLabel} • ${areaLabel}` : roleLabel,
    cardNo: cardRecord.cardNumber,
    year: String(cardRecord.academicYear || schoolInfo.academicYear),
    validUntil: cardRecord.visualOverride?.customValidityDate || cardRecord.validUntil || config.validityDate,
    signed: false,
  };

  if (config.showTeacherDni && config.includeMaskedDniInQr) {
    const masked = maskDniForPrivacy(teacher.dni);
    if (masked) payload.dniRef = masked;
  }

  return payload;
};

/**
 * Serializa el payload en formato JSON compacto para una matriz QR limpia y fácil de escanear.
 */
export const serializeQRPayload = (payload: QRPayloadV1): string => {
  return JSON.stringify(payload);
};

/**
 * Genera una imagen DataURL PNG de alta definición para usar tanto en pantalla como en jsPDF.
 */
export const generateQRDataUrl = async (
  payload: QRPayloadV1 | string,
  sizePx = 240
): Promise<string> => {
  const content = typeof payload === 'string' ? payload : serializeQRPayload(payload);
  return QRCode.toDataURL(content, {
    width: sizePx,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0c2d48',
      light: '#ffffff',
    },
  });
};

export type QRVerificationStatus =
  | 'vigente'
  | 'vencido'
  | 'anulado'
  | 'reemplazado'
  | 'no_registrado_local'
  | 'invalido';

export interface QRVerificationResult {
  validFormat: boolean;
  status: QRVerificationStatus;
  statusLabel: string;
  statusDescription: string;
  payload?: QRPayloadV1;
  matchedStudent?: Student;
  matchedTeacher?: Teacher;
  matchedCardRecord?: IssuedCardRecord;
  securityNotice: string;
  rawText: string;
}

const SECURITY_DISCLAIMER =
  'Verificación informativa local: este código QR no cuenta con firma digital criptográfica emitida por un servidor central. Su estado se contrasta exclusivamente contra los registros almacenados en este dispositivo.';

/**
 * Analiza el contenido decodificado de un QR y valida su formato, vigencia y coincidencia
 * con el registro local de alumnos, docentes y carnets emitidos/revocados.
 */
export const parseAndValidateQR = (
  rawText: string,
  students: Student[],
  teachers: Teacher[],
  issuedCards: IssuedCardRecord[]
): QRVerificationResult => {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      validFormat: false,
      status: 'invalido',
      statusLabel: 'Código vacío',
      statusDescription: 'No se detectó contenido legible en el código QR.',
      securityNotice: SECURITY_DISCLAIMER,
      rawText,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      validFormat: false,
      status: 'invalido',
      statusLabel: 'QR no perteneciente al sistema',
      statusDescription: 'El código escaneado no corresponde al formato JSON estructurado de carnets escolares.',
      securityNotice: SECURITY_DISCLAIMER,
      rawText,
    };
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.v !== '1.0' ||
    (parsed.type !== 'student' && parsed.type !== 'teacher') ||
    typeof parsed.name !== 'string' ||
    typeof parsed.cardNo !== 'string'
  ) {
    return {
      validFormat: false,
      status: 'invalido',
      statusLabel: 'Formato QR inválido',
      statusDescription: 'El código QR no contiene los campos obligatorios de versión 1.0 del sistema escolar.',
      securityNotice: SECURITY_DISCLAIMER,
      rawText,
    };
  }

  const payload = parsed as QRPayloadV1;
  const matchedStudent =
    payload.type === 'student' ? students.find((s) => s.id === payload.uid) : undefined;
  const matchedTeacher =
    payload.type === 'teacher' ? teachers.find((t) => t.id === payload.uid) : undefined;
  const matchedCardRecord = issuedCards.find((c) => c.cardNumber === payload.cardNo);

  const todayIso = getLocalTodayISO();
  const isExpired = Boolean(payload.validUntil && payload.validUntil < todayIso);

  if (matchedCardRecord) {
    if (matchedCardRecord.status === 'anulado') {
      return {
        validFormat: true,
        status: 'anulado',
        statusLabel: 'Carnet Anulado / Revocado',
        statusDescription: matchedCardRecord.revokeReason
          ? `Revocado el ${matchedCardRecord.revokedAt || 'sin fecha'}: ${matchedCardRecord.revokeReason}`
          : 'Este carnet fue anulado manualmente en el registro local de credenciales.',
        payload,
        matchedStudent,
        matchedTeacher,
        matchedCardRecord,
        securityNotice: SECURITY_DISCLAIMER,
        rawText,
      };
    }

    if (matchedCardRecord.status === 'reemplazado') {
      return {
        validFormat: true,
        status: 'reemplazado',
        statusLabel: 'Carnet Reemplazado',
        statusDescription: 'Existe una reemisión más reciente para esta persona. Esta credencial ya no debe utilizarse.',
        payload,
        matchedStudent,
        matchedTeacher,
        matchedCardRecord,
        securityNotice: SECURITY_DISCLAIMER,
        rawText,
      };
    }
  }

  if (isExpired) {
    return {
      validFormat: true,
      status: 'vencido',
      statusLabel: 'Carnet Vencido',
      statusDescription: `La vigencia de esta credencial expiró el ${payload.validUntil}. Se recomienda regenerar para el ciclo actual.`,
      payload,
      matchedStudent,
      matchedTeacher,
      matchedCardRecord,
      securityNotice: SECURITY_DISCLAIMER,
      rawText,
    };
  }

  if (!matchedStudent && !matchedTeacher && !matchedCardRecord) {
    return {
      validFormat: true,
      status: 'no_registrado_local',
      statusLabel: 'Formato válido (no encontrado en esta base local)',
      statusDescription:
        'La estructura del QR es válida, pero el titular o número de carnet no figura en la base local cargada en este equipo.',
      payload,
      securityNotice: SECURITY_DISCLAIMER,
      rawText,
    };
  }

  return {
    validFormat: true,
    status: 'vigente',
    statusLabel: 'Credencial Vigente (Registro Local)',
    statusDescription: `Coincide con un ${payload.type === 'student' ? 'estudiante' : 'docente'} activo en la base local. Vigencia hasta ${payload.validUntil}.`,
    payload,
    matchedStudent,
    matchedTeacher,
    matchedCardRecord,
    securityNotice: SECURITY_DISCLAIMER,
    rawText,
  };
};
