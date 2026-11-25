import React from 'react';
import { SchoolInfo, CardDesignConfig } from '../types';
import { PrintableCardItem } from '../services/cardPdfExport';
import { User, ShieldCheck } from 'lucide-react';

interface CarnetPreviewCardProps {
  item: PrintableCardItem;
  schoolInfo: SchoolInfo;
  config: CardDesignConfig;
  side?: 'front' | 'back' | 'both';
  compact?: boolean;
}

const getFontClass = (font: CardDesignConfig['fontFamily']) => {
  if (font === 'classic') return 'font-serif';
  if (font === 'dm') return 'font-sans';
  return 'font-display';
};

export const CarnetPreviewCard: React.FC<CarnetPreviewCardProps> = ({
  item,
  schoolInfo,
  config,
  side = 'both',
  compact = false,
}) => {
  const isVertical = config.orientation === 'vertical';
  const fontClass = getFontClass(config.fontFamily);
  const cardTitle =
    item.personType === 'student' ? config.studentCardTitle : config.teacherCardTitle;

  const headerGradient =
    config.layoutPreset === 'emerald-nature'
      ? `linear-gradient(125deg, ${config.primaryColor} 0%, ${config.accentColor} 100%)`
      : config.layoutPreset === 'crystal-clean'
      ? `linear-gradient(180deg, ${config.primaryColor} 0%, ${config.secondaryColor} 100%)`
      : `linear-gradient(115deg, ${config.primaryColor} 0%, ${config.secondaryColor} 65%, ${config.accentColor} 100%)`;

  const statusBadge =
    item.cardRecord.status === 'anulado'
      ? { label: 'ANULADO', cls: 'bg-rose-600 text-white' }
      : item.cardRecord.status === 'reemplazado'
      ? { label: 'REEMPLAZADO', cls: 'bg-amber-500 text-slate-950' }
      : null;

  const dimensionsClass = isVertical
    ? compact
      ? 'w-[215px] min-h-[330px]'
      : 'w-[248px] min-h-[385px]'
    : compact
    ? 'w-[310px] min-h-[196px]'
    : 'w-[356px] max-w-full min-h-[222px]';

  const renderFront = () => (
    <div
      className={`relative rounded-2xl overflow-hidden border border-sky-200/90 shadow-lg bg-gradient-to-br from-white via-sky-50/70 to-teal-50/60 flex flex-col justify-between select-none ${dimensionsClass} ${fontClass}`}
    >
      {/* Efecto brillo cristalino Frutiger Aero */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full opacity-25 blur-xl"
        style={{ background: config.secondaryColor }}
      />

      {statusBadge && (
        <div
          className={`absolute top-2 right-2 z-20 px-2 py-0.5 rounded-md text-[9px] font-black tracking-wider shadow ${statusBadge.cls}`}
        >
          {statusBadge.label}
        </div>
      )}

      {/* Encabezado del Carnet */}
      <div
        className="relative px-3.5 py-2.5 text-white flex items-center gap-2.5"
        style={{ background: headerGradient }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
        <div className="w-9 h-9 rounded-xl bg-white/95 p-1 flex items-center justify-center shrink-0 shadow-sm relative z-10 overflow-hidden">
          {schoolInfo.logo ? (
            <img src={schoolInfo.logo} alt="Escudo" className="w-full h-full object-contain" />
          ) : (
            <img src="/aero-emblem.png" alt="Emblema" className="w-full h-full object-cover rounded-lg" />
          )}
        </div>
        <div className="min-w-0 relative z-10 flex-1">
          <p className="text-[10px] font-extrabold uppercase leading-tight line-clamp-1 tracking-wide">
            {schoolInfo.name}
          </p>
          <p className="text-[8.5px] font-bold uppercase tracking-widest text-sky-100/95 truncate">
            {cardTitle} • {item.cardRecord.academicYear}
          </p>
        </div>
      </div>

      {/* Cuerpo del Frente */}
      {!isVertical ? (
        <div className="p-3 flex items-center gap-3 flex-1 relative z-10">
          {item.photo && (
            <div
              className="w-[64px] h-[78px] rounded-xl overflow-hidden border-2 bg-sky-100 shrink-0 shadow-sm"
              style={{ borderColor: config.secondaryColor }}
            >
              <img src={item.photo} alt={item.fullName} className="w-full h-full object-cover" />
            </div>
          )}

          {!item.photo && ((item.personType === 'student' && config.showStudentPhoto) || (item.personType === 'teacher' && config.showTeacherPhoto)) && !item.cardRecord.visualOverride?.hidePhoto && (
            <div className="w-[64px] h-[78px] rounded-xl border-2 border-dashed border-sky-300 bg-sky-50 flex flex-col items-center justify-center text-sky-400 shrink-0">
              <User size={24} />
              <span className="text-[7px] font-bold uppercase mt-0.5">Sin foto</span>
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-1">
            <h4 className="text-[13px] font-extrabold text-slate-900 uppercase leading-tight line-clamp-2">
              {item.fullName}
            </h4>
            <p
              className="text-[11px] font-extrabold leading-tight truncate"
              style={{ color: config.primaryColor }}
            >
              {item.subtitle}
            </p>
            {item.secondaryLine && (
              <p className="text-[9.5px] text-slate-600 font-medium leading-snug line-clamp-2">
                {item.secondaryLine}
              </p>
            )}
            {item.dniMaskedOrVisible && (
              <p className="text-[9px] font-mono font-bold text-slate-700">
                DNI: {item.dniMaskedOrVisible}
              </p>
            )}
          </div>

          <div className="bg-white p-1.5 rounded-xl border border-sky-200 shadow-sm shrink-0">
            <img
              src={item.qrDataUrl}
              alt="Código QR"
              className="w-[68px] h-[68px] block"
            />
          </div>
        </div>
      ) : (
        <div className="p-3.5 flex flex-col items-center text-center gap-2 flex-1 relative z-10">
          {item.photo ? (
            <div
              className="w-[78px] h-[92px] rounded-2xl overflow-hidden border-2 bg-sky-100 shadow-sm"
              style={{ borderColor: config.secondaryColor }}
            >
              <img src={item.photo} alt={item.fullName} className="w-full h-full object-cover" />
            </div>
          ) : (
            ((item.personType === 'student' && config.showStudentPhoto) ||
              (item.personType === 'teacher' && config.showTeacherPhoto)) &&
            !item.cardRecord.visualOverride?.hidePhoto && (
              <div className="w-[78px] h-[92px] rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50 flex flex-col items-center justify-center text-sky-400">
                <User size={28} />
                <span className="text-[8px] font-bold uppercase mt-1">Sin foto</span>
              </div>
            )
          )}

          <div className="space-y-0.5 w-full">
            <h4 className="text-xs font-extrabold text-slate-900 uppercase leading-tight line-clamp-2">
              {item.fullName}
            </h4>
            <p className="text-[11px] font-extrabold truncate" style={{ color: config.primaryColor }}>
              {item.subtitle}
            </p>
            {item.secondaryLine && (
              <p className="text-[9px] text-slate-600 line-clamp-1">{item.secondaryLine}</p>
            )}
            {item.dniMaskedOrVisible && (
              <p className="text-[9px] font-mono font-bold text-slate-700">DNI: {item.dniMaskedOrVisible}</p>
            )}
          </div>

          <div className="bg-white p-1.5 rounded-xl border border-sky-200 shadow-sm mt-auto">
            <img src={item.qrDataUrl} alt="Código QR" className="w-[74px] h-[74px] block" />
          </div>
        </div>
      )}

      {/* Pie del Frente */}
      <div
        className="px-3.5 py-1.5 flex items-center justify-between text-[9px] font-bold border-t border-sky-100 bg-white/85 relative z-10"
        style={{ borderBottom: `4px solid ${config.accentColor}` }}
      >
        <span className="font-mono text-slate-800">N° {item.cardRecord.cardNumber}</span>
        <span style={{ color: config.primaryColor }}>Válido: {item.cardRecord.validUntil}</span>
      </div>
    </div>
  );

  const renderBack = () => (
    <div
      className={`relative rounded-2xl overflow-hidden border border-sky-200/90 shadow-lg bg-gradient-to-br from-white via-sky-50/60 to-emerald-50/40 flex flex-col justify-between select-none ${dimensionsClass} ${fontClass}`}
    >
      <div
        className="px-3.5 py-2 text-white text-center text-[9px] font-extrabold uppercase tracking-widest"
        style={{ background: headerGradient }}
      >
        Dorso Institucional • Identificación y Vigencia
      </div>

      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2 text-[9.5px] text-slate-700">
        <div className="grid grid-cols-2 gap-1.5 bg-white/85 rounded-xl p-2 border border-sky-100 text-[9px]">
          <div>
            <span className="text-slate-400 font-bold uppercase block text-[7.5px]">N° de Carnet</span>
            <span className="font-mono font-extrabold text-slate-900">{item.cardRecord.cardNumber}</span>
          </div>
          <div>
            <span className="text-slate-400 font-bold uppercase block text-[7.5px]">Emisión / Vence</span>
            <span className="font-mono font-bold text-sky-900">
              {item.cardRecord.issuedAt} &rarr; {item.cardRecord.validUntil}
            </span>
          </div>
        </div>

        <p className="text-[8.8px] leading-snug text-slate-600">{config.backUsageLegend}</p>

        {config.showContactOnBack && (
          <div className="bg-sky-50/90 border border-sky-200/80 rounded-xl p-2 space-y-0.5 text-[8.5px]">
            <p className="font-extrabold text-sky-950 truncate">{schoolInfo.name}</p>
            <p className="text-slate-600 truncate">
              {schoolInfo.address}
              {schoolInfo.locality ? ` • ${schoolInfo.locality}` : ''}
            </p>
            <p className="text-slate-600 truncate">
              {schoolInfo.phone ? `Tel: ${schoolInfo.phone}` : ''}
              {schoolInfo.email ? ` • ${schoolInfo.email}` : ''}
              {schoolInfo.cue ? ` • CUE: ${schoolInfo.cue}` : ''}
            </p>
          </div>
        )}

        <div className="pt-1 flex items-end justify-between gap-2 border-t border-sky-100">
          <div className="flex items-center gap-1 text-[8px] text-slate-500 font-semibold">
            <ShieldCheck size={12} className="text-teal-600 shrink-0" />
            <span>Uso escolar interno</span>
          </div>
          <div className="text-center">
            <div className="w-24 border-b border-slate-400 mb-0.5" />
            <span className="text-[7.5px] font-bold text-slate-600 block truncate max-w-[110px]">
              {schoolInfo.principalName || 'Dirección Escolar'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (side === 'front') return renderFront();
  if (side === 'back') return renderBack();

  return (
    <div className="flex flex-wrap items-start justify-center gap-4">
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800 block text-center">
          Frente
        </span>
        {renderFront()}
      </div>
      <div className="space-y-1.5">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-800 block text-center">
          Dorso
        </span>
        {renderBack()}
      </div>
    </div>
  );
};
