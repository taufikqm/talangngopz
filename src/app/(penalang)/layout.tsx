import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { ambilPenalang } from '@/lib/supabase/server';
import { TombolKeluar } from './tombol-keluar';

// Proxy sudah mengalihkan tanpa sesi, tetapi proxy hanya pemeriksaan optimistis.
// Pemeriksaan di sini yang mengikat untuk setiap halaman bersesi.
async function PenjagaSesi({ children }: { children: ReactNode }) {
  const penalang = await ambilPenalang();
  if (!penalang) redirect('/login');
  return (
    <>
      <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-1 dark:border-zinc-800">
        <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{penalang.nama}</span>
        <TombolKeluar />
      </header>
      {children}
    </>
  );
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-3 px-4 py-6">
      <div className="h-6 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-6 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-6 w-5/6 rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export default function LayoutPenalang({ children }: LayoutProps<'/'>) {
  return (
    <Suspense fallback={<Kerangka />}>
      <PenjagaSesi>{children}</PenjagaSesi>
    </Suspense>
  );
}
