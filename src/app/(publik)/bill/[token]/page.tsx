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
      <p role="alert" className="mt-4 text-tl-isi font-semibold text-tl-galat">
        Tagihan gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  if (!rekap) notFound();

  const lunas = rekap.peserta.filter((p) => p.status === 'lunas').length;
  return (
    <>
      <h1 className="text-[24px] font-extrabold">{rekap.judul}</h1>
      <p className="mt-1 text-tl-isi text-tl-teks-sekunder">
        {tampilTanggal(rekap.tanggal)} · ditalangi {rekap.penalang}
      </p>
      <p className="mt-4 text-tl-angka font-extrabold tabular-nums">{rupiah(rekap.total)}</p>
      <p className="text-tl-isi text-tl-teks-sekunder">
        {lunas} dari {rekap.peserta.length} orang sudah lunas
      </p>
      <ul className="mt-6 flex flex-col divide-y divide-tl-garis-halus rounded-tl-kartu border border-tl-garis bg-tl-permukaan">
        {rekap.peserta.map((p, i) => (
          <li key={i} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 truncate text-tl-nama font-bold">{p.nama}</span>
            <span className="text-tl-nominal font-bold tabular-nums">{rupiah(p.total)}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-tl-lencana font-bold ${KELAS_STATUS[p.status]}`}>
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
      <div className="h-7 w-2/3 rounded-tl-tombol bg-tl-garis" />
      <div className="h-11 w-1/2 rounded-tl-tombol bg-tl-garis" />
      <div className="h-32 w-full rounded-tl-kartu border border-tl-garis bg-tl-permukaan" />
    </div>
  );
}

export default function HalamanBill({ params }: PageProps<'/bill/[token]'>) {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-6">
      <Suspense fallback={<Kerangka />}>
        <Isi params={params} />
      </Suspense>
    </main>
  );
}
