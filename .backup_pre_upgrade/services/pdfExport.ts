import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Student, Teacher, CourseYear, SUBJECTS_BY_YEAR, SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';
import { calculateAge, getPromotionStatus } from './utils';

export const generateStudentPDFReport = (
  student: Student, 
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO
) => {
  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolAddress = schoolInfo.address || DEFAULT_SCHOOL_INFO.address;
  const schoolPhone = schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : '';
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const todayFormatted = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // ===================== ENCABEZADO INSTITUCIONAL =====================
  // Barra superior decorativa
  doc.setFillColor(30, 58, 138); // Blue 900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Franja dorada decorativa
  doc.setFillColor(234, 179, 8); // Gold/Amber
  doc.rect(0, 28, pageWidth, 2.5, 'F');

  // Textos del encabezado
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254);
  const locationSub = `${schoolAddress}${schoolPhone}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}`;
  doc.text(locationSub, pageWidth / 2, 17, { align: 'center' });
  doc.text(`CICLO LECTIVO ${currentYear} • DOCUMENTO OFICIAL DE TRAYECTORIA ESCOLAR`, pageWidth / 2, 23, { align: 'center' });

  // Título del Reporte
  let currentY = 37;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('REPORTE INTEGRAL DE SITUACIÓN ACADÉMICA Y ASISTENCIA', pageWidth / 2, currentY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Fecha de emisión: ${todayFormatted} | Sistema de Gestión Escolar`, pageWidth / 2, currentY + 5, { align: 'center' });

  // ===================== DATOS DEL ESTUDIANTE =====================
  currentY += 10;
  const promotion = getPromotionStatus(student);
  const age = calculateAge(student.birthDate);

  // Cuadro contenedor
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 30, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  // Columna 1
  doc.setFont('helvetica', 'bold');
  doc.text('Estudiante:', 18, currentY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(student.fullName.toUpperCase(), 37, currentY + 7);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('DNI:', 18, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(student.dni || 'Sin registrar', 37, currentY + 14);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Fec. Nac.:', 18, currentY + 21);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${student.birthDate || 'No informada'} (${age} años)`, 37, currentY + 21);

  // Columna 2
  const col2X = 110;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Curso / Año:', col2X, currentY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const cycleText = Number(student.course) <= 3 ? 'Ciclo Básico Común' : 'Ciclo Orientado (Agropecuaria)';
  doc.text(`${student.course}° Año (${cycleText})`, col2X + 22, currentY + 7);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Domicilio:', col2X, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  const addressText = doc.splitTextToSize(student.address || 'No declarado', 65);
  doc.text(addressText, col2X + 22, currentY + 14);

  // Estado de promoción en badge
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Condición:', col2X, currentY + 23);

  let badgeColor = [22, 163, 74]; // Green
  let badgeText = promotion.status.toUpperCase();
  if (promotion.status === 'Repite') {
    badgeColor = [220, 38, 38]; // Red
  } else if (promotion.status === 'Regular') {
    badgeColor = [37, 99, 235]; // Blue
  }

  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.roundedRect(col2X + 22, currentY + 19, 36, 6, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(badgeText, col2X + 40, currentY + 23.2, { align: 'center' });

  // ===================== TABLA DE CALIFICACIONES =====================
  currentY += 34;

  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. RENDIMIENTO ACADÉMICO Y CALIFICACIONES TRIMESTRALES', 14, currentY);

  const subjects = SUBJECTS_BY_YEAR[student.course] || [];
  let sumFinals = 0;
  let finalCount = 0;
  let passedCount = 0;
  let failedCount = 0;

  const tableBody = subjects.map((subject) => {
    const grade = student.grades[subject] || {};
    const t1 = grade.trimestre1 !== undefined ? String(grade.trimestre1) : '-';
    const t2 = grade.trimestre2 !== undefined ? String(grade.trimestre2) : '-';
    const t3 = grade.trimestre3 !== undefined ? String(grade.trimestre3) : '-';
    const fn = grade.final !== undefined ? String(grade.final) : '-';

    let condition = 'En Curso';
    if (grade.final !== undefined) {
      sumFinals += grade.final;
      finalCount++;
      if (grade.final >= 6) {
        condition = 'Aprobado';
        passedCount++;
      } else {
        condition = 'Desaprobado';
        failedCount++;
      }
    }

    return [subject, t1, t2, t3, fn, condition];
  });

  const finalAvg = finalCount > 0 ? (sumFinals / finalCount).toFixed(2) : '-';

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Espacio Curricular', '1° Trim.', '2° Trim.', '3° Trim.', 'Nota Final', 'Estado']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 20, halign: 'center' },
    },
    didParseCell: (data) => {
      // Formato condicional de notas en tabla
      if (data.section === 'body' && (data.column.index === 4 || data.column.index === 5)) {
        const row = data.row.raw as string[];
        const finalVal = parseFloat(row[4]);
        if (!isNaN(finalVal)) {
          if (finalVal >= 6) {
            data.cell.styles.textColor = [37, 99, 235]; // Azul
          } else if (finalVal >= 4) {
            data.cell.styles.textColor = [22, 163, 74]; // Verde
          } else {
            data.cell.styles.textColor = [220, 38, 38]; // Rojo
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore (jsPDF AutoTable adds lastAutoTable to doc)
  let afterTableY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 4 : currentY + 70;

  // Resumen de calificaciones
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, afterTableY, pageWidth - 28, 8, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(`Promedio General: ${finalAvg}  |  Materias Aprobadas: ${passedCount}  |  Adeudadas / A recursar: ${failedCount}  |  Criterio: Aplazo (1-3) • Desaprobado (4-5) • Aprobado (6-10)`, 17, afterTableY + 5.2);

  // ===================== SECCIÓN DE ASISTENCIA =====================
  currentY = afterTableY + 12;

  // Si nos estamos quedando sin espacio en la página, iniciamos nueva página
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = 20;
  }

  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. REGISTRO Y COMPUTO DE ASISTENCIAS', 14, currentY);

  const totalAttendance = student.attendance ? student.attendance.length : 0;
  const presentes = student.attendance ? student.attendance.filter((a) => a.type === 'presente').length : 0;
  const tardes = student.attendance ? student.attendance.filter((a) => a.type === 'tarde').length : 0;
  const ausentes = student.attendance ? student.attendance.filter((a) => a.type === 'ausente').length : 0;
  const justificadas = student.attendance ? student.attendance.filter((a) => a.justified).length : 0;

  // Porcentaje de asistencia: presentes + tardes*0.5
  const effectivePresent = presentes + tardes * 0.5;
  const attendancePercentage = totalAttendance > 0 ? ((effectivePresent / totalAttendance) * 100).toFixed(1) : '100.0';
  const attendanceNum = parseFloat(attendancePercentage);

  const attBoxY = currentY + 3;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, attBoxY, pageWidth - 28, 20, 2.5, 2.5, 'FD');

  const cardWidth = (pageWidth - 28) / 4;

  // Stat 1: Total días
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Jornadas Registradas', 14 + cardWidth * 0 + 6, attBoxY + 6);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalAttendance}`, 14 + cardWidth * 0 + 6, attBoxY + 14);

  // Stat 2: Presentes y Tardes
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Presentes / Tardanzas', 14 + cardWidth * 1 + 6, attBoxY + 6);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text(`${presentes}`, 14 + cardWidth * 1 + 6, attBoxY + 14);
  doc.setFontSize(9);
  doc.setTextColor(217, 119, 6);
  doc.text(` (${tardes} tardes)`, 14 + cardWidth * 1 + 18, attBoxY + 14);

  // Stat 3: Inasistencias
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Inasistencias (Justif.)', 14 + cardWidth * 2 + 6, attBoxY + 6);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(220, 38, 38);
  doc.text(`${ausentes}`, 14 + cardWidth * 2 + 6, attBoxY + 14);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(` (${justificadas} just.)`, 14 + cardWidth * 2 + 18, attBoxY + 14);

  // Stat 4: Asistencia %
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('% Presentismo Efectivo', 14 + cardWidth * 3 + 6, attBoxY + 6);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  if (attendanceNum >= 80) {
    doc.setTextColor(30, 58, 138);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.text(`${attendancePercentage}%`, 14 + cardWidth * 3 + 6, attBoxY + 14);

  // ===================== OBSERVACIONES MÉDICAS Y DE CONDUCTA =====================
  currentY = attBoxY + 24;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Observaciones Sanitarias y Disciplinarias:', 17, currentY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  const medNotes = student.medical?.treatments || student.medical?.notes || 'Sin observaciones médicas registradas';
  const discCount = student.disciplinary ? student.disciplinary.length : 0;
  const discText = discCount > 0 ? `${discCount} llamado(s) de atención registrados` : 'Conducta regular sin sanciones disciplinarias';
  doc.text(`• Ficha Médica: ${medNotes}   |   • Disciplina: ${discText}`, 17, currentY + 10);

  // ===================== FIRMAS INSTITUCIONALES =====================
  currentY += 19;

  // Si no entra en la página, añadir página
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = 25;
  }

  const sigWidth = 50;
  const space = (pageWidth - 28 - sigWidth * 3) / 2;

  const sig1X = 14;
  const sig2X = sig1X + sigWidth + space;
  const sig3X = sig2X + sigWidth + space;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);

  // Línea 1
  doc.line(sig1X, currentY + 12, sig1X + sigWidth, currentY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(schoolInfo.principalName || 'Firma de Dirección', sig1X + sigWidth / 2, currentY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(schoolName, sig1X + sigWidth / 2, currentY + 19.5, { align: 'center' });

  // Línea 2
  doc.line(sig2X, currentY + 12, sig2X + sigWidth, currentY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Firma del Padre / Tutor', sig2X + sigWidth / 2, currentY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Aclaración y DNI', sig2X + sigWidth / 2, currentY + 19.5, { align: 'center' });

  // Línea 3
  doc.line(sig3X, currentY + 12, sig3X + sigWidth, currentY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Preceptoría / Secretaría', sig3X + sigWidth / 2, currentY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Sello y Notificación', sig3X + sigWidth / 2, currentY + 19.5, { align: 'center' });

  // Pie de página con numeración
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • ${schoolAddress}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // Descarga directa del archivo PDF
  const sanitizedName = student.fullName.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
  doc.save(`Informe_Academico_${sanitizedName}_${student.dni || 'S-DNI'}.pdf`);
};

/**
 * Exporta el listado de alumnos en formato PDF con diseño institucional (A4 horizontal)
 */
export const exportStudentsListPDF = (
  students: Student[],
  courseYear: CourseYear | 'all' = 'all',
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO,
  filterDescription?: string
) => {
  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolAddress = schoolInfo.address || DEFAULT_SCHOOL_INFO.address;
  const schoolPhone = schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : '';
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();

  // A4 horizontal: 297mm ancho x 210mm alto
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const todayFormatted = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Encabezado institucional decorativo
  doc.setFillColor(30, 58, 138); // Azul institucional
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setFillColor(234, 179, 8); // Franja dorada
  doc.rect(0, 24, pageWidth, 2.5, 'F');

  // Textos del encabezado
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 9, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254);
  const locationSub = `${schoolAddress}${schoolPhone}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''} • CICLO LECTIVO ${currentYear}`;
  doc.text(locationSub, pageWidth / 2, 15, { align: 'center' });

  // Título del documento
  const courseTitle = courseYear === 'all' 
    ? 'NÓMINA GENERAL DE ESTUDIANTES MATRICULADOS' 
    : `PLANILLA OFICIAL DE ALUMNOS REGULARES - ${courseYear}° AÑO`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(courseTitle, pageWidth / 2, 21.5, { align: 'center' });

  // Barra de datos y filtros
  let currentY = 32;
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Total Alumnos: ${students.length}`, 14, currentY);

  if (filterDescription) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Filtro: ${filterDescription}`, 60, currentY);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Fecha de Emisión: ${todayFormatted} | Sistema de Gestión Escolar`, pageWidth - 14, currentY, { align: 'right' });

  // Preparación del cuerpo de la tabla
  const tableRows = students.map((student, index) => {
    const age = calculateAge(student.birthDate);
    const birthInfo = student.birthDate ? `${student.birthDate} (${age}a)` : `${age} años`;
    return [
      String(index + 1),
      student.fullName.toUpperCase(),
      student.dni || 'S/D',
      `${student.course}° Año`,
      birthInfo,
      student.address || 'No registrado',
      '' // Espacio en blanco para firma / observaciones / tilde
    ];
  });

  autoTable(doc, {
    startY: currentY + 3,
    head: [['N°', 'APELLIDO Y NOMBRE', 'DNI', 'CURSO', 'FEC. NAC. (EDAD)', 'DOMICILIO / LOCALIDAD', 'FIRMA / OBSERVACIONES']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 65, halign: 'left', fontStyle: 'bold' },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 38, halign: 'center' },
      5: { cellWidth: 64, halign: 'left' },
      6: { cellWidth: 44, halign: 'center' },
    },
    margin: { left: 14, right: 14, bottom: 28 },
  });

  // @ts-ignore
  let afterTableY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : currentY + 120;

  // Si no hay suficiente espacio para las firmas en la página actual, agregar página
  if (afterTableY > pageHeight - 32) {
    doc.addPage();
    afterTableY = 25;
  }

  // Firmas institucionales
  const sigWidth = 65;
  const sigSpacing = (pageWidth - 28 - (sigWidth * 3)) / 2;
  const sig1X = 14;
  const sig2X = sig1X + sigWidth + sigSpacing;
  const sig3X = sig2X + sigWidth + sigSpacing;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);

  // Firma 1: Preceptoría
  doc.line(sig1X, afterTableY + 12, sig1X + sigWidth, afterTableY + 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Preceptoría de Curso', sig1X + sigWidth / 2, afterTableY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Firma y Aclaración', sig1X + sigWidth / 2, afterTableY + 19.5, { align: 'center' });

  // Firma 2: Secretaría
  doc.line(sig2X, afterTableY + 12, sig2X + sigWidth, afterTableY + 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Secretaría Escolar', sig2X + sigWidth / 2, afterTableY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Control y Registro de Matrícula', sig2X + sigWidth / 2, afterTableY + 19.5, { align: 'center' });

  // Firma 3: Dirección
  doc.line(sig3X, afterTableY + 12, sig3X + sigWidth, afterTableY + 12);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(schoolInfo.principalName || 'Dirección Institucional', sig3X + sigWidth / 2, afterTableY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(schoolName, sig3X + sigWidth / 2, afterTableY + 19.5, { align: 'center' });

  // Pie de página con numeración en todas las hojas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • Sistema de Gestión Escolar • Generado el ${todayFormatted}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  // Nombre de archivo limpio
  const cleanCourse = courseYear === 'all' ? 'General_Todos' : `Curso_${courseYear}`;
  doc.save(`Nomina_Alumnos_${cleanCourse}_${currentYear}.pdf`);
};

/**
 * Exporta la nómina general de docentes en formato PDF institucional (A4 horizontal)
 */
export const exportTeachersListPDF = (
  teachers: Teacher[],
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO,
  courseFilter: CourseYear | 'all' = 'all'
) => {
  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolAddress = schoolInfo.address || DEFAULT_SCHOOL_INFO.address;
  const schoolPhone = schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : '';
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();

  // A4 horizontal: 297mm ancho x 210mm alto
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const todayFormatted = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Encabezado institucional decorativo
  doc.setFillColor(30, 58, 138); // Azul institucional
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setFillColor(234, 179, 8); // Franja dorada
  doc.rect(0, 24, pageWidth, 2.5, 'F');

  // Textos del encabezado
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 9, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254);
  const locationSub = `${schoolAddress}${schoolPhone}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''} • CICLO LECTIVO ${currentYear}`;
  doc.text(locationSub, pageWidth / 2, 15, { align: 'center' });

  // Título del documento
  const subTitle = courseFilter === 'all'
    ? 'PLANTA ORGÁNICO FUNCIONAL (P.O.F.) / NÓMINA GENERAL DOCENTE'
    : `NÓMINA DE PERSONAL DOCENTE ASIGNADO A ${courseFilter}° AÑO`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(subTitle, pageWidth / 2, 21.5, { align: 'center' });

  // Resumen métrico
  const totalHours = teachers.reduce((acc, t) => acc + (Number(t.hours) || 0), 0);
  let currentY = 32;

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`Total Docentes: ${teachers.length}   |   Total Horas Cátedra Asignadas: ${totalHours} hs`, 14, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(`Fecha de Emisión: ${todayFormatted} | Sistema de Gestión Escolar`, pageWidth - 14, currentY, { align: 'right' });

  // Filas de docentes
  const tableRows = teachers.map((teacher, index) => {
    const assignedText = teacher.assignedCourses && teacher.assignedCourses.length > 0
      ? teacher.assignedCourses.map(c => `${c.course}°: ${c.subject}`).join(', ')
      : 'Sin asignación registrada';

    const contactText = [teacher.phone, teacher.email].filter(Boolean).join('\n') || 'S/D';

    return [
      String(index + 1),
      teacher.legajo || 'S/L',
      teacher.fullName.toUpperCase(),
      teacher.dni || 'S/D',
      `${teacher.hours || 0} hs`,
      assignedText,
      contactText,
      '' // Espacio para firma / observación
    ];
  });

  autoTable(doc, {
    startY: currentY + 3,
    head: [['N°', 'LEGAJO', 'APELLIDO Y NOMBRE', 'DNI', 'HORAS', 'ESPACIOS CURRICULARES ASIGNADOS', 'CONTACTO (TEL / EMAIL)', 'FIRMA / ASISTENCIA']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 54, halign: 'left', fontStyle: 'bold' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 73, halign: 'left' },
      6: { cellWidth: 38, halign: 'left', fontSize: 7 },
      7: { cellWidth: 30, halign: 'center' },
    },
    margin: { left: 14, right: 14, bottom: 28 },
  });

  // @ts-ignore
  let afterTableY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : currentY + 120;

  if (afterTableY > pageHeight - 32) {
    doc.addPage();
    afterTableY = 25;
  }

  // Firmas institucionales
  const sigWidth = 70;
  const sigSpacing = (pageWidth - 28 - (sigWidth * 2));
  const sig1X = 14;
  const sig2X = sig1X + sigWidth + sigSpacing;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);

  // Firma 1: Secretaría Docente
  doc.line(sig1X, afterTableY + 12, sig1X + sigWidth, afterTableY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Secretaría Docente y Personal', sig1X + sigWidth / 2, afterTableY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Revisión y Confección de Nómina', sig1X + sigWidth / 2, afterTableY + 19.5, { align: 'center' });

  // Firma 2: Dirección Institucional
  doc.line(sig2X, afterTableY + 12, sig2X + sigWidth, afterTableY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(schoolInfo.principalName || 'Dirección Institucional', sig2X + sigWidth / 2, afterTableY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(schoolName, sig2X + sigWidth / 2, afterTableY + 19.5, { align: 'center' });

  // Paginación
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • Planta Orgánico Funcional • Generado el ${todayFormatted}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  doc.save(`Nomina_Docente_${courseFilter === 'all' ? 'General' : `Curso_${courseFilter}`}_${currentYear}.pdf`);
};

/**
 * Genera el informe institucional individual de un docente en PDF (A4 vertical)
 */
export const generateTeacherPDFReport = (
  teacher: Teacher,
  schoolInfoInput: SchoolInfo | string = DEFAULT_SCHOOL_INFO
) => {
  const schoolInfo: SchoolInfo = typeof schoolInfoInput === 'string'
    ? { ...DEFAULT_SCHOOL_INFO, name: schoolInfoInput }
    : { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };

  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolAddress = schoolInfo.address || DEFAULT_SCHOOL_INFO.address;
  const schoolPhone = schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : '';
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const todayFormatted = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Encabezado institucional
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setFillColor(234, 179, 8);
  doc.rect(0, 28, pageWidth, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(219, 234, 254);
  const locationSub = `${schoolAddress}${schoolPhone}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}`;
  doc.text(locationSub, pageWidth / 2, 17, { align: 'center' });
  doc.text(`CICLO LECTIVO ${currentYear} • LEGAJO INSTITUCIONAL DOCENTE`, pageWidth / 2, 23, { align: 'center' });

  // Título
  let currentY = 37;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FICHA PERSONAL Y FUNCIONAL DEL DOCENTE', pageWidth / 2, currentY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Fecha de emisión: ${todayFormatted} | Sistema de Gestión Escolar`, pageWidth / 2, currentY + 5, { align: 'center' });

  // Datos del docente
  currentY += 10;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, pageWidth - 28, 28, 3, 3, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Docente:', 18, currentY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(teacher.fullName.toUpperCase(), 38, currentY + 7);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('DNI:', 18, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(teacher.dni || 'Sin registrar', 38, currentY + 14);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Legajo:', 18, currentY + 21);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(teacher.legajo || 'Sin asignar', 38, currentY + 21);

  const col2X = 110;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Carga Horaria:', col2X, currentY + 7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${teacher.hours || 0} Horas Cátedra`, col2X + 25, currentY + 7);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha Ingreso:', col2X, currentY + 14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(teacher.entryDate || 'No informada', col2X + 25, currentY + 14);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('Contacto:', col2X, currentY + 21);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`${teacher.phone || 'S/Tel'} • ${teacher.email || 'S/Email'}`, col2X + 25, currentY + 21);

  // Espacios curriculares asignados
  currentY += 34;
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. ASIGNACIÓN DE ESPACIOS CURRICULARES Y CURSOS', 14, currentY);

  const coursesRows = (teacher.assignedCourses || []).map((c, i) => [
    String(i + 1),
    `${c.course}° Año`,
    Number(c.course) <= 3 ? 'Ciclo Básico Común' : 'Ciclo Orientado',
    c.subject,
    'Titular / En función'
  ]);

  autoTable(doc, {
    startY: currentY + 3,
    head: [['N°', 'Curso', 'Ciclo', 'Espacio Curricular', 'Situación de Revista']],
    body: coursesRows.length > 0 ? coursesRows : [['-', '-', '-', 'Sin espacios curriculares asignados actualmente', '-']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2, lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 70, halign: 'left', fontStyle: 'bold' },
      4: { cellWidth: 35, halign: 'center' },
    },
    margin: { left: 14, right: 14 }
  });

  // @ts-ignore
  let afterCoursesY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : currentY + 45;

  // Registro de asistencias y licencias
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. HISTORIAL DE LICENCIAS Y NOVEDADES REGISTRADAS', 14, afterCoursesY);

  const attRows = (teacher.attendance || []).map((a, i) => [
    String(i + 1),
    a.date,
    a.type.toUpperCase().replace('_', ' '),
    a.licenseCode || a.licenseDetails?.licenseCode || '-',
    a.licenseDetails ? `${a.licenseDetails.from} al ${a.licenseDetails.to}` : '-',
    a.licenseDetails?.presentationDate || a.notes || '-'
  ]);

  autoTable(doc, {
    startY: afterCoursesY + 3,
    head: [['N°', 'Fecha', 'Tipo Novedad', 'Artículo / Código', 'Período', 'Constancia / Nota']],
    body: attRows.length > 0 ? attRows : [['-', '-', 'Sin novedades registradas', '-', '-', '-']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 42, halign: 'center' },
      3: { cellWidth: 32, halign: 'center' },
      4: { cellWidth: 35, halign: 'center' },
      5: { cellWidth: 35, halign: 'left' },
    },
    margin: { left: 14, right: 14 }
  });

  // @ts-ignore
  let afterAttY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : afterCoursesY + 45;

  if (afterAttY > pageHeight - 35) {
    doc.addPage();
    afterAttY = 25;
  }

  // Firmas
  const sigWidth = 55;
  const space = (pageWidth - 28 - sigWidth * 2);
  const sig1X = 14;
  const sig2X = sig1X + sigWidth + space;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);

  doc.line(sig1X, afterAttY + 12, sig1X + sigWidth, afterAttY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Firma del Docente', sig1X + sigWidth / 2, afterAttY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Conformidad', sig1X + sigWidth / 2, afterAttY + 19.5, { align: 'center' });

  doc.line(sig2X, afterAttY + 12, sig2X + sigWidth, afterAttY + 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(schoolInfo.principalName || 'Dirección Institucional', sig2X + sigWidth / 2, afterAttY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(schoolName, sig2X + sigWidth / 2, afterAttY + 19.5, { align: 'center' });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • Legajo Docente`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const cleanName = teacher.fullName.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
  doc.save(`Ficha_Docente_${cleanName}_${teacher.legajo || 'SL'}.pdf`);
};
