import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_SCHOOL_INFO,
  DisciplinaryIncident,
  MeritOrderConfig,
  SchoolInfo,
  Student,
  StudentTrajectoryProfile,
} from '../types';
import {
  ACTUATION_STATUS_LABELS,
  MOVEMENT_TYPE_LABELS,
  MeritOrderEvaluationResult,
  SANCTION_TYPE_LABELS,
  StudentTrajectorySummary,
  YEAR_CONDITION_LABELS,
} from './trajectoryService';
import { slugifyFileName } from './storageService';

const drawHeaderLogo = (doc: jsPDF, logo?: string, x = 14, y = 4, size = 16.5) => {
  if (!logo || !logo.startsWith('data:image/')) return;
  try {
    const format = logo.includes('image/png') ? 'PNG' : 'JPEG';
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x - 1, y - 1, size + 2, size + 2, 2, 2, 'F');
    doc.addImage(logo, format, x, y, size, size, undefined, 'FAST');
  } catch {
    // Fallback limpio si la imagen no es rasterizable por jsPDF
  }
};

export type MeritPdfScope = 'all' | 'elegible' | 'elegible_y_revision';

export interface MeritPdfExportOptions {
  scope?: MeritPdfScope;
  includeHonorRoll?: boolean;
  includeCriteriaSummary?: boolean;
  includeRequirementsDetail?: boolean;
  includePendingSubjectsDetail?: boolean;
  actNumber?: string;
  additionalObservations?: string;
}

export interface MeritPdfExportResult {
  fileName: string;
  includedStudentsCount: number;
  pageCount: number;
}

const getDisciplinaryPolicyLabel = (config: MeritOrderConfig): string => {
  if (config.disciplinaryPolicy === 'inform_only') {
    return 'Solo informativo — no excluye automáticamente (nunca descuenta promedio)';
  }
  if (config.disciplinaryPolicy === 'review_active') {
    return 'Revisión institucional para actuaciones activas (nunca descuenta promedio)';
  }
  const excludedLabels =
    config.excludedSanctionTypes.length > 0
      ? config.excludedSanctionTypes.map((t) => SANCTION_TYPE_LABELS[t]).join(', ')
      : 'Ningún tipo seleccionado';
  return `Exclusión solo para tipos configurados: ${excludedLabels} (nunca descuenta promedio)`;
};

const getScopeLabel = (scope: MeritPdfScope): string => {
  if (scope === 'elegible') return 'Solo estudiantes elegibles';
  if (scope === 'elegible_y_revision') return 'Elegibles y en revisión institucional';
  return 'Nómina completa evaluada (Elegibles, Revisión y No elegibles)';
};

/**
 * Exporta el Acta / Orden de Mérito oficial para Selección de Abanderados y Escoltas (A4 horizontal),
 * incluyendo criterios institucionales aplicados, Cuadro de Honor, lista ordenada de alumnos con
 * promedios generales y detalle completo de cumplimiento de requisitos institucionales por estudiante.
 */
