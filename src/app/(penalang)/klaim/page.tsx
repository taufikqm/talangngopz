import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, unstable_rethrow } from 'next/navigation';
import { hariIni } from '@/lib/event';
import { GalatMuat, muatKlaimMenunggu, type KlaimTampil } from '@/lib/klaim-penalang';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { PenyediaPesan, TampilPesan } from '../pesan-aksi';
import { DaftarKlaim } from './daftar-klaim';

export const metadata: Metadata = { title: 'Klaim menunggu' };

async function Isi() {
  let klaim: KlaimTampil[];
  try {
    const penalang = await ambilPenalang();
    if (!penalang) redirect('/login');
    klaim = await muatKlaimMenunggu(await buatKlienServer(), penalang.id, hariIni());
  } catch (e) {
    unstable_rethrow(e);
    console.error('klaim menunggu: gagal memuat', e instanceof GalatMuat ? e.kode : 'tidak_dikenal');
    return (
      <p role="alert" className="text-tl-isi font-semibold text-tl-galat">
        Daftar klaim gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  return (
    <PenyediaPesan>
      <h1 className="text-2xl font-extrabold">Klaim menunggu</h1>
      <TampilPesan />
      <DaftarKlaim klaim={klaim} />
      {klaim.length === 0 && <p className="text-tl-isi text-tl-teks-sekunder">Tidak ada klaim yang menunggu konfirmasi.</p>}
    </PenyediaPesan>
  );
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-2">
      <div className="mb-2 h-8 w-2/3 rounded-tl-tombol bg-tl-garis" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-tl-kartu border border-tl-garis bg-tl-permukaan" />
      ))}
    </div>
  );
}

export default function HalamanKlaim() {
  return (
    <div className="flex flex-1 flex-col bg-tl-latar font-jakarta text-tl-teks">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-3 pb-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-tl-label font-bold text-tl-aksi">
          ‹ Dasbor
        </Link>
        <Suspense fallback={<Kerangka />}>
          <Isi />
        </Suspense>
      </main>
    </div>
  );
}
