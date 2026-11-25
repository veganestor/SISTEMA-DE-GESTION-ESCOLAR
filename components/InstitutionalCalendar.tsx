import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CalendarEvent, CalendarEventType, CourseYear } from '../types';
import {
  formatShortDateES,
  getUpcomingCalendarEvents,
  rescheduleCalendarEvent,
  sortDayEvents,
} from '../services/calendarUtils';
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
  CheckCircle2,
  CalendarDays,
  GripVertical,
  LayoutGrid,
  Columns,
  Undo2,
  AlertTriangle,
} from 'lucide-react';

export type CalendarViewMode = 'monthly' | 'agenda';

interface InstitutionalCalendarProps {
  events: CalendarEvent[];
  onAddEvent: (event: CalendarEvent) => void;
  onUpdateEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (eventId: string) => void;
  onDeleteAllEvents?: () => void;
  initialSelectedDate?: string;
  defaultView?: CalendarViewMode;
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
  onDeleteAllEvents,
  initialSelectedDate,
  defaultView = 'monthly',
}) => {
  // Inicializar en la fecha actual
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  const [viewMode, setViewMode] = useState<CalendarViewMode>(defaultView);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Estado de Arrastrar y Soltar (Drag & Drop)
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [rescheduleToast, setRescheduleToast] = useState<{
    eventId: string;
    title: string;
    fromDate: string;
    toDate: string;
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navDragHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (navDragHoverTimerRef.current) clearTimeout(navDragHoverTimerRef.current);
    };
  }, []);

  // Sincronizar fecha enfocada si se recibe una fecha inicial
  useEffect(() => {
    if (!initialSelectedDate) return;
    const parts = initialSelectedDate.split('-').map(Number);
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      setSelectedDate(initialSelectedDate);
      setCurrentYear(parts[0]);
      setCurrentMonth(parts[1] - 1);
    }
  }, [initialSelectedDate]);

  // Filtros
  const [typeFilter, setTypeFilter] = useState<CalendarEventType | 'all'>('all');
  const [courseFilter, setCourseFilter] = useState<CourseYear | 'all'>('all');

  // Modal de Crear / Editar, confirmación de eliminación individual y masiva
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [confirmDeleteInModal, setConfirmDeleteInModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [calendarNotice, setCalendarNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setCalendarNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      setCalendarNotice(null);
    }, 4500);
  };

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

  // Mapa de eventos por fecha (ordenados cronológicamente)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((evt) => {
      const list = map.get(evt.date) || [];
      list.push(evt);
      map.set(evt.date, list);
    });
    map.forEach((list, key) => {
      map.set(key, sortDayEvents(list));
    });
    return map;
  }, [filteredEvents]);

  // Recordatorios visuales para hoy y los próximos 2 meses calendario
  const upcomingReminders = useMemo(() => {
    return getUpcomingCalendarEvents(events, 2, today);
  }, [events, today]);

  // Eventos para el día seleccionado
  const selectedDayEvents = useMemo(() => {
    return eventsByDate.get(selectedDate) || [];
  }, [eventsByDate, selectedDate]);

  // Drag & Drop Handlers
  const clearNavHoverTimer = () => {
    if (navDragHoverTimerRef.current) {
      clearTimeout(navDragHoverTimerRef.current);
      navDragHoverTimerRef.current = null;
    }
  };

  const handleEventDragStart = (e: React.DragEvent, evt: CalendarEvent) => {
    setDraggedEventId(evt.id);
    setConfirmDeleteEventId(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', evt.id);
  };

  const handleEventDragEnd = () => {
    setDraggedEventId(null);
    setDragOverDate(null);
    clearNavHoverTimer();
  };

  const handleDayDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDayDragLeave = (e: React.DragEvent, dateStr: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    if (dragOverDate === dateStr) {
      setDragOverDate(null);
    }
  };

  const handleDayDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    clearNavHoverTimer();
    const droppedId = e.dataTransfer.getData('text/plain') || draggedEventId;
    setDraggedEventId(null);
    setDragOverDate(null);

    if (!droppedId) return;
    const result = rescheduleCalendarEvent(events, droppedId, targetDateStr);
    if (!result) return;

    onUpdateEvent(result.updatedEvent);
    setSelectedDate(targetDateStr);
    const [y, m] = targetDateStr.split('-').map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      setCurrentYear(y);
      setCurrentMonth(m - 1);
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setRescheduleToast({
      eventId: result.updatedEvent.id,
      title: result.updatedEvent.title,
      fromDate: result.previousDate,
      toDate: targetDateStr,
    });
    toastTimerRef.current = setTimeout(() => {
      setRescheduleToast(null);
    }, 6500);
  };

  const handleUndoReschedule = () => {
    if (!rescheduleToast) return;
    const undoRes = rescheduleCalendarEvent(
      events,
      rescheduleToast.eventId,
      rescheduleToast.fromDate
    );
    if (undoRes) {
      onUpdateEvent(undoRes.updatedEvent);
      setSelectedDate(rescheduleToast.fromDate);
      const [y, m] = rescheduleToast.fromDate.split('-').map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        setCurrentYear(y);
        setCurrentMonth(m - 1);
      }
    }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setRescheduleToast(null);
  };

  const handleScheduleNavOnDrag = (direction: 'prev' | 'next') => {
    if (!draggedEventId) return;
    clearNavHoverTimer();
    navDragHoverTimerRef.current = setTimeout(() => {
      if (direction === 'prev') handlePrevMonth();
      else handleNextMonth();
    }, 550);
  };

  // Apertura de modal para nuevo evento
  const handleOpenCreateModal = (presetDate?: string) => {
    setEditingEvent(null);
    setConfirmDeleteInModal(false);
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
    setConfirmDeleteInModal(false);
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

  const handleConfirmDeleteSingle = (evt: CalendarEvent) => {
    onDeleteEvent(evt.id);
    setConfirmDeleteEventId(null);
    setConfirmDeleteInModal(false);
    if (rescheduleToast?.eventId === evt.id) {
      setRescheduleToast(null);
    }
    showNotice(`Evento "${evt.title}" eliminado del calendario.`);
  };

  const handleConfirmDeleteAllEvents = () => {
    if (onDeleteAllEvents) {
      onDeleteAllEvents();
    } else {
      events.forEach((evt) => onDeleteEvent(evt.id));
    }
    setConfirmDeleteEventId(null);
    setConfirmDeleteInModal(false);
    setRescheduleToast(null);
    setShowDeleteAllModal(false);
    showNotice('Se eliminaron todos los eventos guardados del calendario escolar.');
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

    setSelectedDate(formDate);
    const [y, m] = formDate.split('-').map(Number);
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      setCurrentYear(y);
      setCurrentMonth(m - 1);
    }

    setConfirmDeleteInModal(false);
    setIsModalOpen(false);
  };

  // Helper de badges y colores por categoría
  const getTypeBadge = (type: CalendarEventType) => {
    switch (type) {
      case 'examen':
        return {
          label: 'Examen / Evaluación',
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
          cardClass: 'bg-rose-50/95 text-rose-950 border-rose-200 hover:border-rose-400',
          dotClass: 'bg-rose-600',
          icon: <FileCheck size={14} className="text-rose-600" />,
        };
      case 'reunion_padres':
        return {
          label: 'Reunión de Padres',
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
          cardClass: 'bg-purple-50/95 text-purple-950 border-purple-200 hover:border-purple-400',
          dotClass: 'bg-purple-600',
          icon: <Users size={14} className="text-purple-600" />,
        };
      case 'institucional':
        return {
          label: 'Evento Institucional',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
          cardClass: 'bg-sky-50/95 text-sky-950 border-sky-200 hover:border-sky-400',
          dotClass: 'bg-blue-600',
          icon: <Landmark size={14} className="text-blue-600" />,
        };
      case 'feriado':
        return {
          label: 'Feriado / Asueto',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          cardClass: 'bg-emerald-50/95 text-emerald-950 border-emerald-200 hover:border-emerald-400',
          dotClass: 'bg-emerald-600',
          icon: <CalendarIcon size={14} className="text-emerald-600" />,
        };
    }
  };

  const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  const currentMonthEventsCount = events.filter((e) => e.date.startsWith(currentMonthPrefix)).length;
  const currentMonthExamsCount = events.filter(
    (e) => e.type === 'examen' && e.date.startsWith(currentMonthPrefix)
  ).length;

  return (
    <div className="space-y-6">
      {/* ================= SECCIÓN DE RECORDATORIOS VISUALES (PRÓXIMOS 2 MESES) ================= */}
      {upcomingReminders.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-blue-500/10 border-2 border-amber-300/80 rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                <Bell size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-slate-800 tracking-tight">Próximos Eventos (2 meses)</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black uppercase tracking-wider">
                    {upcomingReminders.length} {upcomingReminders.length === 1 ? 'Próximo' : 'Próximos'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Eventos programados desde hoy y dentro de los próximos 2 meses
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleOpenCreateModal()}
              className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] aero-btn-primary text-xs font-bold rounded-xl transition-all active:scale-95 shrink-0"
            >
              <Plus size={15} /> Agendar Evento
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingReminders.map(({ evt, diffDays }) => {
              const badge = getTypeBadge(evt.type);
              const isToday = diffDays === 0;
              const isTomorrow = diffDays === 1;
              const isConfirmingDelete = confirmDeleteEventId === evt.id;

              return (
                <div
                  key={evt.id}
                  onClick={() => {
                    setSelectedDate(evt.date);
                    const [y, m] = evt.date.split('-').map(Number);
                    setCurrentYear(y);
                    setCurrentMonth(m - 1);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md flex flex-col justify-between gap-2 ${
                    isToday
                      ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/50'
                      : 'bg-white border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-lg border flex items-center gap-1 ${badge.badgeClass}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                          isToday
                            ? 'bg-rose-600 text-white'
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
                        {formatShortDateES(evt.date)} {evt.time ? `• ${evt.time} hs` : ''}
                      </span>
                      {evt.targetCourse !== 'all' ? (
                        <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                          {evt.targetCourse}° Año
                        </span>
                      ) : (
                        <span className="text-slate-400">Toda la escuela</span>
                      )}
                    </div>
                  </div>

                  <div
                    className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(evt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors"
                    >
                      <Edit3 size={12} /> Editar
                    </button>
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleConfirmDeleteSingle(evt)}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black transition-colors"
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteEventId(null)}
                          className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[11px] font-bold transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEventId(evt.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
                        title="Eliminar evento"
                      >
                        <Trash2 size={12} /> Eliminar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aviso de estado del calendario (ej. eliminación individual o total) */}
      {calendarNotice && (
        <div
          role="status"
          className="px-4 py-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 text-xs font-bold flex items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-sky-600 shrink-0" />
            <span>{calendarNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setCalendarNotice(null)}
            className="p-1 rounded-lg hover:bg-sky-100 text-sky-700"
            aria-label="Cerrar aviso"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Aviso de Reprogramación Exitosa con Opción de Deshacer */}
      {rescheduleToast && (
        <div
          role="status"
          className="px-4 py-3 rounded-2xl bg-emerald-50/95 border border-emerald-300 text-emerald-950 text-xs font-bold flex flex-wrap items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>
              Actividad reprogramada: <strong>&ldquo;{rescheduleToast.title}&rdquo;</strong> movida del{' '}
              <span className="tabular-nums">{formatShortDateES(rescheduleToast.fromDate)}</span> al{' '}
              <span className="tabular-nums underline decoration-emerald-400">
                {formatShortDateES(rescheduleToast.toDate)}
              </span>
              .
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleUndoReschedule}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-extrabold inline-flex items-center gap-1 transition-colors"
            >
              <Undo2 size={13} />
              <span>Deshacer</span>
            </button>
            <button
              type="button"
              onClick={() => setRescheduleToast(null)}
              className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700"
              aria-label="Cerrar aviso de reprogramación"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ================= CONTENEDOR PRINCIPAL: CALENDARIO Y AGENDA ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* PANEL PRINCIPAL: CALENDARIO MENSUAL INTERACTIVO CON ARRASTRAR Y SOLTAR */}
        <div
          className={`${
            viewMode === 'monthly' ? 'lg:col-span-12' : 'lg:col-span-8'
          } aero-glass rounded-3xl p-5 sm:p-7 flex flex-col`}
        >
          
          {/* Header del Calendario, Selector de Vista y Navegación */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-900 flex items-center justify-center font-black border border-sky-200 shrink-0">
                <CalendarIcon size={22} />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-[#0c2d48] tracking-tight flex items-center gap-2">
                  <span>{MONTH_NAMES[currentMonth]}</span>
                  <span className="text-sky-700">{currentYear}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Arrastra y suelta cualquier evento sobre otro día para reprogramarlo o haz clic para editarlo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Switcher de Vista: Calendario Mensual vs Mes y Agenda */}
              <div
                role="tablist"
                aria-label="Modo de vista del calendario"
                className="inline-flex items-center p-1 rounded-xl bg-sky-100/80 border border-sky-200/90"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'monthly'}
                  onClick={() => setViewMode('monthly')}
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-extrabold transition-all ${
                    viewMode === 'monthly'
                      ? 'bg-white text-sky-950 shadow-sm'
                      : 'text-slate-600 hover:text-sky-900'
                  }`}
                >
                  <LayoutGrid size={14} className={viewMode === 'monthly' ? 'text-sky-600' : ''} />
                  <span>Calendario Mensual</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'agenda'}
                  onClick={() => setViewMode('agenda')}
                  className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg text-xs font-extrabold transition-all ${
                    viewMode === 'agenda'
                      ? 'bg-white text-sky-950 shadow-sm'
                      : 'text-slate-600 hover:text-sky-900'
                  }`}
                >
                  <Columns size={14} className={viewMode === 'agenda' ? 'text-sky-600' : ''} />
                  <span>Mes y Agenda</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handlePrevMonth}
                onDragEnter={() => handleScheduleNavOnDrag('prev')}
                onDragLeave={clearNavHoverTimer}
                onDragOver={(e) => {
                  if (draggedEventId) e.preventDefault();
                }}
                className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-colors ${
                  draggedEventId
                    ? 'border-sky-400 bg-sky-50 text-sky-900'
                    : 'border-sky-200 bg-white/80 hover:bg-white text-slate-700'
                }`}
                title="Mes anterior (mantén un evento encima al arrastrar para retroceder de mes)"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} />
              </button>
              
              <button
                type="button"
                onClick={handleGoToToday}
                className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 transition-colors"
                title="Ir al mes actual"
              >
                Hoy
              </button>

              <button
                type="button"
                onClick={handleNextMonth}
                onDragEnter={() => handleScheduleNavOnDrag('next')}
                onDragLeave={clearNavHoverTimer}
                onDragOver={(e) => {
                  if (draggedEventId) e.preventDefault();
                }}
                className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border transition-colors ${
                  draggedEventId
                    ? 'border-sky-400 bg-sky-50 text-sky-900'
                    : 'border-sky-200 bg-white/80 hover:bg-white text-slate-700'
                }`}
                title="Mes siguiente (mantén un evento encima al arrastrar para avanzar de mes)"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} />
              </button>

              <button
                type="button"
                onClick={() => handleOpenCreateModal()}
                className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] aero-btn-primary text-xs font-black rounded-xl transition-all active:scale-95"
              >
                <Plus size={16} /> Nuevo Evento
              </button>

              <button
                type="button"
                disabled={events.length === 0}
                onClick={() => setShowDeleteAllModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-extrabold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-45 disabled:pointer-events-none transition-colors"
                title="Eliminar todos los eventos guardados del calendario"
              >
                <Trash2 size={15} />
                <span>Eliminar todos{events.length > 0 ? ` (${events.length})` : ''}</span>
              </button>
            </div>
          </div>

          {/* Barra informativa de vista Calendario Mensual y resumen rápido */}
          {viewMode === 'monthly' && (
            <div className="mb-4 px-4 py-2.5 rounded-2xl bg-sky-50/85 border border-sky-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-sky-950 font-bold">
                <GripVertical size={15} className="text-sky-600 shrink-0" />
                <span>
                  {draggedEventId
                    ? 'Suelta el evento sobre el día destino para cambiar su fecha al instante.'
                    : 'Vista Calendario Mensual: arrastra tarjetas entre días para reprogramar actividades sin abrir el editor.'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-extrabold tabular-nums text-slate-600">
                <span>{currentMonthEventsCount} en el mes</span>
                <span className="text-rose-700">• {currentMonthExamsCount} exámenes</span>
              </div>
            </div>
          )}

          {/* Filtros de Categoría y Cursos */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
            {/* Filtro por tipo de evento */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider mr-1 shrink-0">Filtrar:</span>
              <button
                type="button"
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
                type="button"
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
                type="button"
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
                type="button"
                onClick={() => setTypeFilter('institucional')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 shrink-0 ${
                  typeFilter === 'institucional'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <Landmark size={13} /> Institucional
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('feriado')}
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 shrink-0 ${
                  typeFilter === 'feriado'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <CalendarIcon size={13} /> Feriados
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

          {/* Días del Mes (con soporte Drag & Drop completo) */}
          <div
            className={`grid grid-cols-7 gap-1.5 sm:gap-2 flex-1 ${
              viewMode === 'monthly' ? 'auto-rows-fr' : ''
            }`}
          >
            {calendarDays.map(({ dateStr, dayNumber, isCurrentMonth }) => {
              const dayEvents = eventsByDate.get(dateStr) || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const isDropTarget = dragOverDate === dateStr && draggedEventId !== null;

              return (
                <div
                  key={dateStr}
                  data-date={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  onDragOver={(e) => handleDayDragOver(e, dateStr)}
                  onDragLeave={(e) => handleDayDragLeave(e, dateStr)}
                  onDrop={(e) => handleDayDrop(e, dateStr)}
                  className={`${
                    viewMode === 'monthly'
                      ? 'min-h-[96px] sm:min-h-[138px] p-1.5 sm:p-2.5'
                      : 'min-h-[70px] sm:min-h-[92px] p-1.5 sm:p-2'
                  } rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group relative ${
                    isDropTarget
                      ? 'bg-emerald-50/90 border-2 border-dashed border-emerald-500 ring-2 ring-emerald-400/50 scale-[1.01] z-10 shadow-md'
                      : isSelected
                      ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-500/30'
                      : isToday
                      ? 'bg-amber-50/50 border-amber-300'
                      : isCurrentMonth
                      ? 'bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50/60'
                      : 'bg-slate-50/40 border-slate-50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
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
                      {viewMode === 'monthly' && dayEvents.length > 0 && (
                        <span className="hidden md:inline-block text-[9px] font-extrabold text-slate-400 tabular-nums">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {isDropTarget ? (
                      <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                        Soltar aquí
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(dateStr);
                          handleOpenCreateModal(dateStr);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-all"
                        title="Agregar evento en este día"
                        aria-label={`Agregar evento el ${formatShortDateES(dateStr)}`}
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </div>

                  {/* Tarjetas / Píldoras arrastrables de eventos */}
                  <div className="space-y-1 mt-1.5 overflow-hidden flex-1">
                    {viewMode === 'monthly' ? (
                      <>
                        {/* Vista Mensual Desktop/Tablet: tarjetas arrastrables completas */}
                        <div className="hidden sm:flex sm:flex-col gap-1 max-h-[106px] overflow-y-auto pr-0.5">
                          {dayEvents.map((evt) => {
                            const badge = getTypeBadge(evt.type);
                            const isDragging = draggedEventId === evt.id;
                            return (
                              <div
                                key={evt.id}
                                draggable
                                onDragStart={(e) => handleEventDragStart(e, evt)}
                                onDragEnd={handleEventDragEnd}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(dateStr);
                                  handleOpenEditModal(evt);
                                }}
                                title={`${evt.title}${evt.time ? ` • ${evt.time} hs` : ''}${
                                  evt.location ? ` • ${evt.location}` : ''
                                } — Arrastra para mover a otro día o haz clic para editar`}
                                className={`group/evt rounded-lg border px-1.5 py-1 text-[10px] font-bold transition-all cursor-grab active:cursor-grabbing select-none flex flex-col gap-0.5 ${
                                  badge.cardClass
                                } ${
                                  isDragging
                                    ? 'opacity-45 scale-95 ring-2 ring-sky-400'
                                    : 'shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:shadow'
                                }`}
                              >
                                <div className="flex items-center gap-1 min-w-0">
                                  <GripVertical
                                    size={11}
                                    className="text-slate-400 group-hover/evt:text-slate-600 shrink-0"
                                  />
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dotClass}`} />
                                  {evt.time && (
                                    <span className="text-[9px] font-extrabold opacity-75 shrink-0 tabular-nums">
                                      {evt.time}
                                    </span>
                                  )}
                                  <span className="truncate font-extrabold leading-tight">
                                    {evt.title}
                                  </span>
                                </div>
                                {(evt.targetCourse !== 'all' || evt.isHighPriority) && (
                                  <div className="flex items-center gap-1 pl-4 text-[9px] font-bold opacity-85">
                                    {evt.targetCourse !== 'all' && (
                                      <span className="bg-white/80 px-1 rounded text-slate-700 border border-slate-200/70">
                                        {evt.targetCourse}°
                                      </span>
                                    )}
                                    {evt.isHighPriority && (
                                      <span className="text-rose-700 font-black">• Urgente</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Vista Móvil: puntos indicadores */}
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
                      </>
                    ) : (
                      <>
                        {/* Vista Estándar (Mes y Agenda) Desktop: Píldoras arrastrables */}
                        <div className="hidden sm:block space-y-1">
                          {dayEvents.slice(0, 2).map((evt) => {
                            const badge = getTypeBadge(evt.type);
                            const isDragging = draggedEventId === evt.id;
                            return (
                              <div
                                key={evt.id}
                                draggable
                                onDragStart={(e) => handleEventDragStart(e, evt)}
                                onDragEnd={handleEventDragEnd}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate flex items-center gap-1 cursor-grab active:cursor-grabbing select-none ${
                                  badge.badgeClass
                                } ${isDragging ? 'opacity-45 ring-2 ring-sky-400' : ''}`}
                                title={`${evt.title} (${evt.time || 'Sin hora'}) — Arrastra a otro día para reprogramar`}
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
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra inferior de Detalle del Día Seleccionado en Vista Calendario Mensual */}
          {viewMode === 'monthly' && (
            <div className="mt-5 pt-4 border-t border-sky-200/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-700 block">
                    Actividades del Día Seleccionado
                  </span>
                  <h4 className="text-sm sm:text-base font-black text-[#0c2d48]">
                    {selectedDate === todayStr ? 'Hoy, ' : ''}
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenCreateModal(selectedDate)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl bg-sky-100 hover:bg-sky-200 text-sky-900 text-xs font-extrabold transition-colors"
                >
                  <Plus size={14} />
                  <span>Agendar en esta fecha</span>
                </button>
              </div>

              {selectedDayEvents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedDayEvents.map((evt) => {
                    const badge = getTypeBadge(evt.type);
                    const isConfirmingDelete = confirmDeleteEventId === evt.id;
                    return (
                      <div
                        key={evt.id}
                        draggable
                        onDragStart={(e) => handleEventDragStart(e, evt)}
                        onDragEnd={handleEventDragEnd}
                        className="p-3.5 rounded-2xl border border-sky-100 bg-white/90 hover:shadow-md transition-all space-y-1.5 cursor-grab active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border inline-flex items-center gap-1 ${badge.badgeClass}`}>
                            <GripVertical size={11} className="opacity-60" />
                            {badge.icon}
                            {badge.label}
                          </span>
                          {isConfirmingDelete ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleConfirmDeleteSingle(evt)}
                                className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEventId(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(evt)}
                                className="p-1 text-slate-500 hover:text-sky-700 rounded-lg hover:bg-sky-50"
                                title="Editar o cambiar fecha manualmente"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteEventId(evt.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-[10px] font-extrabold transition-colors"
                                title="Eliminar evento"
                              >
                                <Trash2 size={12} />
                                <span>Eliminar</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                          {evt.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium">
                          {evt.time && (
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} className="text-sky-600" />
                              {evt.time} hs
                            </span>
                          )}
                          {evt.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={11} className="text-rose-600" />
                              {evt.location}
                            </span>
                          )}
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            {evt.targetCourse === 'all' ? 'Toda la Escuela' : `${evt.targetCourse}° Año`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Sin actividades registradas para el {formatShortDateES(selectedDate)}. Puedes arrastrar cualquier evento existente hacia este día o añadir uno nuevo.
                </p>
              )}
            </div>
          )}
        </div>

        {/* PANEL DERECHO: AGENDA DEL DÍA SELECCIONADO (visible en vista 'Mes y Agenda') */}
        {viewMode === 'agenda' && (
          <div className="lg:col-span-4 aero-glass rounded-3xl p-5 sm:p-6 flex flex-col">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-sky-200/70">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                  Agenda del Día
                </span>
                <h4 className="text-lg font-black text-[#0c2d48]">
                  {selectedDate === todayStr ? 'Hoy, ' : ''}
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                </h4>
              </div>

              <button
                type="button"
                onClick={() => handleOpenCreateModal(selectedDate)}
                className="flex items-center gap-1 px-3 py-2 min-h-[40px] bg-sky-100/90 text-sky-900 hover:bg-sky-200/80 rounded-xl text-xs font-bold transition-colors"
              >
                <Plus size={14} /> Añadir
              </button>
            </div>

            {/* Lista de eventos del día (también arrastrables hacia la cuadrícula mensual) */}
            <div className="flex-1 overflow-y-auto space-y-3 max-h-[550px] pr-1">
              {selectedDayEvents.length > 0 ? (
                selectedDayEvents.map((evt) => {
                  const badge = getTypeBadge(evt.type);
                  const isConfirmingDelete = confirmDeleteEventId === evt.id;
                  return (
                    <div
                      key={evt.id}
                      draggable
                      onDragStart={(e) => handleEventDragStart(e, evt)}
                      onDragEnd={handleEventDragEnd}
                      className="p-4 rounded-2xl border border-sky-100 bg-white/80 hover:bg-white hover:shadow-md transition-all space-y-2 group cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${badge.badgeClass}`}>
                          <GripVertical size={11} className="opacity-60" />
                          {badge.icon}
                          {badge.label}
                        </span>

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteSingle(evt)}
                              className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEventId(null)}
                              className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(evt)}
                              className="p-1.5 text-slate-500 hover:text-sky-700 rounded-lg hover:bg-sky-50 transition-colors"
                              title="Editar evento"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEventId(evt.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg text-[10px] font-extrabold transition-colors"
                              title="Eliminar evento"
                            >
                              <Trash2 size={12} />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        )}
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
                    type="button"
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
                    {currentMonthEventsCount}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100">
                  <span className="text-rose-700 block text-[10px]">Exámenes del Mes</span>
                  <span className="text-base font-black text-rose-800">
                    {currentMonthExamsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ================= MODAL HORIZONTAL DE REGISTRAR / EDITAR EVENTO ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            
            <div className="shrink-0 flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center font-bold shrink-0">
                  {editingEvent ? <Edit3 size={18} /> : <CalendarIcon size={18} />}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    {editingEvent ? 'Editar Evento Escolar' : 'Registrar Nuevo Evento'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">Gestión del Calendario Institucional</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteInModal(false);
                  setIsModalOpen(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                aria-label="Cerrar ventana"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5">
                  {/* Columna izquierda: datos principales y fecha/lugar */}
                  <div className="md:col-span-7 space-y-3.5">
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
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Tipo de Evento *
                        </label>
                        <select
                          value={formType}
                          onChange={(e) => setFormType(e.target.value as CalendarEventType)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 bg-white"
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
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-slate-800 bg-white"
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Fecha *
                        </label>
                        <input
                          type="date"
                          required
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
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
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-800"
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
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Columna derecha: descripción y prioridad */}
                  <div className="md:col-span-5 flex flex-col justify-between gap-3.5 md:border-l md:border-slate-100 md:pl-5">
                    <div className="flex-1 flex flex-col">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Descripción / Observaciones
                      </label>
                      <textarea
                        rows={5}
                        placeholder="Detalles sobre temario, asistencia, documentación requerida, etc."
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        className="w-full flex-1 min-h-[120px] px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 resize-none"
                      />
                    </div>

                    <label
                      htmlFor="highPriority"
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 cursor-pointer hover:bg-amber-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        id="highPriority"
                        checked={formIsHighPriority}
                        onChange={(e) => setFormIsHighPriority(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 shrink-0"
                      />
                      <span className="text-xs font-bold text-slate-700 leading-snug">
                        Destacar como evento de alta prioridad / recordatorio visual urgente
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Pie fijo siempre visible */}
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50/80">
                <div>
                  {editingEvent && (
                    confirmDeleteInModal ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleConfirmDeleteSingle(editingEvent);
                            setIsModalOpen(false);
                          }}
                          className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-colors"
                        >
                          Confirmar eliminación
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteInModal(false)}
                          className="px-3 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteInModal(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-xs transition-colors"
                      >
                        <Trash2 size={14} />
                        <span>Eliminar evento</span>
                      </button>
                    )
                  )}
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteInModal(false);
                      setIsModalOpen(false);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors"
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
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIRMACIÓN: ELIMINAR TODOS LOS EVENTOS ================= */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  Eliminar todos los eventos guardados
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Estás por eliminar de forma permanente <strong>{events.length}</strong>{' '}
                  {events.length === 1 ? 'evento guardado' : 'eventos guardados'} del calendario escolar y sus recordatorios activos. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAllEvents}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md transition-all active:scale-95"
              >
                <Trash2 size={14} />
                <span>Sí, eliminar todos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