export const exportMeritOrderPDF = (
  meritResult: MeritOrderEvaluationResult,
  config: MeritOrderConfig,
  schoolInfoInput: SchoolInfo = DEFAULT_SCHOOL_INFO,
  options: MeritPdfExportOptions = {}
): MeritPdfExportResult => {
  const schoolInfo: SchoolInfo = { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };
  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolLocation = [schoolInfo.address, schoolInfo.locality, schoolInfo.province]
    .filter(Boolean)
    .join(' • ') || DEFAULT_SCHOOL_INFO.address;
  const currentYear = Number(schoolInfo.academicYear) || new Date().getFullYear();

  const scope: MeritPdfScope = options.scope || 'all';
  const includeHonorRoll = options.includeHonorRoll !== false;
  const includeCriteriaSummary = options.includeCriteriaSummary !== false;
  const includeRequirementsDetail = options.includeRequirementsDetail !== false;
  const includePendingSubjectsDetail = options.includePendingSubjectsDetail !== false;
  const actNumber = (options.actNumber || '').trim();
  const additionalObservations = (options.additionalObservations || '').trim();

  const selectedCandidates =
    scope === 'elegible'
      ? meritResult.eligibleCandidates
      : scope === 'elegible_y_revision'
      ? [...meritResult.eligibleCandidates, ...meritResult.reviewCandidates]
      : [
          ...meritResult.eligibleCandidates,
          ...meritResult.reviewCandidates,
          ...meritResult.ineligibleCandidates,
        ];

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
  const timeFormatted = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // -------------------------------------------------------------------------
  // ENCABEZADO INSTITUCIONAL
  // -------------------------------------------------------------------------
  doc.setFillColor(3, 105, 161);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setFillColor(20, 184, 166);
  doc.rect(0, 25, pageWidth, 2.5, 'F');
  drawHeaderLogo(doc, schoolInfo.logo, 14, 4, 16.5);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 9, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(224, 242, 254);
  doc.text(
    `${schoolLocation}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''} • CICLO LECTIVO ${currentYear}`,
    pageWidth / 2,
    14.5,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    actNumber
      ? `ACTA DE ORDEN DE MÉRITO — SELECCIÓN DE ABANDERADOS Y ESCOLTAS (${actNumber})`
      : 'ACTA DE ORDEN DE MÉRITO — SELECCIÓN DE ABANDERADOS Y ESCOLTAS',
    pageWidth / 2,
    21.2,
    { align: 'center' }
  );

  let y = 32.5;

  // Línea de metadatos de emisión y alcance
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(12, 45, 72);
  doc.text(`Alcance del informe: ${getScopeLabel(scope)}`, 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Emitido: ${todayFormatted} ${timeFormatted} hs`, pageWidth - 14, y, {
    align: 'right',
  });
  y += 4;

  // Aviso de empate o DNI duplicados en cabecera si corresponde
  if (meritResult.hasTopThreeTie) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(245, 158, 11);
    doc.roundedRect(14, y, pageWidth - 28, 9, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(146, 64, 14);
    const tiedStr = meritResult.tiedRanks
      .filter((r) => r <= 3)
      .map((r) => `${r}°`)
      .join(', ');
    doc.text(
      `AVISO DE EMPATE EN CUADRO DE HONOR (Puesto/s ${tiedStr}): No se aplican desempates automáticos ocultos. La resolución corresponde a las autoridades institucionales según normativa.`,
      17,
      y + 5.7
    );
    y += 11.5;
  }

  if (meritResult.duplicateDniWarnings.length > 0) {
    doc.setFillColor(255, 241, 242);
    doc.setDrawColor(244, 63, 94);
    doc.roundedRect(14, y, pageWidth - 28, 8.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(159, 18, 57);
    const dupSummary = meritResult.duplicateDniWarnings
      .map((w) => `DNI ${w.dni} (${w.studentNames.join(' / ')})`)
      .join(' | ');
    doc.text(`ALERTA DE INTEGRIDAD — DNI DUPLICADO DETECTADO: ${dupSummary}`.slice(0, 165), 17, y + 5.4);
    y += 11;
  }

  // -------------------------------------------------------------------------
  // SECCIÓN 1: PARÁMETROS Y REQUISITOS INSTITUCIONALES APLICADOS
  // -------------------------------------------------------------------------
  let sectionIdx = 1;
  if (includeCriteriaSummary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(12, 45, 72);
    doc.text(`${sectionIdx}. CRITERIOS Y REQUISITOS INSTITUCIONALES APLICADOS`, 14, y + 2);
    sectionIdx += 1;

    const coursesLabel = config.targetCourses.map((c) => `${c}° Año`).join(', ') || 'Todos';
    const pw = config.gradingPeriodWeights;
    const cw = config.courseYearWeights;
    const dt = config.disciplinaryThresholds;

    const periodWeightsLabel = pw?.enabled
      ? ` · Períodos: 1°T ${pw.trimestre1}% / 2°T ${pw.trimestre2}% / 3°T ${pw.trimestre3}%${
          pw.finalExamWeight > 0 ? ` / Final ${pw.finalExamWeight}%` : ''
        }`
      : '';
    const courseWeightsLabel = cw?.enabled
      ? ` · Pesos por curso: ${(['1', '2', '3', '4', '5', '6'] as const)
          .map((c) => `${c}°:${cw.weights[c] ?? 1}x`)
          .join(' ')}`
      : '';
    const calcLabel = `${
      config.calculationMode === 'weighted' ? 'Promedio Ponderado' : 'Promedio Simple por materia'
    } (${config.decimalPlaces} decimales visibles · nota aprobación ≥ ${config.passingGrade})${periodWeightsLabel}${courseWeightsLabel}`;

    const thresholdParts: string[] = [];
    if (dt) {
      thresholdParts.push(`Umbral rev. manual: ≥${dt.manualReviewMinActiveCount}`);
      if (dt.manualReviewRecentYearsWindow > 0) {
        thresholdParts.push(`Ventana: últimos ${dt.manualReviewRecentYearsWindow} ciclo(s)`);
      }
      if (config.excludedSanctionTypes.length > 0) {
        thresholdParts.push(
          `Umbral exclusión: ≥${dt.exclusionMinSanctionCount}${
            dt.exclusionTriggersManualReviewInsteadOfHardBlock ? ' (deriva a rev. manual)' : ''
          }`
        );
      }
      if (dt.maxTotalActiveSanctionsBeforeEscalation > 0) {
        thresholdParts.push(`Tope acumulación: ≥${dt.maxTotalActiveSanctionsBeforeEscalation}`);
      }
    }

    const criteriaRows: string[][] = [
      [
        'Cursos evaluados',
        coursesLabel,
        'Fórmula de cálculo',
        calcLabel,
      ],
      [
        'Calificaciones definitivas',
        config.requireDefinitiveAverage
          ? 'Exigido (solo ciclos cerrados definitivos)'
          : 'Admite promedios parciales',
        'Trayectoria y antigüedad',
        `${
          config.requireCompleteTrajectory ? 'Trayectoria completa desde 1° Año' : 'Trayectoria flexible'
        } · Antigüedad mín.: ${config.minYearsInInstitution} año(s)`,
      ],
      [
        'Regularidad / Pendientes',
        config.requireNoPendingSubjects
          ? `Máximo permitido: ${config.maxAllowedPendingSubjects} materia(s) pendiente(s)`
          : 'No excluyente (solo informativo)',
        'Repitencias',
        config.allowRepeatedYears
          ? 'Admitidas sin exclusión automática'
          : 'No admitidas según criterio institucional',
      ],
      [
        'Antecedentes disciplinarios',
        `${getDisciplinaryPolicyLabel(config)}${
          config.ignoreAnnulledSanctions ? ' · Ignora anuladas' : ' · Incluye anuladas'
        }${thresholdParts.length > 0 ? ` (${thresholdParts.join(' · ')})` : ''}`,
        'Resumen de evaluación',
        `Evaluados: ${meritResult.evaluatedCount} · Elegibles: ${meritResult.eligibleCandidates.length} · Revisión: ${meritResult.reviewCandidates.length} · No elegibles: ${meritResult.ineligibleCandidates.length}`,
      ],
    ];

    if (config.institutionalNotes || additionalObservations) {
      const combinedNotes = [config.institutionalNotes, additionalObservations]
        .filter(Boolean)
        .join(' | ');
      criteriaRows.push([
        'Normativa / Observaciones',
        combinedNotes,
        'Referencia de acta',
        actNumber || `Ciclo Lectivo ${currentYear}`,
      ]);
    }

    autoTable(doc, {
      startY: y + 4.5,
      body: criteriaRows,
      theme: 'grid',
      styles: { fontSize: 7.2, cellPadding: 1.9, textColor: [30, 41, 59], valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 42, fontStyle: 'bold', fillColor: [240, 249, 255], textColor: [12, 45, 72] },
        1: { cellWidth: 92 },
        2: { cellWidth: 42, fontStyle: 'bold', fillColor: [240, 249, 255], textColor: [12, 45, 72] },
        3: { cellWidth: 93 },
      },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    y = (doc.lastAutoTable?.finalY || y + 28) + 6;
  }

  // -------------------------------------------------------------------------
  // SECCIÓN 2: CUADRO DE HONOR (ABANDERADO/A Y ESCOLTAS)
  // -------------------------------------------------------------------------
  if (includeHonorRoll) {
    if (y > pageHeight - 48) {
      doc.addPage();
      y = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(12, 45, 72);
    doc.text(`${sectionIdx}. CUADRO DE HONOR — ABANDERADO/A Y ESCOLTAS`, 14, y);
    sectionIdx += 1;

    const formatGroupNames = (group: MeritOrderEvaluationResult['abanderadosGroup']) => {
      if (group.length === 0) return 'Vacante / Sin candidato elegible según criterios vigentes';
      if (group.length === 1) {
        const g = group[0];
        return `${g.student.fullName.toUpperCase()}  |  DNI: ${g.student.dni || 'S/D'}  |  ${g.student.course}° Año  |  Prom. Gral.: ${g.formattedAverage}`;
      }
      return (
        `EMPATE (${group.length}): ` +
        group
          .map(
            (g) =>
              `${g.student.fullName.toUpperCase()} (DNI ${g.student.dni || 'S/D'}, Prom. ${g.formattedAverage})`
          )
          .join('  /  ')
      );
    };

    autoTable(doc, {
      startY: y + 2.5,
      head: [['DISTINCIÓN', 'ESTUDIANTE(S) DESIGNADO(S) / PRELIMINAR', 'OBSERVACIÓN']],
      body: [
        [
          '1° · ABANDERADO/A',
          formatGroupNames(meritResult.abanderadosGroup),
          meritResult.abanderadosGroup.length > 1
            ? 'Empate en promedio: definir según normativa institucional'
            : meritResult.abanderadosGroup.length === 1
            ? `1° promedio elegible (${meritResult.abanderadosGroup[0].summary.cumulativeStatusLabel})`
            : 'Sin candidato elegible',
        ],
        [
          '2° · PRIMER/A ESCOLTA',
          formatGroupNames(meritResult.primerEscoltaGroup),
          meritResult.primerEscoltaGroup.length > 1
            ? 'Empate en promedio: definir según normativa institucional'
            : meritResult.primerEscoltaGroup.length === 1
            ? `2° promedio elegible (${meritResult.primerEscoltaGroup[0].summary.cumulativeStatusLabel})`
            : 'Sin candidato elegible',
        ],
        [
          '3° · SEGUNDO/A ESCOLTA',
          formatGroupNames(meritResult.segundoEscoltaGroup),
          meritResult.segundoEscoltaGroup.length > 1
            ? 'Empate en promedio: definir según normativa institucional'
            : meritResult.segundoEscoltaGroup.length === 1
            ? `3° promedio elegible (${meritResult.segundoEscoltaGroup[0].summary.cumulativeStatusLabel})`
            : 'Sin candidato elegible',
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 7.7, cellPadding: 2.2, textColor: [15, 23, 42], valign: 'middle' },
      headStyles: { fillColor: [3, 105, 161], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 44, fontStyle: 'bold', fillColor: [240, 249, 255] },
        1: { cellWidth: 147, fontStyle: 'bold' },
        2: { cellWidth: 78 },
      },
      margin: { left: 14, right: 14 },
    });

    // @ts-ignore
    y = (doc.lastAutoTable?.finalY || y + 32) + 7;
  }

  // -------------------------------------------------------------------------
  // SECCIÓN 3: LISTA ORDENADA DE ALUMNOS CON SUS PROMEDIOS GENERALES
  // -------------------------------------------------------------------------
  if (y > pageHeight - 45) {
    doc.addPage();
    y = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(12, 45, 72);
  doc.text(
    `${sectionIdx}. LISTA ORDENADA DE ALUMNOS Y PROMEDIOS GENERALES (${selectedCandidates.length} REGISTRO${selectedCandidates.length === 1 ? '' : 'S'})`,
    14,
    y
  );
  sectionIdx += 1;

  const summarizeCompliance = (ev: MeritOrderEvaluationResult['eligibleCandidates'][number]) => {
    const total = ev.checks.length;
    const okCount = ev.checks.filter((c) => c.status === 'ok').length;
    const revCount = ev.checks.filter((c) => c.status === 'review').length;
    const failCount = ev.checks.filter((c) => c.status === 'failed').length;
    if (failCount === 0 && revCount === 0) return `${okCount}/${total} Cumple`;
    const parts = [];
    if (failCount > 0) parts.push(`${failCount} inc.`);
    if (revCount > 0) parts.push(`${revCount} rev.`);
    return `${okCount}/${total} (${parts.join(', ')})`;
  };

  const orderedRows = selectedCandidates.map((ev) => [
    ev.meritRank !== null ? `${ev.meritRank}°${ev.isTied ? ' (Emp.)' : ''}` : '—',
    ev.student.fullName.toUpperCase(),
    ev.student.dni || 'S/D',
    `${ev.student.course}°${ev.student.division ? ` ${ev.student.division}` : ''}`,
    ev.formattedAverage,
    ev.summary.cumulativeStatusLabel,
    `${ev.summary.cumulativeCountedSubjects} mat. / ${ev.summary.cumulativeCountedYears} a.`,
    String(ev.summary.totalPendingSubjects),
    ev.summary.disciplinary.activeCount > 0
      ? `${ev.summary.disciplinary.activeCount} act. (no desc.)`
      : 'Sin novedades',
    summarizeCompliance(ev),
    ev.eligibilityStatus === 'elegible'
      ? ev.roleAssigned || 'Elegible'
      : ev.eligibilityStatus === 'revision_institucional'
      ? 'Revisión institucional'
      : 'No elegible',
  ]);

  autoTable(doc, {
    startY: y + 2.5,
    head: [
      [
        'ORDEN',
        'APELLIDO Y NOMBRE',
        'DNI',
        'CURSO',
        'PROM. GRAL.',
        'ESTADO',
        'COMPUTADAS',
        'PEND.',
        'DISCIPLINA',
        'REQUISITOS',
        'ELEGIBILIDAD / ROL',
      ],
    ],
    body:
      orderedRows.length > 0
        ? orderedRows
        : [['—', 'Sin estudiantes para el alcance y cursos seleccionados', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
    theme: 'grid',
    styles: { fontSize: 7.2, cellPadding: 1.9, textColor: [30, 41, 59], valign: 'middle' },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 48, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 19, halign: 'center', fontStyle: 'bold', textColor: [3, 105, 161] },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 24, halign: 'center' },
      7: { cellWidth: 11, halign: 'center' },
      8: { cellWidth: 28, halign: 'center' },
      9: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      10: { cellWidth: 39, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body' || orderedRows.length === 0) return;
      const candidate = selectedCandidates[hookData.row.index];
      if (!candidate) return;
      if (hookData.column.index === 10) {
        if (candidate.roleAssigned) {
          hookData.cell.styles.textColor = [3, 105, 161];
          hookData.cell.styles.fillColor = [224, 242, 254];
        } else if (candidate.eligibilityStatus === 'elegible') {
          hookData.cell.styles.textColor = [4, 120, 87];
        } else if (candidate.eligibilityStatus === 'revision_institucional') {
          hookData.cell.styles.textColor = [180, 83, 9];
          hookData.cell.styles.fillColor = [254, 243, 199];
        } else {
          hookData.cell.styles.textColor = [190, 18, 60];
        }
      }
      if (hookData.column.index === 9) {
        const hasFail = candidate.checks.some((c) => c.status === 'failed');
        const hasRev = candidate.checks.some((c) => c.status === 'review');
        if (hasFail) {
          hookData.cell.styles.textColor = [190, 18, 60];
        } else if (hasRev) {
          hookData.cell.styles.textColor = [180, 83, 9];
        } else {
          hookData.cell.styles.textColor = [4, 120, 87];
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  // @ts-ignore
  y = (doc.lastAutoTable?.finalY || y + 40) + 8;

  // -------------------------------------------------------------------------
  // SECCIÓN 4: DETALLE DE CUMPLIMIENTO DE REQUISITOS INSTITUCIONALES POR ALUMNO
  // -------------------------------------------------------------------------
  if (includeRequirementsDetail && selectedCandidates.length > 0) {
    if (y > pageHeight - 48) {
      doc.addPage();
      y = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(12, 45, 72);
    doc.text(
      `${sectionIdx}. DETALLE DE CUMPLIMIENTO DE REQUISITOS INSTITUCIONALES POR ESTUDIANTE`,
      14,
      y
    );
    sectionIdx += 1;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(
      'Verificación individual de cada criterio institucional vigente: [CUMPLE] requisito satisfecho · [REVISIÓN] sujeto a evaluación directiva · [NO CUMPLE] requisito no alcanzado.',
      14,
      y + 4
    );

    const detailRows = selectedCandidates.map((ev) => {
      const checksLines = ev.checks.map((chk) => {
        const tag =
          chk.status === 'ok'
            ? '[CUMPLE]'
            : chk.status === 'review'
            ? '[REVISIÓN]'
            : '[NO CUMPLE]';
        return `${tag} ${chk.label}: ${chk.detail}`;
      });

      if (includePendingSubjectsDetail && ev.summary.pendingSubjectsList.length > 0) {
        const pendText = ev.summary.pendingSubjectsList
          .map((p) => `${p.subject} (${p.course}°/${p.academicYear})`)
          .join(', ');
        checksLines.push(`• Materias pendientes registradas: ${pendText}`);
      }

      const globalLabel =
        ev.eligibilityStatus === 'elegible'
          ? ev.roleAssigned
            ? `ELEGIBLE\n(${ev.roleAssigned})`
            : 'ELEGIBLE'
          : ev.eligibilityStatus === 'revision_institucional'
          ? 'REVISIÓN\nINSTITUCIONAL'
          : 'NO ELEGIBLE';

      const coursesHistory =
        ev.summary.distinctCoursesRecorded.length > 0
          ? ev.summary.distinctCoursesRecorded.map((c) => `${c}°`).join(', ')
          : '—';

      return [
        ev.meritRank !== null ? `${ev.meritRank}°${ev.isTied ? '\n(Empate)' : ''}` : '—',
        `${ev.student.fullName.toUpperCase()}\nDNI: ${ev.student.dni || 'S/D'} · ${ev.student.course}° Año\nTrayectoria: ${coursesHistory}`,
        `${ev.formattedAverage}\n(${ev.summary.cumulativeStatusLabel})`,
        globalLabel,
        checksLines.join('\n'),
      ];
    });

    autoTable(doc, {
      startY: y + 6.5,
      head: [
        [
          'ORDEN',
          'ESTUDIANTE / IDENTIFICACIÓN',
          'PROM. GRAL.',
          'RESULTADO',
          'DETALLE DE CUMPLIMIENTO DE REQUISITOS INSTITUCIONALES',
        ],
      ],
      body: detailRows,
      theme: 'grid',
      styles: {
        fontSize: 7.1,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        valign: 'top',
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [3, 105, 161],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center', fontStyle: 'bold', valign: 'middle' },
        1: { cellWidth: 53, fontStyle: 'bold' },
        2: { cellWidth: 23, halign: 'center', fontStyle: 'bold', textColor: [3, 105, 161], valign: 'middle' },
        3: { cellWidth: 28, halign: 'center', fontStyle: 'bold', valign: 'middle' },
        4: { cellWidth: 147 },
      },
      didParseCell: (hookData) => {
        if (hookData.section !== 'body') return;
        const candidate = selectedCandidates[hookData.row.index];
        if (!candidate) return;
        if (hookData.column.index === 3) {
          if (candidate.eligibilityStatus === 'elegible') {
            hookData.cell.styles.textColor = [4, 120, 87];
            hookData.cell.styles.fillColor = [236, 253, 245];
          } else if (candidate.eligibilityStatus === 'revision_institucional') {
            hookData.cell.styles.textColor = [180, 83, 9];
            hookData.cell.styles.fillColor = [254, 243, 199];
          } else {
            hookData.cell.styles.textColor = [190, 18, 60];
            hookData.cell.styles.fillColor = [255, 241, 242];
          }
        }
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });

    // @ts-ignore
    y = (doc.lastAutoTable?.finalY || y + 40) + 8;
  }

  // -------------------------------------------------------------------------
  // NOTA REGLAMENTARIA Y BLOQUE DE FIRMAS OFICIALES
  // -------------------------------------------------------------------------
  let sigY = y;
  if (sigY > pageHeight - 36) {
    doc.addPage();
    sigY = 22;
  }

  doc.setFontSize(7.4);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  const regNote =
    'Nota reglamentaria: Las sanciones o antecedentes disciplinarios nunca descuentan ni alteran el promedio académico. En caso de empate en el promedio general o situaciones de revisión institucional, la decisión definitiva corresponde al equipo directivo y comisión evaluadora conforme a la normativa jurisdiccional vigente.';
  const wrappedNote = doc.splitTextToSize(regNote, pageWidth - 28);
  doc.text(wrappedNote, 14, sigY);

  sigY += wrappedNote.length * 3.8 + 13;
  if (sigY > pageHeight - 16) {
    doc.addPage();
    sigY = 30;
  }

  const sigWidth = 65;
  const sigGap = (pageWidth - 28 - sigWidth * 3) / 2;
  doc.setDrawColor(148, 163, 184);
  [
    { label: 'Secretaría Escolar', sub: 'Verificación de Trayectorias y Promedios' },
    { label: 'Comisión Evaluadora', sub: 'Control de Requisitos y Orden de Mérito' },
    { label: schoolInfo.principalName || 'Dirección Institucional', sub: schoolName },
  ].forEach((sig, i) => {
    const sx = 14 + i * (sigWidth + sigGap);
    doc.line(sx, sigY, sx + sigWidth, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(30, 41, 59);
    doc.text(sig.label, sx + sigWidth / 2, sigY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(sig.sub, sx + sigWidth / 2, sigY + 7.5, { align: 'center' });
  });

  // Pie de página oficial en todas las páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • Selección de Abanderados y Escoltas (Ciclo ${currentYear})${
        actNumber ? ` • ${actNumber}` : ''
      } • Emitido ${todayFormatted}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
  }

  const scopeSuffix =
    scope === 'elegible' ? '_Elegibles' : scope === 'elegible_y_revision' ? '_Elegibles_y_Revision' : '';
  const fileName = `Orden_de_Merito_Abanderados_${slugifyFileName(schoolName)}_${currentYear}${scopeSuffix}.pdf`;
  doc.save(fileName);

  return {
    fileName,
    includedStudentsCount: selectedCandidates.length,
    pageCount: totalPages,
  };
};

/**
 * Exporta la Ficha Individual de Trayectoria Académica (1° a 6° Año) y Antecedentes Disciplinarios en PDF.
 */
export const exportStudentTrajectoryPDF = (
  student: Student,
  trajectory: StudentTrajectoryProfile,
  summary: StudentTrajectorySummary,
  incidents: DisciplinaryIncident[],
  config: MeritOrderConfig,
  schoolInfoInput: SchoolInfo = DEFAULT_SCHOOL_INFO
) => {
  const schoolInfo: SchoolInfo = { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };
  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolAddress = schoolInfo.address || DEFAULT_SCHOOL_INFO.address;
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

  // Encabezado
  doc.setFillColor(3, 105, 161);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(20, 184, 166);
  doc.rect(0, 26, pageWidth, 2.5, 'F');
  drawHeaderLogo(doc, schoolInfo.logo, 14, 4.5, 17);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(224, 242, 254);
  doc.text(
    `${schoolAddress}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}`,
    pageWidth / 2,
    15.5,
    { align: 'center' }
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `FICHA INDIVIDUAL DE TRAYECTORIA ESCOLAR (1° A 6° AÑO) • CICLO ${currentYear}`,
    pageWidth / 2,
    22,
    { align: 'center' }
  );

  // Datos identificatorios y promedios
  let y = 34;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, pageWidth - 28, 26, 2.5, 2.5, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Alumno/a: ${student.fullName.toUpperCase()}`, 18, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `ID Único: ${student.id}   |   DNI: ${student.dni || 'S/D'}   |   Año de Ingreso: ${trajectory.entryYear}   |   Curso Actual: ${student.course}° Año${student.division ? ` "${student.division}"` : ''}`,
    18,
    y + 12.5
  );
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(3, 105, 161);
  doc.text(
    `Prom. General Acumulado: ${summary.formattedCumulativeAverage} (${summary.cumulativeStatusLabel})   |   Prom. Final 6° Año: ${summary.formattedFinalSixthYearAverage}   |   Pendientes: ${summary.totalPendingSubjects}`,
    18,
    y + 19.5
  );

  y += 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(12, 45, 72);
  doc.text('1. RESUMEN DE PROMEDIOS ANUALES POR CICLO LECTIVO', 14, y);

  autoTable(doc, {
    startY: y + 3,
    head: [
      ['Ciclo', 'Curso', 'Condición', 'Promedio Anual', 'Tipo', 'Computadas', 'Aprob.', 'Desapr.', 'Pend.'],
    ],
    body: summary.yearSummaries.map((ys) => [
      String(ys.academicYear),
      `${ys.course}°${ys.division ? ` ${ys.division}` : ''}${ys.isRepeatedYear ? ' (Rep.)' : ''}`,
      YEAR_CONDITION_LABELS[ys.condition],
      ys.formattedAverage,
      ys.statusLabel,
      `${ys.countedSubjects}/${ys.totalApplicableSubjects}`,
      String(ys.approvedCount),
      String(ys.disapprovedCount),
      String(ys.pendingAccreditationCount),
    ]),
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: [3, 105, 161], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore
  y = (doc.lastAutoTable?.finalY || y + 40) + 8;

  // Historial de movimientos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(12, 45, 72);
  doc.text('2. HISTORIAL DE MOVIMIENTOS Y SITUACIONES ACADÉMICAS', 14, y);

  autoTable(doc, {
    startY: y + 3,
    head: [['Fecha', 'Ciclo', 'Situación / Movimiento', 'Detalle', 'Autoridad / Ref.']],
    body:
      trajectory.movements.length > 0
        ? trajectory.movements.map((m) => [
            m.date,
            String(m.academicYear),
            MOVEMENT_TYPE_LABELS[m.type],
            m.description,
            [m.authority, m.resolutionRef].filter(Boolean).join(' · ') || '—',
          ])
        : [['—', '—', 'Sin movimientos adicionales registrados', '—', '—']],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore
  y = (doc.lastAutoTable?.finalY || y + 35) + 8;
  if (y > pageHeight - 55) {
    doc.addPage();
    y = 20;
  }

  // Antecedentes disciplinarios
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(12, 45, 72);
  doc.text('3. ANTECEDENTES DISCIPLINARIOS (NO MODIFICAN EL PROMEDIO ACADÉMICO)', 14, y);

  const sortedIncidents = [...incidents].sort((a, b) => a.date.localeCompare(b.date));
  autoTable(doc, {
    startY: y + 3,
    head: [['Fecha', 'Curso', 'Medida / Sanción', 'Motivo', 'Autoridad', 'Estado']],
    body:
      sortedIncidents.length > 0
        ? sortedIncidents.map((inc) => [
            inc.date,
            `${inc.course}° Año`,
            inc.customSanctionLabel || SANCTION_TYPE_LABELS[inc.sanctionType],
            inc.reason,
            inc.authority || '—',
            ACTUATION_STATUS_LABELS[inc.status],
          ])
        : [['—', '—', 'Sin antecedentes disciplinarios registrados', '—', '—', '—']],
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [100, 116, 139], textColor: [255, 255, 255], fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • Ficha de Trayectoria (${config.calculationMode === 'weighted' ? 'Ponderado' : 'Simple'}, ${config.decimalPlaces} dec.) • ${todayFormatted}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  doc.save(
    `Trayectoria_${slugifyFileName(student.fullName, 'alumno')}_${student.dni || 'SDNI'}.pdf`
  );
};

export interface DisciplinarySummaryPdfResult {
  fileName: string;
  totalIncidents: number;
  activeIncidents: number;
  pendingIncidents: number;
  resolvedIncidents: number;
  annulledIncidents: number;
  legacyNotesCount: number;
  pageCount: number;
}

/**
 * Exporta un Informe y Resumen Disciplinario Completo de un estudiante en PDF (A4 vertical),
 * detallando métricas por estado y tipo, listado cronológico completo de incidentes,
 * resoluciones, referencias documentales, notas previas del legajo y bloque oficial de firmas.
 */
export const exportStudentDisciplinarySummaryPDF = (
  student: Student,
  incidents: DisciplinaryIncident[],
  schoolInfoInput: SchoolInfo = DEFAULT_SCHOOL_INFO,
  options?: {
    trajectory?: StudentTrajectoryProfile;
    meritConfig?: MeritOrderConfig;
  }
): DisciplinarySummaryPdfResult => {
  const schoolInfo: SchoolInfo = { ...DEFAULT_SCHOOL_INFO, ...schoolInfoInput };
  const schoolName = schoolInfo.name || DEFAULT_SCHOOL_INFO.name;
  const schoolLocation =
    [schoolInfo.address, schoolInfo.locality, schoolInfo.province].filter(Boolean).join(' • ') ||
    DEFAULT_SCHOOL_INFO.address;
  const currentYear = schoolInfo.academicYear || new Date().getFullYear();

  const studentIncidents = incidents
    .filter((inc) => inc.studentId === student.id)
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

  // Calcular observaciones previas del legajo aún no migradas para garantizar informe completo
  const migratedDescriptions = new Set(
    studentIncidents.filter((i) => i.migratedFromLegacy).map((i) => (i.description || '').trim())
  );
  const unmigratedLegacyNotes = (student.disciplinary || [])
    .map((entry) => (entry || '').trim())
    .filter((entry) => entry.length > 0 && !migratedDescriptions.has(entry));

  let pendingCount = 0;
  let resolvedCount = 0;
  let annulledCount = 0;
  const countByType = new Map<string, number>();

  studentIncidents.forEach((inc) => {
    if (inc.status === 'pendiente') pendingCount += 1;
    else if (inc.status === 'resuelta') resolvedCount += 1;
    else annulledCount += 1;

    const typeLabel =
      inc.sanctionType === 'otra_medida' && inc.customSanctionLabel
        ? inc.customSanctionLabel
        : SANCTION_TYPE_LABELS[inc.sanctionType];
    countByType.set(typeLabel, (countByType.get(typeLabel) || 0) + 1);
  });

  const activeCount = pendingCount + resolvedCount;

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
  const timeFormatted = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // -------------------------------------------------------------------------
  // ENCABEZADO INSTITUCIONAL
  // -------------------------------------------------------------------------
  doc.setFillColor(3, 105, 161);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(20, 184, 166);
  doc.rect(0, 26, pageWidth, 2.5, 'F');
  drawHeaderLogo(doc, schoolInfo.logo, 14, 4.5, 17);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(schoolName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(224, 242, 254);
  doc.text(
    `${schoolLocation}${schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}`,
    pageWidth / 2,
    15.5,
    { align: 'center' }
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `RESUMEN DISCIPLINARIO COMPLETO DEL ESTUDIANTE • CICLO ${currentYear}`,
    pageWidth / 2,
    22,
    { align: 'center' }
  );

  // -------------------------------------------------------------------------
  // DATOS IDENTIFICATORIOS DEL ESTUDIANTE
  // -------------------------------------------------------------------------
  let y = 34;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, pageWidth - 28, 24, 2.5, 2.5, 'FD');

  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`Alumno/a: ${student.fullName.toUpperCase()}`, 18, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  const entryYearText = options?.trajectory?.entryYear
    ? `   |   Año de Ingreso: ${options.trajectory.entryYear}`
    : '';
  doc.text(
    `DNI: ${student.dni || 'S/D'}   |   ID Legajo: ${student.id}   |   Curso Actual: ${student.course}° Año${
      student.division ? ` "${student.division}"` : ''
    }${entryYearText}`,
    18,
    y + 13
  );

  doc.setFontSize(7.6);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Fecha y hora de emisión: ${todayFormatted} ${timeFormatted} hs   |   Documento oficial de seguimiento de convivencia`,
    18,
    y + 19.5
  );

  // -------------------------------------------------------------------------
  // SECCIÓN 1: RESUMEN ESTADÍSTICO Y CRITERIO INSTITUCIONAL
  // -------------------------------------------------------------------------
  y += 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(12, 45, 72);
  doc.text('1. RESUMEN GENERAL DE ANTECEDENTES DISCIPLINARIOS', 14, y);

  const breakdownByTypeText =
    countByType.size > 0
      ? Array.from(countByType.entries())
          .map(([label, qty]) => `${label}: ${qty}`)
          .join('  •  ')
      : 'Sin medidas ni sanciones registradas';

  const summaryRows: string[][] = [
    [
      'Total de incidentes registrados',
      String(studentIncidents.length),
      'Actuaciones activas (Pend. + Res.)',
      String(activeCount),
    ],
    [
      'Resueltas',
      String(resolvedCount),
      'Pendientes de resolución',
      String(pendingCount),
    ],
    [
      'Anuladas (sin efecto)',
      String(annulledCount),
      'Notas previas de legajo sin migrar',
      String(unmigratedLegacyNotes.length),
    ],
    [
      'Desglose por tipo de medida',
      breakdownByTypeText,
      'Criterio institucional vigente',
      options?.meritConfig
        ? getDisciplinaryPolicyLabel(options.meritConfig)
        : 'Registro informativo institucional (nunca descuenta promedio académico)',
    ],
  ];

  autoTable(doc, {
    startY: y + 3,
    body: summaryRows,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 41, 59],
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 44, fontStyle: 'bold', fillColor: [240, 249, 255], textColor: [12, 45, 72] },
      1: { cellWidth: 47, fontStyle: 'bold' },
      2: { cellWidth: 46, fontStyle: 'bold', fillColor: [240, 249, 255], textColor: [12, 45, 72] },
      3: { cellWidth: 45 },
    },
    margin: { left: 14, right: 14 },
  });

  // @ts-ignore
  y = (doc.lastAutoTable?.finalY || y + 32) + 8;

  // -------------------------------------------------------------------------
  // SECCIÓN 2: DETALLE CRONOLÓGICO DE INCIDENTES Y RESOLUCIONES
  // -------------------------------------------------------------------------
  if (y > pageHeight - 55) {
    doc.addPage();
    y = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(12, 45, 72);
  doc.text(
    `2. DETALLE CRONOLÓGICO DE INCIDENTES REGISTRADOS Y RESOLUCIONES (${studentIncidents.length})`,
    14,
    y
  );

  const incidentRows = studentIncidents.map((inc, index) => {
    const sanctionLabel =
      inc.sanctionType === 'otra_medida' && inc.customSanctionLabel
        ? inc.customSanctionLabel
        : SANCTION_TYPE_LABELS[inc.sanctionType];

    const incidentParts: string[] = [`Motivo: ${inc.reason}`];
    if (inc.description && inc.description.trim()) {
      incidentParts.push(`Detalle: ${inc.description.trim()}`);
    }
    incidentParts.push(`Autoridad: ${inc.authority || 'No informada'}`);

    const statusLabel = ACTUATION_STATUS_LABELS[inc.status].toUpperCase();
    const resolutionParts: string[] = [`Estado: ${statusLabel}`];
    if (inc.resolutionDetails && inc.resolutionDetails.trim()) {
      resolutionParts.push(`Resolución: ${inc.resolutionDetails.trim()}`);
    } else if (inc.status === 'resuelta') {
      resolutionParts.push('Resolución: Actuación resuelta y cerrada según registro institucional.');
    } else if (inc.status === 'anulada') {
      resolutionParts.push('Resolución: Actuación anulada / dejada sin efecto.');
    } else {
      resolutionParts.push('Resolución: Pendiente de cierre o seguimiento institucional.');
    }
    if (inc.resolutionDate) {
      resolutionParts.push(`Fecha res.: ${inc.resolutionDate}`);
    }
    if (inc.supportingDocRef) {
      resolutionParts.push(`Ref. documental: ${inc.supportingDocRef}`);
    }
    if (inc.supportingDocName) {
      resolutionParts.push(`Adjunto: ${inc.supportingDocName}`);
    }

    return [
      String(index + 1),
      `${inc.date}\n${inc.course}° Año (${inc.academicYear})`,
      inc.migratedFromLegacy ? `${sanctionLabel}\n(Migrado de legajo)` : sanctionLabel,
      incidentParts.join('\n'),
      resolutionParts.join('\n'),
    ];
  });

  autoTable(doc, {
    startY: y + 3,
    head: [
      [
        'N°',
        'FECHA / CURSO',
        'MEDIDA / SANCIÓN',
        'INCIDENTE REGISTRADO Y AUTORIDAD',
        'ESTADO Y RESOLUCIÓN',
      ],
    ],
    body:
      incidentRows.length > 0
        ? incidentRows
        : [
            [
              '—',
              '—',
              'Sin antecedentes',
              'No se registran incidentes disciplinarios en el historial estructurado del estudiante.',
              'Sin actuaciones pendientes ni sanciones activas.',
            ],
          ],
    theme: 'grid',
    styles: {
      fontSize: 7.3,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 33, fontStyle: 'bold' },
      3: { cellWidth: 59 },
      4: { cellWidth: 55 },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body' || incidentRows.length === 0) return;
      const inc = studentIncidents[hookData.row.index];
      if (!inc) return;
      if (hookData.column.index === 4) {
        if (inc.status === 'resuelta') {
          hookData.cell.styles.textColor = [3, 105, 161];
          hookData.cell.styles.fillColor = [240, 249, 255];
        } else if (inc.status === 'pendiente') {
          hookData.cell.styles.textColor = [146, 64, 14];
          hookData.cell.styles.fillColor = [254, 243, 199];
        } else {
          hookData.cell.styles.textColor = [100, 116, 139];
          hookData.cell.styles.fillColor = [241, 245, 249];
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 24 },
  });

  // @ts-ignore
  y = (doc.lastAutoTable?.finalY || y + 40) + 8;

  // -------------------------------------------------------------------------
  // SECCIÓN 3 (OPCIONAL): OBSERVACIONES PREVIAS DEL LEGAJO SIN MIGRAR
  // -------------------------------------------------------------------------
  if (unmigratedLegacyNotes.length > 0) {
    if (y > pageHeight - 45) {
      doc.addPage();
      y = 18;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(12, 45, 72);
    doc.text(
      `3. OBSERVACIONES DISCIPLINARIAS PREVIAS DEL LEGAJO (${unmigratedLegacyNotes.length})`,
      14,
      y
    );

    autoTable(doc, {
      startY: y + 3,
      head: [['N°', 'REGISTRO HISTÓRICO DE LEGAJO', 'ESTADO']],
      body: unmigratedLegacyNotes.map((note, idx) => [
        String(idx + 1),
        note,
        'Registro previo (sin migrar a historial estructurado)',
      ]),
      theme: 'grid',
      styles: {
        fontSize: 7.3,
        cellPadding: 2,
        textColor: [30, 41, 59],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 120 },
        2: { cellWidth: 52 },
      },
      margin: { left: 14, right: 14, bottom: 24 },
    });

    // @ts-ignore
    y = (doc.lastAutoTable?.finalY || y + 30) + 8;
  }

  // -------------------------------------------------------------------------
  // NOTA NORMATIVA Y BLOQUE DE FIRMAS OFICIALES
  // -------------------------------------------------------------------------
  if (y > pageHeight - 42) {
    doc.addPage();
    y = 22;
  }

  doc.setFontSize(7.4);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(71, 85, 105);
  const regNote =
    'Nota institucional: El presente resumen disciplinario refleja las actuaciones y resoluciones registradas en el legajo escolar. Las sanciones o medidas de convivencia nunca descuentan ni modifican las calificaciones ni el promedio académico del estudiante.';
  const wrappedNote = doc.splitTextToSize(regNote, pageWidth - 28);
  doc.text(wrappedNote, 14, y);

  let sigY = y + wrappedNote.length * 3.8 + 16;
  if (sigY > pageHeight - 18) {
    doc.addPage();
    sigY = 30;
  }

  const sigWidth = 52;
  const sigGap = (pageWidth - 28 - sigWidth * 3) / 2;
  doc.setDrawColor(148, 163, 184);
  [
    { label: 'Preceptoría / Tutoría', sub: 'Seguimiento de Convivencia' },
    { label: 'Secretaría Escolar', sub: 'Registro y Archivo de Legajo' },
    { label: schoolInfo.principalName || 'Dirección Institucional', sub: schoolName },
  ].forEach((sig, i) => {
    const sx = 14 + i * (sigWidth + sigGap);
    doc.line(sx, sigY, sx + sigWidth, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(sig.label, sx + sigWidth / 2, sigY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(sig.sub, sx + sigWidth / 2, sigY + 7.5, { align: 'center' });
  });

  // Pie de página en todas las hojas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${i} de ${totalPages} • ${schoolName} • Resumen Disciplinario • ${student.fullName.toUpperCase()} • ${todayFormatted}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const fileName = `Resumen_Disciplinario_${slugifyFileName(student.fullName, 'alumno')}_${
    student.dni || 'SDNI'
  }.pdf`;
  doc.save(fileName);

  return {
    fileName,
    totalIncidents: studentIncidents.length,
    activeIncidents: activeCount,
    pendingIncidents: pendingCount,
    resolvedIncidents: resolvedCount,
    annulledIncidents: annulledCount,
    legacyNotesCount: unmigratedLegacyNotes.length,
    pageCount: totalPages,
  };
};
