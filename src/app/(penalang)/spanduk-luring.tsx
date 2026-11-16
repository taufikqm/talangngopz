'use client';

import { useSyncExternalStore } from 'react';

function langgan(panggil: () => void) {
  window.addEventListener('online', panggil);
  window.addEventListener('offline', panggil);
  return () => {
    window.removeEventListener('online', panggil);
    window.removeEventListener('offline', panggil);
  };
}

/**
 * Spanduk saat jaringan putus di tengah pemakaian. Teksnya tidak menjanjikan penyimpanan
 * luring: aplikasi belum menyimpan apa pun tanpa sambungan.
 */
export function SpandukLuring() {
  const daring = useSyncExternalStore(
    langgan,
    () => navigator.onLine,
    () => true,
  );
  if (daring) return null;
  return (
    <div role="status" className="sticky top-0 z-10 bg-tl-perhatian py-3 pr-28 pl-4 text-tl-label font-semibold text-tl-perhatian-teks">
      Kamu sedang luring. Sambungkan internet untuk melihat data terbaru.
    </div>
  );
}
