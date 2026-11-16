import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // Keep dev preview free from stale cached bundles
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister().catch(() => {}));
    });
  } else {
    const RELOAD_GUARD_KEY = 'az_sw_controller_reloaded';
    let hadExistingController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadExistingController) {
        hadExistingController = true;
        return;
      }
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
        sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      } catch {
        // Ignore private browsing storage error
      }
      window.location.reload();
    });

    const updateSW = registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        registration.update().catch(() => {});
        const checkUpdate = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', checkUpdate);
        window.addEventListener('focus', checkUpdate);
      },
      onNeedRefresh() {
        updateSW(true);
      },
    });
  }
}

window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('az_preload_reloaded')) return;
    sessionStorage.setItem('az_preload_reloaded', '1');
  } catch {
    // Ignore storage error
  }
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(<App />);
