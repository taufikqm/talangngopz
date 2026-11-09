import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';
import type { AnggotaDaftar } from '@/lib/contracts';
import { daftarAnggota, tautanPribadi } from '@/lib/anggota';
import { buatKlienServer } from '@/lib/supabase/server';
import { DaftarAnggota } from './daftar-anggota';

export const metadata: Metadata = { title: 'Anggota' };

async function muatAnggota(): Promise<AnggotaDaftar[] | null> {
  try {
    const db = await buatKlienServer();
    const baris = await daftarAnggota(db);
    // Token hanya dipakai untuk membentuk tautan; tidak dikirim terpisah ke klien.
    return baris.map(({ accessToken, ...a }) => ({ ...a, tautan: tautanPribadi(accessToken) }));
  } catch (e) {
    // cookies() melempar sinyal penundaan saat prerender; sinyal itu milik Next, bukan galat.
    unstable_rethrow(e);
    const kode = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : 'tidak_dikenal';
    console.error('halaman anggota: gagal memuat', kode);
    return null;
  }
}

export default async function HalamanAnggota() {
  const anggota = await muatAnggota();
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Anggota</h1>
        {anggota && <span className="text-sm text-zinc-700 dark:text-zinc-300">{anggota.length} orang</span>}
      </div>
      {anggota ? (
        <DaftarAnggota anggota={anggota} />
      ) : (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          Daftar anggota gagal dimuat. Muat ulang halaman sebentar lagi.
        </p>
      )}
    </main>
  );
}
