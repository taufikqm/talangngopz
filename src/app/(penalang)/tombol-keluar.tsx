'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { keluar } from '@/actions/auth';

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
    <div className="flex items-center gap-2">
      {galat && (
        <span role="alert" className="text-tl-label font-semibold text-tl-galat">
          {galat}
        </span>
      )}
      <button
        type="button"
        onClick={klik}
        disabled={sedangKeluar}
        className="min-h-11 min-w-11 rounded-tl-tombol px-3 text-tl-label font-bold text-tl-aksi hover:underline disabled:text-tl-teks-redup"
      >
        {sedangKeluar ? 'Keluar…' : 'Keluar'}
      </button>
    </div>
  );
}
