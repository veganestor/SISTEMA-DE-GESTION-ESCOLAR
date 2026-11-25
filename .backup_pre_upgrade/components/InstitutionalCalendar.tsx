import React, { useState, useMemo } from 'react';
import { CalendarEvent, CalendarEventType, CourseYear } from '../types';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  MapPin, 
  Users, 
  FileCheck, 
  Landmark, 
  Bell, 
  Trash2, 
  Edit3, 
  X, 
  Check, 
  Filter, 
  AlertCircle,
  CalendarDays,
  Sparkles
} from 'lucide-react';

interface InstitutionalCalendarProps {
  events: CalendarEvent[];
  onAddEvent: (event: CalendarEvent) => void;
  onUpdateEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (eventId: string) => void;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const InstitutionalCalendar: React.FC<InstitutionalCalendarProps> = ({
  events,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
}) => {
  // Inicializar en Noviembre 2026 o en la fecha actual
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Filtros
  const [typeFilter, setTypeFilter] = useState<CalendarEventType | 'all'>('all');
  const [courseFilter, setCourseFilter] = useState<CourseYear | 'all'>('all');

  // Modal de Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(todayStr);
  const [formTime, setFormTime] = useState('09:00');
  const [formType, setFormType] = useState<CalendarEventType>('institucional');
  const [formTargetCourse, setFormTargetCourse] = useState<CourseYear | 'all'>('all');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsHighPriority, setFormIsHighPriority] = useState(false);

