import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { AttendanceMovementRecord } from '../shared/attendanceDomain';
import type { SchoolInfo } from '../types';

export function exportAttendanceMovementsToPDF(
  movements: AttendanceMovementRecord[],
  schoolInfo: SchoolInfo,
  subtitle: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(13);
  doc.text(schoolInfo.name || 'Sistema de Gestión Escolar', 14, 14);
  doc.setFontSize(10);
  doc.text(`Reporte de Asistencia QR (Ingresos, Tardanzas, Ausencias y Salidas) — ${subtitle}`, 14, 20);

  autoTable(doc, {
    startY: 25,
    head: [
      [
        'Fecha',
        'Hora',
        'Alumno',
        'Curso/Div',
        'Turno',
        'Movimiento',
        'Estado / Tipo',
        'Retirado por / Motivo',
        'Operador',
      ],
    ],
    body: movements.map((m) => [
      m.attendanceDate,
      m.recordedTime,
      m.studentName || m.studentId,
      `${m.course || ''}° ${m.division || ''}`.trim(),
      m.shift,
      m.movementKind === 'ingreso' ? 'INGRESO' : 'SALIDA',
      m.movementKind === 'ingreso'
        ? (m.attendanceStatus || '').toUpperCase()
        : (m.exitType || '').toUpperCase(),
      m.movementKind === 'salida'
        ? `${m.authorizedPersonName || ''} ${m.withdrawalReason ? `(${m.withdrawalReason})` : ''}`.trim()
        : m.observations || '-',
      m.operatorName,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [2, 132, 199] },
  });

  doc.save(`Reporte_Asistencia_QR_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportAttendanceMovementsToExcel(
  movements: AttendanceMovementRecord[]
): void {
  const wb = XLSX.utils.book_new();

  const movSheetData = movements.map((m) => ({
    Fecha: m.attendanceDate,
    Hora: m.recordedTime,
    Alumno: m.studentName || m.studentId,
    Curso: m.course || '',
    Division: m.division || '',
    Turno: m.shift,
    Movimiento: m.movementKind === 'ingreso' ? 'Ingreso' : 'Salida',
    Estado_o_Tipo:
      m.movementKind === 'ingreso' ? m.attendanceStatus || '' : m.exitType || '',
    Persona_Retira: m.authorizedPersonName || '',
    DNI_Retira: m.authorizedPersonDni || '',
    Motivo: m.withdrawalReason || '',
    Observaciones: m.observations || '',
    Operador: m.operatorName,
  }));

  const wsMov = XLSX.utils.json_to_sheet(movSheetData);

  XLSX.utils.book_append_sheet(wb, wsMov, 'Movimientos_Asistencia');

  XLSX.writeFile(wb, `Asistencia_QR_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
