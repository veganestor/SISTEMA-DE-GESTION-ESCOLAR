import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  CameraOff,
  Upload,
  QrCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  RefreshCw,
  FileCode,
  ExternalLink,
  Clock,
  Calendar,
  ClipboardCheck,
  Repeat,
  LogIn,
  LogOut,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Users,
  BarChart3,
  ShieldCheck,
} from 'lucide-react';
import {
  Student,
  Teacher,
  IssuedCardRecord,
  SchoolInfo,
  AttendanceRecord,
  CourseYear,
  CalendarEvent,
} from '../types';
import type {
  AuthUserSession,
  DailyAttendanceStatusSummary,
  ExitType,
  QRScanBackendResponse,
  ShiftType,
  StudentGuardianLink,
} from '../shared/attendanceDomain';
import { parseAndValidateQR, QRVerificationResult } from '../services/qrService';
import { getLocalTodayISO } from '../services/storageService';
import {
  formatLocalTimeHHMM,
  QRAttendanceFeedback,
} from '../services/attendanceService';
import { playAttendanceSound } from '../services/soundFeedback';
import {
  fetchDailyAttendanceBoard,
  fetchStudentGuardians,
  finalizeAbsencesNow,
  getInMemorySession,
  scanQREntry,
  scanQRExit,
  subscribeAuthSession,
  syncAppContextToBackend,
} from '../services/attendanceApiClient';
import { BackendAuthGate } from './BackendAuthGate';
import { ScheduleSettingsPanel } from './ScheduleSettingsPanel';
import { GuardiansAndUsersPanel } from './GuardiansAndUsersPanel';
import { UserManagementPanel } from './UserManagementPanel';
import { AttendanceReportsLogsPanel } from './AttendanceReportsLogsPanel';
import { GuardianPortalPanel } from './GuardianPortalPanel';

export type QRWorkspaceSection =
  | 'scanner'
  | 'schedules'
  | 'guardians'
  | 'users'
  | 'reports'
  | 'guardian-portal';

interface QRScannerPanelProps {
  students: Student[];
  teachers: Teacher[];
  issuedCards: IssuedCardRecord[];
  calendarEvents?: CalendarEvent[];
  schoolInfo: SchoolInfo;
  initialSection?: QRWorkspaceSection;
  onInspectStudent?: (student: Student) => void;
  onOpenTeachersTab?: () => void;
  onRegisterStudentAttendance?: (
    studentId: string,
    date: string,
    type: AttendanceRecord['type'],
    recordedAt?: string
  ) => QRAttendanceFeedback;
  onOpenAttendanceTracker?: (course?: CourseYear, date?: string) => void;
}

interface ScanHistoryEntry {
  id: string;
  scannedAt: string;
  operationMode: 'ingreso' | 'salida';
  rawData: string;
  localVerification: QRVerificationResult;
  backendResponse?: QRScanBackendResponse;
}

const CONTINUOUS_DUPLICATE_COOLDOWN_MS = 3000;

