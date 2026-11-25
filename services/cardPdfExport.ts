import jsPDF from 'jspdf';
import {
  Student,
  Teacher,
  SchoolInfo,
  CardDesignConfig,
  IssuedCardRecord,
} from '../types';
import {
  buildStudentQRPayload,
  buildTeacherQRPayload,
  generateQRDataUrl,
  maskDniForPrivacy,
} from './qrService';
import { slugifyFileName } from './storageService';

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = (hex || '#0284c7').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
};

const safeAddImage = (
  doc: jsPDF,
  dataUrl: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
  try {
    const format = dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
    doc.addImage(dataUrl, format, x, y, w, h, undefined, 'FAST');
  } catch {
    // Ignorar formatos no soportados por jsPDF (ej. SVG sin rasterizar)
  }
};

export interface PrintableCardItem {
  personType: 'student' | 'teacher';
  personId: string;
  fullName: string;
  subtitle: string; // Curso/División o Cargo
  secondaryLine?: string; // Ciclo o Área/Materias
  dniMaskedOrVisible?: string;
  photo?: string;
  cardRecord: IssuedCardRecord;
  qrDataUrl: string;
}

export const buildStudentPrintableCard = async (
  student: Student,
  schoolInfo: SchoolInfo,
  cardRecord: IssuedCardRecord,
  config: CardDesignConfig
): Promise<PrintableCardItem> => {
  const override = cardRecord.visualOverride;
  const payload = buildStudentQRPayload(student, schoolInfo, cardRecord, config);
  const qrDataUrl = await generateQRDataUrl(payload, 260);
  const displayName = override?.displayName?.trim() || student.fullName;
  const divisionText = override?.customSubtitle?.trim()
    || (config.showStudentDivision && student.division ? `División ${student.division}` : '');
  const courseText = `${student.course}° Año${divisionText ? ` • ${divisionText}` : ''}`;
  const cycleText = Number(student.course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado';
  const showPhoto = config.showStudentPhoto && !override?.hidePhoto;
  const photo = showPhoto ? (override?.displayPhoto || student.photo) : undefined;

  return {
    personType: 'student',
    personId: student.id,
    fullName: displayName,
    subtitle: courseText,
    secondaryLine: override?.customArea?.trim() || cycleText,
    dniMaskedOrVisible: config.showStudentDniMasked ? maskDniForPrivacy(student.dni) : undefined,
    photo,
    cardRecord,
    qrDataUrl,
  };
};

export const buildTeacherPrintableCard = async (
  teacher: Teacher,
  schoolInfo: SchoolInfo,
  cardRecord: IssuedCardRecord,
  config: CardDesignConfig
): Promise<PrintableCardItem> => {
  const override = cardRecord.visualOverride;
  const payload = buildTeacherQRPayload(teacher, schoolInfo, cardRecord, config);
  const qrDataUrl = await generateQRDataUrl(payload, 260);
  const displayName = override?.displayName?.trim() || teacher.fullName;
  const roleLabel = override?.customSubtitle?.trim() || teacher.role || 'Personal Docente';
  const subjectsList = teacher.assignedCourses?.length
    ? Array.from(new Set(teacher.assignedCourses.map((c) => `${c.course}° ${c.subject}`)))
        .slice(0, 2)
        .join(' • ')
    : `Legajo ${teacher.legajo || 'S/L'}`;
  const showPhoto = config.showTeacherPhoto && !override?.hidePhoto;
  const photo = showPhoto ? (override?.displayPhoto || teacher.photo) : undefined;

  return {
    personType: 'teacher',
    personId: teacher.id,
    fullName: displayName,
    subtitle: roleLabel,
    secondaryLine: config.showTeacherSubjects ? (override?.customArea?.trim() || subjectsList) : `Legajo ${teacher.legajo || 'S/L'}`,
    dniMaskedOrVisible: config.showTeacherDni ? (teacher.dni || undefined) : undefined,
    photo,
    cardRecord,
    qrDataUrl,
  };
};

const drawCardFront = (
  doc: jsPDF,
  item: PrintableCardItem,
  schoolInfo: SchoolInfo,
  config: CardDesignConfig,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  const [pR, pG, pB] = hexToRgb(config.primaryColor);
  const [sR, sG, sB] = hexToRgb(config.secondaryColor);
  const [aR, aG, aB] = hexToRgb(config.accentColor);
  const isVertical = config.orientation === 'vertical';

  // Fondo blanco cristalino con borde suave
  doc.setFillColor(246, 252, 255);
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');

  // Franja superior Frutiger Aero
  const headerH = isVertical ? 18 : 14;
  doc.setFillColor(pR, pG, pB);
  doc.roundedRect(x, y, w, headerH, 3, 3, 'F');
  doc.rect(x, y + headerH - 3, w, 3, 'F');

  // Línea brillante aqua/turquesa inferior del encabezado
  doc.setFillColor(sR, sG, sB);
  doc.rect(x, y + headerH, w, 1.3, 'F');

  // Franja inferior decorativa verde agua
  doc.setFillColor(aR, aG, aB);
  doc.rect(x, y + h - 2.6, w, 2.6, 'F');

  // Escudo institucional en el encabezado si existe
  let textStartX = x + 3.5;
  if (schoolInfo.logo) {
    safeAddImage(doc, schoolInfo.logo, x + 2.5, y + 2, 10, 10);
    textStartX = x + 14;
  }

  // Nombre institución + tipo credencial
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isVertical ? 6.5 : 7.2);
  const schoolLines = doc.splitTextToSize(schoolInfo.name.toUpperCase(), w - (textStartX - x) - 3);
  doc.text(schoolLines.slice(0, 2), textStartX, y + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(224, 242, 254);
  const cardTitle = item.personType === 'student' ? config.studentCardTitle : config.teacherCardTitle;
  doc.text(`${cardTitle} • CICLO ${item.cardRecord.academicYear}`, textStartX, y + headerH - 2.2);

  if (!isVertical) {
    // HORIZONTAL LAYOUT (CR80 85.6 x 54 mm)
    const contentY = y + headerH + 3.2;
    let infoX = x + 3.8;

    if (item.photo) {
      doc.setFillColor(224, 242, 254);
      doc.setDrawColor(sR, sG, sB);
      doc.roundedRect(x + 3.2, contentY, 17.5, 22, 2, 2, 'FD');
      safeAddImage(doc, item.photo, x + 3.6, contentY + 0.4, 16.7, 21.2);
      infoX = x + 23;
    }

    const qrSize = 20.5;
    const qrX = x + w - qrSize - 3.2;
    const qrY = contentY + 0.5;

    // Caja QR
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(186, 230, 253);
    doc.roundedRect(qrX - 0.8, qrY - 0.8, qrSize + 1.6, qrSize + 1.6, 1.5, 1.5, 'FD');
    safeAddImage(doc, item.qrDataUrl, qrX, qrY, qrSize, qrSize);

    const maxInfoW = qrX - infoX - 2.5;
    doc.setTextColor(12, 45, 72);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    const nameLines = doc.splitTextToSize(item.fullName.toUpperCase(), maxInfoW);
    doc.text(nameLines.slice(0, 2), infoX, contentY + 4);

    const afterNameY = contentY + (nameLines.length > 1 ? 11.2 : 8.2);
    doc.setTextColor(pR, pG, pB);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.text(doc.splitTextToSize(item.subtitle, maxInfoW).slice(0, 1), infoX, afterNameY);

    if (item.secondaryLine) {
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(doc.splitTextToSize(item.secondaryLine, maxInfoW).slice(0, 2), infoX, afterNameY + 3.8);
    }

    if (item.dniMaskedOrVisible) {
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text(`DNI: ${item.dniMaskedOrVisible}`, infoX, y + h - 9.2);
    }

    // Pie de frente: N° Carnet y Vigencia
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`N° ${item.cardRecord.cardNumber}`, x + 3.5, y + h - 4.5);
    doc.setTextColor(pR, pG, pB);
    doc.text(`Válido hasta: ${item.cardRecord.validUntil}`, x + w - 3.5, y + h - 4.5, { align: 'right' });
  } else {
    // VERTICAL LAYOUT (54 x 85.6 mm)
    let cursorY = y + headerH + 3.5;
    if (item.photo) {
      const pW = 20;
      const pH = 24;
      const pX = x + (w - pW) / 2;
      doc.setFillColor(224, 242, 254);
      doc.setDrawColor(sR, sG, sB);
      doc.roundedRect(pX - 0.5, cursorY - 0.5, pW + 1, pH + 1, 2, 2, 'FD');
      safeAddImage(doc, item.photo, pX, cursorY, pW, pH);
      cursorY += pH + 4;
    } else {
      cursorY += 3;
    }

    doc.setTextColor(12, 45, 72);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const nameLines = doc.splitTextToSize(item.fullName.toUpperCase(), w - 7);
    doc.text(nameLines.slice(0, 2), x + w / 2, cursorY, { align: 'center' });
    cursorY += nameLines.length > 1 ? 7.5 : 4.5;

    doc.setTextColor(pR, pG, pB);
    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(item.subtitle, w - 7).slice(0, 1), x + w / 2, cursorY, { align: 'center' });
    cursorY += 3.8;

    if (item.secondaryLine) {
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.text(doc.splitTextToSize(item.secondaryLine, w - 7).slice(0, 1), x + w / 2, cursorY, { align: 'center' });
      cursorY += 3.5;
    }

    // QR centrado inferior
    const qrSize = 20;
    const qrX = x + (w - qrSize) / 2;
    const qrY = y + h - qrSize - 8.5;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(186, 230, 253);
    doc.roundedRect(qrX - 0.8, qrY - 0.8, qrSize + 1.6, qrSize + 1.6, 1.5, 1.5, 'FD');
    safeAddImage(doc, item.qrDataUrl, qrX, qrY, qrSize, qrSize);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(15, 23, 42);
    doc.text(`N° ${item.cardRecord.cardNumber} • Vence ${item.cardRecord.validUntil}`, x + w / 2, y + h - 4.3, {
      align: 'center',
    });
  }
};

