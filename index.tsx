import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';

// Registro seguro y único del Service Worker PWA (sin recargas forzadas ni registros repetidos)
function registerServiceWorkerSafely() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (window.__SGE_SW_REGISTERED__) return;

  window.__SGE_SW_REGISTERED__ = true;

  try {
    registerSW({
      immediate: false,
      onNeedRefresh() {
        // Evitar recargas automáticas inesperadas durante el uso del sistema
      },
      onNeedReload() {
        // Anula el fallback window.location.reload() de vite-plugin-pwa para evitar bucles de recarga
      },
      onOfflineReady() {
        // Caché offline lista de forma silenciosa
      },
      onRegisterError(error) {
        console.warn('[PWA] Registro de Service Worker omitido sin afectar la aplicación:', error);
      },
    });
  } catch (error) {
    console.warn('[PWA] No se pudo inicializar el Service Worker:', error);
  }
}

registerServiceWorkerSafely();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Ocultar pantalla inicial (splash) suavemente al montar React
const splash = document.getElementById('app-splash');
if (splash) {
  requestAnimationFrame(() => {
    splash.classList.add('splash-hidden');
    setTimeout(() => splash.remove(), 300);
  });
}
