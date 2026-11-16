'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { masuk } from '@/actions/auth';

// Gaya Beranda (docs/gaya-visual.md): semua warna dan ukuran dari token tl-* di globals.css.
const KELAS_MEDAN = 'min-h-12 w-full rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-3 text-[16px] text-tl-teks';
const KELAS_LABEL = 'text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup';
const KELAS_GALAT = 'text-tl-label font-semibold text-tl-galat';

export function FormulirMasuk() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangMasuk, mulaiMasuk] = useTransition();

  function kirim(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mulaiMasuk(async () => {
      const hasil = await masuk({ email, password });
      if (hasil.ok) {
        router.replace('/');
        router.refresh();
      } else {
        setGalat(hasil.pesan);
        setPassword('');
      }
    });
  }

  return (
    <form onSubmit={kirim} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className={KELAS_LABEL}>
          Surel
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={galat ? true : undefined}
          aria-describedby="status-masuk"
          className={KELAS_MEDAN}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className={KELAS_LABEL}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={galat ? true : undefined}
          aria-describedby="status-masuk"
          className={KELAS_MEDAN}
        />
      </div>

      <p id="status-masuk" aria-live="polite" className={`min-h-6 text-tl-isi ${KELAS_GALAT}`}>
        {galat}
      </p>

      <button
        type="submit"
        disabled={sedangMasuk}
        className="min-h-13 w-full rounded-tl-tombol bg-tl-aksi px-4 text-[16px] font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-redup"
      >
        {sedangMasuk ? 'Masuk…' : 'Masuk'}
      </button>
    </form>
  );
}
