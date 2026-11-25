
import { read, utils, writeFile } from 'xlsx';
import { Student, Teacher, CourseYear, SUBJECTS_BY_YEAR, SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';

export const calculateAge = (birthDate: string): number => {
  if (!birthDate) return 0;
  
  // Parseo manual de la fecha (YYYY-MM-DD) para evitar problemas de zona horaria (UTC vs Local)
  // que suelen ocurrir al usar 'new Date(string)'.
  const parts = birthDate.split('-');
  if (parts.length !== 3) return 0;

  const birthYear = parseInt(parts[0], 10);
  const birthMonth = parseInt(parts[1], 10);
  const birthDay = parseInt(parts[2], 10);

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // getMonth() devuelve 0-11
  const currentDay = today.getDate();

  let age = currentYear - birthYear;

  // Si el mes actual es menor al mes de nacimiento, aún no cumplió años.
  // Si el mes es el mismo pero el día actual es menor al día de nacimiento, tampoco.
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age--;
  }

  return age;
};

export const parseExcelDate = (excelDate: any): string => {
  if (typeof excelDate === 'number') {
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  if (typeof excelDate === 'string') return excelDate;
  return new Date().toISOString().split('T')[0];
};

export const importStudentsFromExcel = async (file: File, course: CourseYear): Promise<Student[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[][] = utils.sheet_to_json(worksheet, { header: 1 });

        // Buscamos a partir de la fila que tenga datos
        const students: Student[] = jsonData.slice(1).map((row) => ({
          id: row[2] ? String(row[2]) : Math.random().toString(36).substr(2, 9),
          fullName: row[0] ? String(row[0]) : 'Sin Nombre',
          birthDate: parseExcelDate(row[1]),
          dni: String(row[2] || ''),
          address: row[4] || '', // Quinta columna es domicilio
          course,
          grades: {},
          attendance: [],
          medical: { treatments: '', medications: '', notes: '' },
          disciplinary: []
        })).filter(s => s.fullName !== 'Sin Nombre' && s.dni !== '');

        resolve(students);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

export const exportStudentsToExcel = (students: Student[], fileName: string) => {
  const data = [
    ['apellido y nombre', 'fecha de nacimiento', 'DNI', 'edad', 'domicilio'],
    ...students.map(s => [
      s.fullName,
      s.birthDate,
      s.dni,
      calculateAge(s.birthDate),
      s.address
    ])
  ];
  const ws = utils.aoa_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Alumnos');
  writeFile(wb, `${fileName}.xlsx`);
};

export const exportAllStudentsToExcel = (
  students: Student[], 
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO
) => {
  if (!students || students.length === 0) {
    alert('No hay alumnos registrados para exportar.');
    return;
  }

  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();
  const schoolAddress = schoolInfo.address ? `${schoolInfo.address} ` : '';
  const schoolPhone = schoolInfo.phone ? `| Tel: ${schoolInfo.phone} ` : '';
  const schoolCue = schoolInfo.cue ? `| CUE: ${schoolInfo.cue}` : '';

  // Ordenar primero por curso (1° a 6°) y luego alfabéticamente por apellido y nombre
  const sortedStudents = [...students].sort((a, b) => {
    if (a.course !== b.course) {
      return Number(a.course) - Number(b.course);
    }
    return a.fullName.localeCompare(b.fullName);
  });

  const todayFormatted = new Date().toLocaleDateString('es-AR');

  const rows: any[][] = [
    [schoolName.toUpperCase()],
    [`${schoolAddress}${schoolPhone}${schoolCue}`.trim()],
    [`PADRÓN GENERAL DE ESTUDIANTES - CICLO LECTIVO ${currentYear}`],
    [`Fecha de emisión: ${todayFormatted} | Total matriculados: ${students.length} alumnos`],
    [''],
    [
      'N° Orden',
      'Apellido y Nombre',
      'Curso / Año',
      'Ciclo Curricular',
      'DNI',
      'Fecha de Nacimiento',
      'Edad Actual',
      'Domicilio',
      'Condición Académica'
    ],
  ];

  sortedStudents.forEach((student, index) => {
    const cycle = Number(student.course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado (Agropecuaria)';
    const status = getPromotionStatus(student).status;
    rows.push([
      index + 1,
      student.fullName,
      `${student.course}° Año`,
      cycle,
      student.dni || 'Sin registrar',
      student.birthDate || 'No informada',
      calculateAge(student.birthDate),
      student.address || 'No declarado',
      status
    ]);
  });

  const ws = utils.aoa_to_sheet(rows);

  // Anchos de columnas para apertura óptima en Excel
  ws['!cols'] = [
    { wch: 10 }, // N°
    { wch: 34 }, // Apellido y Nombre
    { wch: 14 }, // Curso
    { wch: 28 }, // Ciclo
    { wch: 16 }, // DNI
    { wch: 20 }, // Fec Nac
    { wch: 12 }, // Edad
    { wch: 35 }, // Domicilio
    { wch: 20 }, // Condición
  ];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Padrón Completo');

  // Hojas individuales por cada año lectivo (1° a 6° año)
  (['1', '2', '3', '4', '5', '6'] as CourseYear[]).forEach((year) => {
    const courseStudents = sortedStudents.filter(s => s.course === year);
    if (courseStudents.length > 0) {
      const courseRows: any[][] = [
        [`${schoolName.toUpperCase()} - ${year}° AÑO`],
        [`Ciclo Lectivo ${currentYear} • Total: ${courseStudents.length} alumnos`],
        [''],
        ['N°', 'Apellido y Nombre', 'DNI', 'Fecha de Nacimiento', 'Edad', 'Domicilio', 'Condición'],
        ...courseStudents.map((s, idx) => [
          idx + 1,
          s.fullName,
          s.dni || 'Sin registrar',
          s.birthDate || 'No informada',
          calculateAge(s.birthDate),
          s.address || 'No declarado',
          getPromotionStatus(s).status
        ])
      ];
      const courseWs = utils.aoa_to_sheet(courseRows);
      courseWs['!cols'] = [
        { wch: 6 },
        { wch: 34 },
        { wch: 16 },
        { wch: 20 },
        { wch: 10 },
        { wch: 35 },
        { wch: 18 }
      ];
      utils.book_append_sheet(wb, courseWs, `${year}° Año`);
    }
  });

  writeFile(wb, `Listado_Completo_Estudiantes_Los_Bulacios_${currentYear}.xlsx`);
};

export const importTeachersFromExcel = async (file: File): Promise<Teacher[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[][] = utils.sheet_to_json(worksheet, { header: 1 });
        
        const teachers: Teacher[] = jsonData.slice(1).map((row) => ({
          id: row[2] ? String(row[2]) : Math.random().toString(36).substr(2, 9),
          fullName: String(row[0] || '') + (row[1] ? ' ' + String(row[1]) : ''),
          dni: String(row[2] || ''),
          birthDate: parseExcelDate(row[3]),
          legajo: String(row[4] || ''),
          entryDate: parseExcelDate(row[5]),
          exitDate: row[6] ? parseExcelDate(row[6]) : undefined,
          address: row[7] || '',
          hours: Number(row[8] || 0),
          phone: String(row[9] || ''),
          email: String(row[10] || ''),
          assignedCourses: [],
          attendance: []
        })).filter(t => t.dni !== '');
        
        resolve(teachers);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

export const exportExTeachersToExcel = (exTeachers: Teacher[]) => {
  const data = [
    ['apellido y nombre', 'DNI', 'legajo', 'fecha de ingreso', 'fecha de egreso', 'motivo'],
    ...exTeachers.map(t => [
      t.fullName,
      t.dni,
      t.legajo,
      t.entryDate,
      t.exitDate || '-',
      'Baja/Renuncia'
    ])
  ];
  const ws = utils.aoa_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Ex-Docentes');
  writeFile(wb, `BBDD_Ex_Docentes_${new Date().getFullYear()}.xlsx`);
};

export const exportTeacherReportToExcel = (
  teacher: Teacher, 
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO
) => {
  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();

  const data: any[] = [
    [schoolName.toUpperCase()],
    [`INFORME DE NOVEDADES DOCENTES - CICLO LECTIVO ${currentYear}`],
    [schoolInfo.address ? `${schoolInfo.address} ${schoolInfo.phone ? `| Tel: ${schoolInfo.phone}` : ''}` : ''],
    [''],
    ['Docente:', teacher.fullName],
    ['DNI:', teacher.dni],
    ['Espacios Curriculares:', teacher.assignedCourses.map(c => `${c.subject} (${c.course}°)`).join(', ')],
    [''],
    ['N° Orden', 'tipo de Licencia', 'fecha desde', 'fecha Hasta', 'fecha de presentación']
  ];

  teacher.attendance.forEach((att, index) => {
    data.push([
      index + 1,
      att.type === 'licencia' ? (att.licenseCode || 'Licencia') : att.type.replace('_', ' ').toUpperCase(),
      att.licenseDetails?.from || att.date,
      att.licenseDetails?.to || att.date,
      att.licenseDetails?.presentationDate || '-'
    ]);
  });

  const ws = utils.aoa_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Novedades');
  writeFile(wb, `Informe_Novedades_${teacher.fullName.replace(/ /g, '_')}.xlsx`);
};

export const exportBulletinToExcel = (
  student: Student, 
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO
) => {
  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();
  const subjects = SUBJECTS_BY_YEAR[student.course];
  
  const data: any[] = [
    [schoolName.toUpperCase()],
    [`BOLETÍN DE CALIFICACIONES - CICLO LECTIVO ${currentYear}`],
    [schoolInfo.address ? `${schoolInfo.address} ${schoolInfo.phone ? `| Tel: ${schoolInfo.phone}` : ''}` : ''],
    [''],
    ['Alumno:', student.fullName],
    ['Curso:', student.course + '° Año'],
    ['DNI:', student.dni],
    [''],
    ['Espacio Curricular', '1° Trimestre', '2° Trimestre', '3° Trimestre', 'Nota Final']
  ];

  subjects.forEach(subject => {
    const g = student.grades[subject] || {};
    data.push([
      subject,
      g.trimestre1 || '-',
      g.trimestre2 || '-',
      g.trimestre3 || '-',
      g.final || '-'
    ]);
  });
  
  data.push(['']);
  data.push(['RESUMEN DE ASISTENCIA']);
  data.push(['Presentes:', student.attendance.filter(a => a.type === 'presente').length]);
  data.push(['Inasistencias:', student.attendance.filter(a => a.type === 'ausente').length]);
  data.push(['Llegadas Tarde:', student.attendance.filter(a => a.type === 'tarde').length]);
  data.push(['']);
  data.push(['ESTADO FINAL:', getPromotionStatus(student).status.toUpperCase()]);
  data.push(['']);
  data.push(['', '', '']);
  data.push(['________________', '________________', '________________']);
  data.push([schoolInfo.principalName || 'Firma Directivo', 'Firma Padres/Tutor', 'Firma Preceptor']);

  const ws = utils.aoa_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Boletín');
  writeFile(wb, `Boletin_${student.fullName.replace(/ /g, '_')}_${currentYear}.xlsx`);
};

export const getPromotionStatus = (student: Student): { status: string; failedCount: number; details: string } => {
  const subjects = SUBJECTS_BY_YEAR[student.course];
  let failedCount = 0;
  
  subjects.forEach(sub => {
    const final = student.grades[sub]?.final;
    // Si la nota final es menor a 6, se considera desaprobada
    if (final !== undefined && final < 6) {
      failedCount++;
    } else if (final === undefined) {
      // Si aún no hay nota final, no lo contamos para la promoción final aún
    }
  });

  if (failedCount >= 3) {
    return { status: 'Repite', failedCount, details: `${failedCount} materias desaprobadas` };
  }
  
  // Si tiene cargadas todas las materias y ninguna desaprobada
  const allGraded = subjects.every(s => student.grades[s]?.final !== undefined);
  if (allGraded && failedCount === 0) {
    return { status: 'Promocionado', failedCount, details: 'Todas las materias aprobadas' };
  }
  
  return { 
    status: 'Regular', 
    failedCount, 
    details: failedCount > 0 ? `${failedCount} materia(s) a coloquio/recuperar` : 'En curso regular' 
  };
};

export { 
  generateStudentPDFReport,
  exportStudentsListPDF,
  exportTeachersListPDF,
  generateTeacherPDFReport
} from './pdfExport';
export { 
  downloadDatabaseBackupJson, 
  buildDatabaseBackup, 
  validateBackupContent,
  getBackupStatus,
  getLastBackupDate 
} from './backupService';
