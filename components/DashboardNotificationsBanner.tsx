import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Cake,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Database,
  Gift,
  Info,
  RotateCcw,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CalendarEvent,
  DisciplinaryIncident,
  IssuedCardRecord,
  SchoolInfo,
  Student,
  StudentTrajectoryProfile,
  Teacher,
} from '../types';
import {
  buildInternalNotifications,
  filterInternalNotificationsByCategory,
  getCategoryLabelES,
  getSeverityLabelES,
  InternalNotification,
  InternalNotificationActionTarget,
  InternalNotificationCategory,
  InternalNotificationSeverity,
} from '../services/internalNotificationsService';

export interface DashboardNotificationsBannerProps {
  students: Student[];
  teachers?: Teacher[];
  calendarEvents: CalendarEvent[];
  disciplinaryRecords: DisciplinaryIncident[];
  issuedCards: IssuedCardRecord[];
  academicTrajectories: Record<string, StudentTrajectoryProfile>;
  schoolInfo: SchoolInfo;
  lastBackupIso: string | null;
  dismissedIds: string[];
  onDismissNotification: (id: string) => void;
  onDismissAll: (ids: string[]) => void;
  onRestoreDismissed: () => void;
  onNavigateAction: (target: InternalNotificationActionTarget, targetId?: string) => void;
  defaultExpanded?: boolean;
  referenceDate?: Date;
}

const CATEGORY_ORDER: Array<InternalNotificationCategory | 'all'> = [
  'all',
  'calendario',
  'asistencia',
  'disciplina',
  'administracion',
  'comunidad',
];

const renderSeverityIcon = (severity: InternalNotificationSeverity) => {
  switch (severity) {
    case 'critica':
      return <ShieldAlert size={18} className="text-rose-700 shrink-0" aria-hidden="true" />;
    case 'advertencia':
      return <AlertTriangle size={18} className="text-amber-700 shrink-0" aria-hidden="true" />;
    case 'informativa':
      return <Info size={18} className="text-sky-700 shrink-0" aria-hidden="true" />;
  }
};

const renderCategoryIcon = (category: InternalNotificationCategory) => {
  switch (category) {
    case 'calendario':
      return <CalendarDays size={15} className="text-sky-700 shrink-0" aria-hidden="true" />;
    case 'asistencia':
      return <UserCheck size={15} className="text-rose-700 shrink-0" aria-hidden="true" />;
    case 'disciplina':
      return <ShieldAlert size={15} className="text-amber-700 shrink-0" aria-hidden="true" />;
    case 'administracion':
      return <Database size={15} className="text-teal-700 shrink-0" aria-hidden="true" />;
    case 'comunidad':
      return <Gift size={15} className="text-amber-700 shrink-0" aria-hidden="true" />;
  }
};

const getSeverityContainerStyles = (
  highestSeverity: InternalNotificationSeverity | null
): { wrapper: string; iconBox: string; accentText: string } => {
  if (highestSeverity === 'critica') {
    return {
      wrapper: 'bg-rose-50/90 border-rose-200',
      iconBox: 'bg-white border border-rose-200 text-rose-700',
      accentText: 'text-rose-800',
    };
  }
  if (highestSeverity === 'advertencia') {
    return {
      wrapper: 'bg-amber-50/90 border-amber-200',
      iconBox: 'bg-white border border-amber-200 text-amber-700',
      accentText: 'text-amber-900',
    };
  }
  if (highestSeverity === 'informativa') {
    return {
      wrapper: 'bg-sky-50/90 border-sky-200',
      iconBox: 'bg-white border border-sky-200 text-sky-700',
      accentText: 'text-sky-900',
    };
  }
  return {
    wrapper: 'bg-emerald-50/80 border-emerald-200',
    iconBox: 'bg-white border border-emerald-200 text-emerald-700',
    accentText: 'text-emerald-900',
  };
};

