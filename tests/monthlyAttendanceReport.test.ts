import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthlyAttendanceReport,
  formatMonthYearLabelES,
} from '../services/monthlyAttendanceReport';
import { Student } from '../types';

function makeStudent(partial: Partial<Student> & Pick<Student, 'id' | 'fullName' | 'course'>): Student {
  return {
    dni: '45000001',
    birthDate: '2010-05-10',
    address: 'Calle 1',
    division: 'A',
    grades: {},
    attendance: [],
    medical: { treatments: '', medications: '', notes: '' },
    disciplinary: [],
    ...partial,
  };
}

test('formatMonthYearLabelES formatea YYYY-MM en español', () => {
  assert.equal(formatMonthYearLabelES('2026-11'), 'Noviembre 2026');
  assert.equal(formatMonthYearLabelES('2026-02'), 'Febrero 2026');
});

test('buildMonthlyAttendanceReport consolida porcentaje por alumno y curso y detalla faltas del mes seleccionado', () => {
  const students: Student[] = [
    makeStudent({
      id: 'st-1',
      fullName: 'Acosta Lucía',
      dni: '46111222',
      course: '1',
      division: 'A',
      attendance: [
        { date: '2026-10-28', type: 'ausente', justified: false, reason: 'Mes anterior' },
        { date: '2026-11-02', type: 'presente', source: 'qr', recordedAt: '07:45' },
        { date: '2026-11-03', type: 'tarde', source: 'qr', recordedAt: '08:12' },
        { date: '2026-11-10', type: 'ausente', justified: true, reason: 'Certificado médico', source: 'manual' },
        { date: '2026-11-05', type: 'ausente', justified: false, reason: '', source: 'manual' },
      ],
    }),
    makeStudent({
      id: 'st-2',
      fullName: 'Benítez Mateo',
      dni: '46333444',
      course: '1',
      division: 'A',
      attendance: [
        { date: '2026-11-02', type: 'presente' },
        { date: '2026-11-03', type: 'presente' },
      ],
    }),
    makeStudent({
      id: 'st-3',
      fullName: 'Castro Sofía',
      dni: '44555666',
      course: '4',
      division: 'B',
      attendance: [],
    }),
  ];

  const report = buildMonthlyAttendanceReport(students, '2026-11', 'all');

  assert.equal(report.month, '2026-11');
  assert.equal(report.monthLabel, 'Noviembre 2026');
  assert.equal(report.totalStudents, 3);
  assert.equal(report.studentsWithRecordsCount, 2);
  assert.equal(report.totalRecords, 6);
  assert.equal(report.totalPresentes, 3);
  assert.equal(report.totalTardes, 1);
  assert.equal(report.totalAusentes, 2);
  assert.equal(report.totalJustificadas, 1);
  assert.equal(report.totalInjustificadas, 1);
  // Asistencia consolidada: (3 + 1*0.5) / 6 = 58.3%
  assert.equal(report.overallAttendancePercentage, 58.3);

  assert.equal(report.courses.length, 2);

  const firstCourse = report.courses[0];
  assert.equal(firstCourse.course, '1');
  assert.equal(firstCourse.courseAttendancePercentage, 58.3);
  assert.equal(firstCourse.rows[0].fullName, 'Acosta Lucía');
  // Acosta: 1 presente + 1 tarde (0.5) + 2 ausentes = 1.5 / 4 = 37.5%
  assert.equal(firstCourse.rows[0].attendancePercentage, 37.5);
  assert.equal(firstCourse.rows[0].ausentes, 2);
  assert.equal(firstCourse.rows[0].justificadas, 1);
  assert.equal(firstCourse.rows[0].injustificadas, 1);
  // Orden cronológico de faltas: 05/11 primero, 10/11 segundo
  assert.deepEqual(
    firstCourse.rows[0].absences.map((a) => ({
      date: a.date,
      formattedDate: a.formattedDate,
      justified: a.justified,
      reason: a.reason,
    })),
    [
      { date: '2026-11-05', formattedDate: '05/11/2026', justified: false, reason: '' },
      { date: '2026-11-10', formattedDate: '10/11/2026', justified: true, reason: 'Certificado médico' },
    ]
  );

  assert.equal(firstCourse.rows[1].fullName, 'Benítez Mateo');
  assert.equal(firstCourse.rows[1].attendancePercentage, 100);
  assert.equal(firstCourse.rows[1].absences.length, 0);

  const fourthCourse = report.courses[1];
  assert.equal(fourthCourse.course, '4');
  assert.equal(fourthCourse.courseAttendancePercentage, null);
  assert.equal(fourthCourse.rows[0].attendancePercentage, null);

  // Filtro por curso específico
  const onlyCourse1 = buildMonthlyAttendanceReport(students, '2026-11', '1');
  assert.equal(onlyCourse1.courses.length, 1);
  assert.equal(onlyCourse1.totalStudents, 2);
});