  // Navegación de meses
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleGoToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(todayStr);
  };

  // Cálculo de días para la cuadrícula del mes
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    // getDay() devuelve 0 para domingo. Lo ajustamos a lunes = 0, domingo = 6
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: { dateStr: string; dayNumber: number; isCurrentMonth: boolean }[] = [];

    // Días del mes anterior
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = currentMonth === 0 ? 12 : currentMonth;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: dayNum, isCurrentMonth: false });
    }

    // Días del mes actual
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: i, isCurrentMonth: true });
    }

    // Completar última semana con días del siguiente mes
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const nextM = currentMonth === 11 ? 1 : currentMonth + 2;
        const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
        const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        days.push({ dateStr, dayNumber: i, isCurrentMonth: false });
      }
    }

    return days;
  }, [currentYear, currentMonth]);

  // Eventos filtrados
  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesType = typeFilter === 'all' || evt.type === typeFilter;
      const matchesCourse = courseFilter === 'all' || evt.targetCourse === 'all' || evt.targetCourse === courseFilter;
      return matchesType && matchesCourse;
    });
  }, [events, typeFilter, courseFilter]);

  // Mapa de eventos por fecha
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((evt) => {
      const list = map.get(evt.date) || [];
      list.push(evt);
      map.set(evt.date, list);
    });
    return map;
  }, [filteredEvents]);

  // Recordatorios visuales para los próximos 7 días o hoy
  const upcomingReminders = useMemo(() => {
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    
    return events
      .map((evt) => {
        const [y, m, d] = evt.date.split('-').map(Number);
        const eventMs = new Date(y, m - 1, d).getTime();
        const diffDays = Math.round((eventMs - todayMs) / (1000 * 60 * 60 * 24));
        return { evt, diffDays };
      })
      .filter(({ diffDays }) => diffDays >= 0 && diffDays <= 7)
      .sort((a, b) => a.diffDays - b.diffDays);
  }, [events, today]);

  // Eventos para el día seleccionado
  const selectedDayEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || [];
  }, [eventsByDate, selectedDate]);

  // Apertura de modal para nuevo evento
  const handleOpenCreateModal = (presetDate?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDate(presetDate || selectedDate || todayStr);
    setFormTime('09:00');
    setFormType('institucional');
    setFormTargetCourse('all');
    setFormLocation('');
    setFormDescription('');
    setFormIsHighPriority(false);
    setIsModalOpen(true);
  };

  // Apertura de modal para editar evento existente
  const handleOpenEditModal = (evt: CalendarEvent) => {
    setEditingEvent(evt);
    setFormTitle(evt.title);
    setFormDate(evt.date);
    setFormTime(evt.time || '09:00');
    setFormType(evt.type);
    setFormTargetCourse(evt.targetCourse);
    setFormLocation(evt.location || '');
    setFormDescription(evt.description || '');
    setFormIsHighPriority(!!evt.isHighPriority);
    setIsModalOpen(true);
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) return;

    if (editingEvent) {
      onUpdateEvent({
        ...editingEvent,
        title: formTitle.trim(),
        date: formDate,
        time: formTime.trim() || undefined,
        type: formType,
        targetCourse: formTargetCourse,
        location: formLocation.trim() || undefined,
        description: formDescription.trim() || undefined,
        isHighPriority: formIsHighPriority,
      });
    } else {
      const newEvent: CalendarEvent = {
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: formTitle.trim(),
        date: formDate,
        time: formTime.trim() || undefined,
        type: formType,
        targetCourse: formTargetCourse,
        location: formLocation.trim() || undefined,
        description: formDescription.trim() || undefined,
        isHighPriority: formIsHighPriority,
      };
      onAddEvent(newEvent);
    }

    setIsModalOpen(false);
  };

  // Helper de badges y colores por categoría
  const getTypeBadge = (type: CalendarEventType) => {
    switch (type) {
      case 'examen':
        return {
          label: 'Examen / Evaluación',
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
          dotClass: 'bg-rose-600',
          icon: <FileCheck size={14} className="text-rose-600" />,
        };
      case 'reunion_padres':
        return {
          label: 'Reunión de Padres',
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
          dotClass: 'bg-purple-600',
          icon: <Users size={14} className="text-purple-600" />,
        };
      case 'institucional':
        return {
          label: 'Evento Institucional',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
          dotClass: 'bg-blue-600',
          icon: <Landmark size={14} className="text-blue-600" />,
        };
      case 'feriado':
        return {
          label: 'Feriado / Asueto',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          dotClass: 'bg-emerald-600',
          icon: <CalendarIcon size={14} className="text-emerald-600" />,
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* ================= SECCIÓN DE RECORDATORIOS VISUALES ================= */}
      {upcomingReminders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-blue-500/10 border-2 border-amber-300/80 rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md animate-pulse shrink-0">
                <Bell size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Recordatorios Activos</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                    {upcomingReminders.length} Próximos
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">Eventos programados para hoy y los próximos 7 días hábiles</p>
              </div>
            </div>
            <button
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 shrink-0"
            >
              <Plus size={15} /> Agendar Evento
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingReminders.map(({ evt, diffDays }) => {
              const badge = getTypeBadge(evt.type);
              const isToday = diffDays === 0;
              const isTomorrow = diffDays === 1;

              return (
                <div
                  key={evt.id}
                  onClick={() => {
                    setSelectedDate(evt.date);
                    const [y, m] = evt.date.split('-').map(Number);
                    setCurrentYear(y);
                    setCurrentMonth(m - 1);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                    isToday
                      ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/50'
                      : 'bg-white border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className={`px-2 py-0.5 text-[10px] font-black rounded-lg border flex items-center gap-1 ${badge.badgeClass}`}>
                      {badge.icon}
                      {badge.label}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        isToday
                          ? 'bg-rose-600 text-white animate-bounce'
                          : isTomorrow
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {isToday ? '¡HOY!' : isTomorrow ? 'MAÑANA' : `En ${diffDays} días`}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-2 mb-1.5">
                    {evt.title}
                  </h4>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      {evt.date} {evt.time ? `• ${evt.time} hs` : ''}
                    </span>
                    {evt.targetCourse !== 'all' ? (
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded font-bold">
                        {evt.targetCourse}° Año
                      </span>
                    ) : (
                      <span className="text-slate-400">Toda la escuela</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= CONTENEDOR PRINCIPAL: CALENDARIO Y AGENDA ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* PANEL IZQUIERDO / SUPERIOR: CALENDARIO MENSUAL INTERACTIVO */}
        <div className="lg:col-span-8 bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-100 flex flex-col">
          
          {/* Header del Calendario y Controles de Navegación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-900 flex items-center justify-center font-black">
                <CalendarIcon size={22} />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <span>{MONTH_NAMES[currentMonth]}</span>
                  <span className="text-blue-700">{currentYear}</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium">Haga clic en cualquier día para ver o registrar eventos</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePrevMonth}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                title="Mes anterior"
              >
                <ChevronLeft size={18} />
              </button>
              
              <button
                onClick={handleGoToToday}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors"
                title="Ir al mes actual"
              >
                Hoy
              </button>

              <button
                onClick={handleNextMonth}
                className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                title="Mes siguiente"
              >
                <ChevronRight size={18} />
              </button>

              <button
                onClick={() => handleOpenCreateModal()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95"
              >
                <Plus size={16} /> Nuevo Evento
              </button>
            </div>
          </div>

          {/* Filtros de Categoría y Cursos */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
            {/* Filtro por tipo de evento */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider mr-1 shrink-0">Filtrar:</span>
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1.5 rounded-xl transition-all shrink-0 ${
                  typeFilter === 'all'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({events.length})
              </button>
              <button
                onClick={() => setTypeFilter('examen')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 shrink-0 ${
                  typeFilter === 'examen'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <FileCheck size={13} /> Exámenes
              </button>
              <button
                onClick={() => setTypeFilter('reunion_padres')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 shrink-0 ${
                  typeFilter === 'reunion_padres'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                <Users size={13} /> Reuniones
              </button>
              <button
                onClick={() => setTypeFilter('institucional')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 shrink-0 ${
                  typeFilter === 'institucional'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <Landmark size={13} /> Institucional
              </button>
            </div>

            {/* Filtro por curso */}
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Curso:</label>
              <select
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos los Cursos</option>
                {['1', '2', '3', '4', '5', '6'].map((c) => (
                  <option key={c} value={c}>{c}° Año</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cuadrícula de Días de la Semana */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2 text-center">
            {WEEKDAY_NAMES.map((name, i) => (
              <div 
                key={name} 
                className={`text-[11px] font-black uppercase tracking-wider py-1.5 ${
                  i >= 5 ? 'text-rose-500' : 'text-slate-400'
                }`}
              >
                {name}
              </div>
            ))}
          </div>

          {/* Días del Mes */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 flex-1">
            {calendarDays.map(({ dateStr, dayNumber, isCurrentMonth }) => {
              const dayEvents = eventsByDate.get(dateStr) || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`min-h-[70px] sm:min-h-[92px] p-1.5 sm:p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group relative ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-500/30'
                      : isToday
                      ? 'bg-amber-50/50 border-amber-300'
                      : isCurrentMonth
                      ? 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50/60'
                      : 'bg-slate-50/40 border-slate-50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-black w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? 'bg-amber-500 text-white shadow-sm'
                          : isSelected
                          ? 'bg-blue-900 text-white shadow-sm'
                          : isCurrentMonth
                          ? 'text-slate-700'
                          : 'text-slate-300'
                      }`}
                    >
                      {dayNumber}
                    </span>

                    {/* Botón rápido para agregar evento en este día */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDate(dateStr);
                        handleOpenCreateModal(dateStr);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-all"
                      title="Agregar evento en este día"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Indicadores / Píldoras de eventos en el día */}
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {/* Vista Desktop: Píldoras con título */}
                    <div className="hidden sm:block space-y-1">
                      {dayEvents.slice(0, 2).map((evt) => {
                        const badge = getTypeBadge(evt.type);
                        return (
                          <div
                            key={evt.id}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate flex items-center gap-1 ${badge.badgeClass}`}
                            title={`${evt.title} (${evt.time || 'Sin hora'})`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dotClass}`} />
                            <span className="truncate">{evt.title}</span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] font-black text-slate-400 pl-1">
                          +{dayEvents.length - 2} más
                        </div>
                      )}
                    </div>

                    {/* Vista Móvil: Puntos de color */}
                    <div className="flex sm:hidden items-center justify-center gap-1 pt-1">
                      {dayEvents.slice(0, 3).map((evt) => {
                        const badge = getTypeBadge(evt.type);
                        return (
                          <span
                            key={evt.id}
                            className={`w-2 h-2 rounded-full ${badge.dotClass}`}
                          />
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span className="text-[8px] font-black text-slate-500">
                          +{dayEvents.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL DERECHO: AGENDA DEL DÍA SELECCIONADO */}
        <div className="lg:col-span-4 bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                Agenda del Día
              </span>
              <h4 className="text-lg font-black text-slate-800">
                {selectedDate === todayStr ? 'Hoy, ' : ''}
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </h4>
            </div>

            <button
              onClick={() => handleOpenCreateModal(selectedDate)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-800 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors"
            >
              <Plus size={14} /> Añadir
            </button>
          </div>

          {/* Lista de eventos del día */}
          <div className="flex-1 overflow-y-auto space-y-3 max-h-[550px] pr-1">
            {selectedDayEvents.length > 0 ? (
              selectedDayEvents.map((evt) => {
                const badge = getTypeBadge(evt.type);
                return (
                  <div
                    key={evt.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 hover:bg-white hover:shadow-md transition-all space-y-2 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${badge.badgeClass}`}>
                        {badge.icon}
                        {badge.label}
                      </span>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEditModal(evt)}
                          className="p-1 text-slate-400 hover:text-blue-700 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Editar evento"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`¿Eliminar el evento "${evt.title}"?`)) {
                              onDeleteEvent(evt.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Eliminar evento"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <h5 className="font-bold text-slate-900 text-sm leading-snug">
                      {evt.title}
                    </h5>

                    {evt.description && (
                      <p className="text-xs text-slate-600 leading-relaxed font-normal">
                        {evt.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500 font-medium">
                      {evt.time && (
                        <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          <Clock size={12} className="text-blue-600" />
                          {evt.time} hs
                        </span>
                      )}

                      {evt.location && (
                        <span className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          <MapPin size={12} className="text-rose-600" />
                          {evt.location}
                        </span>
                      )}

                      <span className="bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-md font-bold text-[10px]">
                        {evt.targetCourse === 'all' ? 'Toda la Escuela' : `${evt.targetCourse}° Año`}
                      </span>

                      {evt.isHighPriority && (
                        <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md font-black text-[10px]">
                          Urgente
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <CalendarDays size={32} className="mx-auto text-slate-300" />
                <p className="text-xs text-slate-400 font-medium">
                  No hay eventos registrados para el {selectedDate}.
                </p>
                <button
                  onClick={() => handleOpenCreateModal(selectedDate)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
                >
                  <Plus size={14} /> Registrar Evento
                </button>
              </div>
            )}
          </div>

          {/* Resumen mensual rápido */}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
              Resumen de {MONTH_NAMES[currentMonth]}
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block text-[10px]">Total Eventos</span>
                <span className="text-base font-black text-slate-800">
                  {events.filter((e) => e.date.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`)).length}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100">
                <span className="text-rose-700 block text-[10px]">Exámenes del Mes</span>
                <span className="text-base font-black text-rose-800">
                  {events.filter((e) => e.type === 'examen' && e.date.startsWith(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`)).length}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ================= MODAL DE REGISTRAR / EDITAR EVENTO ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
                  {editingEvent ? <Edit3 size={18} /> : <CalendarIcon size={18} />}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    {editingEvent ? 'Editar Evento Escolar' : 'Registrar Nuevo Evento'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Gestión del Calendario Institucional</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Título del Evento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mesas de Examen de Previas, Reunión de Padres 1° Año..."
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Tipo de Evento *
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as CalendarEventType)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 bg-white"
                  >
                    <option value="institucional">🏛️ Evento Institucional / Acto</option>
                    <option value="examen">📝 Examen / Evaluación</option>
                    <option value="reunion_padres">👥 Reunión de Padres y Tutores</option>
                    <option value="feriado">🏖️ Feriado / Asueto Escolar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Curso Destinatario *
                  </label>
                  <select
                    value={formTargetCourse}
                    onChange={(e) => setFormTargetCourse(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 bg-white"
                  >
                    <option value="all">🏫 Toda la Institución</option>
                    <option value="1">1° Año (Ciclo Básico)</option>
                    <option value="2">2° Año (Ciclo Básico)</option>
                    <option value="3">3° Año (Ciclo Básico)</option>
                    <option value="4">4° Año (Ciclo Orientado)</option>
                    <option value="5">5° Año (Ciclo Orientado)</option>
                    <option value="6">6° Año (Ciclo Orientado)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Hora (Opcional)
                  </label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Lugar / Espacio
                </label>
                <input
                  type="text"
                  placeholder="Ej: Salón de Actos (SUM), Aula 3, Polideportivo, Patio..."
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Descripción / Observaciones
                </label>
                <textarea
                  rows={3}
                  placeholder="Detalles sobre temario, asistencia, documentación requerida, etc."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="highPriority"
                  checked={formIsHighPriority}
                  onChange={(e) => setFormIsHighPriority(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="highPriority" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Destacar como evento de alta prioridad / recordatorio visual urgente
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-black text-xs shadow-md transition-all active:scale-95"
                >
                  {editingEvent ? 'Guardar Cambios' : 'Registrar Evento'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
};
