import React, { useRef } from 'react';
import { Student, SUBJECTS_BY_YEAR, SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';
import { calculateAge, getPromotionStatus } from '../services/utils';
import { Printer, Download, X, GraduationCap, Award, CheckCircle2, AlertCircle, Calendar, School, UserCheck } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OfficialReportCardModalProps {
  student: Student;
  isOpen: boolean;
  onClose: () => void;
  schoolInfo?: SchoolInfo;
}

export const OfficialReportCardModal: React.FC<OfficialReportCardModalProps> = ({
  student,
  isOpen,
  onClose,
  schoolInfo = DEFAULT_SCHOOL_INFO,
}) => {
  const printableRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const subjects = SUBJECTS_BY_YEAR[student.course] || [];
  const promotion = getPromotionStatus(student);
  const age = calculateAge(student.birthDate);
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();
  const todayFormatted = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  // Cálculo de promedios y materias
  let sumDefinitive = 0;
  let gradedSubjects = 0;
  let passedSubjects = 0;
  let pendingSubjects = 0;

  const processedGrades = subjects.map((subject) => {
    const g = student.grades[subject] || {};
    const t1 = g.trimestre1;
    const t2 = g.trimestre2;
    const t3 = g.trimestre3;

    // Promedio parcial de trimestres
    const trimesters = [t1, t2, t3].filter((n): n is number => typeof n === 'number');
    const partialAverage = trimesters.length > 0 
      ? Number((trimesters.reduce((a, b) => a + b, 0) / trimesters.length).toFixed(1))
      : undefined;

    // Calificación definitiva (final si existe, sino el promedio parcial si los 3 están presentes)
    const definitive = typeof g.final === 'number' 
      ? g.final 
      : (trimesters.length === 3 ? Math.round(partialAverage!) : undefined);

    if (typeof definitive === 'number') {
      sumDefinitive += definitive;
      gradedSubjects++;
      if (definitive >= 6) {
        passedSubjects++;
      } else {
        pendingSubjects++;
      }
    }

    let status = 'En Curso';
    if (typeof definitive === 'number') {
      status = definitive >= 6 ? 'Aprobada' : 'Adeuda';
    }

    return {
      subject,
      t1,
      t2,
      t3,
      partialAverage,
      final: g.final,
      definitive,
      status
    };
  });

  const generalAverage = gradedSubjects > 0 ? (sumDefinitive / gradedSubjects).toFixed(2) : '-';

  // Estadísticas de asistencia
  const attendanceList = student.attendance || [];
  const totalDays = attendanceList.length;
  const presentes = attendanceList.filter((a) => a.type === 'presente').length;
  const tardes = attendanceList.filter((a) => a.type === 'tarde').length;
  const ausentesTotal = attendanceList.filter((a) => a.type === 'ausente').length;
  const ausentesJustificadas = attendanceList.filter((a) => a.type === 'ausente' && a.justified).length;
  const ausentesInjustificadas = ausentesTotal - ausentesJustificadas;
  const effectivePresent = presentes + tardes * 0.5;
  const attendancePercent = totalDays > 0 ? ((effectivePresent / totalDays) * 100).toFixed(1) : '100.0';

  // Exportar PDF oficial de la libreta
  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Franja superior azul cielo / institucional Frutiger Aero
    doc.setFillColor(3, 105, 161);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Línea turquesa luminosa
    doc.setFillColor(20, 184, 166);
    doc.rect(0, 28, pageWidth, 2, 'F');

    // Logo institucional si está configurado
    if (schoolInfo.logo && schoolInfo.logo.startsWith('data:image/')) {
      try {
        const format = schoolInfo.logo.includes('image/png') ? 'PNG' : 'JPEG';
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(12, 4, 20, 20, 3, 3, 'F');
        doc.addImage(schoolInfo.logo, format, 13, 5, 18, 18);
      } catch {
        // continuar sin logo si la imagen no es compatible con jsPDF
      }
    }

    // Textos de cabecera
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text((schoolInfo.name || DEFAULT_SCHOOL_INFO.name).toUpperCase(), pageWidth / 2, 10, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(224, 242, 254);
    const subLocation = `${schoolInfo.address || DEFAULT_SCHOOL_INFO.address}${schoolInfo.locality ? ` • ${schoolInfo.locality}` : ''}${schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : ''}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}`;
    doc.text(subLocation, pageWidth / 2, 16, { align: 'center' });
    const provinceHeader = schoolInfo.province
      ? `PROVINCIA DE ${schoolInfo.province.toUpperCase()} • MINISTERIO DE EDUCACIÓN`
      : 'MINISTERIO DE EDUCACIÓN';
    doc.text(provinceHeader, pageWidth / 2, 21, { align: 'center' });

    // Título de Libreta
    let currentY = 36;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('LIBRETA OFICIAL DE CALIFICACIONES', pageWidth / 2, currentY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Ciclo Lectivo ${currentYear} • Régimen de Evaluación Trimestral`, pageWidth / 2, currentY + 5, { align: 'center' });

    // Ficha de Datos del Alumno
    currentY += 10;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, currentY, pageWidth - 28, 22, 2, 2, 'FD');

    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    // Fila 1 datos
    doc.setFont('helvetica', 'bold');
    doc.text('Estudiante:', 18, currentY + 6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(student.fullName.toUpperCase(), 38, currentY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('DNI:', 125, currentY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(student.dni || 'S/D', 135, currentY + 6);

    // Fila 2 datos
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Curso / Año:', 18, currentY + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    const cycle = Number(student.course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado (Agropecuaria)';
    doc.text(`${student.course}° Año - ${cycle}`, 38, currentY + 12);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Emisión:', 125, currentY + 12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(todayFormatted, 140, currentY + 12);

    // Fila 3 datos
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Condición Actual:', 18, currentY + 18);
    doc.setFont('helvetica', 'bold');
    if (promotion.status === 'Repite') {
      doc.setTextColor(220, 38, 38);
    } else {
      doc.setTextColor(22, 163, 74);
    }
    doc.text(`${promotion.status.toUpperCase()} (${promotion.details})`, 48, currentY + 18);

    // Tabla de Calificaciones Trimestrales
    currentY += 26;

    const tableRows = processedGrades.map((g) => [
      g.subject,
      g.t1 !== undefined ? String(g.t1) : '-',
      g.t2 !== undefined ? String(g.t2) : '-',
      g.t3 !== undefined ? String(g.t3) : '-',
      g.partialAverage !== undefined ? String(g.partialAverage) : '-',
      g.definitive !== undefined ? String(g.definitive) : '-',
      g.status
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Espacio Curricular / Materia', '1° Trim.', '2° Trim.', '3° Trim.', 'Promedio', 'Definitiva', 'Estado']],
      body: tableRows,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [15, 23, 42],
      },
      headStyles: {
        fillColor: [3, 105, 161],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 76, fontStyle: 'bold', halign: 'left' },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 22, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.column.index === 4 || data.column.index === 5)) {
          const val = parseFloat(String(data.cell.raw));
          if (!isNaN(val)) {
            if (val < 6) {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [30, 58, 138];
            }
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    let tableEndY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 4 : currentY + 80;

    // Resumen Académico
    doc.setFillColor(241, 245, 249);
    doc.rect(14, tableEndY, pageWidth - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(
      `Promedio General: ${generalAverage}   |   Aprobadas: ${passedSubjects}   |   Adeudadas / A Coloquio: ${pendingSubjects}`,
      pageWidth / 2,
      tableEndY + 4.8,
      { align: 'center' }
    );

    // Resumen de Asistencia
    tableEndY += 11;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, tableEndY, pageWidth - 28, 14, 1.5, 1.5, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text('CÓMPUTO DE ASISTENCIA Y PRESENTISMO', 18, tableEndY + 5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Jornadas: ${totalDays}   |   Presentes: ${presentes}   |   Tardanzas: ${tardes}   |   Inasistencias: ${ausentesTotal} (Justificadas: ${ausentesJustificadas}, Injustificadas: ${ausentesInjustificadas})   |   Presentismo: ${attendancePercent}%`,
      18,
      tableEndY + 10
    );

    // Firmas
    let sigY = tableEndY + 22;
    if (sigY > pageHeight - 35) {
      doc.addPage();
      sigY = 25;
    }

    const colWidth = (pageWidth - 28) / 3;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);

    // Firma 1
    doc.line(18, sigY + 12, 18 + colWidth - 8, sigY + 12);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(schoolInfo.principalName || 'Dirección / Rectoría', 18 + (colWidth - 8) / 2, sigY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(schoolInfo.name, 18 + (colWidth - 8) / 2, sigY + 19, { align: 'center' });

    // Firma 2
    doc.line(14 + colWidth + 4, sigY + 12, 14 + colWidth * 2 - 4, sigY + 12);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Preceptoría / Secretaría', 14 + colWidth + colWidth / 2, sigY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Firma y Sello', 14 + colWidth + colWidth / 2, sigY + 19, { align: 'center' });

    // Firma 3
    doc.line(14 + colWidth * 2 + 4, sigY + 12, pageWidth - 18, sigY + 12);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Padre / Madre / Tutor', 14 + colWidth * 2 + (colWidth - 4) / 2, sigY + 16, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('Firma y Aclaración', 14 + colWidth * 2 + (colWidth - 4) / 2, sigY + 19, { align: 'center' });

    const safeName = student.fullName.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_');
    doc.save(`Libreta_Calificaciones_${safeName}_${student.course}Ano.pdf`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-6 flex flex-col max-h-[92vh] overflow-hidden border border-slate-200">
        
        {/* Barra superior de acciones (no se imprime) */}
        <div className="aero-header text-white p-4 flex items-center justify-between no-print gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 text-white p-2 rounded-xl border border-white/30">
              <GraduationCap size={22} />
            </div>
            <div>
              <h3 className="font-black text-lg sm:text-xl leading-tight">Libreta de Calificaciones Oficial</h3>
              <p className="text-xs text-sky-100">
                {student.fullName} • {student.course}° Año • Ciclo Lectivo {currentYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] bg-amber-400 hover:bg-amber-300 text-sky-950 font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95"
              title="Descargar Libreta Oficial en formato PDF"
            >
              <Download size={15} />
              <span className="hidden sm:inline">Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 min-h-[44px] bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95"
              title="Imprimir Libreta de Calificaciones"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-sky-100 hover:text-white hover:bg-white/15 rounded-xl transition-colors"
              title="Cerrar libreta"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Contenido desplazable y visualización de la Libreta */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50" ref={printableRef}>
          <div className="bg-white border-2 border-slate-300 p-4 sm:p-8 rounded-xl shadow-sm text-slate-800 space-y-6 student-print-sheet">
            
            {/* Cabecera Institucional */}
            <div className="border-b-2 border-slate-900 pb-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  {schoolInfo.logo ? (
                    <img
                      src={schoolInfo.logo}
                      alt={schoolInfo.name}
                      className="w-14 h-14 rounded-2xl object-contain border-2 border-sky-700/30 bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full border-2 border-sky-800 flex flex-col items-center justify-center font-black text-[11px] leading-tight text-sky-900 bg-sky-50 shrink-0">
                      <School size={22} className="text-sky-800 mb-0.5" />
                      <span className="text-[8px] uppercase truncate max-w-[46px]">
                        {schoolInfo.institutionNumber || schoolInfo.province?.slice(0, 6) || 'INST.'}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {schoolInfo.province
                        ? `Provincia de ${schoolInfo.province} • Ministerio de Educación`
                        : 'Ministerio de Educación'}
                    </p>
                    <h2 className="text-xl sm:text-2xl font-black text-[#0c2d48] uppercase tracking-tight">
                      {schoolInfo.name}
                    </h2>
                    <p className="text-xs text-slate-600 font-medium">
                      {schoolInfo.address}
                      {schoolInfo.locality ? ` • ${schoolInfo.locality}` : ''}
                      {schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : ''}
                      {schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-center sm:text-right border-t sm:border-t-0 sm:border-l-2 border-slate-200 pt-2 sm:pt-0 sm:pl-4">
                  <span className="inline-block bg-blue-900 text-amber-300 px-3 py-1 rounded text-xs font-black uppercase tracking-wider">
                    Libreta de Calificaciones
                  </span>
                  <p className="text-xs font-bold text-slate-700 mt-1">
                    Ciclo Lectivo: <strong className="text-slate-900">{currentYear}</strong>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Fecha de Emisión: {todayFormatted}
                  </p>
                </div>
              </div>
            </div>

            {/* Datos del Estudiante */}
            <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Estudiante:</span>
                <strong className="text-slate-900 text-sm font-black">{student.fullName}</strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">DNI:</span>
                <span className="font-bold text-slate-800">{student.dni || 'Sin registrar'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Curso y Ciclo:</span>
                <span className="font-bold text-slate-800">
                  {student.course}° Año ({Number(student.course) <= 3 ? 'Ciclo Básico' : 'Ciclo Orientado'})
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Condición Académica:</span>
                <span className={`inline-block font-black px-2 py-0.5 rounded text-[11px] ${
                  promotion.status === 'Repite' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {promotion.status.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Tabla de Calificaciones Trimestrales */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse border border-slate-300 text-xs print-table">
                <thead>
                  <tr className="bg-blue-900 text-white uppercase text-[10px] tracking-wider font-bold">
                    <th className="p-2 sm:p-2.5 border border-slate-400">Espacio Curricular / Materia</th>
                    <th className="p-2 sm:p-2.5 border border-slate-400 text-center w-16">1° Trim.</th>
                    <th className="p-2 sm:p-2.5 border border-slate-400 text-center w-16">2° Trim.</th>
                    <th className="p-2 sm:p-2.5 border border-slate-400 text-center w-16">3° Trim.</th>
                    <th className="p-2 sm:p-2.5 border border-slate-400 text-center w-20 bg-blue-950">Promedio</th>
                    <th className="p-2 sm:p-2.5 border border-slate-400 text-center w-20 bg-amber-500 text-blue-950">Definitiva</th>
                    <th className="p-2 sm:p-2.5 border border-slate-400 text-center w-24">Condición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {processedGrades.map((g, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 sm:p-2.5 border border-slate-300 font-bold text-slate-800">
                        {g.subject}
                      </td>
                      <td className="p-2 sm:p-2.5 border border-slate-300 text-center font-bold">
                        {g.t1 !== undefined ? (
                          <span className={g.t1 < 6 ? 'text-red-600' : 'text-slate-800'}>{g.t1}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-2.5 border border-slate-300 text-center font-bold">
                        {g.t2 !== undefined ? (
                          <span className={g.t2 < 6 ? 'text-red-600' : 'text-slate-800'}>{g.t2}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-2.5 border border-slate-300 text-center font-bold">
                        {g.t3 !== undefined ? (
                          <span className={g.t3 < 6 ? 'text-red-600' : 'text-slate-800'}>{g.t3}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-2.5 border border-slate-300 text-center font-black bg-slate-100/60">
                        {g.partialAverage !== undefined ? (
                          <span className={g.partialAverage < 6 ? 'text-red-600' : 'text-blue-900'}>{g.partialAverage}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-2.5 border border-slate-300 text-center font-black bg-amber-50">
                        {g.definitive !== undefined ? (
                          <span className={g.definitive < 6 ? 'text-red-600 font-black' : 'text-blue-900 font-black'}>{g.definitive}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-2 sm:p-2.5 border border-slate-300 text-center font-bold text-[11px]">
                        {g.status === 'Aprobada' ? (
                          <span className="text-emerald-700">Aprobada</span>
                        ) : g.status === 'Adeuda' ? (
                          <span className="text-red-600">Adeuda</span>
                        ) : (
                          <span className="text-slate-400">En Curso</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-800">
                    <td className="p-2.5 border border-slate-300 uppercase tracking-wider text-[11px]">
                      Síntesis de Rendimiento Escolar
                    </td>
                    <td colSpan={3} className="p-2.5 border border-slate-300 text-center text-slate-600">
                      Escala numérica: 1 a 10 (Aprobación: 6 o más)
                    </td>
                    <td colSpan={3} className="p-2.5 border border-slate-300 text-center font-black text-blue-900">
                      Promedio General: <span className="text-base text-amber-600 ml-1">{generalAverage}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Cómputo de Asistencia Institucional */}
            <div className="border border-slate-300 rounded-lg p-4 bg-slate-50">
              <h4 className="font-black text-xs uppercase tracking-wider text-blue-950 mb-2 flex items-center gap-2">
                <UserCheck size={16} className="text-blue-700" />
                Cómputo de Asistencia y Régimen de Regularidad
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Días Hábiles</span>
                  <span className="text-base font-black text-slate-900">{totalDays}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Presentes</span>
                  <span className="text-base font-black text-emerald-700">{presentes}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Tardanzas</span>
                  <span className="text-base font-black text-amber-600">{tardes}</span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">Inasistencias</span>
                  <span className="text-base font-black text-red-600">
                    {ausentesTotal} <span className="text-[10px] text-slate-400 font-normal">({ausentesJustificadas} just.)</span>
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-200 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">% Asistencia</span>
                  <span className={`text-base font-black ${Number(attendancePercent) >= 80 ? 'text-blue-900' : 'text-red-600'}`}>
                    {attendancePercent}%
                  </span>
                </div>
              </div>
            </div>

            {/* Espacio para Firmas Oficiales */}
            <div className="pt-8 border-t border-slate-300 print-avoid-break">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
                <div className="flex flex-col items-center">
                  <div className="w-48 border-b-2 border-slate-700 mb-1.5 h-10"></div>
                  <span className="font-bold text-xs uppercase text-slate-900">
                    {schoolInfo.principalName || 'Firma y Sello Rectoría'}
                  </span>
                  <span className="text-[10px] text-slate-500">{schoolInfo.name}</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-48 border-b-2 border-slate-700 mb-1.5 h-10"></div>
                  <span className="font-bold text-xs uppercase text-slate-900">Preceptor/a Responsable</span>
                  <span className="text-[10px] text-slate-500">Aclaración y Legajo</span>
                </div>
                <div className="flex flex-col items-center">
                  <div className="w-48 border-b-2 border-slate-700 mb-1.5 h-10"></div>
                  <span className="font-bold text-xs uppercase text-slate-900">Firma del Padre / Tutor</span>
                  <span className="text-[10px] text-slate-500">Notificado en Conformidad</span>
                </div>
              </div>
              <p className="text-[9px] text-center text-slate-400 mt-6 italic">
                Documento Institucional Oficial emitido por el Sistema de Información y Gestión Escolar • {schoolInfo.name}
              </p>
            </div>

          </div>
        </div>

        {/* Pie del modal */}
        <div className="bg-white border-t border-slate-200 p-3 sm:p-4 flex justify-end gap-3 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
};
