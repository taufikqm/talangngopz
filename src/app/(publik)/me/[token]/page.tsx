import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound, unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { GalatPemuat, rekapPribadi } from '@/lib/publik';
import { rupiah } from '@/lib/uang';
import { DaftarBayar } from './daftar-bayar';
import { KartuTujuan } from './kartu-tujuan';

// Judul statis: token tidak boleh muncul di judul halaman.
export const metadata: Metadata = {
  title: 'Tagihanmu',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

async function Isi({ params }: { params: Promise<{ token: string }> }) {
  // Klien Supabase membaca jam saat dibuat; tunda sampai permintaan nyata.
  await connection();
  const { token } = await params;
  let rekap;
  try {
    rekap = await rekapPribadi(token);
  } catch (e) {
    unstable_rethrow(e);
    console.error('halaman me: gagal memuat', e instanceof GalatPemuat ? e.kode : 'tidak_dikenal');
    return (
      <p role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
        Tagihan gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  if (!rekap) notFound();

  // Rekening hanya untuk penalang yang masih ditunggu pembayarannya.
  const masihBerutang = new Set(rekap.perEvent.filter((p) => p.status === 'belum_bayar').map((p) => p.penalangId));
  const tujuanAktif = rekap.tujuan.filter((t) => masihBerutang.has(t.penalangId));

  return (
    <>
      <h1 className="text-xl font-medium">Halo {rekap.namaPanggilan}</h1>
      {rekap.totalUtang === 0 ? (
        <p className="mt-2 text-2xl font-semibold">Kamu sudah lunas semua. Makasih!</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">Total utangmu</p>
          <p className="text-4xl font-semibold tabular-nums">{rupiah(rekap.totalUtang)}</p>
        </>
      )}

      {tujuanAktif.length > 0 && (
        <section aria-labelledby="judul-tujuan" className="mt-6 flex flex-col gap-3">
          <h2 id="judul-tujuan" className="text-sm font-medium">Transfer ke</h2>
          {tujuanAktif.map((t) => (
            <KartuTujuan key={t.penalangId} tujuan={t} />
          ))}
        </section>
      )}

      <DaftarBayar
        perEvent={rekap.perEvent}
        namaPenalang={Object.fromEntries(rekap.tujuan.map((t) => [t.penalangId, t.nama]))}
        namaPanggilan={rekap.namaPanggilan}
      />
    </>
  );
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-3">
      <div className="h-6 w-1/3 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-10 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-24 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-32 w-full rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

export default function HalamanMe({ params }: PageProps<'/me/[token]'>) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col px-4 pt-6">
      <Suspense fallback={<Kerangka />}>
        <Isi params={params} />
      </Suspense>
    </main>
  );
}
