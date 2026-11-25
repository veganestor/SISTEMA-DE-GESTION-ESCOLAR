import React, { useState, useEffect } from 'react';
import { SchoolInfo, DEFAULT_SCHOOL_INFO } from '../types';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Calendar, 
  Mail, 
  Hash, 
  FileText, 
  Check, 
  X, 
  RotateCcw, 
  Save, 
  Eye, 
  ShieldCheck,
  Sparkles
} from 'lucide-react';

interface SchoolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  schoolInfo: SchoolInfo;
  onSave: (updated: SchoolInfo) => void;
}

export const SchoolSettingsModal: React.FC<SchoolSettingsModalProps> = ({
  isOpen,
  onClose,
  schoolInfo,
  onSave,
}) => {
  const [formData, setFormData] = useState<SchoolInfo>(schoolInfo);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');

  useEffect(() => {
    if (isOpen) {
      setFormData(schoolInfo);
      setShowSavedFeedback(false);
    }
  }, [isOpen, schoolInfo]);

  if (!isOpen) return null;

  const handleChange = (field: keyof SchoolInfo, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('El nombre de la escuela no puede estar vacío.');
      return;
    }
    onSave(formData);
    setShowSavedFeedback(true);
    setTimeout(() => {
      setShowSavedFeedback(false);
      onClose();
    }, 1200);
  };

  const handleResetDefaults = () => {
    if (window.confirm('¿Restablecer los datos generales de la escuela a los valores predeterminados?')) {
      setFormData(DEFAULT_SCHOOL_INFO);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-gray-100 flex flex-col my-8">
        
        {/* Header del Modal */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 text-white p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"
            aria-label="Cerrar ventana"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-400 text-blue-950 rounded-2xl shadow-md transform -rotate-3">
              <Building2 size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-full bg-blue-700/60 text-amber-300 border border-blue-600/50">
                  Configuración del Sistema
                </span>
                <span className="text-xs text-blue-200">Datos Oficiales</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white mt-1">
                Datos Generales de la Escuela
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Edite la información institucional aplicada automáticamente en reportes PDF, boletines, certificados y listados Excel.
              </p>
            </div>
          </div>

          {/* Selector de Pestañas: Edición / Vista Previa */}
          <div className="flex gap-2 mt-5 border-t border-blue-800/80 pt-3">
            <button
              type="button"
              onClick={() => setActiveTab('form')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'form'
                  ? 'bg-white text-blue-950 shadow-sm'
                  : 'bg-blue-800/60 text-blue-100 hover:bg-blue-800'
              }`}
            >
              <FileText size={14} />
              <span>Formulario de Configuración</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'preview'
                  ? 'bg-white text-blue-950 shadow-sm'
                  : 'bg-blue-800/60 text-blue-100 hover:bg-blue-800'
              }`}
            >
              <Eye size={14} />
              <span>Vista Previa de Encabezado</span>
            </button>
          </div>
        </div>

        {/* Notificación de Éxito al Guardar */}
        {showSavedFeedback && (
          <div className="bg-emerald-500 text-white px-6 py-3 flex items-center justify-center gap-2 text-sm font-black animate-in slide-in-from-top-2 duration-300">
            <Check size={18} />
            <span>¡Datos institucionales guardados correctamente!</span>
          </div>
        )}

        {/* Contenido Principal */}
        <div className="p-6 md:p-8 max-h-[70vh] overflow-y-auto">
          {activeTab === 'form' ? (
            <form id="school-settings-form" onSubmit={handleSave} className="space-y-6">
              
              {/* Sección 1: Identificación Principal */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-2 mb-3">
                  <Building2 size={16} className="text-blue-600" />
                  <span>1. Identificación y Ciclo Lectivo</span>
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Nombre de la Escuela */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Nombre de la Escuela <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="Ej. ESCUELA SECUNDARIA DE LOS BULACIOS"
                        className="w-full pl-3 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all uppercase"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Aparecerá en el encabezado principal de cada reporte, certificado y boletín.
                    </p>
                  </div>

                  {/* Ciclo Lectivo Vigente */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Ciclo Lectivo Vigente <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="number"
                        min="2020"
                        max="2040"
                        required
                        value={formData.academicYear}
                        onChange={(e) => handleChange('academicYear', Number(e.target.value))}
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-black text-blue-900 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">Año escolar activo (ej. 2026).</p>
                  </div>
                </div>
              </div>

              {/* Sección 2: Domicilio y Contacto */}
              <div className="pt-2 border-t border-gray-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-2 mb-3">
                  <MapPin size={16} className="text-blue-600" />
                  <span>2. Localización y Canales de Contacto</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Dirección */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Dirección Institucional / Ubicación <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        required
                        value={formData.address}
                        onChange={(e) => handleChange('address', e.target.value)}
                        placeholder="Ej. Ruta 306 Km 22 – Los Bulacio – Dpto. Cruz Alta"
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Teléfono */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Teléfono de Contacto
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="Ej. 381-4567890"
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Correo Electrónico Institucional */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Correo Electrónico Oficial
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="Ej. secundaria.losbulacios@educaciontuc.gov.ar"
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección 3: Datos Normativos y Autoridad */}
              <div className="pt-2 border-t border-gray-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-2 mb-3">
                  <ShieldCheck size={16} className="text-blue-600" />
                  <span>3. Datos Normativos y Autoridad Firmante</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* CUE */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Código Único de Establecimiento (C.U.E.)
                    </label>
                    <div className="relative">
                      <Hash size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        value={formData.cue || ''}
                        onChange={(e) => handleChange('cue', e.target.value)}
                        placeholder="Ej. 9001234-00"
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono text-gray-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">Identificador ministerial del establecimiento educativo.</p>
                  </div>

                  {/* Autoridad Responsable / Firma Dirección */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700">
                      Firma de Autoridad / Dirección
                    </label>
                    <div className="relative">
                      <ShieldCheck size={16} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        value={formData.principalName || ''}
                        onChange={(e) => handleChange('principalName', e.target.value)}
                        placeholder="Ej. Dirección Escolar o Nombre del Directivo"
                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">Nombre o leyenda que figura en el campo de firma de la dirección.</p>
                  </div>
                </div>
              </div>

              {/* Botón de restablecer */}
              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-900 underline font-medium transition-colors"
                >
                  <RotateCcw size={13} />
                  <span>Restablecer valores predeterminados</span>
                </button>
              </div>
            </form>
          ) : (
            /* Vista Previa Interactiva del Encabezado */
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <Sparkles size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 leading-relaxed font-medium">
                  Así se visualizarán los encabezados de los documentos oficiales (reportes PDF, legajos escolares y exportaciones Excel) con los datos ingresados actualmente:
                </p>
              </div>

              {/* Muestra de Encabezado tipo PDF */}
              <div className="border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                <div className="bg-blue-900 text-white p-5 text-center relative">
                  <div className="h-1.5 bg-amber-400 w-full absolute top-0 left-0"></div>
                  <h4 className="text-lg font-black tracking-wide uppercase">
                    {formData.name || 'NOMBRE DE LA ESCUELA'}
                  </h4>
                  <p className="text-xs text-blue-200 mt-1">
                    {formData.address || 'Dirección de la institución'} 
                    {formData.phone ? ` • Tel: ${formData.phone}` : ''}
                    {formData.cue ? ` • CUE: ${formData.cue}` : ''}
                  </p>
                  <p className="text-[11px] text-amber-300 font-bold uppercase tracking-wider mt-1.5">
                    CICLO LECTIVO {formData.academicYear || 2026} • DOCUMENTO OFICIAL DE TRAYECTORIA ESCOLAR
                  </p>
                </div>

                <div className="p-5 bg-slate-50 border-t border-slate-200">
                  <div className="text-center font-bold text-xs text-slate-700 uppercase tracking-wider mb-4">
                    REPORTE INTEGRAL DE SITUACIÓN ACADÉMICA Y ASISTENCIA
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs bg-white p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">Establecimiento</span>
                      <strong className="text-slate-800">{formData.name}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">Año Escolar</span>
                      <strong className="text-blue-900">Ciclo {formData.academicYear}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">Contacto</span>
                      <span className="text-slate-700">{formData.phone || 'Sin teléfono'} | {formData.email || 'Sin correo'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-bold block text-[10px] uppercase">Firma Autorizada</span>
                      <span className="text-slate-700">{formData.principalName || 'Dirección Escolar'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Muestra de Encabezado en Excel */}
              <div className="border border-emerald-200 rounded-2xl p-4 bg-emerald-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">
                    Vista Hoja de Cálculo (.XLSX)
                  </span>
                  <span className="text-xs text-emerald-900 font-bold">Encabezado en celdas de Excel:</span>
                </div>
                <div className="bg-white rounded-lg border border-emerald-200 p-3 font-mono text-xs text-slate-800 space-y-1">
                  <div className="font-bold text-emerald-950">[A1] {formData.name.toUpperCase()}</div>
                  <div className="text-slate-600">[A2] PADRÓN GENERAL / BOLETÍN - CICLO LECTIVO {formData.academicYear}</div>
                  <div className="text-slate-500 text-[11px]">[A3] {formData.address} {formData.phone ? `| Tel: ${formData.phone}` : ''} {formData.cue ? `| CUE: ${formData.cue}` : ''}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer del Modal */}
        <div className="p-4 md:px-8 md:py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Los cambios se guardan localmente y se mantendrán en las próximas sesiones.
          </p>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="school-settings-form"
              onClick={activeTab === 'preview' ? handleSave : undefined}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black shadow-md transition-all active:scale-95"
            >
              <Save size={15} />
              <span>Guardar Configuración</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
