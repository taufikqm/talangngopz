'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { keluar } from '@/actions/auth';

/**
 * Tombol Keluar mengambang di kanan atas, tanpa bilah atas. Lajur penampung memakai
 * pointer-events-none supaya hanya tombol (bukan seluruh lajur) yang menangkap ketukan, dan
 * lebarnya mengikuti kolom isi (max-w-md) agar di layar lebar tidak terlempar ke tepi jendela.
 */
export function TombolKeluar() {
  const router = useRouter();
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangKeluar, mulaiKeluar] = useTransition();

  function klik() {
    mulaiKeluar(async () => {
      const hasil = await keluar();
      if (hasil.ok) {
        router.replace('/login');
        router.refresh();
      } else {
        setGalat(hasil.pesan);
      }
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md items-center justify-end gap-2 px-5">
        {galat && (
          <span role="alert" className="pointer-events-auto rounded-full bg-tl-permukaan px-3 py-1 text-tl-label font-semibold text-tl-galat shadow-sm">
            {galat}
          </span>
        )}
        <button
          type="button"
          onClick={klik}
          disabled={sedangKeluar}
          className="pointer-events-auto min-h-11 min-w-11 rounded-full border border-tl-garis bg-tl-permukaan px-4 text-tl-label font-bold text-tl-aksi shadow-sm disabled:text-tl-teks-redup"
        >
          {sedangKeluar ? 'Keluar…' : 'Keluar'}
        </button>
      </div>
    </div>
  );
}
