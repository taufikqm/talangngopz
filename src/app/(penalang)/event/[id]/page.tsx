import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect, unstable_rethrow } from 'next/navigation';
import { LencanaStatus } from '@/components/lencana-status';
import { idSah } from '@/lib/anggota';
import { hariIni } from '@/lib/event';
import { GalatMuat } from '@/lib/klaim-penalang';
import { muatRincianEvent, type RincianEvent } from '@/lib/rincian-event';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { tampilTanggal } from '@/lib/tanggal';
import { rupiah } from '@/lib/uang';
import { DaftarKlaim } from '../../klaim/daftar-klaim';
import { PenyediaPesan, TampilPesan } from '../../pesan-aksi';
import { MenuTunai } from './menu-tunai';

export const metadata: Metadata = { title: 'Rincian event' };

function Isi({ e }: { e: RincianEvent }) {
  return (
    <PenyediaPesan>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">{e.judul}</h1>
        <p className="flex flex-wrap items-center gap-2 text-tl-label text-tl-teks-redup">
          <span>{tampilTanggal(e.tanggal)}</span>
          <span aria-hidden>·</span>
          <span className="font-bold tabular-nums">{rupiah(e.total)}</span>
          {e.terkunci && (
            <span className="rounded-full bg-tl-belum px-2.5 py-0.5 text-tl-lencana font-bold text-tl-belum-teks">Terkunci</span>
          )}
        </p>
        {e.terkunci && (
          <p className="text-tl-label text-tl-teks-redup">Sudah ada yang lunas, nominal tidak bisa diubah.</p>
        )}
      </header>

      <TampilPesan />
      <DaftarKlaim klaim={e.klaim} />

      <section aria-labelledby="judul-porsi" className="flex flex-col gap-2">
        <h2 id="judul-porsi" className="text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup">
          Porsi
        </h2>
        <ul className="divide-y divide-tl-garis-halus rounded-tl-kartu border border-tl-garis bg-tl-permukaan px-4">
          {e.porsi.map((p) => (
            <li key={p.shareId} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-tl-nama font-bold">{p.nama}</span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-tl-nominal font-extrabold tabular-nums">{rupiah(p.total)}</span>
                <LencanaStatus status={p.status} />
              </span>
              {p.status === 'belum_bayar' ? (
                <MenuTunai shareId={p.shareId} nama={p.nama} total={p.total} eventTerkunci={e.terkunci} />
              ) : (
                <span className="size-11 shrink-0" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="judul-riwayat" className="flex flex-col gap-2">
        <h2 id="judul-riwayat" className="text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup">
          Riwayat
        </h2>
        {e.riwayat.length === 0 ? (
          <p className="text-tl-isi text-tl-teks-sekunder">Belum ada riwayat.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {e.riwayat.map((r) => (
              <li key={r.kunci} className="rounded-tl-kartu border border-tl-garis bg-tl-permukaan px-4 py-3">
                <p className="text-tl-isi font-semibold">
                  {r.teks} · {r.waktu}
                </p>
                {r.alasan && <p className="mt-1 text-tl-label text-tl-teks-sekunder">Alasan: “{r.alasan}”</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </PenyediaPesan>
  );
}

async function Muat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Id ngawur diperlakukan sama dengan event milik penalang lain: 404 yang sama.
  if (!idSah(id)) notFound();
  let rincian: RincianEvent | null;
  try {
    const penalang = await ambilPenalang();
    if (!penalang) redirect('/login');
    rincian = await muatRincianEvent(await buatKlienServer(), penalang, id, hariIni());
  } catch (e) {
    unstable_rethrow(e);
    console.error('rincian event: gagal memuat', e instanceof GalatMuat ? e.kode : 'tidak_dikenal');
    return (
      <p role="alert" className="text-tl-isi font-semibold text-tl-galat">
        Rincian event gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  if (!rincian) notFound();
  return <Isi e={rincian} />;
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-2">
      <div className="mb-2 h-8 w-2/3 rounded-tl-tombol bg-tl-garis" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-tl-kartu border border-tl-garis bg-tl-permukaan" />
      ))}
    </div>
  );
}

export default function HalamanEvent({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-1 flex-col bg-tl-latar font-jakarta text-tl-teks">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-3 pb-10">
        <Link href="/" className="inline-flex min-h-11 items-center text-tl-label font-bold text-tl-aksi">
          ‹ Dasbor
        </Link>
        <Suspense fallback={<Kerangka />}>
          <Muat params={params} />
        </Suspense>
      </main>
    </div>
  );
}
