import React, { useState } from 'react';
import { 
  School, Users, GraduationCap, Menu, Info, X, Monitor, 
  LayoutDashboard, Database, Settings, Smartphone, Tablet, 
  CalendarCheck, ChevronDown, Check, Sparkles, Laptop, Calendar
} from 'lucide-react';
import { SchoolInfo, DeviceViewMode } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenBackup?: () => void;
  schoolInfo: SchoolInfo;
  onOpenSettings?: () => void;
  deviceMode: DeviceViewMode;
  setDeviceMode: (mode: DeviceViewMode) => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  onOpenBackup,
  schoolInfo,
  onOpenSettings,
  deviceMode,
  setDeviceMode,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  const deviceOptions: { id: DeviceViewMode; label: string; sub: string; icon: React.ReactNode }[] = [
    { 
      id: 'responsive', 
      label: 'Automático (Adaptable)', 
      sub: 'Se adapta al tamaño de la pantalla', 
      icon: <Monitor size={16} className="text-blue-600" /> 
    },
    { 
      id: 'pc', 
      label: 'PC / Escritorio', 
      sub: 'Visualización completa para computadoras', 
      icon: <Laptop size={16} className="text-indigo-600" /> 
    },
    { 
      id: 'android', 
      label: 'Celular Android', 
      sub: 'Formato teléfono Android táctil (~412px)', 
      icon: <Smartphone size={16} className="text-emerald-600" /> 
    },
    { 
      id: 'iphone', 
      label: 'iPhone (iOS)', 
      sub: 'Formato pantalla iPhone (~390px)', 
      icon: <Smartphone size={16} className="text-slate-700" /> 
    },
    { 
      id: 'tablet', 
      label: 'Tablet / iPad', 
      sub: 'Visualización formato tablet (~768px)', 
      icon: <Tablet size={16} className="text-purple-600" /> 
    },
  ];

  const currentDevice = deviceOptions.find((d) => d.id === deviceMode) || deviceOptions[0];

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-100/60">
      {/* Header Institucional */}
      <header className="bg-blue-900 text-white p-3 sm:p-5 shadow-lg no-print relative z-20">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo y Nombre Institucional */}
          <div className="flex items-center justify-between w-full md:w-auto gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 bg-blue-800 hover:bg-blue-700 rounded-xl text-yellow-400 transition-colors"
                title="Abrir menú"
              >
                <Menu size={22} />
              </button>
              
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-yellow-400/20 border border-yellow-400/30 flex items-center justify-center text-yellow-400 shrink-0 shadow-inner">
                <School size={26} />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-wider uppercase leading-tight">
                    {schoolInfo.name}
                  </h1>
                  <span className="bg-amber-400 text-blue-950 font-black text-[10px] sm:text-[11px] px-2 sm:px-2.5 py-0.5 rounded-full shadow-sm">
                    Ciclo {schoolInfo.academicYear}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-blue-200 mt-0.5 line-clamp-1">
                  {schoolInfo.address}
                  {schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : ''}
                </p>
              </div>
            </div>

            {/* Selector rápido móvil */}
            <div className="md:hidden">
              <button
                type="button"
                onClick={() => setShowDeviceMenu(!showDeviceMenu)}
                className="p-2 bg-white/10 hover:bg-white/20 text-yellow-300 rounded-xl border border-white/20 text-xs font-bold flex items-center gap-1"
                title="Cambiar formato de visualización"
              >
                {currentDevice.icon}
                <ChevronDown size={14} />
              </button>
            </div>
          </div>

          {/* Acciones y Selector de Dispositivos (PC, Android, iPhone, Tablet) */}
          <div className="flex flex-col md:items-end gap-2 w-full md:w-auto">
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-2">
              
              {/* BOTÓN DE ADAPTACIÓN DE VISTA (PC, CELULAR ANDROID, IPHONE, TABLET) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDeviceMenu(!showDeviceMenu)}
                  className="flex items-center gap-2 text-xs bg-amber-400 hover:bg-amber-300 text-blue-950 font-black px-3.5 py-2 rounded-xl transition-all shadow-md active:scale-95 border border-amber-300"
                  title="Adaptar visualización para PC, Celular Android, iPhone o Tablet"
                >
                  <div className="shrink-0">{currentDevice.icon}</div>
                  <span className="hidden sm:inline">Vista:</span>
                  <span className="font-extrabold">{currentDevice.label}</span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${showDeviceMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Menú desplegable de dispositivos */}
                {showDeviceMenu && (
                  <div className="absolute right-0 mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-2xl border border-gray-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150 text-gray-800">
                    <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                        Adaptar Visualización
                      </span>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                        Multi-dispositivo
                      </span>
                    </div>

                    <div className="p-1 space-y-0.5">
                      {deviceOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setDeviceMode(opt.id);
                            setShowDeviceMenu(false);
                          }}
                          className={`w-full px-3.5 py-2.5 rounded-xl text-left flex items-center justify-between transition-all ${
                            deviceMode === opt.id
                              ? 'bg-blue-50 text-blue-900 font-black shadow-sm'
                              : 'hover:bg-gray-50 text-gray-700 font-semibold'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-gray-100 shrink-0">
                              {opt.icon}
                            </div>
                            <div>
                              <p className="text-xs leading-tight">{opt.label}</p>
                              <p className="text-[10px] text-gray-400 font-normal mt-0.5">{opt.sub}</p>
                            </div>
                          </div>
                          {deviceMode === opt.id && (
                            <Check size={16} className="text-blue-700 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Configuración Escolar */}
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex items-center gap-1.5 text-xs bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-2 rounded-xl transition-all border border-blue-400/30 shadow-sm active:scale-95"
                  title="Configurar datos generales de la escuela (nombre, dirección, ciclo lectivo)"
                >
                  <Settings size={14} className="text-amber-300" />
                  <span className="hidden sm:inline">Datos Escuela</span>
                </button>
              )}

              {/* Backup Automático */}
              {onOpenBackup && (
                <button
                  type="button"
                  onClick={onOpenBackup}
                  className="flex items-center gap-1.5 text-xs bg-blue-800 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl transition-all shadow-sm border border-blue-700 active:scale-95"
                  title="Descargar copia de seguridad en JSON o restaurar base de datos"
                >
                  <Database size={14} className="text-yellow-400" />
                  <span className="hidden sm:inline">Backup</span>
                </button>
              )}

              {/* Ayuda de instalación */}
              <button 
                type="button"
                onClick={() => setShowInstallHelp(true)}
                className="flex items-center gap-1.5 text-xs bg-blue-800/80 hover:bg-blue-700 px-2.5 py-2 rounded-xl transition-colors border border-blue-700/60 font-medium text-blue-100"
                title="Cómo instalar como aplicación en PC y Celular"
              >
                <Info size={14} />
                <span className="hidden lg:inline">Instalar App</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Backdrop para menú lateral en móviles */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm transition-opacity"
        />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar de Navegación Principal */}
        <aside className={`bg-white w-64 sm:w-72 shadow-xl flex flex-col transition-all duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } fixed md:relative z-40 h-full no-print border-r border-gray-200 shrink-0`}>
          
          <div className="p-4 border-b border-gray-100 flex items-center justify-between md:hidden">
            <span className="text-xs font-black uppercase tracking-wider text-blue-900">
              Menú de Navegación
            </span>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 p-3 sm:p-4 space-y-2 overflow-y-auto">
            {/* Pestaña Alumnos */}
            <button 
              type="button"
              onClick={() => handleTabClick('students')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all text-sm ${
                activeTab === 'students' 
                  ? 'bg-blue-900 text-white font-black shadow-lg shadow-blue-900/20 scale-[1.02]' 
                  : 'text-gray-600 hover:bg-gray-100 font-bold'
              }`}
            >
              <Users size={20} className={activeTab === 'students' ? 'text-amber-400' : 'text-blue-700'} />
              <span>Alumnos</span>
            </button>

            {/* Pestaña Control de Asistencia Diario */}
            <button 
              type="button"
              onClick={() => handleTabClick('attendance')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all text-sm ${
                activeTab === 'attendance' 
                  ? 'bg-blue-900 text-white font-black shadow-lg shadow-blue-900/20 scale-[1.02]' 
                  : 'text-gray-600 hover:bg-gray-100 font-bold'
              }`}
            >
              <CalendarCheck size={20} className={activeTab === 'attendance' ? 'text-emerald-400' : 'text-emerald-600'} />
              <div className="text-left">
                <span className="block leading-tight">Asistencia Diaria</span>
                <span className={`text-[10px] block font-normal ${activeTab === 'attendance' ? 'text-blue-200' : 'text-gray-400'}`}>
                  Registro por curso y fecha
                </span>
              </div>
            </button>

            {/* Pestaña Docentes */}
            <button 
              type="button"
              onClick={() => handleTabClick('teachers')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all text-sm ${
                activeTab === 'teachers' 
                  ? 'bg-blue-900 text-white font-black shadow-lg shadow-blue-900/20 scale-[1.02]' 
                  : 'text-gray-600 hover:bg-gray-100 font-bold'
              }`}
            >
              <GraduationCap size={20} className={activeTab === 'teachers' ? 'text-amber-400' : 'text-blue-700'} />
              <span>Docentes</span>
            </button>

            {/* Pestaña Calendario Escolar */}
            <button 
              type="button"
              onClick={() => handleTabClick('calendar')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all text-sm ${
                activeTab === 'calendar' 
                  ? 'bg-blue-900 text-white font-black shadow-lg shadow-blue-900/20 scale-[1.02]' 
                  : 'text-gray-600 hover:bg-gray-100 font-bold'
              }`}
            >
              <Calendar size={20} className={activeTab === 'calendar' ? 'text-amber-400' : 'text-blue-700'} />
              <div className="text-left">
                <span className="block leading-tight">Calendario Escolar</span>
                <span className={`text-[10px] block font-normal ${activeTab === 'calendar' ? 'text-blue-200' : 'text-gray-400'}`}>
                  Eventos, exámenes y reuniones
                </span>
              </div>
            </button>

            {/* Pestaña Panel de Control */}
            <button 
              type="button"
              onClick={() => handleTabClick('reports')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all text-sm ${
                activeTab === 'reports' 
                  ? 'bg-blue-900 text-white font-black shadow-lg shadow-blue-900/20 scale-[1.02]' 
                  : 'text-gray-600 hover:bg-gray-100 font-bold'
              }`}
            >
              <LayoutDashboard size={20} className={activeTab === 'reports' ? 'text-amber-400' : 'text-blue-700'} />
              <span>Panel de Control</span>
            </button>

            {/* Acciones y Selector de Dispositivos en el Sidebar */}
            <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
              <div className="px-2 pb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Adaptar a Pantalla
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-50 rounded-2xl border border-gray-200">
                <button
                  type="button"
                  onClick={() => setDeviceMode('pc')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                    deviceMode === 'pc' ? 'bg-blue-900 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
                  }`}
                  title="Vista PC"
                >
                  <Laptop size={16} className="mb-0.5" />
                  <span className="text-[10px]">PC</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeviceMode('android')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                    deviceMode === 'android' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
                  }`}
                  title="Vista Celular Android"
                >
                  <Smartphone size={16} className="mb-0.5" />
                  <span className="text-[10px]">Android</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeviceMode('iphone')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                    deviceMode === 'iphone' ? 'bg-slate-800 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
                  }`}
                  title="Vista iPhone"
                >
                  <Smartphone size={16} className="mb-0.5" />
                  <span className="text-[10px]">iPhone</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDeviceMode('tablet')}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-bold transition-all ${
                    deviceMode === 'tablet' ? 'bg-purple-700 text-white shadow-sm' : 'text-gray-600 hover:bg-white'
                  }`}
                  title="Vista Tablet"
                >
                  <Tablet size={16} className="mb-0.5" />
                  <span className="text-[10px]">Tablet</span>
                </button>
              </div>

              {onOpenBackup && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenBackup();
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-amber-900 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 font-bold text-xs"
                >
                  <Database size={16} className="text-amber-600 shrink-0" />
                  <div className="text-left">
                    <p className="leading-none">Backup Automático</p>
                    <p className="text-[10px] text-amber-700/80 font-normal mt-0.5">Descargar JSON local</p>
                  </div>
                </button>
              )}

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSettings();
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-blue-900 bg-blue-50 hover:bg-blue-100/80 border border-blue-200/80 font-bold text-xs"
                >
                  <Settings size={16} className="text-blue-700 shrink-0" />
                  <div className="text-left">
                    <p className="leading-none">Datos de la Escuela</p>
                    <p className="text-[10px] text-blue-700/80 font-normal mt-0.5">Nombre, CUE y ciclo</p>
                  </div>
                </button>
              )}
            </div>
          </nav>
        </aside>

        {/* Contenido Principal con Simulación de Dispositivo si está activa */}
        <main className="flex-1 overflow-auto bg-slate-100/80 p-3 sm:p-6 md:p-8 w-full transition-all">
          {/* Si el usuario seleccionó un dispositivo específico en PC, envolver en marco de dispositivo */}
          <div className={`mx-auto transition-all duration-300 ${
            deviceMode === 'android'
              ? 'max-w-[420px] bg-white rounded-[36px] shadow-2xl border-8 border-slate-800 p-3 sm:p-5 my-2 min-h-[780px]'
              : deviceMode === 'iphone'
              ? 'max-w-[390px] bg-white rounded-[44px] shadow-2xl border-8 border-slate-900 p-3 sm:p-5 my-2 min-h-[780px]'
              : deviceMode === 'tablet'
              ? 'max-w-[768px] bg-white rounded-[32px] shadow-2xl border-8 border-slate-700 p-4 sm:p-6 my-2 min-h-[850px]'
              : 'w-full'
          }`}>
            
            {/* Barra superior de dispositivo (indicador visual para Android / iPhone) */}
            {(deviceMode === 'android' || deviceMode === 'iphone') && (
              <div className="flex items-center justify-between px-3 py-1.5 mb-4 border-b border-gray-100 text-[10px] font-bold text-gray-400 no-print">
                <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="h-4 w-24 bg-slate-800 rounded-full mx-auto" />
                <span>100% 🔋</span>
              </div>
            )}

            {children}
          </div>
        </main>
      </div>

      {/* Modal de Ayuda para Instalar en PC y Celular */}
      {showInstallHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 relative">
            <button 
              type="button"
              onClick={() => setShowInstallHelp(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-gray-100"
            >
              <X size={22} />
            </button>
            
            <div className="text-center mb-6">
              <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-700 shadow-inner">
                <Monitor size={32} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                Instalación en PC y Celulares
              </h3>
              <p className="text-sm text-gray-500 mt-2 font-medium">
                Esta aplicación está diseñada para funcionar como un sistema nativo en computadoras, celulares Android e iPhone.
              </p>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-gray-700">
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-100">
                <h4 className="font-bold text-blue-900 flex items-center gap-2 mb-1.5">
                  <Smartphone size={16} className="text-emerald-600" />
                  <span>En Celulares Android (Chrome / Edge):</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1 ml-1 text-gray-600">
                  <li>Toque los 3 puntos del navegador en la esquina superior derecha.</li>
                  <li>Seleccione <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.</li>
                  <li>Tendrá un ícono directo en su celular que funciona a pantalla completa.</li>
                </ol>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-gray-200">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-1.5">
                  <Laptop size={16} className="text-blue-600" />
                  <span>En Computadoras (Windows / Mac):</span>
                </h4>
                <ol className="list-decimal list-inside space-y-1 ml-1 text-gray-600">
                  <li>En Google Chrome o Edge, haga clic en el ícono de instalar en la barra de direcciones.</li>
                  <li>O vaya a Menú &rarr; Guardar y compartir &rarr; <strong>"Instalar página como aplicación..."</strong>.</li>
                </ol>
              </div>
            </div>

            <div className="mt-6">
              <button 
                type="button"
                onClick={() => setShowInstallHelp(false)}
                className="w-full bg-blue-900 text-white py-3 rounded-xl hover:bg-blue-800 font-bold text-sm shadow-md transition-all active:scale-95"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};