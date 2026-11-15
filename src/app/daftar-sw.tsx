'use client';

import { useEffect } from 'react';

/**
 * Mendaftarkan service worker. Hanya dipasang di layar penalang dan login: halaman peserta
 * tidak pernah mendaftarkannya. Di mode dev dilewati supaya tidak mengganggu HMR.
 */
export function DaftarSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    // updateViaCache 'none': berkas sw.js selalu dicek ulang ke server, bukan dari cache HTTP.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Tanpa service worker aplikasi tetap jalan; hanya halaman luring yang hilang.
    });
  }, []);
  return null;
}
