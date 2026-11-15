import { Suspense } from 'react';
import Link from 'next/link';
import { redirect, unstable_rethrow } from 'next/navigation';
import { LencanaStatus } from '@/components/lencana-status';
import { GalatDasbor, labelUmur, muatDasbor, type BarisPiutang, type Dasbor } from '@/lib/dasbor';
import { hariIni } from '@/lib/event';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';
import { porsiBelumBayar } from '@/lib/tagihan';
import { tampilTanggal } from '@/lib/tanggal';
import { rupiah } from '@/lib/uang';
import { TombolSalin } from './tombol-salin';

function KartuAnggota({ a }: { a: BarisPiutang }) {
  const umur = labelUmur(a.umurHari);
  return (
    <li>
      <details className="group rounded-tl-kartu border border-tl-garis bg-tl-permukaan">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-tl-nama font-bold">{a.nama}</span>
            <span className="text-tl-label text-tl-teks-redup">
              {a.jumlahEvent} event
              {!umur.lama && ` · ${umur.teks}`}
              {a.menunggu > 0 && ` · ${rupiah(a.menunggu)} menunggu konfirmasi`}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-tl-nominal font-extrabold tabular-nums">{rupiah(a.total)}</span>
            {umur.lama && <span className="text-tl-label font-bold text-tl-lama">{umur.teks}</span>}
          </span>
          <span aria-hidden className="text-tl-teks-redup transition-transform group-open:rotate-90">›</span>
        </summary>
        <ul className="divide-y divide-tl-garis-halus border-t border-tl-garis-halus bg-tl-permukaan-redup px-4 rounded-b-tl-kartu">
          {a.rincian.map((r) => {
            const isi = (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-tl-isi font-semibold">{r.judul}</span>
                  <span className="text-tl-label text-tl-teks-redup">{tampilTanggal(r.tanggal)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-tl-isi font-bold tabular-nums">{rupiah(r.total)}</span>
                  <LencanaStatus status={r.status} />
                </span>
              </>
            );
            return (
              <li key={r.shareId}>
                {r.eventId ? (
                  <Link href={`/event/${r.eventId}`} className="flex min-h-11 items-center gap-3 py-3">
                    {isi}
                    <span aria-hidden className="text-tl-teks-redup">›</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{isi}</div>
                )}
              </li>
            );
          })}
        </ul>
        {porsiBelumBayar(a.rincian).length > 0 && (
          <div className="rounded-b-tl-kartu border-t border-tl-garis-halus bg-tl-permukaan-redup px-4 py-3">
            <TombolSalin memberId={a.memberId} label="Salin tagihan" />
          </div>
        )}
      </details>
    </li>
  );
}

function IsiDasbor({ d }: { d: Dasbor }) {
  return (
    <>
      {d.klaimMenunggu > 0 && (
        <Link
          href="/klaim"
          className="flex min-h-12 items-center justify-between gap-3 rounded-tl-kartu bg-tl-perhatian px-4 py-3 text-tl-isi font-bold text-tl-perhatian-teks"
        >
          <span>{d.klaimMenunggu} klaim menunggu konfirmasi kamu</span>
          <span className="shrink-0">Lihat ›</span>
        </Link>
      )}
      {d.keadaan === 'kosong' && (
        <p className="text-tl-isi text-tl-teks-sekunder">
          Belum ada talangan. Tekan tombol di bawah setelah kamu bayarin temen.
        </p>
      )}
      {d.keadaan === 'lunas' && <p className="text-tl-nama font-bold">Semua sudah bayar.</p>}
      {d.keadaan === 'piutang' && (
        <>
          <section aria-labelledby="judul-total">
            <h1 id="judul-total" className="text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup">
              Total piutang
            </h1>
            <p className="text-tl-angka font-extrabold tabular-nums">{rupiah(d.totalPiutang)}</p>
            {d.anggota.some((a) => porsiBelumBayar(a.rincian).length > 0) && (
              <div className="mt-2">
                <TombolSalin label="Salin semua tagihan" />
              </div>
            )}
          </section>
          <section aria-labelledby="judul-anggota" className="flex flex-col gap-2">
            <h2 id="judul-anggota" className="text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup">
              Yang masih utang
            </h2>
            <ul className="flex flex-col gap-2">
              {d.anggota.map((a) => (
                <KartuAnggota key={a.memberId} a={a} />
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

async function Isi() {
  let dasbor: Dasbor;
  try {
    const db = await buatKlienServer();
    // uid dari klaim JWT (diverifikasi lokal) supaya data dimuat bersamaan dengan pemeriksaan
    // profil, bukan sesudahnya. RLS tetap membatasi baris ke auth.uid(); hasilnya dibuang
    // bila pemeriksaan profil gagal.
    const { data: klaim } = await db.auth.getClaims();
    const uid = klaim?.claims.sub;
    if (!uid) redirect('/login');
    const [penalang, hasil] = await Promise.all([ambilPenalang(), muatDasbor(db, uid, hariIni())]);
    if (!penalang || penalang.id !== uid) redirect('/login');
    dasbor = hasil;
  } catch (e) {
    unstable_rethrow(e);
    console.error('dasbor: gagal memuat', e instanceof GalatDasbor ? e.kode : 'tidak_dikenal');
    return (
      <p role="alert" className="text-tl-isi font-semibold text-tl-galat">
        Dasbor gagal dimuat. Muat ulang halaman sebentar lagi.
      </p>
    );
  }
  return <IsiDasbor d={dasbor} />;
}

function Kerangka() {
  return (
    <div aria-busy="true" aria-label="Memuat" className="flex flex-col gap-2">
      <div className="mb-2 h-12 w-2/3 rounded-tl-tombol bg-tl-garis" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-tl-kartu border border-tl-garis bg-tl-permukaan" />
      ))}
    </div>
  );
}

export default function HalamanDasbor() {
  return (
    <div className="flex flex-1 flex-col bg-tl-latar font-jakarta text-tl-teks">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-5 pt-5 pb-28">
        <Suspense fallback={<Kerangka />}>
          <Isi />
        </Suspense>
      </main>
      <div className="sticky bottom-0 border-t border-tl-garis bg-tl-latar px-5 py-3">
        <Link
          href="/event/baru"
          className="mx-auto flex min-h-13 w-full max-w-md items-center justify-center rounded-tl-tombol bg-tl-aksi text-[16px] font-bold text-white"
        >
          + Talangan baru
        </Link>
      </div>
    </div>
  );
}
