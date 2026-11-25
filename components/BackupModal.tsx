import React, { useState, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Clock, 
  FileJson, 
  X, 
  RefreshCw,
  Users,
  GraduationCap,
  Calendar,
  AlertCircle
} from 'lucide-react';
import {
  Student,
  Teacher,
  SchoolInfo,
  DEFAULT_SCHOOL_INFO,
  CalendarEvent,
  CardDesignConfig,
  IssuedCardRecord,
  StudentTrajectoryProfile,
  DisciplinaryIncident,
  MeritOrderConfig,
} from '../types';
import {
  downloadDatabaseBackupJson,
  getLastBackupDate,
  getBackupStatus,
  validateBackupContent,
  calculateDatabaseStats,
  DatabaseBackup,
} from '../services/backupService';
import { slugifyFileName } from '../services/storageService';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  teachers: Teacher[];
  exTeachers: Teacher[];
  schoolInfo?: SchoolInfo;
  calendarEvents?: CalendarEvent[];
  cardConfig?: CardDesignConfig;
  issuedCards?: IssuedCardRecord[];
  academicTrajectories?: Record<string, StudentTrajectoryProfile>;
  disciplinaryRecords?: DisciplinaryIncident[];
  meritConfig?: MeritOrderConfig;
  onRestoreBackup: (backup: DatabaseBackup) => void;
  onBackupCompleted?: (timestamp: string) => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  students,
  teachers,
  exTeachers,
  schoolInfo = DEFAULT_SCHOOL_INFO,
  calendarEvents,
  cardConfig,
  issuedCards,
  academicTrajectories,
  disciplinaryRecords,
  meritConfig,
  onRestoreBackup,
  onBackupCompleted,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<{ fileName: string; sizeKb: string } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [lastBackupIso, setLastBackupIso] = useState<string | null>(getLastBackupDate());
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<DatabaseBackup | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [activeTab, setActiveTab] = useState<'download' | 'restore'>('download');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentStats = calculateDatabaseStats(students, teachers, exTeachers);
  const statusInfo = getBackupStatus(lastBackupIso);

  const handleDownload = () => {
    setDownloadError(null);
    try {
      const result = downloadDatabaseBackupJson(
        students,
        teachers,
        exTeachers,
        schoolInfo,
        calendarEvents,
        cardConfig,
        issuedCards,
        academicTrajectories,
        disciplinaryRecords,
        meritConfig
      );
      setDownloadSuccess({ fileName: result.fileName, sizeKb: result.sizeKb });
      setLastBackupIso(result.timestamp);
      onBackupCompleted?.(result.timestamp);
      setTimeout(() => setDownloadSuccess(null), 7000);
    } catch (err: any) {
      setDownloadError('Error al generar la descarga: ' + (err?.message || 'Error desconocido'));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFile(file);
    setRestoreError(null);
    setRestorePreview(null);
    setConfirmRestore(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const validation = validateBackupContent(text);
        if (validation.success && validation.parsedBackup) {
          setRestorePreview(validation.parsedBackup);
        } else {
          setRestoreError(validation.message || 'El archivo seleccionado no es un backup válido.');
        }
      } catch (err: any) {
        setRestoreError('Error al leer el archivo: ' + (err?.message || 'Formato no legible'));
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = () => {
    if (!restorePreview) return;
    onRestoreBackup(restorePreview);
    setRestoreSuccessMsg(
      `¡Copia de seguridad restaurada con éxito! Se cargaron ${restorePreview.data.students.length} alumnos y ${restorePreview.data.teachers.length} docentes.`
    );
    setConfirmRestore(false);
    setTimeout(() => {
      setRestoreSuccessMsg(null);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4 overflow-y-auto no-print">
      <div
        className="aero-glass rounded-[30px] shadow-2xl max-w-2xl w-full border-2 border-white overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Modal Frutiger Aero */}
        <div className="aero-header p-6 md:p-7 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-sky-100 hover:text-white bg-white/15 hover:bg-white/25 p-2 rounded-full transition-colors"
            title="Cerrar ventana"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3.5 rounded-2xl backdrop-blur-md border border-white/30 shadow-inner">
              <Database className="text-emerald-200" size={30} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-extrabold tracking-widest uppercase bg-white/90 text-sky-950 px-2.5 py-0.5 rounded-md">
                  Módulo de Seguridad
                </span>
                <span className="text-xs text-sky-100 font-medium">Formato JSON Institucional</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white mt-1">
                Backup Automático y Copia de Seguridad
              </h3>
              <p className="text-xs sm:text-sm text-sky-100 font-medium mt-0.5 truncate">
                {schoolInfo.name} • Base de Datos Local
              </p>
            </div>
          </div>

          {/* Subnavegación del modal */}
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setActiveTab('download')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'download'
                  ? 'bg-white text-blue-950 shadow-md'
                  : 'bg-white/10 text-blue-100 hover:bg-white/20'
              }`}
            >
              <Download size={15} />
              <span>Descargar Copia (.JSON)</span>
            </button>
            <button
              onClick={() => setActiveTab('restore')}
              className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'restore'
                  ? 'bg-white text-blue-950 shadow-md'
                  : 'bg-white/10 text-blue-100 hover:bg-white/20'
              }`}
            >
              <Upload size={15} />
              <span>Restaurar Copia</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 md:p-8 space-y-6">
          {activeTab === 'download' && (
            <>
              {/* Banner de estado de la copia */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${statusInfo.badgeClass}`}>
                    {statusInfo.status === 'safe' ? (
                      <ShieldCheck size={22} className="text-emerald-700" />
                    ) : statusInfo.status === 'warning' ? (
                      <AlertTriangle size={22} className="text-amber-700" />
                    ) : (
                      <Clock size={22} className="text-red-700" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black uppercase tracking-wider text-gray-500">Estado del Respaldo:</p>
                      <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border ${statusInfo.badgeClass}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 font-medium mt-0.5">
                      {statusInfo.timeDescription}
                    </p>
                  </div>
                </div>

                {lastBackupIso && (
                  <span className="text-[11px] text-gray-400 font-medium self-end sm:self-center">
                    Último: {new Date(lastBackupIso).toLocaleDateString('es-AR')} {new Date(lastBackupIso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Mensaje de confirmación tras descargar */}
              {downloadSuccess && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex items-center gap-3 text-emerald-900 animate-in slide-in-from-top-2">
                  <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-emerald-950">¡Archivo de backup generado y descargado con éxito!</p>
                    <p className="font-mono text-emerald-700 mt-0.5">
                      {downloadSuccess.fileName} ({downloadSuccess.sizeKb} KB)
                    </p>
                  </div>
                </div>
              )}

              {/* Resumen de los datos a incluir */}
              <div className="space-y-3">
                <h4 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                  Contenido incluido en el archivo JSON
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-3.5">
                    <div className="flex items-center gap-2 text-blue-700 mb-1">
                      <Users size={16} />
                      <span className="text-xs font-bold">Estudiantes</span>
                    </div>
                    <p className="text-2xl font-black text-blue-950">{currentStats.totalStudents}</p>
                    <p className="text-[11px] text-blue-700 font-medium">De 1° a 6° año</p>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-3.5">
                    <div className="flex items-center gap-2 text-emerald-700 mb-1">
                      <GraduationCap size={16} />
                      <span className="text-xs font-bold">Docentes</span>
                    </div>
                    <p className="text-2xl font-black text-emerald-950">{currentStats.totalTeachers}</p>
                    <p className="text-[11px] text-emerald-700 font-medium">En ejercicio activo</p>
                  </div>

                  <div className="bg-purple-50/70 border border-purple-100 rounded-2xl p-3.5 col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-2 text-purple-700 mb-1">
                      <FileJson size={16} />
                      <span className="text-xs font-bold">Historial y Notas</span>
                    </div>
                    <p className="text-2xl font-black text-purple-950">100%</p>
                    <p className="text-[11px] text-purple-700 font-medium">Asistencias y boletines</p>
                  </div>
                </div>
              </div>

              {/* Mensaje de error si falló la descarga */}
              {downloadError && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-800 text-xs">
                  <AlertCircle size={20} className="text-rose-600 shrink-0" />
                  <p className="font-bold">{downloadError}</p>
                </div>
              )}

              {/* Explicación y Botón Principal */}
              <div className="bg-sky-50/70 border border-sky-200/80 rounded-2xl p-4 text-xs text-slate-700 leading-relaxed space-y-1">
                <p className="font-bold text-sky-950 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-sky-600" />
                  Seguridad y Privacidad Local:
                </p>
                <p>
                  El archivo descargado se guarda directamente en su equipo sin enviarse a servidores externos. Contiene todos los datos actuales de alumnos, docentes, calendario, configuración institucional y carnets de <strong>{schoolInfo.name}</strong>.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full aero-btn-primary font-extrabold py-4 px-6 min-h-[52px] rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 text-sm sm:text-base"
                >
                  <Download size={20} />
                  <span>Descargar Backup Completo (.JSON)</span>
                </button>
                <p className="text-center text-[11px] text-slate-500 mt-2">
                  Guarde una copia periódica en un pendrive o carpeta de resguardo institucional.
                </p>
              </div>
            </>
          )}

          {activeTab === 'restore' && (
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
                <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-950">Atención al restaurar copias de seguridad:</p>
                  <p className="mt-1 leading-relaxed">
                    Al cargar un archivo JSON de respaldo, los datos actuales de alumnos y docentes se reemplazarán por los contenidos en dicho archivo. Se recomienda descargar una copia previa de seguridad antes de continuar.
                  </p>
                </div>
              </div>

              {/* Selector de archivo */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer bg-gray-50 hover:bg-blue-50/40 transition-all flex flex-col items-center justify-center gap-2"
              >
                <Upload size={32} className="text-gray-400 group-hover:text-blue-600" />
                <span className="text-sm font-bold text-gray-700">
                  {restoreFile ? restoreFile.name : 'Haz clic para seleccionar el archivo .JSON'}
                </span>
                <span className="text-xs text-slate-500">
                  Formato compatible: backup_{slugifyFileName(schoolInfo.name, 'escuela')}_*.json (v1.0 y v2.0)
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json,application/json"
                  className="hidden"
                />
              </div>

              {restoreSuccessMsg && (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 flex items-center gap-3 text-emerald-900 text-xs font-bold">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  <p>{restoreSuccessMsg}</p>
                </div>
              )}

              {/* Error si falló la validación */}
              {restoreError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-800 text-xs">
                  <AlertCircle size={20} className="text-red-600 shrink-0" />
                  <p className="font-medium">{restoreError}</p>
                </div>
              )}

              {/* Vista previa de la copia a restaurar */}
              {restorePreview && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-blue-900">
                      Archivo validado correctamente
                    </span>
                    <span className="text-xs font-mono bg-blue-200 text-blue-900 px-2 py-0.5 rounded-full font-bold">
                      Versión {restorePreview.schemaVersion}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-gray-500 font-medium">Institución:</p>
                      <p className="font-bold text-gray-900">{restorePreview.institution}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Fecha de emisión:</p>
                      <p className="font-bold text-gray-900">{restorePreview.createdAtFormatted}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Total de Alumnos:</p>
                      <p className="font-black text-blue-900 text-base">{restorePreview.data.students.length} alumnos</p>
                    </div>
                    <div>
                      <p className="text-gray-500 font-medium">Total de Docentes:</p>
                      <p className="font-black text-emerald-900 text-base">{restorePreview.data.teachers.length} docentes</p>
                    </div>
                  </div>

                  {/* Confirmación explícita */}
                  {!confirmRestore ? (
                    <button
                      onClick={() => setConfirmRestore(true)}
                      className="w-full mt-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <RefreshCw size={15} />
                      <span>Proceder a Restaurar Datos</span>
                    </button>
                  ) : (
                    <div className="bg-amber-100 border border-amber-300 rounded-xl p-3 text-center space-y-2 mt-2">
                      <p className="text-xs font-bold text-amber-950">
                        ¿Confirma que desea reemplazar la base de datos actual con este archivo?
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={handleExecuteRestore}
                          className="bg-red-700 hover:bg-red-800 text-white font-black px-4 py-2 rounded-lg text-xs transition-colors shadow-sm"
                        >
                          Sí, restaurar ahora
                        </button>
                        <button
                          onClick={() => setConfirmRestore(false)}
                          className="bg-white hover:bg-gray-100 text-gray-700 font-bold px-4 py-2 rounded-lg text-xs border border-gray-300 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer del Modal */}
        <div className="bg-white/80 border-t border-sky-100 p-4 px-6 md:px-8 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-semibold truncate">
            {schoolInfo.name}
            {schoolInfo.province ? ` • ${schoolInfo.province}` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 min-h-[42px] bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-xs transition-colors shrink-0"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
