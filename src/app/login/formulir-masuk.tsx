'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { masuk } from '@/actions/auth';

const KELAS_MEDAN =
  'min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-base text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50';

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
        <label htmlFor="email" className="text-sm font-medium">
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
        <label htmlFor="password" className="text-sm font-medium">
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

      <p id="status-masuk" aria-live="polite" className="min-h-6 text-sm text-red-700 dark:text-red-400">
        {galat}
      </p>

      <button
        type="submit"
        disabled={sedangMasuk}
        className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 text-base font-medium text-white disabled:bg-zinc-500 dark:bg-zinc-50 dark:text-zinc-900 dark:disabled:bg-zinc-400"
      >
        {sedangMasuk ? 'Masuk…' : 'Masuk'}
      </button>
    </form>
  );
}
