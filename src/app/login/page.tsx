import type { Metadata } from 'next';
import { FormulirMasuk } from './formulir-masuk';

export const metadata: Metadata = {
  title: 'Masuk',
  robots: { index: false, follow: false },
};

export default function HalamanMasuk() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Masuk</h1>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Khusus penalang.</p>
      </div>
      <FormulirMasuk />
    </main>
  );
}
