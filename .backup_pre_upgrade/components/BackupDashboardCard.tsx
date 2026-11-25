import React, { useState } from 'react';
import { 
  Database, 
  Download, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Upload, 
  HardDriveDownload,
  FileJson
} from 'lucide-react';
import { Student, Teacher } from '../types';
import { 
  downloadDatabaseBackupJson, 
  getLastBackupDate, 
  getBackupStatus, 
  calculateDatabaseStats 
} from '../services/backupService';

interface BackupDashboardCardProps {
  students: Student[];
  teachers: Teacher[];
  exTeachers: Teacher[];
  onOpenBackupModal: () => void;
}

export const BackupDashboardCard: React.FC<BackupDashboardCardProps> = ({
  students,
  teachers,
  exTeachers,
  onOpenBackupModal,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [lastBackupIso, setLastBackupIso] = useState<string | null>(getLastBackupDate());

  const status = getBackupStatus(lastBackupIso);
  const stats = calculateDatabaseStats(students, teachers, exTeachers);

  const handleQuickDownload = () => {
    try {
      const result = downloadDatabaseBackupJson(students, teachers, exTeachers);
      setLastBackupIso(result.timestamp);
      setDownloadSuccess(`Descargado: ${result.fileName}`);
      setTimeout(() => setDownloadSuccess(null), 6000);
    } catch (err: any) {
      alert('Error al descargar el backup: ' + (err?.message || 'Error desconocido'));
    }
  };

  return (
    <div className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-gray-100 relative overflow-hidden transition-all hover:shadow-md">
      {/* Fondo decorativo con marca de agua */}
      <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none text-blue-900">
        <Database size={130} />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Cabecera de la tarjeta */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-blue-600 text-white p-3.5 rounded-2xl shadow-md shadow-blue-600/20">
              <HardDriveDownload size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  Respaldo Institucional
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.badgeClass}`}>
                  {status.label}
                </span>
              </div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight mt-0.5">
                Copia de Seguridad & Backup Automático
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={onOpenBackupModal}
              className="text-xs font-bold text-gray-600 hover:text-blue-700 bg-gray-50 hover:bg-blue-50 border border-gray-200 px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <FileJson size={14} />
              <span>Opciones Avanzadas</span>
            </button>
          </div>
        </div>

        {/* Resumen de estado y estadísticas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Última Copia Descargada
            </p>
            <p className="font-black text-gray-800 text-sm flex items-center gap-1.5">
              <Clock size={15} className="text-gray-400" />
              {status.timeDescription}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {lastBackupIso 
                ? new Date(lastBackupIso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Pendiente de realizar'}
            </p>
          </div>

          <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">
              Alumnos en Base de Datos
            </p>
            <p className="font-black text-blue-950 text-xl">
              {stats.totalStudents} <span className="text-xs font-medium text-blue-700">estudiantes</span>
            </p>
            <p className="text-[11px] text-blue-600 mt-1">
              Cursos 1° a 6° año con notas
            </p>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
              Docentes en Base de Datos
            </p>
            <p className="font-black text-emerald-950 text-xl">
              {stats.totalTeachers} <span className="text-xs font-medium text-emerald-700">activos</span>
            </p>
            <p className="text-[11px] text-emerald-600 mt-1">
              Planta funcional y novedades
            </p>
          </div>
        </div>

        {/* Alerta de éxito al descargar */}
        {downloadSuccess && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 flex items-center gap-3 text-emerald-900 animate-in fade-in">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <p className="text-xs font-bold">{downloadSuccess}</p>
          </div>
        )}

        {/* Barra de acción principal */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-medium text-center sm:text-left">
            Exporta un archivo <span className="font-mono font-bold text-gray-700">.json</span> listo para resguardar en soporte externo (pendrive o nube).
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onOpenBackupModal}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <Upload size={14} />
              <span>Restaurar Copia</span>
            </button>
            <button
              onClick={handleQuickDownload}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-md shadow-blue-700/20 hover:shadow-blue-800/30 transition-all flex items-center justify-center gap-2"
            >
              <Download size={15} />
              <span>Descargar Backup JSON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