export const QRScannerPanel: React.FC<QRScannerPanelProps> = ({
  students,
  teachers,
  issuedCards,
  calendarEvents = [],
  schoolInfo,
  initialSection = 'scanner',
  onInspectStudent,
  onRegisterStudentAttendance,
  onOpenAttendanceTracker,
}) => {
  const [authUser, setAuthUser] = useState<AuthUserSession | null>(
    () => getInMemorySession().user
  );
  const [activeSection, setActiveSection] = useState<QRWorkspaceSection>(initialSection);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    return subscribeAuthSession((user) => {
      setAuthUser(user);
    });
  }, []);

  // Sincronización automática del padrón escolar hacia SQLite cuando inicia sesión personal habilitado
  useEffect(() => {
    if (!authUser || authUser.role === 'tutor') return;
    syncAppContextToBackend({
      students,
      issuedCards,
      calendarEvents,
    }).catch(() => {});
  }, [authUser?.id, students, issuedCards, calendarEvents]);

  // Estados del módulo operativo QR
  const [operationMode, setOperationMode] = useState<'ingreso' | 'salida'>('ingreso');
  const [activeInputMode, setActiveInputMode] = useState<'camera' | 'image' | 'manual'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [continuousScan, setContinuousScan] = useState(false);

  // Parámetros de fecha, hora y turno
  const [attendanceDate, setAttendanceDate] = useState<string>(() => getLocalTodayISO());
  const [useSystemClock, setUseSystemClock] = useState(true);
  const [customTime, setCustomTime] = useState<string>(() => formatLocalTimeHHMM());
  const [selectedShift, setSelectedShift] = useState<ShiftType>('manana');
  const [entryObservations, setEntryObservations] = useState('');

  // Parámetros de SALIDA
  const [exitType, setExitType] = useState<ExitType>('habitual');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [authorizedPersonName, setAuthorizedPersonName] = useState('');
  const [authorizedPersonDni, setAuthorizedPersonDni] = useState('');
  const [selectedGuardianLinkId, setSelectedGuardianLinkId] = useState<string>('');
  const [exitObservations, setExitObservations] = useState('');
  const [scannedStudentGuardians, setScannedStudentGuardians] = useState<StudentGuardianLink[]>([]);
  const [lastRawQrForRetryExit, setLastRawQrForRetryExit] = useState<string>('');

  // Resultados y tablero del día
  const [lastBackendResult, setLastBackendResult] = useState<QRScanBackendResponse | null>(null);
  const [lastLocalResult, setLastLocalResult] = useState<QRVerificationResult | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [dailyKpis, setDailyKpis] = useState({
    totalActive: 0,
    ingresaron: 0,
    presentes: 0,
    tardes: 0,
    ausentes: 0,
    enEstablecimiento: 0,
    salidasRegistradas: 0,
  });
  const [dailySummaries, setDailySummaries] = useState<DailyAttendanceStatusSummary[]>([]);
  const [showCloseAbsencesModal, setShowCloseAbsencesModal] = useState(false);
  const [closeAbsencesFeedback, setCloseAbsencesFeedback] = useState<string | null>(null);
  const [processingScan, setProcessingScan] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const continuousScanRef = useRef<boolean>(continuousScan);
  continuousScanRef.current = continuousScan;
  const lastContinuousScanRef = useRef<{ raw: string; timestamp: number } | null>(null);

  const refreshDailyBoard = useCallback(async () => {
    if (!authUser || authUser.role === 'tutor') return;
    try {
      const board = await fetchDailyAttendanceBoard({ date: attendanceDate });
      setDailyKpis(board.kpis);
      setDailySummaries(board.summaries);
    } catch {
      // Ignore transient load error
    }
  }, [authUser, attendanceDate]);

  useEffect(() => {
    refreshDailyBoard();
  }, [refreshDailyBoard]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    lastContinuousScanRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const getEffectiveTime = (): string => {
    return useSystemClock ? formatLocalTimeHHMM() : customTime || formatLocalTimeHHMM();
  };

  const executeBackendScan = useCallback(
    async (
      rawData: string,
      overrideExitPayload?: {
        exitType: ExitType;
        withdrawalReason: string;
        authorizedPersonName: string;
        authorizedPersonDni: string;
        guardianLinkId: string;
      }
    ) => {
      if (!authUser || authUser.role === 'tutor') return;
      setProcessingScan(true);

      const localVerif = parseAndValidateQR(rawData, students, teachers, issuedCards);
      setLastLocalResult(localVerif);
      const effectiveTime = getEffectiveTime();

      try {
        // Asegurar sincronización antes de procesar si hay un alumno local
        await syncAppContextToBackend({ students, issuedCards, calendarEvents });

        if (localVerif.matchedStudent) {
          fetchStudentGuardians(localVerif.matchedStudent.id)
            .then((links) => setScannedStudentGuardians(links))
            .catch(() => setScannedStudentGuardians([]));
        } else {
          setScannedStudentGuardians([]);
        }

        let response: QRScanBackendResponse;

        if (operationMode === 'ingreso') {
          response = await scanQREntry({
            qrRaw: rawData,
            attendanceDate,
            recordedTime: effectiveTime,
            shift: selectedShift,
            observations: entryObservations,
          });
        } else {
          setLastRawQrForRetryExit(rawData);
          const ex = overrideExitPayload || {
            exitType,
            withdrawalReason,
            authorizedPersonName,
            authorizedPersonDni,
            guardianLinkId: selectedGuardianLinkId,
          };
          response = await scanQRExit({
            qrRaw: rawData,
            attendanceDate,
            recordedTime: effectiveTime,
            exitType: ex.exitType,
            withdrawalReason: ex.withdrawalReason,
            authorizedPersonName: ex.authorizedPersonName,
            authorizedPersonDni: ex.authorizedPersonDni,
            guardianLinkId: ex.guardianLinkId || null,
            observations: exitObservations,
          });
        }

        setLastBackendResult(response);

        if (soundEnabled) {
          if (response.ok) {
            if (response.code === 'EXIT_REGISTERED') {
              playAttendanceSound('salida');
            } else if (response.movement?.attendanceStatus === 'tarde') {
              playAttendanceSound('tarde');
            } else {
              playAttendanceSound('presente');
            }
          } else {
            playAttendanceSound('error');
          }
        }

        if (
          response.ok &&
          response.code === 'ENTRY_REGISTERED' &&
          response.student &&
          onRegisterStudentAttendance
        ) {
          const stType = response.movement?.attendanceStatus || 'presente';
          onRegisterStudentAttendance(
            response.student.id,
            attendanceDate,
            stType,
            response.movement?.recordedTime || effectiveTime
          );
        }

        setHistory((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            scannedAt: effectiveTime,
            operationMode,
            rawData,
            localVerification: localVerif,
            backendResponse: response,
          },
          ...prev.slice(0, 14),
        ]);

        await refreshDailyBoard();
      } catch (err) {
        if (soundEnabled) playAttendanceSound('error');
        setLastBackendResult({
          ok: false,
          code: 'VALIDATION_ERROR',
          message: err instanceof Error ? err.message : 'Error procesando código QR.',
        });
      } finally {
        setProcessingScan(false);
      }
    },
    [
      authUser,
      students,
      teachers,
      issuedCards,
      calendarEvents,
      operationMode,
      attendanceDate,
      useSystemClock,
      customTime,
      selectedShift,
      entryObservations,
      exitType,
      withdrawalReason,
      authorizedPersonName,
      authorizedPersonDni,
      selectedGuardianLinkId,
      exitObservations,
      soundEnabled,
      onRegisterStudentAttendance,
      refreshDailyBoard,
    ]
  );

  const executeScanRef = useRef(executeBackendScan);
  executeScanRef.current = executeBackendScan;

  const scanFrameLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    if (
      video.readyState === video.HAVE_ENOUGH_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (decoded?.data) {
          const now = Date.now();
          const prevScan = lastContinuousScanRef.current;
          const isWithinCooldown =
            continuousScanRef.current &&
            prevScan &&
            prevScan.raw === decoded.data &&
            now - prevScan.timestamp < CONTINUOUS_DUPLICATE_COOLDOWN_MS;

          if (!isWithinCooldown) {
            lastContinuousScanRef.current = { raw: decoded.data, timestamp: now };
            executeScanRef.current(decoded.data);
          }

          if (!continuousScanRef.current) {
            stopCamera();
            return;
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(scanFrameLoop);
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    lastContinuousScanRef.current = null;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Este navegador no permite acceso directo a la cámara (requiere HTTPS o permiso). Puede usar "Imagen QR" o "Texto JSON".'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video
          .play()
          .then(() => {
            rafRef.current = requestAnimationFrame(scanFrameLoop);
          })
          .catch(() => {
            setCameraError('No se pudo iniciar la reproducción de la cámara.');
            stopCamera();
          });
      });
    } catch {
      setCameraError(
        'No se pudo abrir la cámara. Verifique permisos del navegador o utilice "Imagen QR".'
      );
      stopCamera();
    }
  };

  const handleUploadQRImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);

    const reader = new FileReader();
    reader.onerror = () => setImageError('Error leyendo el archivo seleccionado.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setImageError('El archivo seleccionado no es una imagen válida.');
      img.onload = () => {
        const offCanvas = document.createElement('canvas');
        const maxDim = 1200;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        offCanvas.width = width;
        offCanvas.height = height;
        const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (!decoded?.data) {
          setImageError('No se detectó ningún código QR legible en la imagen.');
          return;
        }
        executeBackendScan(decoded.data);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleManualVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    executeBackendScan(manualText);
  };

  const handleConfirmCloseAbsences = async () => {
    setShowCloseAbsencesModal(false);
    setCloseAbsencesFeedback(null);
    try {
      const res = await finalizeAbsencesNow({
        attendanceDate,
        currentTimeHHMM: getEffectiveTime(),
      });

      if (res.skippedNonSchoolDay) {
        setCloseAbsencesFeedback(
          `No se marcaron ausencias: el ${attendanceDate} figura como día no lectivo (${res.nonSchoolReason}).`
        );
        return;
      }

      if (onRegisterStudentAttendance) {
        for (const stId of res.absentStudentIds) {
          onRegisterStudentAttendance(stId, attendanceDate, 'ausente', getEffectiveTime());
        }
      }

      setCloseAbsencesFeedback(
        `Cierre ejecutado: ${res.markedAbsentCount} ausencias confirmadas. ${
          res.skippedBeforeCutoffCount > 0
            ? `${res.skippedBeforeCutoffCount} alumnos omitidos por continuar dentro de la ventana horaria del turno.`
            : ''
        }`
      );
      await refreshDailyBoard();
    } catch (err) {
      setCloseAbsencesFeedback(
        err instanceof Error ? err.message : 'Error ejecutando cierre de ausencias.'
      );
    }
  };

  const matchedStudentForLink = useMemo(() => {
    const id = lastBackendResult?.student?.id || lastLocalResult?.matchedStudent?.id;
    if (!id) return undefined;
    return students.find((s) => s.id === id);
  }, [lastBackendResult, lastLocalResult, students]);

  if (!authUser) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-in fade-in duration-300">
        <div className="aero-glass rounded-[28px] p-5 sm:p-7 border border-white/90 shadow-lg">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
            Sistema Integral de Asistencia Escolar por QR • {schoolInfo.name}
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            Control de Ingresos, Salidas y Portal Familiar
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Operación autenticada con control de roles, horarios por turno y validación de retiros anticipados.
          </p>
        </div>

        <BackendAuthGate
          currentUser={authUser}
          onAuthenticated={(user) => {
            setAuthUser(user);
            if (user.role === 'tutor') {
              setActiveSection('guardian-portal');
            }
          }}
        />
      </div>
    );
  }

  // Si inició sesión como Padre / Tutor, mostrar exclusivamente el Portal Familiar aislado
  if (authUser.role === 'tutor') {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-300">
        <BackendAuthGate currentUser={authUser} onAuthenticated={setAuthUser} />
        <GuardianPortalPanel currentUser={authUser} />
      </div>
    );
  }

  const canConfigure = authUser.role === 'admin';
  const canManageGuardiansAndClose = authUser.role === 'admin' || authUser.role === 'preceptor';

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-300">
      <BackendAuthGate currentUser={authUser} onAuthenticated={setAuthUser} />

      {/* Navegación modular del Sistema QR */}
      <div className="aero-glass rounded-3xl p-2.5 border border-white/90 shadow-md flex flex-wrap gap-1.5">
        {[
          {
            id: 'scanner' as QRWorkspaceSection,
            label: 'Tomar Asistencia y Salidas QR',
            icon: <QrCode size={15} />,
          },
          {
            id: 'schedules' as QRWorkspaceSection,
            label: 'Horarios y Días No Lectivos',
            icon: <SlidersHorizontal size={15} />,
          },
          {
            id: 'guardians' as QRWorkspaceSection,
            label: 'Tutores y Usuarios',
            icon: <Users size={15} />,
          },
          ...(canConfigure
            ? [
                {
                  id: 'users' as QRWorkspaceSection,
                  label: 'Gestión de Usuarios',
                  icon: <ShieldCheck size={15} />,
                },
              ]
            : []),
          {
            id: 'reports' as QRWorkspaceSection,
            label: 'Historial y Reportes',
            icon: <BarChart3 size={15} />,
          },
          ...(canManageGuardiansAndClose
            ? [
                {
                  id: 'guardian-portal' as QRWorkspaceSection,
                  label: 'Asistencia de mis hijos (Vista Tutor)',
                  icon: <ShieldCheck size={15} />,
                },
              ]
            : []),
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (tab.id !== 'scanner') stopCamera();
              setActiveSection(tab.id);
            }}
            className={`px-3.5 py-2.5 min-h-[40px] rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeSection === tab.id
                ? 'aero-btn-primary text-white shadow-sm'
                : 'text-slate-700 hover:bg-sky-50'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeSection === 'schedules' && <ScheduleSettingsPanel canEdit={canConfigure} />}
      {activeSection === 'guardians' && (
        <GuardiansAndUsersPanel students={students} currentUser={authUser} />
      )}
      {activeSection === 'users' && canConfigure && (
        <UserManagementPanel currentUser={authUser} />
      )}
      {activeSection === 'reports' && (
        <AttendanceReportsLogsPanel
          students={students}
          schoolInfo={schoolInfo}
          isAdmin={authUser.role === 'admin'}
        />
      )}
      {activeSection === 'guardian-portal' && <GuardianPortalPanel currentUser={authUser} />}

      {activeSection === 'scanner' && (
        <div className="space-y-6">
          {/* Selector Explícito de Operación: Tomar asistencia (INGRESO) vs Registrar salida (SALIDA) */}
          <div className="aero-glass rounded-[28px] p-5 sm:p-6 border border-white/90 shadow-lg space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-sky-700">
                  Operación Explícita de Portería / Preceptoría
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                  {operationMode === 'ingreso'
                    ? 'Tomar asistencia (Modo INGRESO)'
                    : 'Registrar salida (Modo SALIDA)'}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  El sistema nunca interpreta un segundo escaneo como salida; seleccione explícitamente el tipo de movimiento antes de escanear.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOperationMode('ingreso')}
                  className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-2 border transition-all whitespace-nowrap ${
                    operationMode === 'ingreso'
                      ? 'aero-btn-emerald text-white border-emerald-600 shadow-md'
                      : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <LogIn size={16} />
                  <span>Tomar asistencia (INGRESO)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOperationMode('salida')}
                  className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center gap-2 border transition-all whitespace-nowrap ${
                    operationMode === 'salida'
                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-md'
                      : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  <LogOut size={16} />
                  <span>Registrar salida (SALIDA)</span>
                </button>
              </div>
            </div>

            {/* Panel de 6 KPIs en tiempo real */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { label: 'Ingresaron', val: dailyKpis.ingresaron, color: 'text-sky-800 bg-sky-50 border-sky-200' },
                { label: 'Presentes', val: dailyKpis.presentes, color: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
                { label: 'Tardes', val: dailyKpis.tardes, color: 'text-amber-800 bg-amber-50 border-amber-200' },
                { label: 'Ausentes', val: dailyKpis.ausentes, color: 'text-rose-800 bg-rose-50 border-rose-200' },
                { label: 'En establecimiento', val: dailyKpis.enEstablecimiento, color: 'text-teal-800 bg-teal-50 border-teal-200' },
                { label: 'Salidas registradas', val: dailyKpis.salidasRegistradas, color: 'text-cyan-900 bg-cyan-50 border-cyan-200' },
              ].map((kpi) => (
                <div key={kpi.label} className={`rounded-2xl border p-3 ${kpi.color}`}>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider block">
                    {kpi.label}
                  </span>
                  <span className="text-2xl font-extrabold tabular-nums">{kpi.val}</span>
                </div>
              ))}
            </div>

            {/* Configuración operativa de jornada */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-sky-100 text-xs items-end">
              <div>
                <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar size={12} className="text-sky-600" />
                  <span>Fecha</span>
                </label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value || getLocalTodayISO())}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-sky-200 font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                  Turno Escolar
                </label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value as ShiftType)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-sky-200 font-bold"
                >
                  <option value="manana">Turno Mañana</option>
                  <option value="tarde">Turno Tarde</option>
                  <option value="vespertino">Turno Vespertino</option>
                </select>
              </div>

              <div>
                <label className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                  <span>Hora del Registro</span>
                  <button
                    type="button"
                    onClick={() => setUseSystemClock((prev) => !prev)}
                    className="text-sky-700 underline"
                  >
                    {useSystemClock ? 'Fijar hora' : 'Usar reloj real'}
                  </button>
                </label>
                {useSystemClock ? (
                  <div className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 font-mono font-extrabold text-sky-950 tabular-nums">
                    Reloj en vivo ({formatLocalTimeHHMM()} hs)
                  </div>
                ) : (
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-sky-200 font-mono font-bold tabular-nums"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                  Audio y Lectura
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSoundEnabled((prev) => !prev)}
                    className={`flex-1 py-2 px-2.5 rounded-xl font-bold border flex items-center justify-center gap-1 ${
                      soundEnabled
                        ? 'bg-sky-600 text-white border-sky-700'
                        : 'bg-white text-slate-600 border-sky-200'
                    }`}
                    title="Confirmación sonora"
                  >
                    {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span>Sonido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContinuousScan((prev) => !prev)}
                    className={`flex-1 py-2 px-2.5 rounded-xl font-bold border flex items-center justify-center gap-1 ${
                      continuousScan
                        ? 'bg-teal-600 text-white border-teal-700'
                        : 'bg-white text-slate-600 border-sky-200'
                    }`}
                  >
                    <Repeat size={14} />
                    <span>Continuo</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {canManageGuardiansAndClose && (
                  <button
                    type="button"
                    onClick={() => setShowCloseAbsencesModal(true)}
                    className="w-full py-2 px-3 min-h-[38px] rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Clock size={14} />
                    <span>Cerrar Turno (Ausentes)</span>
                  </button>
                )}
                {onOpenAttendanceTracker && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenAttendanceTracker(matchedStudentForLink?.course, attendanceDate)
                    }
                    className="w-full py-1.5 px-3 rounded-xl bg-white hover:bg-sky-50 text-sky-900 border border-sky-200 text-[11px] font-extrabold flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <ExternalLink size={12} />
                    <span>Asistencia Diaria</span>
                  </button>
                )}
              </div>
            </div>

            {closeAbsencesFeedback && (
              <div className="bg-sky-50 border border-sky-200 text-sky-950 rounded-2xl p-3 text-xs font-bold">
                {closeAbsencesFeedback}
              </div>
            )}

            {/* Formulario específico cuando está en modo SALIDA */}
            {operationMode === 'salida' && (
              <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-extrabold text-amber-950 uppercase tracking-wider">
                    Datos de Retiro / Salida del Establecimiento
                  </h4>
                  <span className="text-[11px] font-bold text-amber-900">
                    Para retiros anticipados se exige persona autorizada y motivo.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-extrabold text-slate-700 mb-1">
                      Tipo de Salida
                    </label>
                    <select
                      value={exitType}
                      onChange={(e) => setExitType(e.target.value as ExitType)}
                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-bold"
                    >
                      <option value="habitual">Salida habitual</option>
                      <option value="retiro_anticipado">Retiro anticipado</option>
                      <option value="retiro_excepcional">Retiro excepcional</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-extrabold text-slate-700 mb-1">
                      Tutor Autorizado (si aplica)
                    </label>
                    <select
                      value={selectedGuardianLinkId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedGuardianLinkId(val);
                        const match = scannedStudentGuardians.find((g) => g.id === val);
                        if (match?.guardian) {
                          setAuthorizedPersonName(match.guardian.fullName);
                          setAuthorizedPersonDni(match.guardian.dni || '');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-bold"
                    >
                      <option value="">Ingresar persona manualmente...</option>
                      {scannedStudentGuardians.map((sg) => (
                        <option key={sg.id} value={sg.id}>
                          {sg.guardian?.fullName} ({sg.relationship}) —{' '}
                          {sg.authorizedPickup ? 'Autorizado' : 'NO AUTORIZADO'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-extrabold text-slate-700 mb-1">
                      Persona que Retira
                    </label>
                    <input
                      type="text"
                      value={authorizedPersonName}
                      onChange={(e) => setAuthorizedPersonName(e.target.value)}
                      placeholder="Nombre y Apellido"
                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-extrabold text-slate-700 mb-1">
                      DNI Persona que Retira
                    </label>
                    <input
                      type="text"
                      value={authorizedPersonDni}
                      onChange={(e) => setAuthorizedPersonDni(e.target.value)}
                      placeholder="DNI"
                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-mono font-bold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-extrabold text-slate-700 mb-1">
                      Motivo del Retiro
                    </label>
                    <input
                      type="text"
                      value={withdrawalReason}
                      onChange={(e) => setWithdrawalReason(e.target.value)}
                      placeholder="Ej. Consulta médica / Retiro autorizado por tutor / Salida de turno"
                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-extrabold text-slate-700 mb-1">
                      Observaciones
                    </label>
                    <input
                      type="text"
                      value={exitObservations}
                      onChange={(e) => setExitObservations(e.target.value)}
                      placeholder="Observaciones adicionales (opcional)"
                      className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white font-semibold"
                    />
                  </div>
                </div>

                {lastRawQrForRetryExit &&
                  lastBackendResult &&
                  !lastBackendResult.ok &&
                  (lastBackendResult.code === 'UNAUTHORIZED_PICKUP' ||
                    lastBackendResult.code === 'VALIDATION_ERROR') && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          executeBackendScan(lastRawQrForRetryExit, {
                            exitType,
                            withdrawalReason,
                            authorizedPersonName,
                            authorizedPersonDni,
                            guardianLinkId: selectedGuardianLinkId,
                          })
                        }
                        className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold flex items-center gap-1.5"
                      >
                        <LogOut size={14} />
                        <span>Confirmar Salida del Alumno Escaneado</span>
                      </button>
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Escáner (Izquierda) + Resultado en Vivo (Derecha) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
              <div className="grid grid-cols-3 gap-2 bg-sky-100/70 p-1.5 rounded-2xl border border-sky-200">
                <button
                  type="button"
                  onClick={() => setActiveInputMode('camera')}
                  className={`py-2.5 px-2 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    activeInputMode === 'camera'
                      ? 'bg-white text-sky-950 shadow-sm'
                      : 'text-sky-800 hover:bg-white/50'
                  }`}
                >
                  <Camera size={15} />
                  <span>Cámara</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActiveInputMode('image');
                  }}
                  className={`py-2.5 px-2 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    activeInputMode === 'image'
                      ? 'bg-white text-sky-950 shadow-sm'
                      : 'text-sky-800 hover:bg-white/50'
                  }`}
                >
                  <Upload size={15} />
                  <span>Imagen QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setActiveInputMode('manual');
                  }}
                  className={`py-2.5 px-2 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                    activeInputMode === 'manual'
                      ? 'bg-white text-sky-950 shadow-sm'
                      : 'text-sky-800 hover:bg-white/50'
                  }`}
                >
                  <FileCode size={15} />
                  <span>Texto JSON</span>
                </button>
              </div>

              {activeInputMode === 'camera' && (
                <div className="space-y-4">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center border-2 border-sky-200">
                    {cameraActive ? (
                      <>
                        <video
                          ref={videoRef}
                          playsInline
                          muted
                          autoPlay
                          className="w-full h-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="w-52 h-52 sm:w-60 sm:h-60 border-2 border-cyan-300 rounded-2xl shadow-[0_0_0_9999px_rgba(8,25,45,0.45)]" />
                        </div>
                        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-sky-950/85 text-cyan-200 text-[11px] font-bold px-3.5 py-1.5 rounded-xl border border-cyan-400/40 whitespace-nowrap">
                          {operationMode === 'ingreso'
                            ? 'Modo INGRESO — apunte el carnet QR'
                            : 'Modo SALIDA — apunte el carnet QR'}
                        </span>
                      </>
                    ) : (
                      <div className="text-center p-6 space-y-3">
                        <div className="w-16 h-16 rounded-2xl bg-sky-500/20 text-cyan-300 flex items-center justify-center mx-auto border border-cyan-400/30">
                          <QrCode size={34} />
                        </div>
                        <p className="text-sm font-bold text-white">Cámara en espera</p>
                        <p className="text-xs text-sky-200/80 max-w-xs mx-auto">
                          Presione &ldquo;Activar Cámara&rdquo; para escanear códigos QR de alumnos.
                        </p>
                      </div>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  {cameraError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 text-xs font-semibold flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <span>{cameraError}</span>
                    </div>
                  )}

                  {!cameraActive ? (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="w-full aero-btn-primary py-3 px-5 min-h-[48px] rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md"
                    >
                      <Camera size={18} />
                      <span>Activar Cámara y Escanear</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 px-5 min-h-[48px] rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md"
                    >
                      <CameraOff size={18} />
                      <span>Detener Cámara</span>
                    </button>
                  )}
                </div>
              )}

              {activeInputMode === 'image' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-sky-300 bg-sky-50/70 rounded-2xl p-7 text-center space-y-3">
                    <div className="w-14 h-14 rounded-2xl bg-white text-sky-600 shadow-sm flex items-center justify-center mx-auto border border-sky-200">
                      <Upload size={26} />
                    </div>
                    <p className="text-sm font-extrabold text-slate-900">
                      Subir imagen de código QR
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadQRImage}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aero-btn-aqua px-6 py-3 min-h-[44px] rounded-xl text-xs font-extrabold inline-flex items-center gap-2"
                    >
                      <Upload size={15} />
                      <span>Seleccionar Imagen</span>
                    </button>
                  </div>

                  {imageError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3.5 text-xs font-semibold flex items-start gap-2">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <span>{imageError}</span>
                    </div>
                  )}
                </div>
              )}

              {activeInputMode === 'manual' && (
                <form onSubmit={handleManualVerify} className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    Pegar carga útil JSON del QR estudiantil
                  </label>
                  <textarea
                    rows={4}
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder='{"v":"1.0","uid":"...","type":"student","name":"...","role":"1° Año","cardNo":"EST-2026-0001","year":"2026","validUntil":"2026-12-31","signed":false}'
                    className="w-full p-3 rounded-2xl bg-white border border-sky-200 font-mono text-xs text-slate-800 outline-none focus:border-sky-500"
                  />
                  {operationMode === 'ingreso' && (
                    <input
                      type="text"
                      value={entryObservations}
                      onChange={(e) => setEntryObservations(e.target.value)}
                      placeholder="Observaciones del ingreso (opcional)"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-sky-200 text-xs font-semibold"
                    />
                  )}
                  <button
                    type="submit"
                    disabled={processingScan}
                    className="w-full aero-btn-primary py-3 min-h-[44px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <QrCode size={16} />
                    <span>
                      {processingScan
                        ? 'Procesando...'
                        : operationMode === 'ingreso'
                        ? 'Escanear y Registrar INGRESO'
                        : 'Escanear y Registrar SALIDA'}
                    </span>
                  </button>
                </form>
              )}
            </div>

            {/* Resultado de Validación y Confirmación Visual */}
            <div className="lg:col-span-6 space-y-5">
              {lastBackendResult ? (
                <div
                  className={`aero-glass rounded-3xl p-5 sm:p-6 border-2 shadow-xl space-y-4 ${
                    lastBackendResult.ok
                      ? 'border-emerald-400 bg-emerald-50/40'
                      : 'border-rose-400 bg-rose-50/40'
                  }`}
                >
                  <div
                    className={`rounded-2xl p-4 flex items-start gap-3 ${
                      lastBackendResult.ok
                        ? 'bg-emerald-100/90 text-emerald-950'
                        : 'bg-rose-100/90 text-rose-950'
                    }`}
                  >
                    {lastBackendResult.ok ? (
                      <CheckCircle2 size={24} className="text-emerald-700 shrink-0" />
                    ) : (
                      <XCircle size={24} className="text-rose-700 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-[11px] font-black uppercase tracking-wider block">
                        {lastBackendResult.code.replaceAll('_', ' ')}
                      </span>
                      <p className="text-xs sm:text-sm font-bold mt-1 leading-relaxed">
                        {lastBackendResult.message}
                      </p>
                    </div>
                  </div>

                  {lastBackendResult.student && (
                    <div className="bg-white/95 rounded-2xl p-4 border border-sky-100 flex items-center gap-4">
                      {lastBackendResult.student.photo ? (
                        <img
                          src={lastBackendResult.student.photo}
                          alt={lastBackendResult.student.fullName}
                          className="w-16 h-16 rounded-2xl object-cover border-2 border-sky-300 shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-900 font-black text-2xl flex items-center justify-center shrink-0">
                          <User size={26} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base font-extrabold text-slate-900 truncate">
                          {lastBackendResult.student.fullName}
                        </h4>
                        <p className="text-xs font-bold text-sky-800">
                          {lastBackendResult.student.course}° Año • División &ldquo;
                          {lastBackendResult.student.division || 'A'}&rdquo; • DNI{' '}
                          {lastBackendResult.student.dni || 'S/D'}
                        </p>
                        {lastBackendResult.dailySummary && (
                          <p className="text-[11px] font-bold text-slate-600 mt-1">
                            Ingreso: {lastBackendResult.dailySummary.entryTime || '--'} hs (
                            {lastBackendResult.dailySummary.entryStatus || '-'}) • Salida:{' '}
                            {lastBackendResult.dailySummary.exitTime || 'Pendiente'}
                          </p>
                        )}
                      </div>
                      {matchedStudentForLink && onInspectStudent && (
                        <button
                          type="button"
                          onClick={() => onInspectStudent(matchedStudentForLink)}
                          className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-extrabold shrink-0"
                        >
                          Legajo
                        </button>
                      )}
                    </div>
                  )}

                </div>
              ) : (
                <div className="aero-glass rounded-3xl p-8 border border-white/90 text-center space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mx-auto">
                    <ClipboardCheck size={32} />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Listo para registrar movimientos escolares por QR
                  </h3>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                    Seleccione <strong>Tomar asistencia (INGRESO)</strong> o{' '}
                    <strong>Registrar salida (SALIDA)</strong> y escanee la credencial del alumno.
                  </p>
                </div>
              )}

              {/* Historial de la sesión */}
              {history.length > 0 && (
                <div className="aero-glass rounded-3xl p-5 border border-white/90 space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-900">
                    Últimos Escaneos de la Jornada ({history.length})
                  </h4>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white/90 border border-sky-100 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-extrabold text-slate-900 truncate">
                            {item.backendResponse?.student?.fullName ||
                              item.localVerification.payload?.name ||
                              'QR Inválido'}
                          </p>
                          <p className="text-[10px] font-mono text-slate-500">
                            {item.scannedAt} • {item.operationMode.toUpperCase()}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase ${
                            item.backendResponse?.ok ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {item.backendResponse?.code || 'ERROR'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resumen Diario de Movimientos de Alumnos */}
          <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                Estado del Día ({attendanceDate}) — Nómina Activa ({dailySummaries.length})
              </h3>
              <button
                type="button"
                onClick={refreshDailyBoard}
                className="px-3 py-1.5 rounded-xl bg-white border border-sky-200 text-xs font-bold text-sky-800 flex items-center gap-1"
              >
                <RefreshCw size={13} />
                <span>Actualizar</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-sky-100 text-[10px] uppercase text-slate-500 text-left">
                    <th className="py-2 pr-3">Alumno</th>
                    <th className="py-2 pr-3">Curso / Div</th>
                    <th className="py-2 pr-3">Turno</th>
                    <th className="py-2 pr-3">Ingreso</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 pr-3">Salida</th>
                    <th className="py-2">Retira / Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100">
                  {dailySummaries.map((s) => (
                    <tr key={s.studentId}>
                      <td className="py-2 pr-3 font-extrabold text-slate-900">{s.studentName}</td>
                      <td className="py-2 pr-3 text-slate-700">
                        {s.course}° {s.division}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{s.shift}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {s.entryTime ? `${s.entryTime} hs` : '-'}
                      </td>
                      <td className="py-2 pr-3 font-extrabold uppercase text-[11px]">
                        {s.entryStatus === 'presente' && (
                          <span className="text-emerald-700">PRESENTE</span>
                        )}
                        {s.entryStatus === 'tarde' && (
                          <span className="text-amber-700">TARDE</span>
                        )}
                        {s.entryStatus === 'ausente' && (
                          <span className="text-rose-700">AUSENTE</span>
                        )}
                        {!s.entryStatus && <span className="text-slate-400">Pendiente</span>}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {s.exitTime ? `${s.exitTime} hs` : s.inPremises ? 'En escuela' : '-'}
                      </td>
                      <td className="py-2 text-slate-600">
                        {s.exitType
                          ? `${s.exitType}${
                              s.authorizedPersonName ? ` (${s.authorizedPersonName})` : ''
                            }`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Cierre de Control y Ausencias (sin window.confirm) */}
      {showCloseAbsencesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4">
          <div className="aero-glass rounded-3xl max-w-md w-full p-6 border-2 border-white shadow-2xl space-y-4">
            <h4 className="text-base font-extrabold text-slate-900">
              ¿Ejecutar cierre de control y registrar ausentes?
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Para el <strong>{attendanceDate}</strong> (hora de corte{' '}
              <strong className="font-mono">{getEffectiveTime()} hs</strong>), los alumnos sin ingreso cuyo horario límite de cierre ya haya vencido serán marcados como{' '}
              <strong>AUSENTE</strong>. Nunca se generan ausencias en días no lectivos ni antes del horario límite configurado.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowCloseAbsencesModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseAbsences}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs"
              >
                Confirmar Cierre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
