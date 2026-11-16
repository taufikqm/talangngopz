'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Hasil, KlaimKeluaran, KlaimMasukan, RekapPribadi } from '@/lib/contracts';
import { ZONA_WAKTU } from '@/lib/event';
import { bolehDicentang, penalangTerpilih } from '@/lib/pilihan-bayar';
import { rupiah } from '@/lib/uang';
import { waktuTransferDariJam } from '@/lib/waktu-transfer';
import { KELAS_STATUS, LABEL_STATUS, tampilJam, tampilTanggal, tampilTanggalWaktu } from '../../tampilan';

const PESAN_LURING = 'Kamu sedang luring. Klaim belum terkirim, coba lagi saat tersambung.';
const KELAS_GALAT = 'text-tl-label font-semibold text-tl-galat';
const KELAS_LABEL = 'text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup';
const KELAS_TOMBOL_UTAMA =
  'min-h-13 rounded-tl-tombol bg-tl-aksi text-[16px] font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-redup';

type Baris = RekapPribadi['perEvent'][number];

// Gaya Beranda (docs/gaya-visual.md): semua warna dan ukuran dari token tl-* di globals.css.
const KELAS_MEDAN = 'min-h-12 w-full rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-3 text-[16px] text-tl-teks';

/** Jam sekarang di zona sirkel, "HH:MM". Dihitung saat formulir dibuka, bukan saat render. */
function jamSekarang(): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_WAKTU }).format(
    new Date(),
  );
}

