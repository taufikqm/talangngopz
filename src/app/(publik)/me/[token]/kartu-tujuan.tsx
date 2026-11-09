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
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-sm">
        <span className="font-medium">{tujuan.nama}</span>
        {tujuan.bank && <span className="text-zinc-700 dark:text-zinc-300"> · {tujuan.bank}</span>}
      </p>
      {tujuan.noRekening ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 break-all text-lg font-semibold tabular-nums">{tujuan.noRekening}</span>
          <button
            type="button"
            onClick={salin}
            className="min-h-11 shrink-0 rounded-lg border border-zinc-400 px-3 text-sm font-medium dark:border-zinc-600"
          >
            <span aria-live="polite">{tersalin ? 'Tersalin' : 'Salin'}</span>
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Nomor rekening belum diisi penalang.</p>
      )}
      {tujuan.qrisUrl && (
        <>
          <button
            type="button"
            onClick={() => dialog.current?.showModal()}
            className="flex min-h-11 items-center gap-3 self-start rounded-lg text-sm font-medium underline underline-offset-4"
          >
            {/* Gambar QRIS ada di penyimpanan eksternal dengan host yang tidak tetap; next/image butuh host terdaftar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tujuan.qrisUrl} alt="" width={64} height={64} className="h-16 w-16 rounded border border-zinc-200 object-contain dark:border-zinc-800" />
            Perbesar QRIS
          </button>
          <dialog
            ref={dialog}
            aria-label={`QRIS ${tujuan.nama}`}
            onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
            className="m-auto w-[min(92vw,28rem)] rounded-lg bg-white p-4 backdrop:bg-black/70 dark:bg-zinc-900"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tujuan.qrisUrl} alt={`QRIS ${tujuan.nama}`} className="h-auto w-full" />
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="mt-3 min-h-11 w-full rounded-lg border border-zinc-400 font-medium dark:border-zinc-600"
            >
              Tutup
            </button>
          </dialog>
        </>
      )}
    </div>
  );
}
