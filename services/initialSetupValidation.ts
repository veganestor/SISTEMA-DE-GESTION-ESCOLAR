import { InstitutionType, SchoolInfo } from '../types';

export const VALID_INSTITUTION_TYPES: InstitutionType[] = [
  'Jardín de Infantes',
  'Escuela Primaria',
  'Escuela Secundaria',
  'Escuela Técnica / Agrotécnica',
  'Instituto Superior',
  'Otra Institución',
];

export type InitialSetupFieldKey =
  | 'name'
  | 'institutionType'
  | 'institutionNumber'
  | 'cue'
  | 'address'
  | 'locality'
  | 'province'
  | 'phone'
  | 'email'
  | 'principalName'
  | 'academicYear';

export const REQUIRED_INITIAL_SETUP_FIELDS: InitialSetupFieldKey[] = [
  'name',
  'institutionType',
  'address',
  'locality',
  'province',
  'phone',
  'email',
  'principalName',
  'academicYear',
];

export interface InitialSetupValidationResult {
  isValid: boolean;
  errors: Partial<Record<InitialSetupFieldKey, string>>;
  requiredTotal: number;
  requiredValidCount: number;
  missingOrInvalidRequiredCount: number;
  firstInvalidField: InitialSetupFieldKey | null;
}

const HAS_LETTER_REGEX = /[a-záéíóúüñA-ZÁÉÍÓÚÜÑ]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_ALLOWED_CHARS_REGEX = /^[+\d\s().-]+$/;
const CUE_ALLOWED_CHARS_REGEX = /^[\d\s-]+$/;

export const MIN_ACADEMIC_YEAR = 2020;
export const MAX_ACADEMIC_YEAR = 2040;

const ORDERED_FIELDS: InitialSetupFieldKey[] = [
  'name',
  'institutionType',
  'institutionNumber',
  'cue',
  'address',
  'locality',
  'province',
  'phone',
  'email',
  'principalName',
  'academicYear',
];

/**
 * Valida un campo individual del formulario de Configuración Inicial del Establecimiento.
 * Devuelve el mensaje de error en español si el dato es faltante o inválido, o null si es válido.
 */
