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
        <span role="alert" className="text-sm text-red-700 dark:text-red-400">
          {galat}
        </span>
      )}
      <button
        type="button"
        onClick={klik}
        disabled={sedangKeluar}
        className="min-h-11 min-w-11 rounded-lg px-3 text-sm font-medium text-zinc-800 underline-offset-4 hover:underline disabled:text-zinc-500 dark:text-zinc-200"
      >
        {sedangKeluar ? 'Keluar…' : 'Keluar'}
      </button>
    </div>
  );
}
