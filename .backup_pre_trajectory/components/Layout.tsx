import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  GraduationCap,
  Menu,
  X,
  Monitor,
  LayoutDashboard,
  Database,
  Settings,
  Smartphone,
  Tablet,
  CalendarCheck,
  ChevronDown,
  Check,
  Laptop,
  Calendar,
  IdCard,
  BadgeCheck,
  QrCode,
  Palette,
  Bell,
  BellRing,
} from 'lucide-react';
import { SchoolInfo, DeviceViewMode } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { OfflineIndicator } from './OfflineIndicator';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenBackup?: () => void;
  schoolInfo: SchoolInfo;
  onOpenSettings?: () => void;
  deviceMode: DeviceViewMode;
  setDeviceMode: (mode: DeviceViewMode) => void;
  isPushSubscribed?: boolean;
  pushAlertCount?: number;
  onOpenPushAlerts?: () => void;
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
  isPushSubscribed = false,
  pushAlertCount = 0,
  onOpenPushAlerts,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const deviceMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) {
        setShowDeviceMenu(false);
      }
    };
    if (showDeviceMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDeviceMenu]);

  const deviceOptions: { id: DeviceViewMode; label: string; shortLabel: string; sub: string; icon: React.ReactNode }[] = [
    {
      id: 'responsive',
      label: 'Automático (Adaptable)',
      shortLabel: 'Auto',
      sub: 'Se adapta automáticamente a su pantalla',
      icon: <Monitor size={15} className="text-sky-600" />,
    },
    {
      id: 'pc',
      label: 'Vista escritorio (PC)',
      shortLabel: 'Escritorio',
      sub: 'Visualización completa para computadoras',
      icon: <Laptop size={15} className="text-sky-700" />,
    },
    {
      id: 'android',
      label: 'Celular Android',
      shortLabel: 'Android',
      sub: 'Formato teléfono Android táctil (~412px)',
      icon: <Smartphone size={15} className="text-emerald-600" />,
    },
    {
      id: 'iphone',
      label: 'iPhone (iOS)',
      shortLabel: 'iPhone',
      sub: 'Formato pantalla iPhone (~390px)',
      icon: <Smartphone size={15} className="text-slate-700" />,
    },
    {
      id: 'tablet',
      label: 'Tablet / iPad',
      shortLabel: 'Tablet',
      sub: 'Visualización formato tablet (~768px)',
      icon: <Tablet size={15} className="text-teal-600" />,
    },
  ];

  const currentDevice = deviceOptions.find((d) => d.id === deviceMode) || deviceOptions[0];
  const isSimulatedMobile = deviceMode === 'android' || deviceMode === 'iphone';

  const handleToggleQuickMobile = () => {
    if (isSimulatedMobile) {
      setDeviceMode('pc');
    } else {
      setDeviceMode('android');
    }
    setShowDeviceMenu(false);
  };

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const navItemClass = (isActive: boolean) =>
    `w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-2xl transition-all text-[13px] ${
      isActive
        ? 'aero-btn-primary text-white font-extrabold shadow-md'
        : 'text-slate-700 hover:bg-sky-50/90 hover:text-sky-950 font-bold'
    }`;

  return (
    <div className="min-h-screen flex flex-col font-sans aero-canvas overflow-x-hidden">
      <OfflineIndicator />

      {/* Header Institucional Frutiger Aero */}
      <header className="aero-header text-white px-3 py-3 sm:px-5 sm:py-3.5 shadow-lg no-print relative z-30">
        <div className="max-w-[1600px] mx-auto flex flex-col lg:flex-row justify-between items-center gap-3">
          {/* Logo, Escudo Dinámico y Nombre Institucional */}
          <div className="flex items-center justify-between w-full lg:w-auto gap-2.5">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/15 hover:bg-white/25 rounded-xl text-white border border-white/25 transition-colors shrink-0"
                aria-label="Abrir menú de navegación"
              >
                <Menu size={22} />
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('reports')}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/95 border border-white flex items-center justify-center shrink-0 shadow-md overflow-hidden p-1 transition-transform hover:scale-105"
                title="Ir al Panel de Control"
              >
                {schoolInfo.logo ? (
                  <img
                    src={schoolInfo.logo}
                    alt={`Escudo de ${schoolInfo.name}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src="/aero-emblem.png"
                    alt="Emblema institucional"
                    className="w-full h-full object-cover rounded-xl"
                  />
                )}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm sm:text-lg md:text-xl font-extrabold tracking-tight uppercase leading-tight truncate max-w-[230px] sm:max-w-md lg:max-w-xl">
                    {schoolInfo.name}
                  </h1>
                  <span className="bg-white/95 text-sky-900 font-extrabold text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-lg shadow-sm whitespace-nowrap">
                    Ciclo {schoolInfo.academicYear}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-sky-100/95 mt-0.5 truncate max-w-[250px] sm:max-w-lg">
                  {schoolInfo.institutionType ? `${schoolInfo.institutionType}` : 'Sistema de Gestión Escolar'}
                  {schoolInfo.institutionNumber ? ` ${schoolInfo.institutionNumber}` : ''}
                  {schoolInfo.address ? ` • ${schoolInfo.address}` : ''}
                  {schoolInfo.phone ? ` • Tel: ${schoolInfo.phone}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Barra de Acciones y Adaptación de Vista */}
          <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 w-full lg:w-auto">
            {/* Botón directo Vista móvil / Vista escritorio */}
            <button
              type="button"
              onClick={handleToggleQuickMobile}
              className={`flex items-center gap-1.5 min-h-[40px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 border whitespace-nowrap ${
                isSimulatedMobile
                  ? 'bg-white text-sky-900 border-white shadow-md'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/30 backdrop-blur-md'
              }`}
              title={
                isSimulatedMobile
                  ? 'Volver a presentación habitual de escritorio'
                  : 'Cambiar a presentación optimizada para teléfonos celulares'
              }
            >
              {isSimulatedMobile ? (
                <>
                  <Monitor size={15} className="text-sky-700 shrink-0" />
                  <span>Vista escritorio</span>
                </>
              ) : (
                <>
                  <Smartphone size={15} className="text-emerald-200 shrink-0" />
                  <span>Vista móvil</span>
                </>
              )}
            </button>

            {/* Selector Multi-dispositivo (Auto / PC / Android / iPhone / Tablet) */}
            <div className="relative" ref={deviceMenuRef}>
              <button
                type="button"
                onClick={() => setShowDeviceMenu(!showDeviceMenu)}
                className="flex items-center gap-1.5 min-h-[40px] text-xs bg-white/95 hover:bg-white text-sky-950 font-extrabold px-3 py-2 rounded-xl transition-all shadow-sm border border-white whitespace-nowrap"
                title="Elegir visualización: Automático, PC, Celular Android, iPhone o Tablet"
              >
                <span className="shrink-0">{currentDevice.icon}</span>
                <span className="hidden sm:inline">{currentDevice.shortLabel}</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${showDeviceMenu ? 'rotate-180' : ''}`}
                />
              </button>

              {showDeviceMenu && (
                <div className="absolute right-0 mt-2 w-64 sm:w-72 aero-glass rounded-2xl shadow-2xl border-2 border-white py-2 z-50 text-slate-800">
                  <div className="px-4 py-2 border-b border-sky-100 flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800">
                      Adaptar Visualización
                    </span>
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md">
                      Multi-dispositivo
                    </span>
                  </div>

                  <div className="p-1.5 space-y-0.5">
                    {deviceOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDeviceMode(opt.id);
                          setShowDeviceMenu(false);
                        }}
                        className={`w-full px-3 py-2.5 min-h-[44px] rounded-xl text-left flex items-center justify-between transition-all ${
                          deviceMode === opt.id
                            ? 'bg-sky-100/90 text-sky-950 font-extrabold'
                            : 'hover:bg-sky-50 text-slate-700 font-semibold'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-white border border-sky-100 shrink-0">
                            {opt.icon}
                          </div>
                          <div>
                            <p className="text-xs leading-tight">{opt.label}</p>
                            <p className="text-[10px] text-slate-500 font-normal mt-0.5">{opt.sub}</p>
                          </div>
                        </div>
                        {deviceMode === opt.id && <Check size={16} className="text-sky-700 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Botón Configuración Institucional */}
            <button
              type="button"
              onClick={() => handleTabClick('settings')}
              className={`flex items-center gap-1.5 min-h-[40px] text-xs font-bold px-3 py-2 rounded-xl transition-all border whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-white text-sky-950 border-white shadow'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/30 backdrop-blur-md'
              }`}
              title="Abrir Configuración Institucional (nombre, escudo, dirección, director)"
            >
              <Settings size={15} className={activeTab === 'settings' ? 'text-sky-700' : 'text-sky-100'} />
              <span className="hidden sm:inline">Institución</span>
            </button>

            {/* Backup */}
            {onOpenBackup && (
              <button
                type="button"
                onClick={onOpenBackup}
                className="flex items-center gap-1.5 min-h-[40px] text-xs bg-white/15 hover:bg-white/25 text-white font-bold px-3 py-2 rounded-xl transition-all border border-white/30 backdrop-blur-md whitespace-nowrap"
                title="Descargar copia de seguridad JSON o restaurar datos locales"
              >
                <Database size={15} className="text-emerald-200" />
                <span className="hidden sm:inline">Backup</span>
              </button>
            )}

            {/* Notificaciones Push Institucionales */}
            {onOpenPushAlerts && (
              <button
                type="button"
                onClick={onOpenPushAlerts}
                className={`relative flex items-center gap-1.5 min-h-[40px] text-xs font-extrabold px-3 py-2 rounded-xl transition-all border whitespace-nowrap ${
                  isPushSubscribed
                    ? 'bg-emerald-500/25 hover:bg-emerald-500/35 text-white border-emerald-200/70 backdrop-blur-md'
                    : 'bg-white/15 hover:bg-white/25 text-white border-white/30 backdrop-blur-md'
                }`}
                title={
                  isPushSubscribed
                    ? 'Alertas Push activas — Clic para configurar categorías y cursos'
                    : 'Suscribirse a alertas push de exámenes y eventos escolares'
                }
                aria-label="Configurar alertas push institucionales"
              >
                {isPushSubscribed ? (
                  <BellRing size={15} className="text-emerald-200 shrink-0" />
                ) : (
                  <Bell size={15} className="text-sky-100 shrink-0" />
                )}
                <span className="hidden sm:inline">Alertas</span>
                {isPushSubscribed && (
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.95)] shrink-0"
                    aria-hidden="true"
                  />
                )}
                {pushAlertCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-amber-400 text-sky-950 text-[10px] font-black leading-tight">
                    {pushAlertCount > 9 ? '9+' : pushAlertCount}
                  </span>
                )}
              </button>
            )}

            {/* Instalación PWA nativa / guía iOS y Android */}
            <PWAInstallButton compact schoolName={schoolInfo.name} />
          </div>
        </div>
      </header>

      {/* Backdrop del drawer lateral móvil */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-sky-950/45 z-40 md:hidden backdrop-blur-sm transition-opacity no-print"
        />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Frutiger Aero */}
        <aside
          className={`aero-glass w-[276px] shadow-xl flex flex-col transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          } fixed md:relative inset-y-0 left-0 z-50 md:z-20 h-full no-print border-r border-white/80 shrink-0`}
        >
          <div className="p-4 border-b border-sky-100 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white border border-sky-200 p-0.5 overflow-hidden shrink-0">
                <img
                  src={schoolInfo.logo || '/aero-emblem.png'}
                  alt="Escudo"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-sky-950 truncate">
                {schoolInfo.name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl hover:bg-sky-100"
              aria-label="Cerrar menú"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 p-3.5 space-y-5 overflow-y-auto">
            {/* Sección 1: Gestión Académica */}
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-sky-700/90 mb-1.5">
                Gestión Académica
              </p>

              <button
                type="button"
                onClick={() => handleTabClick('reports')}
                className={navItemClass(activeTab === 'reports')}
              >
                <LayoutDashboard size={18} className={activeTab === 'reports' ? 'text-sky-100' : 'text-sky-600'} />
                <span>Panel de Control</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('students')}
                className={navItemClass(activeTab === 'students')}
              >
                <Users size={18} className={activeTab === 'students' ? 'text-sky-100' : 'text-sky-600'} />
                <span>Alumnos</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('attendance')}
                className={navItemClass(activeTab === 'attendance')}
              >
                <CalendarCheck size={18} className={activeTab === 'attendance' ? 'text-emerald-200' : 'text-teal-600'} />
                <div className="text-left">
                  <span className="block leading-tight">Asistencia Diaria</span>
                  <span
                    className={`text-[10px] block font-medium ${
                      activeTab === 'attendance' ? 'text-sky-100/90' : 'text-slate-400'
                    }`}
                  >
                    Registro por curso y fecha
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('teachers')}
                className={navItemClass(activeTab === 'teachers')}
              >
                <GraduationCap size={18} className={activeTab === 'teachers' ? 'text-sky-100' : 'text-sky-600'} />
                <span>Docentes</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('calendar')}
                className={navItemClass(activeTab === 'calendar')}
              >
                <Calendar size={18} className={activeTab === 'calendar' ? 'text-sky-100' : 'text-sky-600'} />
                <div className="text-left">
                  <span className="block leading-tight">Calendario Escolar</span>
                  <span
                    className={`text-[10px] block font-medium ${
                      activeTab === 'calendar' ? 'text-sky-100/90' : 'text-slate-400'
                    }`}
                  >
                    Eventos, exámenes y reuniones
                  </span>
                </div>
              </button>
            </div>

            {/* Sección 2: Carnets y Verificación QR */}
            <div className="space-y-1 pt-3 border-t border-sky-100/90">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-teal-700 mb-1.5">
                Credenciales y QR
              </p>

              <button
                type="button"
                onClick={() => handleTabClick('student-cards')}
                className={navItemClass(activeTab === 'student-cards')}
              >
                <IdCard size={18} className={activeTab === 'student-cards' ? 'text-sky-100' : 'text-sky-600'} />
                <span>Carnets de Estudiantes</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('teacher-cards')}
                className={navItemClass(activeTab === 'teacher-cards')}
              >
                <BadgeCheck size={18} className={activeTab === 'teacher-cards' ? 'text-emerald-200' : 'text-teal-600'} />
                <span>Carnets de Docentes</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('qr-scanner')}
                className={navItemClass(activeTab === 'qr-scanner')}
              >
                <QrCode size={18} className={activeTab === 'qr-scanner' ? 'text-emerald-200' : 'text-emerald-600'} />
                <span>Lector y Verificador QR</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick('card-designer')}
                className={navItemClass(activeTab === 'card-designer')}
              >
                <Palette size={18} className={activeTab === 'card-designer' ? 'text-sky-100' : 'text-cyan-600'} />
                <span>Personalizar Carnets</span>
              </button>
            </div>

            {/* Sección 3: Institución y Adaptación */}
            <div className="space-y-2 pt-3 border-t border-sky-100/90">
              <p className="px-3 text-[10px] font-extrabold uppercase tracking-widest text-sky-700/90">
                Institución y Respaldo
              </p>

              <button
                type="button"
                onClick={() => handleTabClick('settings')}
                className={navItemClass(activeTab === 'settings')}
              >
                <Settings size={18} className={activeTab === 'settings' ? 'text-sky-100' : 'text-sky-700'} />
                <div className="text-left">
                  <span className="block leading-tight">Configuración Institucional</span>
                  <span
                    className={`text-[10px] block font-medium ${
                      activeTab === 'settings' ? 'text-sky-100/90' : 'text-slate-400'
                    }`}
                  >
                    Nombre, escudo, CUE y director
                  </span>
                </div>
              </button>

              {onOpenPushAlerts && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenPushAlerts();
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 min-h-[44px] rounded-2xl transition-all border font-bold text-xs ${
                    isPushSubscribed
                      ? 'text-sky-950 bg-sky-50/90 hover:bg-sky-100/90 border-sky-200'
                      : 'text-slate-700 bg-white/80 hover:bg-sky-50/90 border-sky-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isPushSubscribed ? (
                      <BellRing size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                      <Bell size={16} className="text-sky-600 shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <p className="leading-none font-extrabold truncate">Alertas Push</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">
                        {isPushSubscribed ? 'Suscripción activa (SW)' : 'Exámenes y calendario'}
                      </p>
                    </div>
                  </div>
                  {isPushSubscribed && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black shrink-0">
                      ON
                    </span>
                  )}
                </button>
              )}

              {onOpenBackup && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenBackup();
                    setSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-2xl transition-all text-emerald-950 bg-emerald-50/85 hover:bg-emerald-100/90 border border-emerald-200/80 font-bold text-xs"
                >
                  <Database size={16} className="text-emerald-600 shrink-0" />
                  <div className="text-left">
                    <p className="leading-none font-extrabold">Backup Automático</p>
                    <p className="text-[10px] text-emerald-800/80 font-medium mt-0.5">Exportar / Restaurar JSON</p>
                  </div>
                </button>
              )}

              {/* Selector rápido de pantalla en Sidebar */}
              <div className="pt-2">
                <span className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Vista por Dispositivo
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-sky-50/80 rounded-2xl border border-sky-200/70">
                  {[
                    { id: 'pc' as DeviceViewMode, label: 'PC', icon: <Laptop size={15} /> },
                    { id: 'android' as DeviceViewMode, label: 'Android', icon: <Smartphone size={15} /> },
                    { id: 'iphone' as DeviceViewMode, label: 'iPhone', icon: <Smartphone size={15} /> },
                    { id: 'tablet' as DeviceViewMode, label: 'Tablet', icon: <Tablet size={15} /> },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDeviceMode(d.id)}
                      className={`flex flex-col items-center justify-center py-2 px-1 min-h-[44px] rounded-xl text-[10px] font-extrabold transition-all ${
                        deviceMode === d.id
                          ? 'aero-btn-primary text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      {d.icon}
                      <span className="mt-0.5">{d.label}</span>
                    </button>
                  ))}
                </div>
                {deviceMode !== 'responsive' && (
                  <button
                    type="button"
                    onClick={() => setDeviceMode('responsive')}
                    className="w-full mt-1.5 py-1.5 rounded-xl text-[10px] font-bold text-sky-700 hover:bg-sky-50 transition-colors"
                  >
                    Restablecer modo automático
                  </button>
                )}
              </div>

              {onOpenSettings && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenSettings();
                    setSidebarOpen(false);
                  }}
                  className="w-full text-[11px] font-semibold text-sky-700 hover:text-sky-950 py-1.5 text-center hover:underline"
                >
                  Edición rápida en ventana emergente
                </button>
              )}
            </div>
          </nav>
        </aside>

        {/* Área de Contenido Principal */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 md:p-7 pb-24 md:pb-8 w-full transition-all">
          <div
            className={`mx-auto transition-all duration-300 ${
              deviceMode === 'android'
                ? 'max-w-[420px] aero-glass rounded-[36px] shadow-2xl border-8 border-slate-800 p-3 sm:p-4 my-2 min-h-[760px]'
                : deviceMode === 'iphone'
                ? 'max-w-[390px] aero-glass rounded-[42px] shadow-2xl border-8 border-slate-900 p-3 sm:p-4 my-2 min-h-[760px]'
                : deviceMode === 'tablet'
                ? 'max-w-[768px] aero-glass rounded-[30px] shadow-2xl border-8 border-slate-700 p-4 sm:p-5 my-2 min-h-[820px]'
                : 'w-full'
            }`}
          >
            {/* Indicador superior discreto solo cuando se simula un teléfono en escritorio */}
            {(deviceMode === 'android' || deviceMode === 'iphone') && (
              <div className="flex items-center justify-between px-3 py-1.5 mb-3 border-b border-sky-100 text-[10px] font-bold text-slate-500 no-print">
                <span>{deviceMode === 'android' ? 'Vista Android (~412px)' : 'Vista iPhone (~390px)'}</span>
                <button
                  type="button"
                  onClick={() => setDeviceMode('responsive')}
                  className="text-sky-700 font-extrabold hover:underline"
                >
                  Salir a Escritorio
                </button>
              </div>
            )}

            {children}

            {/* Pie Institucional Discreto */}
            <footer className="mt-10 pt-4 border-t border-sky-200/70 text-center text-[11px] text-slate-500 no-print">
              <p className="font-bold text-sky-950/80">
                {schoolInfo.name} • Ciclo Lectivo {schoolInfo.academicYear}
              </p>
              <p className="mt-0.5">
                {[schoolInfo.address, schoolInfo.locality, schoolInfo.province].filter(Boolean).join(' • ')}
                {schoolInfo.cue ? ` • CUE ${schoolInfo.cue}` : ''}
              </p>
            </footer>
          </div>
        </main>
      </div>

      {/* Barra de Navegación Inferior Móvil (<= 15% altura, botones táctiles >= 44px) */}
      <nav
        aria-label="Navegación rápida móvil"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 aero-glass border-t border-white/90 shadow-[0_-8px_24px_rgba(3,105,161,0.14)] pb-safe no-print"
      >
        <div className="grid grid-cols-5 h-[60px] px-1">
          {[
            { id: 'reports', label: 'Inicio', icon: <LayoutDashboard size={19} /> },
            { id: 'students', label: 'Alumnos', icon: <Users size={19} /> },
            { id: 'attendance', label: 'Asistencia', icon: <CalendarCheck size={19} /> },
            { id: 'student-cards', label: 'Carnets', icon: <IdCard size={19} /> },
          ].map((item) => {
            const active =
              activeTab === item.id ||
              (item.id === 'student-cards' &&
                (activeTab === 'teacher-cards' || activeTab === 'qr-scanner' || activeTab === 'card-designer'));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabClick(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                  active ? 'text-sky-700 font-extrabold' : 'text-slate-500 font-semibold'
                }`}
              >
                <span className={`p-1 rounded-lg ${active ? 'bg-sky-100/90 text-sky-700' : ''}`}>
                  {item.icon}
                </span>
                <span className="text-[10px] leading-none">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
              sidebarOpen ? 'text-sky-700 font-extrabold' : 'text-slate-500 font-semibold'
            }`}
          >
            <span className="p-1 rounded-lg">
              <Menu size={19} />
            </span>
            <span className="text-[10px] leading-none">Más</span>
          </button>
        </div>
      </nav>
    </div>
  );
};