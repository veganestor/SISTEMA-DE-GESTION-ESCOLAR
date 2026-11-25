import React, { useEffect, useState } from 'react';
import { Clock, Save, Plus, Trash2, CalendarOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { CourseYear } from '../types';
import type { ScheduleConfigPayload, ShiftScheduleConfig, ShiftType } from '../shared/attendanceDomain';
import {
  addNonSchoolDay,
  deleteCourseScheduleOverride,
  deleteNonSchoolDay,
  fetchScheduleConfig,
  updateShiftSchedule,
  updateWeekendRule,
  upsertCourseScheduleOverride,
} from '../services/attendanceApiClient';

interface ScheduleSettingsPanelProps {
  canEdit: boolean;
}

export const ScheduleSettingsPanel: React.FC<ScheduleSettingsPanelProps> = ({ canEdit }) => {
  const [config, setConfig] = useState<ScheduleConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Form for course override
  const [ovrCourse, setOvrCourse] = useState<CourseYear>('1');
  const [ovrDivision, setOvrDivision] = useState('');
  const [ovrShift, setOvrShift] = useState<ShiftType>('manana');
  const [ovrEntry, setOvrEntry] = useState('07:30');
  const [ovrCutoff, setOvrCutoff] = useState('07:40');
  const [ovrTolerance, setOvrTolerance] = useState(5);
  const [ovrExit, setOvrExit] = useState('12:30');
  const [ovrClose, setOvrClose] = useState('09:30');

  // Form for non-school day
  const [nsdDate, setNsdDate] = useState('');
  const [nsdReason, setNsdReason] = useState('');

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await fetchScheduleConfig();
      setConfig(data);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudieron cargar los horarios.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleShiftFieldChange = (
    shift: ShiftType,
    field: keyof ShiftScheduleConfig,
    value: string | number | boolean
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      shifts: config.shifts.map((s) => (s.shift === shift ? { ...s, [field]: value } : s)),
    });
  };

  const handleSaveShift = async (shiftItem: ShiftScheduleConfig) => {
    setFeedback(null);
    try {
      const updated = await updateShiftSchedule(shiftItem.shift, {
        label: shiftItem.label,
        entryTime: shiftItem.entryTime,
        punctualityCutoffTime: shiftItem.punctualityCutoffTime,
        toleranceMinutes: Number(shiftItem.toleranceMinutes),
        exitTime: shiftItem.exitTime,
        absenceCloseTime: shiftItem.absenceCloseTime,
        enabled: shiftItem.enabled,
      });
      setConfig(updated);
      setFeedback({ type: 'ok', text: `Horario de ${shiftItem.label} actualizado correctamente.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error guardando horario.',
      });
    }
  };

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const updated = await upsertCourseScheduleOverride({
        course: ovrCourse,
        division: ovrDivision.trim(),
        shift: ovrShift,
        entryTime: ovrEntry,
        punctualityCutoffTime: ovrCutoff,
        toleranceMinutes: Number(ovrTolerance),
        exitTime: ovrExit,
        absenceCloseTime: ovrClose,
        active: true,
      });
      setConfig(updated);
      setOvrDivision('');
      setFeedback({ type: 'ok', text: 'Excepción horaria por curso/división guardada.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo guardar la excepción.',
      });
    }
  };

  const handleDeleteOverride = async (id: string) => {
    try {
      const updated = await deleteCourseScheduleOverride(id);
      setConfig(updated);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error eliminando excepción.' });
    }
  };

  const handleAddNonSchoolDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nsdDate || !nsdReason.trim()) return;
    try {
      const updated = await addNonSchoolDay(nsdDate, nsdReason.trim());
      setConfig(updated);
      setNsdDate('');
      setNsdReason('');
      setFeedback({ type: 'ok', text: 'Día no lectivo registrado.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error registrando día no lectivo.',
      });
    }
  };

  const handleToggleWeekend = async (checked: boolean) => {
    try {
      const updated = await updateWeekendRule(checked);
      setConfig(updated);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Error actualizando regla.' });
    }
  };

  if (loading || !config) {
    return (
      <div className="aero-glass rounded-3xl p-8 text-center text-sm font-bold text-slate-600">
        Cargando configuración horaria y calendario escolar...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {!canEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs font-bold text-amber-900">
          Modo lectura: solo el Director / Administrador puede modificar los horarios institucionales y días no lectivos.
        </div>
      )}

      {/* Turnos principales */}
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
        <div className="flex items-center gap-2.5">
          <Clock size={20} className="text-sky-600" />
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Horarios Generales por Turno (Mañana, Tarde y Vespertino)
            </h3>
            <p className="text-xs text-slate-600">
              Clasifica automáticamente PRESENTE (hasta hora límite + minutos de tolerancia) o TARDE, y controla el cierre de ausencias.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {config.shifts.map((sh) => (
            <div
              key={sh.shift}
              className="bg-white/90 rounded-2xl border border-sky-200/80 p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-extrabold text-sky-950">{sh.label}</h4>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={sh.enabled}
                    onChange={(e) => handleShiftFieldChange(sh.shift, 'enabled', e.target.checked)}
                  />
                  <span>Activo</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Entrada
                  </label>
                  <input
                    type="time"
                    disabled={!canEdit}
                    value={sh.entryTime}
                    onChange={(e) => handleShiftFieldChange(sh.shift, 'entryTime', e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Límite Puntualidad
                  </label>
                  <input
                    type="time"
                    disabled={!canEdit}
                    value={sh.punctualityCutoffTime}
                    onChange={(e) =>
                      handleShiftFieldChange(sh.shift, 'punctualityCutoffTime', e.target.value)
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Tolerancia (min)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    disabled={!canEdit}
                    value={sh.toleranceMinutes}
                    onChange={(e) =>
                      handleShiftFieldChange(sh.shift, 'toleranceMinutes', Number(e.target.value))
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Salida Habitual
                  </label>
                  <input
                    type="time"
                    disabled={!canEdit}
                    value={sh.exitTime}
                    onChange={(e) => handleShiftFieldChange(sh.shift, 'exitTime', e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold tabular-nums"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-extrabold uppercase text-slate-500 mb-1">
                    Cierre de Control (Dispara Ausencias)
                  </label>
                  <input
                    type="time"
                    disabled={!canEdit}
                    value={sh.absenceCloseTime}
                    onChange={(e) =>
                      handleShiftFieldChange(sh.shift, 'absenceCloseTime', e.target.value)
                    }
                    className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white font-mono font-bold tabular-nums"
                  />
                </div>
              </div>

              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleSaveShift(sh)}
                  className="w-full aero-btn-primary py-2.5 min-h-[40px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Save size={14} />
                  <span>Guardar {sh.label}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Excepciones por curso y división */}
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">
            Horarios Diferenciados por Curso y División
          </h3>
          <p className="text-xs text-slate-600">
            Anulan el horario general cuando un curso o división específica posee otro horario de entrada o salida.
          </p>
        </div>

        {canEdit && (
          <form
            onSubmit={handleAddOverride}
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2.5 items-end bg-sky-50/70 p-3.5 rounded-2xl border border-sky-200"
          >
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Curso
              </label>
              <select
                value={ovrCourse}
                onChange={(e) => setOvrCourse(e.target.value as CourseYear)}
                className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
              >
                {(['1', '2', '3', '4', '5', '6'] as CourseYear[]).map((c) => (
                  <option key={c} value={c}>
                    {c}° Año
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                División
              </label>
              <input
                type="text"
                value={ovrDivision}
                onChange={(e) => setOvrDivision(e.target.value)}
                placeholder="Todas o A, B"
                className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Turno
              </label>
              <select
                value={ovrShift}
                onChange={(e) => setOvrShift(e.target.value as ShiftType)}
                className="w-full px-2.5 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
              >
                <option value="manana">Mañana</option>
                <option value="tarde">Tarde</option>
                <option value="vespertino">Vespertino</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Entrada
              </label>
              <input
                type="time"
                value={ovrEntry}
                onChange={(e) => setOvrEntry(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border border-sky-200 bg-white text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Límite
              </label>
              <input
                type="time"
                value={ovrCutoff}
                onChange={(e) => setOvrCutoff(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border border-sky-200 bg-white text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Tol. (m)
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={ovrTolerance}
                onChange={(e) => setOvrTolerance(Number(e.target.value))}
                className="w-full px-2 py-2 rounded-xl border border-sky-200 bg-white text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Salida
              </label>
              <input
                type="time"
                value={ovrExit}
                onChange={(e) => setOvrExit(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border border-sky-200 bg-white text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Cierre Aus.
              </label>
              <input
                type="time"
                value={ovrClose}
                onChange={(e) => setOvrClose(e.target.value)}
                className="w-full px-2 py-2 rounded-xl border border-sky-200 bg-white text-xs font-mono font-bold"
              />
            </div>
            <button
              type="submit"
              className="aero-btn-aqua py-2 px-3 min-h-[38px] rounded-xl text-xs font-extrabold flex items-center justify-center gap-1 whitespace-nowrap"
            >
              <Plus size={14} />
              <span>Agregar</span>
            </button>
          </form>
        )}

        {config.overrides.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            No hay horarios especiales por curso cargados. Se aplican los horarios generales de cada turno.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-sky-100 text-slate-500 uppercase text-[10px] text-left">
                  <th className="py-2 pr-3">Curso / División</th>
                  <th className="py-2 pr-3">Turno</th>
                  <th className="py-2 pr-3">Entrada</th>
                  <th className="py-2 pr-3">Puntualidad (+Tol)</th>
                  <th className="py-2 pr-3">Salida</th>
                  <th className="py-2 pr-3">Cierre Aus.</th>
                  {canEdit && <th className="py-2 text-right">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100">
                {config.overrides.map((ovr) => (
                  <tr key={ovr.id}>
                    <td className="py-2.5 pr-3 font-extrabold text-slate-900">
                      {ovr.course}° Año {ovr.division ? `Div. ${ovr.division}` : '(Todas las divisiones)'}
                    </td>
                    <td className="py-2.5 pr-3 font-bold text-sky-800">{ovr.shift}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{ovr.entryTime}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">
                      {ovr.punctualityCutoffTime} (+{ovr.toleranceMinutes} min)
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{ovr.exitTime}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">{ovr.absenceCloseTime}</td>
                    {canEdit && (
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteOverride(ovr.id)}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                          title="Eliminar excepción"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calendario Escolar y Días No Lectivos */}
      <div className="aero-glass rounded-3xl p-5 sm:p-6 border border-white/90 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <CalendarOff size={20} className="text-amber-600" />
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Calendario Escolar y Días No Lectivos
              </h3>
              <p className="text-xs text-slate-600">
                En días no lectivos o feriados sincronizados del calendario el sistema nunca marca ausencias.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-extrabold text-slate-800 bg-white px-3.5 py-2 rounded-xl border border-sky-200">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={config.weekendIsNonSchoolDay}
              onChange={(e) => handleToggleWeekend(e.target.checked)}
            />
            <span>Sábados y domingos son días no lectivos</span>
          </label>
        </div>

        {canEdit && (
          <form onSubmit={handleAddNonSchoolDay} className="flex flex-wrap items-end gap-2.5">
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Fecha
              </label>
              <input
                type="date"
                required
                value={nsdDate}
                onChange={(e) => setNsdDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-bold"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                Motivo (Feriado / Asueto / Jornada Institucional)
              </label>
              <input
                type="text"
                required
                value={nsdReason}
                onChange={(e) => setNsdReason(e.target.value)}
                placeholder="Ej. Feriado Nacional / Jornada Pedagógica"
                className="w-full px-3 py-2 rounded-xl border border-sky-200 bg-white text-xs font-semibold"
              />
            </div>
            <button
              type="submit"
              className="aero-btn-primary px-4 py-2 min-h-[38px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus size={14} />
              <span>Agregar Día No Lectivo</span>
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {config.nonSchoolDays.map((day) => (
            <div
              key={day.id}
              className="bg-amber-50/85 border border-amber-200 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <p className="font-mono font-extrabold text-amber-950">{day.date}</p>
                <p className="font-semibold text-amber-800 truncate">{day.reason}</p>
              </div>
              {canEdit && day.source === 'manual' && (
                <button
                  type="button"
                  onClick={async () => setConfig(await deleteNonSchoolDay(day.id))}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 shrink-0"
                  title="Eliminar día no lectivo"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {config.nonSchoolDays.length === 0 && (
            <p className="text-xs text-slate-500 italic col-span-full">
              Sin días no lectivos excepcionales cargados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
