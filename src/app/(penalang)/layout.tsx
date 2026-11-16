import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { hitungKlaimMenunggu } from '@/lib/klaim-penalang';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { DaftarSw } from '../daftar-sw';
import { MenuUtama } from './menu-utama';
import { SpandukLuring } from './spanduk-luring';
import { TombolKeluar } from './tombol-keluar';

// Proxy sudah mengalihkan tanpa sesi, tetapi proxy hanya pemeriksaan optimistis.
// Pemeriksaan di sini yang mengikat untuk setiap halaman bersesi.
async function PenjagaSesi({ children }: { children: ReactNode }) {
  const penalang = await ambilPenalang();
  if (!penalang) redirect('/login');
  const klaimMenunggu = await hitungKlaimMenunggu(await buatKlienServer(), penalang.id);
  return (
    <>
      <TombolKeluar />
      {/* pt-12 menyisakan ruang di bawah tombol Keluar yang mengambang, supaya tidak menutup isi paling atas.
          Pembungkus juga mengisi sisa tinggi layar supaya menu (sticky di dasar) tetap di dasar pada halaman pendek. */}
      <div className="flex flex-1 flex-col pt-12">{children}</div>
      <MenuUtama klaimMenunggu={klaimMenunggu} />
    </>
  );
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="mx-auto flex w-full max-w-md flex-col gap-2 px-5 pt-14 pb-6">
      <div className="mb-2 h-12 w-2/3 rounded-tl-tombol bg-tl-garis" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-tl-kartu border border-tl-garis bg-tl-permukaan" />
      ))}
    </div>
  );
}

export default function LayoutPenalang({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SpandukLuring />
      <DaftarSw />
      <Suspense fallback={<Kerangka />}>
        <PenjagaSesi>{children}</PenjagaSesi>
      </Suspense>
    </>
  );
}
