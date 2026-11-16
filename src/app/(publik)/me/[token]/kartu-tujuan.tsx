'use client';

import { useRef, useState } from 'react';
import type { TujuanTransfer } from '@/lib/contracts';

export function KartuTujuan({ tujuan }: { tujuan: TujuanTransfer }) {
  const [tersalin, setTersalin] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  async function salin() {
    if (!tujuan.noRekening) return;
    try {
      await navigator.clipboard.writeText(tujuan.noRekening);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      // Papan klip bisa ditolak peramban; nomor tetap terlihat untuk disalin manual.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-tl-kartu border border-tl-garis bg-tl-permukaan p-4">
      <p className="text-tl-isi">
        <span className="text-tl-nama font-bold">{tujuan.nama}</span>
        {tujuan.bank && <span className="font-semibold text-tl-teks-redup"> · {tujuan.bank}</span>}
      </p>
      {tujuan.noRekening ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-all text-[20px] font-extrabold tabular-nums">{tujuan.noRekening}</span>
          <button
            type="button"
            onClick={salin}
            className="min-h-11 shrink-0 rounded-tl-tombol border-[1.5px] border-tl-aksi bg-tl-permukaan px-3 text-tl-label font-bold text-tl-aksi"
          >
            <span aria-live="polite">{tersalin ? 'Tersalin' : 'Salin'}</span>
          </button>
        </div>
      ) : (
        <p className="text-tl-isi text-tl-teks-sekunder">Nomor rekening belum diisi penalang.</p>
      )}
      {tujuan.qrisUrl && (
        <>
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            className="flex min-h-11 items-center gap-3 self-start rounded-tl-tombol text-tl-isi font-bold text-tl-aksi underline underline-offset-4"
          >
            {/* Gambar QRIS ada di penyimpanan eksternal dengan host yang tidak tetap; next/image butuh host terdaftar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tujuan.qrisUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-tl-tombol border border-tl-garis object-contain" />
            Perbesar QRIS
          </button>
          <dialog
            ref={dialog}
            aria-label={`QRIS ${tujuan.nama}`}
            onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
            className="m-auto w-[min(92vw,28rem)] rounded-tl-kartu bg-tl-permukaan p-4 backdrop:bg-black/70"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tujuan.qrisUrl} alt={`QRIS ${tujuan.nama}`} className="h-auto w-full" />
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="mt-3 min-h-12 w-full rounded-tl-tombol border-[1.5px] border-tl-aksi bg-tl-permukaan text-[16px] font-bold text-tl-aksi"
            >
              Tutup
            </button>
          </dialog>
        </>
      )}
    </div>
  );
}