export const DashboardNotificationsBanner: React.FC<DashboardNotificationsBannerProps> = ({
  students,
  teachers,
  calendarEvents,
  disciplinaryRecords,
  issuedCards,
  academicTrajectories,
  schoolInfo,
  lastBackupIso,
  dismissedIds,
  onDismissNotification,
  onDismissAll,
  onRestoreDismissed,
  onNavigateAction,
  defaultExpanded = false,
  referenceDate,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [selectedCategory, setSelectedCategory] = useState<InternalNotificationCategory | 'all'>('all');

  const summary = useMemo(
    () =>
      buildInternalNotifications({
        students,
        teachers,
        calendarEvents,
        disciplinaryRecords,
        issuedCards,
        academicTrajectories,
        schoolInfo,
        lastBackupIso,
        dismissedIds,
        referenceDate,
      }),
    [
      students,
      teachers,
      calendarEvents,
      disciplinaryRecords,
      issuedCards,
      academicTrajectories,
      schoolInfo,
      lastBackupIso,
      dismissedIds,
      referenceDate,
    ]
  );

  const visibleNotifications = useMemo(
    () => filterInternalNotificationsByCategory(summary.active, selectedCategory),
    [summary.active, selectedCategory]
  );

  const topAlert: InternalNotification | undefined = summary.active[0];
  const highestSeverity: InternalNotificationSeverity | null = topAlert ? topAlert.severity : null;
  const theme = getSeverityContainerStyles(highestSeverity);

  const summaryMetadataSegments = useMemo(() => {
    const parts: string[] = [];
    if (summary.countsBySeverity.critica > 0) {
      parts.push(
        `${summary.countsBySeverity.critica} ${
          summary.countsBySeverity.critica === 1 ? 'crítica' : 'críticas'
        }`
      );
    }
    if (summary.countsBySeverity.advertencia > 0) {
      parts.push(
        `${summary.countsBySeverity.advertencia} ${
          summary.countsBySeverity.advertencia === 1 ? 'aviso' : 'avisos'
        }`
      );
    }
    if (summary.countsBySeverity.informativa > 0) {
      parts.push(
        `${summary.countsBySeverity.informativa} ${
          summary.countsBySeverity.informativa === 1 ? 'informativa' : 'informativas'
        }`
      );
    }
    return parts;
  }, [summary.countsBySeverity]);

  const birthdayNotification = useMemo(
    () => summary.all.find((n) => n.id.startsWith('comm-bday-')),
    [summary.all]
  );

  const showBirthdayBanner =
    summary.todaysBirthdays.length > 0 &&
    (!birthdayNotification || !dismissedIds.includes(birthdayNotification.id));

  return (
    <section
      role="region"
      aria-label="Centro de notificaciones internas del Panel de Control"
      className={`rounded-3xl border shadow-sm transition-colors ${theme.wrapper}`}
    >
      {/* Banner persistente compacto y no intrusivo */}
      <div className="p-4 sm:px-6 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${theme.iconBox}`}
          >
            {topAlert ? (
              topAlert.severity === 'critica' ? (
                <ShieldAlert size={20} aria-hidden="true" />
              ) : topAlert.severity === 'advertencia' ? (
                <AlertTriangle size={20} aria-hidden="true" />
              ) : (
                <Bell size={20} aria-hidden="true" />
              )
            ) : (
              <CheckCircle2 size={20} aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold">
              <span className={`uppercase tracking-wider text-[11px] font-extrabold ${theme.accentText}`}>
                Alertas internas
              </span>
              {summary.active.length > 0 ? (
                <>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="text-slate-700 tabular-nums">
                    {summary.active.length} {summary.active.length === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                  {summaryMetadataSegments.map((seg) => (
                    <React.Fragment key={seg}>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-slate-600 tabular-nums">{seg}</span>
                    </React.Fragment>
                  ))}
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="text-emerald-800">Al día, sin avisos pendientes</span>
                </>
              )}
            </div>

            {topAlert ? (
              <div className="min-w-0">
                <p className="text-sm sm:text-[15px] font-extrabold text-slate-900 leading-snug truncate">
                  {topAlert.title}
                </p>
                <p className="text-xs text-slate-600 font-medium leading-relaxed line-clamp-2 sm:line-clamp-1">
                  {topAlert.detail}
                </p>
              </div>
            ) : (
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Todos los avisos institucionales de calendario, asistencia, convivencia y respaldo están al día.
              </p>
            )}
          </div>
        </div>

        {/* Acciones del banner */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {topAlert && (
            <button
              type="button"
              onClick={() =>
                onNavigateAction(
                  topAlert.actionTarget,
                  topAlert.targetTeacherId || topAlert.targetStudentId
                )
              }
              className="aero-btn-primary px-4 py-2 min-h-[40px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>{topAlert.actionLabel}</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}

          {summary.active.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              className="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-extrabold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 tabular-nums"
            >
              <Bell size={14} className="text-sky-700" aria-hidden="true" />
              <span>
                {isExpanded ? 'Ocultar lista' : `Ver lista (${summary.active.length})`}
              </span>
              {isExpanded ? (
                <ChevronUp size={14} aria-hidden="true" />
              ) : (
                <ChevronDown size={14} aria-hidden="true" />
              )}
            </button>
          )}

          {topAlert && !isExpanded && (
            <button
              type="button"
              onClick={() => onDismissNotification(topAlert.id)}
              className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
              title="Marcar este aviso destacado como leído"
              aria-label={`Marcar como leída la notificación ${topAlert.title}`}
            >
              <Check size={14} aria-hidden="true" />
              <span>Leída</span>
            </button>
          )}

          {summary.dismissedCount > 0 && (
            <button
              type="button"
              onClick={onRestoreDismissed}
              className="px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-white/85 hover:bg-white text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 tabular-nums"
              title="Volver a mostrar las notificaciones internas archivadas"
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>Restaurar ocultas ({summary.dismissedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Notificación visual automática de cumpleaños (alumnos, docentes y personal) con acceso directo a perfil o legajo */}
      {showBirthdayBanner && (
        <div
          role="status"
          aria-label="Cumpleaños del día en la comunidad educativa"
          className={`border-t border-amber-200/80 bg-amber-50/90 px-4 py-3.5 sm:px-6 space-y-2.5 ${
            !isExpanded || summary.active.length === 0 ? 'rounded-b-3xl' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <Cake size={17} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-extrabold text-amber-950 leading-tight">
                  {summary.todaysBirthdays.length === 1
                    ? '¡Cumpleaños hoy en la institución!'
                    : `¡Hoy celebramos ${summary.todaysBirthdays.length} cumpleaños en la institución!`}
                </p>
                <p className="text-[11px] font-semibold text-amber-800">
                  Haz clic sobre la persona para abrir su perfil o legajo institucional
                </p>
              </div>
            </div>

            {birthdayNotification && (
              <button
                type="button"
                onClick={() => onDismissNotification(birthdayNotification.id)}
                className="px-2.5 py-1.5 min-h-[34px] rounded-lg text-[11px] font-bold text-amber-900 hover:bg-amber-100/80 border border-amber-200/80 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                title="Ocultar aviso de cumpleaños por hoy"
              >
                <Check size={13} aria-hidden="true" />
                <span>Leída</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {summary.todaysBirthdays.map((person) => (
              <button
                key={`${person.personKind}-${person.id}`}
                type="button"
                onClick={() => onNavigateAction(person.actionTarget, person.id)}
                className="text-left p-2.5 px-3 min-h-[48px] rounded-xl bg-white hover:bg-sky-50/90 border border-amber-200 hover:border-sky-300 transition-colors flex items-center justify-between gap-2.5 group"
                title={
                  person.actionTarget === 'student-detail'
                    ? `Abrir legajo de ${person.fullName}`
                    : `Abrir perfil de ${person.fullName}`
                }
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-900 font-extrabold text-xs flex items-center justify-center shrink-0">
                    {person.fullName.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 group-hover:text-sky-900 truncate">
                      {person.fullName}
                    </p>
                    <p className="text-[11px] text-slate-600 font-medium truncate tabular-nums">
                      {person.roleLabel}
                      {person.age !== null ? ` · ${person.age} años` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-extrabold text-sky-800 flex items-center gap-0.5 whitespace-nowrap shrink-0">
                  <span>{person.actionTarget === 'student-detail' ? 'Ver legajo' : 'Ver perfil'}</span>
                  <ChevronRight size={13} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista expandible de alertas internas (sin modales ni superposiciones intrusivas) */}
      {isExpanded && summary.active.length > 0 && (
        <div className="border-t border-slate-200/80 bg-white/95 rounded-b-3xl px-4 py-4 sm:px-6 space-y-3.5">
          {/* Barra de filtros por categoría + acción global */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div
              role="tablist"
              aria-label="Filtrar notificaciones por categoría"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto"
            >
              {CATEGORY_ORDER.map((category) => {
                const count =
                  category === 'all'
                    ? summary.active.length
                    : summary.countsByCategory[category];
                if (category !== 'all' && count === 0) return null;
                const active = selectedCategory === category;
                const label = category === 'all' ? 'Todas' : getCategoryLabelES(category);

                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-3 py-1.5 min-h-[34px] rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => onDismissAll(summary.active.map((n) => n.id))}
              className="self-start sm:self-auto px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCheck size={14} aria-hidden="true" />
              <span>Marcar todas leídas</span>
            </button>
          </div>

          {/* Filas de alertas */}
          {visibleNotifications.length > 0 ? (
            <ul className="divide-y divide-slate-200/80 border border-slate-200/90 rounded-2xl bg-white overflow-hidden">
              {visibleNotifications.map((item) => (
                <li
                  key={item.id}
                  className="p-3.5 sm:px-4 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 flex items-center gap-1.5 shrink-0">
                      {renderSeverityIcon(item.severity)}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold text-slate-500">
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          {renderCategoryIcon(item.category)}
                          <span>{getSeverityLabelES(item.severity)}</span>
                        </span>
                        {item.metaParts.map((part, idx) => (
                          <React.Fragment key={`${item.id}-meta-${idx}`}>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{part}</span>
                          </React.Fragment>
                        ))}
                      </div>

                      <p className="text-sm font-extrabold text-slate-900 leading-snug">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {item.detail}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateAction(
                          item.actionTarget,
                          item.targetTeacherId || item.targetStudentId
                        )
                      }
                      className="px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-extrabold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>{item.actionLabel}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDismissNotification(item.id)}
                      className="p-2 min-w-[38px] min-h-[38px] rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 flex items-center justify-center transition-colors shrink-0"
                      title="Marcar notificación como leída"
                      aria-label={`Marcar como leída: ${item.title}`}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 text-center space-y-2">
              <p className="text-xs font-bold text-slate-600">
                No hay alertas activas en la categoría seleccionada.
              </p>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-white text-slate-800 border border-slate-200 hover:bg-slate-100 transition-colors"
              >
                Ver todas las categorías
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
