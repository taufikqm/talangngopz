import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect, unstable_rethrow } from 'next/navigation';
import { LencanaStatus } from '@/components/lencana-status';
import { BATAS_DAFTAR_EVENT, muatDaftarEvent, type EventRingkas } from '@/lib/daftar-event';
import { GalatMuat } from '@/lib/klaim-penalang';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { tampilTanggal } from '@/lib/tanggal';
import { rupiah } from '@/lib/uang';

export const metadata: Metadata = { title: 'Event' };

function KartuEvent({ e }: { e: EventRingkas }) {
  return (
    <li>
      <Link
        href={`/event/${e.id}`}
        className="flex min-h-16 items-center gap-3 rounded-tl-kartu border border-tl-garis bg-tl-permukaan px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-tl-nama font-bold">{e.judul}</p>
          <p className="text-tl-label text-tl-teks-redup">
            {tampilTanggal(e.tanggal)} · {e.jumlahLunas} dari {e.jumlahPorsi} lunas
          </p>
          <div className="mt-1.5">
            <LencanaStatus status={e.status} />
          </div>
        </div>
        <span className="shrink-0 text-tl-nominal font-bold tabular-nums">{rupiah(e.total)}</span>
        <span aria-hidden="true" className="text-tl-teks-redup">
          ›
        </span>
      </Link>
    </li>
  );
}

async function Isi() {
  let daftar: EventRingkas[];
  try {
    const penalang = await ambilPenalang();
    if (!penalang) redirect('/login');
    daftar = await muatDaftarEvent(await buatKlienServer(), penalang.id);
  } catch (e) {
    unstable_rethrow(e);
    console.error('daftar event: gagal memuat', e instanceof GalatMuat ? e.kode : 'tidak_dikenal');
    return (
      <p role="alert" className="text-tl-isi font-semibold text-tl-galat">
        Daftar event gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  return (
    <>
      <h1 className="text-[24px] font-extrabold">Event</h1>
      {daftar.length === 0 ? (
        <p className="text-tl-isi text-tl-teks-sekunder">Belum ada event. Tekan ＋ untuk mencatat talangan pertama.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {daftar.map((e) => (
              <KartuEvent key={e.id} e={e} />
            ))}
          </ul>
          {daftar.length >= BATAS_DAFTAR_EVENT && (
            <p className="text-tl-label text-tl-teks-redup">Menampilkan {BATAS_DAFTAR_EVENT} event terbaru.</p>
          )}
        </>
      )}
    </>
  );
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-2">
      <div className="mb-2 h-8 w-1/3 rounded-tl-tombol bg-tl-garis" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 rounded-tl-kartu border border-tl-garis bg-tl-permukaan" />
      ))}
    </div>
  );
}

export default function HalamanEvent() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-5 pb-8">
      <Suspense fallback={<Kerangka />}>
        <Isi />
      </Suspense>
    </main>
  );
}
