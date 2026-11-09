'use client';

import { useState } from 'react';
import type { RekapPribadi } from '@/lib/contracts';
import { ZONA_WAKTU } from '@/lib/event';
import { rupiah } from '@/lib/uang';
import { KELAS_STATUS, LABEL_STATUS, tampilJam, tampilTanggal, tampilTanggalWaktu } from '../../tampilan';

type Baris = RekapPribadi['perEvent'][number];

const KELAS_MEDAN =
  'min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-base dark:border-zinc-600 dark:bg-zinc-900';

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
  const [terpilih, setTerpilih] = useState<Set<string>>(() => new Set());
  const [isian, setIsian] = useState<{ jam: string; pengirim: string } | null>(null);

  const dipilih = perEvent.filter((p) => terpilih.has(p.shareId));
  // Satu transfer menuju satu rekening: centang dikunci ke penalang event pertama yang dipilih.
  const penalangDipilih = dipilih[0]?.penalangId ?? null;
  const jumlah = dipilih.reduce((a, p) => a + p.total, 0);
  const adaBedaPenalang =
    penalangDipilih !== null && perEvent.some((p) => p.status === 'belum_bayar' && p.penalangId !== penalangDipilih);

  function ubah(id: string) {
    const baru = new Set(terpilih);
    if (baru.has(id)) baru.delete(id);
    else baru.add(id);
    setTerpilih(baru);
    if (baru.size === 0) setIsian(null);
  }

  if (perEvent.length === 0) {
    return <p className="mt-6 text-sm text-zinc-700 dark:text-zinc-300">Belum ada tagihan untukmu.</p>;
  }

  return (
    <section aria-labelledby="judul-event" className="mt-6 flex flex-1 flex-col">
      <h2 id="judul-event" className="text-sm font-medium">Tagihan per event</h2>
      {adaBedaPenalang && (
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          Satu transfer hanya untuk satu penalang. Event milik {namaPenalang[penalangDipilih ?? ''] ?? 'penalang lain'} saja yang bisa digabung.
        </p>
      )}
      <ul className="mt-2 flex flex-col divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {perEvent.map((p) => {
          const bisaDicentang = p.status === 'belum_bayar';
          const terkunci = bisaDicentang && penalangDipilih !== null && p.penalangId !== penalangDipilih;
          const idCentang = `centang-${p.shareId}`;
          return (
            <li key={p.shareId} className="flex min-h-16 items-start gap-3 py-3">
              {bisaDicentang ? (
                <input
                  id={idCentang}
                  type="checkbox"
                  checked={terpilih.has(p.shareId)}
                  disabled={terkunci}
                  onChange={() => ubah(p.shareId)}
                  className="mt-1 h-6 w-6 shrink-0 accent-zinc-900 disabled:opacity-40 dark:accent-zinc-100"
                />
              ) : (
                <span aria-hidden className="h-6 w-6 shrink-0" />
              )}
              <label htmlFor={bisaDicentang ? idCentang : undefined} className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{p.judul}</span>
                  <span className="shrink-0 tabular-nums">{rupiah(p.total)}</span>
                </span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {tampilTanggal(p.tanggal)} · {namaPenalang[p.penalangId] ?? 'Penalang'}
                </span>
                {p.status === 'menunggu_konfirmasi' && p.menungguSejak ? (
                  <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${KELAS_STATUS.menunggu_konfirmasi}`}>
                    Menunggu konfirmasi {namaPenalang[p.penalangId] ?? 'penalang'} · {tampilJam(p.menungguSejak)}
                  </span>
                ) : p.status === 'lunas' ? (
                  <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${KELAS_STATUS.lunas}`}>
                    Lunas{p.lunasPada ? ` · ${tampilTanggalWaktu(p.lunasPada)}` : ''}
                  </span>
                ) : (
                  <span className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${KELAS_STATUS[p.status]}`}>
                    {LABEL_STATUS[p.status]}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {dipilih.length > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-3 border-t border-zinc-200 bg-white px-4 pt-3 pb-4 dark:border-zinc-800 dark:bg-black">
          {isian ? (
            <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-3">
              <p className="font-medium tabular-nums">
                Bayar {rupiah(jumlah)} ({dipilih.length} event)
              </p>
              <div className="flex flex-col gap-1">
                <label htmlFor="jam-transfer" className="text-sm font-medium">Jam transfer</label>
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
                <label htmlFor="pengirim" className="text-sm font-medium">Nama pengirim atau bank</label>
                <input
                  id="pengirim"
                  required
                  maxLength={100}
                  value={isian.pengirim}
                  onChange={(e) => setIsian({ ...isian, pengirim: e.target.value })}
                  className={KELAS_MEDAN}
                />
              </div>
              <button
                type="submit"
                disabled
                aria-describedby="keterangan-kirim"
                className="min-h-11 rounded-lg bg-zinc-900 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Saya sudah transfer
              </button>
              <p id="keterangan-kirim" className="text-center text-sm text-zinc-700 dark:text-zinc-300">
                Pengiriman klaim segera tersedia
              </p>
              <button type="button" onClick={() => setIsian(null)} className="min-h-11 text-sm font-medium underline underline-offset-4">
                Batal
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setIsian({ jam: jamSekarang(), pengirim: namaPanggilan })}
              className="min-h-11 rounded-lg bg-zinc-900 font-medium text-white tabular-nums dark:bg-zinc-100 dark:text-zinc-900"
            >
              Bayar {rupiah(jumlah)} ({dipilih.length} event)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
