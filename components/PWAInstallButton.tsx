import React, { useState } from 'react';
import { Download, Share, PlusSquare, Smartphone, Laptop, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  schoolName?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  schoolName = 'Sistema Escolar',
}) => {
  const { canInstallNative, isIOS, isInstalled, install } = usePWAInstall();
  const [showHelpModal, setShowHelpModal] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (canInstallNative) {
      await install();
    } else {
      setShowHelpModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`flex items-center justify-center gap-1.5 min-h-[40px] rounded-xl text-xs font-bold transition-all active:scale-95 border whitespace-nowrap ${
          canInstallNative
            ? 'aero-btn-emerald px-3.5 py-2 shadow-md'
            : 'bg-white/15 hover:bg-white/25 text-white border-white/30 px-3 py-2 backdrop-blur-md'
        }`}
        title="Instalar como aplicación en Android, iPhone o PC"
      >
        <Download size={15} className="shrink-0" />
        <span className={compact ? 'hidden lg:inline' : ''}>
          {canInstallNative ? 'Instalar App' : 'App / PWA'}
        </span>
      </button>

      {showHelpModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-sky-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowHelpModal(false)}
        >
          <div
            className="aero-glass rounded-3xl max-w-lg w-full p-6 sm:p-7 relative text-slate-800 border-2 border-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-sky-100/70 transition-colors"
              aria-label="Cerrar guía de instalación"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3.5 mb-5">
              <img
                src="/icon.svg"
                alt="Ícono de la aplicación"
                className="w-14 h-14 rounded-2xl shadow-lg border border-white shrink-0"
              />
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-700">
                  Aplicación Web Progresiva (PWA)
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 leading-tight">
                  Instalar {schoolName}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Funciona a pantalla completa y mantiene los datos locales disponibles incluso sin conexión.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm">
              {isIOS ? (
                <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-4 space-y-2.5">
                  <p className="font-extrabold text-sky-950 flex items-center gap-2">
                    <Smartphone size={16} className="text-sky-600" />
                    Instalación en iPhone / iPad (Safari):
                  </p>
                  <ol className="space-y-2 text-slate-700 list-decimal list-inside">
                    <li className="flex items-start gap-2">
                      <Share size={16} className="text-sky-600 shrink-0 mt-0.5" />
                      <span>
                        Toque el botón <strong>Compartir</strong> en la barra inferior de Safari.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <PlusSquare size={16} className="text-teal-600 shrink-0 mt-0.5" />
                      <span>
                        Deslice hacia abajo y toque <strong>&ldquo;Agregar a inicio&rdquo;</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <span>
                        Confirme con <strong>&ldquo;Agregar&rdquo;</strong> para abrirla como app independiente.
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <>
                  <div className="bg-sky-50/90 border border-sky-200 rounded-2xl p-4 space-y-1.5">
                    <p className="font-extrabold text-sky-950 flex items-center gap-2">
                      <Smartphone size={16} className="text-emerald-600" />
                      En Celulares Android (Chrome / Edge):
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-700 text-xs">
                      <li>Abra el menú del navegador (los tres puntos arriba a la derecha).</li>
                      <li>Toque <strong>&ldquo;Instalar aplicación&rdquo;</strong> o <strong>&ldquo;Agregar a pantalla principal&rdquo;</strong>.</li>
                      <li>El ícono aparecerá junto a sus aplicaciones del teléfono.</li>
                    </ol>
                  </div>

                  <div className="bg-teal-50/80 border border-teal-200 rounded-2xl p-4 space-y-1.5">
                    <p className="font-extrabold text-teal-950 flex items-center gap-2">
                      <Share size={15} className="text-sky-600" />
                      En iPhone / iPad (Safari):
                    </p>
                    <p className="text-xs text-slate-700">
                      Toque el botón <strong>Compartir</strong> &rarr; <strong>&ldquo;Agregar a inicio&rdquo;</strong> &rarr; <strong>&ldquo;Agregar&rdquo;</strong>.
                    </p>
                  </div>

                  <div className="bg-white/90 border border-slate-200 rounded-2xl p-4 space-y-1.5">
                    <p className="font-extrabold text-slate-900 flex items-center gap-2">
                      <Laptop size={16} className="text-sky-600" />
                      En Computadoras (Windows / Mac / Linux):
                    </p>
                    <p className="text-xs text-slate-700">
                      En Chrome o Edge, haga clic en el ícono de instalación en la barra de direcciones o en <strong>Menú &rarr; Instalar aplicación</strong>.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="aero-btn-primary px-6 py-2.5 rounded-xl text-xs font-extrabold"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