export const validateInitialSetupField = (
  field: InitialSetupFieldKey,
  formData: SchoolInfo
): string | null => {
  switch (field) {
    case 'name': {
      const value = (formData.name || '').trim();
      if (!value) return 'Ingrese el nombre completo de la institución.';
      if (value.length < 3) return 'El nombre debe tener al menos 3 caracteres.';
      if (!HAS_LETTER_REGEX.test(value)) return 'El nombre de la institución debe incluir letras.';
      return null;
    }

    case 'institutionType': {
      const value = formData.institutionType;
      if (!value || !VALID_INSTITUTION_TYPES.includes(value)) {
        return 'Seleccione el tipo de institución.';
      }
      return null;
    }

    case 'institutionNumber': {
      const value = (formData.institutionNumber || '').trim();
      if (!value) return null; // Opcional
      if (value.length > 30) {
        return 'El número o identificación no puede superar los 30 caracteres.';
      }
      return null;
    }

    case 'cue': {
      const value = (formData.cue || '').trim();
      if (!value) return null; // Opcional
      if (!CUE_ALLOWED_CHARS_REGEX.test(value)) {
        return 'El C.U.E. solo puede contener números y guiones.';
      }
      const digits = value.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 9) {
        return 'El C.U.E. debe tener entre 7 y 9 dígitos numéricos.';
      }
      return null;
    }

    case 'address': {
      const value = (formData.address || '').trim();
      if (!value) return 'Ingrese la dirección del establecimiento.';
      if (value.length < 4) return 'Ingrese una dirección válida (al menos 4 caracteres).';
      return null;
    }

    case 'locality': {
      const value = (formData.locality || '').trim();
      if (!value) return 'Ingrese la localidad.';
      if (value.length < 2 || !HAS_LETTER_REGEX.test(value)) {
        return 'Ingrese un nombre de localidad válido.';
      }
      return null;
    }

    case 'province': {
      const value = (formData.province || '').trim();
      if (!value) return 'Ingrese la provincia.';
      if (value.length < 2 || !HAS_LETTER_REGEX.test(value)) {
        return 'Ingrese un nombre de provincia válido.';
      }
      return null;
    }

    case 'phone': {
      const value = (formData.phone || '').trim();
      if (!value) return 'Ingrese un teléfono de contacto.';
      if (!PHONE_ALLOWED_CHARS_REGEX.test(value)) {
        return 'El teléfono solo admite números, espacios y símbolos +, -, ( ).';
      }
      const digits = value.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return 'El teléfono debe contener entre 7 y 15 dígitos.';
      }
      return null;
    }

    case 'email': {
      const value = (formData.email || '').trim();
      if (!value) return 'Ingrese el correo electrónico institucional.';
      if (!EMAIL_REGEX.test(value)) {
        return 'Ingrese un correo electrónico válido (ej: escuela@dominio.edu.ar).';
      }
      return null;
    }

    case 'principalName': {
      const value = (formData.principalName || '').trim();
      if (!value) return 'Ingrese el nombre del director/a o responsable institucional.';
      if (value.length < 3 || !HAS_LETTER_REGEX.test(value)) {
        return 'Ingrese un nombre y apellido válido (al menos 3 caracteres).';
      }
      return null;
    }

    case 'academicYear': {
      const raw = formData.academicYear;
      if (raw === '' || raw === null || raw === undefined) {
        return 'Ingrese el año del ciclo lectivo.';
      }
      const numericYear = Number(raw);
      if (
        !Number.isInteger(numericYear) ||
        numericYear < MIN_ACADEMIC_YEAR ||
        numericYear > MAX_ACADEMIC_YEAR
      ) {
        return `El ciclo lectivo debe ser un año entre ${MIN_ACADEMIC_YEAR} y ${MAX_ACADEMIC_YEAR}.`;
      }
      return null;
    }
  }
};

/**
 * Valida integralmente el formulario de Configuración Inicial del Establecimiento.
 */
export const validateInitialSetupForm = (
  formData: SchoolInfo
): InitialSetupValidationResult => {
  const errors: Partial<Record<InitialSetupFieldKey, string>> = {};
  let firstInvalidField: InitialSetupFieldKey | null = null;

  for (const field of ORDERED_FIELDS) {
    const error = validateInitialSetupField(field, formData);
    if (error) {
      errors[field] = error;
      if (!firstInvalidField) {
        firstInvalidField = field;
      }
    }
  }

  let requiredValidCount = 0;
  for (const reqField of REQUIRED_INITIAL_SETUP_FIELDS) {
    if (!errors[reqField]) {
      requiredValidCount += 1;
    }
  }

  const requiredTotal = REQUIRED_INITIAL_SETUP_FIELDS.length;
  const missingOrInvalidRequiredCount = requiredTotal - requiredValidCount;

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    requiredTotal,
    requiredValidCount,
    missingOrInvalidRequiredCount,
    firstInvalidField,
  };
};

/**
 * Sanitiza y normaliza los campos validados antes de guardar la configuración inicial.
 */
export const sanitizeInitialSetupData = (formData: SchoolInfo): SchoolInfo => ({
  ...formData,
  name: (formData.name || '').trim(),
  institutionNumber: (formData.institutionNumber || '').trim(),
  cue: (formData.cue || '').trim(),
  address: (formData.address || '').trim(),
  locality: (formData.locality || '').trim(),
  province: (formData.province || '').trim(),
  phone: (formData.phone || '').trim(),
  email: (formData.email || '').trim().toLowerCase(),
  principalName: (formData.principalName || '').trim(),
  academicYear: Number(formData.academicYear),
  isConfigured: true,
  updatedAt: new Date().toISOString(),
});