const drawCardBack = (
  doc: jsPDF,
  item: PrintableCardItem,
  schoolInfo: SchoolInfo,
  config: CardDesignConfig,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  const [pR, pG, pB] = hexToRgb(config.primaryColor);
  const [sR, sG, sB] = hexToRgb(config.secondaryColor);

  doc.setFillColor(248, 253, 255);
  doc.setDrawColor(186, 230, 253);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 3, 3, 'FD');

  // Banda superior suave
  doc.setFillColor(pR, pG, pB);
  doc.rect(x, y + 3.5, w, 5.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.text('DORSO INSTITUCIONAL • CONDICIONES DE USO', x + w / 2, y + 7.2, { align: 'center' });

  let cursorY = y + 13;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.text(
    `Carnet N°: ${item.cardRecord.cardNumber}   |   Emitido: ${item.cardRecord.issuedAt}`,
    x + 3.5,
    cursorY
  );
  cursorY += 3.6;

  doc.setTextColor(pR, pG, pB);
  doc.text(
    `Vigencia hasta: ${item.cardRecord.validUntil}${schoolInfo.cue ? `   |   CUE: ${schoolInfo.cue}` : ''}`,
    x + 3.5,
    cursorY
  );
  cursorY += 4.5;

  // Leyenda institucional
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.7);
  const legendLines = doc.splitTextToSize(config.backUsageLegend, w - 7);
  doc.text(legendLines.slice(0, 4), x + 3.5, cursorY);
  cursorY += Math.min(legendLines.length, 4) * 2.7 + 2.5;

  // Datos de contacto institucional
  if (config.showContactOnBack) {
    doc.setFillColor(235, 248, 255);
    doc.setDrawColor(sR, sG, sB);
    doc.roundedRect(x + 3, cursorY - 1.5, w - 6, 12, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.6);
    doc.setTextColor(12, 45, 72);
    doc.text(doc.splitTextToSize(schoolInfo.name, w - 9).slice(0, 1), x + 4.5, cursorY + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(51, 65, 85);
    const contactLine1 = [schoolInfo.address, schoolInfo.locality].filter(Boolean).join(' - ');
    const contactLine2 = [
      schoolInfo.phone ? `Tel: ${schoolInfo.phone}` : '',
      schoolInfo.email || '',
    ]
      .filter(Boolean)
      .join(' • ');
    doc.text(doc.splitTextToSize(contactLine1, w - 9).slice(0, 1), x + 4.5, cursorY + 5.2);
    doc.text(doc.splitTextToSize(contactLine2 || config.backEmergencyNote, w - 9).slice(0, 1), x + 4.5, cursorY + 8.3);
  }

  // Firma autoridad en esquina inferior
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  const sigW = Math.min(34, w * 0.48);
  const sigX = x + (w - sigW) / 2;
  doc.line(sigX, y + h - 6.2, sigX + sigW, y + h - 6.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(71, 85, 105);
  doc.text(schoolInfo.principalName || 'Dirección Escolar', x + w / 2, y + h - 3.6, { align: 'center' });
};

/**
 * Exporta uno o múltiples carnets en una plancha A4 lista para imprimir y recortar
 * (cada fila contiene Frente + Dorso lado a lado para plegado o corte exacto).
 */
export const exportCardsSheetPDF = (
  items: PrintableCardItem[],
  schoolInfo: SchoolInfo,
  config: CardDesignConfig,
  labelSlug = 'carnets'
) => {
  if (!items.length) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm

  const baseW = config.sizePreset === 'large' ? 92 : 85.6;
  const baseH = config.sizePreset === 'large' ? 58 : 54;
  const cardW = config.orientation === 'horizontal' ? baseW : baseH;
  const cardH = config.orientation === 'horizontal' ? baseH : baseW;

  const gapX = 6;
  const gapY = 7;
  const pairWidth = cardW * 2 + gapX;
  const marginX = Math.max(8, (pageWidth - pairWidth) / 2);
  const startY = 20;

  const rowsPerPage = Math.max(1, Math.floor((pageHeight - startY - 12) / (cardH + gapY)));

  const drawPageHeader = (pageNum: number, totalPages: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(12, 45, 72);
    doc.text(`${schoolInfo.name.toUpperCase()} — PLANCHA DE CARNETS`, 12, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Ciclo ${schoolInfo.academicYear} • Formato ${config.sizePreset.toUpperCase()} (${config.orientation}) • Hoja ${pageNum} de ${totalPages}`,
      pageWidth - 12,
      10,
      { align: 'right' }
    );
    doc.setDrawColor(186, 230, 253);
    doc.setLineWidth(0.3);
    doc.line(12, 12.5, pageWidth - 12, 12.5);
  };

  const totalPages = Math.ceil(items.length / rowsPerPage);

  items.forEach((item, idx) => {
    const pageIndex = Math.floor(idx / rowsPerPage);
    const rowInPage = idx % rowsPerPage;

    if (idx > 0 && rowInPage === 0) {
      doc.addPage();
    }
    if (rowInPage === 0) {
      drawPageHeader(pageIndex + 1, totalPages);
    }

    const rowY = startY + rowInPage * (cardH + gapY);

    // Frente (izquierda) y Dorso (derecha)
    drawCardFront(doc, item, schoolInfo, config, marginX, rowY, cardW, cardH);
    drawCardBack(doc, item, schoolInfo, config, marginX + cardW + gapX, rowY, cardW, cardH);

    // Etiqueta discreta de corte entre frente y dorso
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(marginX + cardW + gapX / 2, rowY, marginX + cardW + gapX / 2, rowY + cardH);
    doc.setLineDashPattern([], 0);
  });

  const instSlug = slugifyFileName(schoolInfo.name, 'escuela');
  doc.save(`Carnets_${labelSlug}_${instSlug}_${schoolInfo.academicYear}.pdf`);
};
