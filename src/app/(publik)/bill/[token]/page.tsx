import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound, unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { GalatPemuat, rekapEvent } from '@/lib/publik';
import { rupiah } from '@/lib/uang';
import { KELAS_STATUS, LABEL_STATUS, tampilTanggal } from '../../tampilan';

// Judul statis: token tidak boleh muncul di judul halaman.
export const metadata: Metadata = {
  title: 'Tagihan',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

async function Isi({ params }: { params: Promise<{ token: string }> }) {
  // Klien Supabase membaca jam saat dibuat; tunda sampai permintaan nyata.
  await connection();
  const { token } = await params;
  let rekap;
  try {
    rekap = await rekapEvent(token);
  } catch (e) {
    unstable_rethrow(e);
    console.error('halaman bill: gagal memuat', e instanceof GalatPemuat ? e.kode : 'tidak_dikenal');
    return (
      <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
        Tagihan gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  if (!rekap) notFound();

  const lunas = rekap.peserta.filter((p) => p.status === 'lunas').length;
  return (
    <>
      <h1 className="text-2xl font-semibold">{rekap.judul}</h1>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        {tampilTanggal(rekap.tanggal)} · ditalangi {rekap.penalang}
      </p>
      <p className="mt-4 text-3xl font-semibold tabular-nums">{rupiah(rekap.total)}</p>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        {lunas} dari {rekap.peserta.length} orang sudah lunas
      </p>
      <ul className="mt-6 flex flex-col divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {rekap.peserta.map((p, i) => (
          <li key={i} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">{p.nama}</span>
            <span className="tabular-nums">{rupiah(p.total)}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${KELAS_STATUS[p.status]}`}>
              {LABEL_STATUS[p.status]}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-3">
      <div className="h-7 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-10 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-32 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export default function HalamanBill({ params }: PageProps<'/bill/[token]'>) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <Suspense fallback={<Kerangka />}>
        <Isi params={params} />
      </Suspense>
    </main>
  );
}