export function DaftarBayar({
  perEvent,
  namaPenalang,
  namaPanggilan,
}: {
  perEvent: Baris[];
  namaPenalang: Record<string, string>;
  namaPanggilan: string;
}) {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const [terpilih, setTerpilih] = useState<Set<string>>(() => new Set());
  const [isian, setIsian] = useState<{ jam: string; pengirim: string } | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const dipilih = perEvent.filter((p) => terpilih.has(p.shareId));
  const penalangDipilih = penalangTerpilih(perEvent, terpilih);
  const jumlah = dipilih.reduce((a, p) => a + p.total, 0);
  const adaBedaPenalang =
    penalangDipilih !== null && perEvent.some((p) => p.status === 'belum_bayar' && p.penalangId !== penalangDipilih);

  function ubah(id: string) {
    const baru = new Set(terpilih);
    if (baru.has(id)) baru.delete(id);
    else baru.add(id);
    setTerpilih(baru);
    setGalat(null);
    if (baru.size === 0) setIsian(null);
  }

  async function kirim() {
    if (!isian || mengirim) return;
    const waktuTransfer = waktuTransferDariJam(isian.jam);
    if (!waktuTransfer) return setGalat('Jam transfer tidak sah.');
    if (typeof navigator !== 'undefined' && !navigator.onLine) return setGalat(PESAN_LURING);
    setMengirim(true);
    setGalat(null);
    const masukan: KlaimMasukan = { token, shareIds: [...terpilih], waktuTransfer, pengirim: isian.pengirim.trim() };
    try {
      const respons = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(masukan),
      });
      const hasil = (await respons.json()) as Hasil<KlaimKeluaran>;
      if (hasil.ok || hasil.kode === 'konflik') {
        // Berhasil: lencana "Menunggu konfirmasi" datang dari data segar. Konflik: tampilkan status terbaru.
        if (!hasil.ok) setGalat(hasil.pesan);
        setTerpilih(new Set());
        setIsian(null);
        router.refresh();
        return;
      }
      setGalat(hasil.pesan);
    } catch {
      setGalat(navigator.onLine ? 'Klaim gagal dikirim. Coba lagi sebentar lagi.' : PESAN_LURING);
    } finally {
      setMengirim(false);
    }
  }

  if (perEvent.length === 0) {
    return <p className="mt-6 text-tl-isi text-tl-teks-sekunder">Belum ada tagihan untukmu.</p>;
  }

  return (
    <section aria-labelledby="judul-event" className="mt-6 flex flex-1 flex-col">
      <h2 id="judul-event" className={KELAS_LABEL}>Tagihan per event</h2>
      {adaBedaPenalang && (
        <p className="mt-2 text-tl-isi text-tl-teks-sekunder">
          Satu transfer hanya untuk satu penalang. Event milik {namaPenalang[penalangDipilih ?? ''] ?? 'penalang lain'} saja yang bisa digabung.
        </p>
      )}
      <ul className="mt-2 flex flex-col divide-y divide-tl-garis-halus rounded-tl-kartu border border-tl-garis bg-tl-permukaan">
        {perEvent.map((p) => {
          const bisaDicentang = p.status === 'belum_bayar';
          const terkunci = bisaDicentang && !terpilih.has(p.shareId) && !bolehDicentang(p, penalangDipilih);
          const idCentang = `centang-${p.shareId}`;
          return (
            <li key={p.shareId} className="flex min-h-16 items-start gap-3 px-4 py-3">
              {bisaDicentang ? (
                <input
                  id={idCentang}
                  type="checkbox"
                  checked={terpilih.has(p.shareId)}
                  disabled={terkunci}
                  onChange={() => ubah(p.shareId)}
                  className="mt-1 h-6 w-6 shrink-0 accent-tl-aksi disabled:opacity-40"
                />
              ) : (
                <span aria-hidden className="h-6 w-6 shrink-0" />
              )}
              <label htmlFor={bisaDicentang ? idCentang : undefined} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-tl-nama font-bold">{p.judul}</span>
                  <span className="shrink-0 text-tl-nominal font-bold tabular-nums">{rupiah(p.total)}</span>
                </span>
                <span className="text-tl-label text-tl-teks-redup">
                  {tampilTanggal(p.tanggal)} · {namaPenalang[p.penalangId] ?? 'Penalang'}
                </span>
                {p.status === 'menunggu_konfirmasi' && p.menungguSejak ? (
                  <span className={`self-start rounded-full px-2 py-0.5 text-tl-lencana font-bold ${KELAS_STATUS.menunggu_konfirmasi}`}>
                    Menunggu konfirmasi {namaPenalang[p.penalangId] ?? 'penalang'} · {tampilJam(p.menungguSejak)}
                  </span>
                ) : p.status === 'lunas' ? (
                  <span className={`self-start rounded-full px-2 py-0.5 text-tl-lencana font-bold ${KELAS_STATUS.lunas}`}>
                    Lunas{p.lunasPada ? ` · ${tampilTanggalWaktu(p.lunasPada)}` : ''}
                  </span>
                ) : (
                  <span className={`self-start rounded-full px-2 py-0.5 text-tl-lencana font-bold ${KELAS_STATUS[p.status]}`}>
                    {LABEL_STATUS[p.status]}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {/* Di luar bilah bawah: pesan konflik tetap terlihat setelah pilihan dikosongkan. */}
      {galat && dipilih.length === 0 && (
        <p role="alert" className={`mt-3 ${KELAS_GALAT}`}>
          {galat}
        </p>
      )}

      {dipilih.length > 0 && (
        <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-3 border-t border-tl-garis bg-tl-latar px-5 pt-3 pb-4">
          {isian ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void kirim();
              }}
              className="flex flex-col gap-3"
            >
              <p className="text-tl-nama font-bold tabular-nums">
                Bayar {rupiah(jumlah)} ({dipilih.length} event)
              </p>
              <div className="flex flex-col gap-1">
                <label htmlFor="jam-transfer" className={KELAS_LABEL}>Jam transfer</label>
                <input
                  id="jam-transfer"
                  type="time"
                  required
                  value={isian.jam}
                  onChange={(e) => setIsian({ ...isian, jam: e.target.value })}
                  className={KELAS_MEDAN}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="pengirim" className={KELAS_LABEL}>Nama pengirim atau bank</label>
                <input
                  id="pengirim"
                  required
                  maxLength={100}
                  value={isian.pengirim}
                  onChange={(e) => setIsian({ ...isian, pengirim: e.target.value })}
                  className={KELAS_MEDAN}
                />
              </div>
              {galat && (
                <p role="alert" className={KELAS_GALAT}>
                  {galat}
                </p>
              )}
              <button
                type="submit"
                disabled={mengirim}
                className={KELAS_TOMBOL_UTAMA}
              >
                {mengirim ? 'Mengirim…' : 'Saya sudah transfer'}
              </button>
              <button
                type="button"
                disabled={mengirim}
                onClick={() => {
                  setIsian(null);
                  setGalat(null);
                }}
                className="min-h-11 text-tl-isi font-bold text-tl-aksi underline underline-offset-4"
              >
                Batal
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsian({ jam: jamSekarang(), pengirim: namaPanggilan })}
              className={`${KELAS_TOMBOL_UTAMA} tabular-nums`}
            >
              Bayar {rupiah(jumlah)} ({dipilih.length} event)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
