/**
 * Service Worker Registration for u-SHA-jua PWA & Offline Crisis Mesh
 */
export function registerServiceWorker() {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('📡 u-SHA-jua ServiceWorker active with scope:', registration.scope);
        })
        .catch((error) => {
          console.warn('ServiceWorker registration error:', error);
        });
    });
  }
}

