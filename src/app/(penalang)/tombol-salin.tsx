'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { buatTeksTagihan } from '@/actions/tagihan';

/** Galat dari aksi, dibedakan dari galat papan klip supaya pesannya yang tampil. */
class GalatAksi extends Error {}

/**
 * Menyalin teks tagihan dengan satu ketukan. Teks diminta ke server di dalam gestur ketukan:
 * Safari menolak penulisan papan klip bila baru dimulai setelah menunggu jaringan, jadi
 * ClipboardItem menerima janji teksnya. Bila peramban tetap menolak, teks tampil di kotak
 * yang bisa dipilih.
 */
export function TombolSalin({ memberId, label, kelas }: { memberId?: string; label: string; kelas?: string }) {
  const [sibuk, setSibuk] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [cadangan, setCadangan] = useState<string | null>(null);
  const penghitung = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idKotak = useId();

  useEffect(() => () => { if (penghitung.current) clearTimeout(penghitung.current); }, []);

  async function tulis(janji: Promise<string>) {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': janji.then((t) => new Blob([t], { type: 'text/plain' })) })]);
    } else {
      await navigator.clipboard.writeText(await janji);
    }
  }

  async function salin() {
    setSibuk(true);
    setGalat(null);
    setCadangan(null);
    setTersalin(false);
    const janji = buatTeksTagihan({ memberId }).then((h) => {
      if (!h.ok) throw new GalatAksi(h.pesan);
      return h.data.teks;
    });
    // Janji ditolak di dua tempat (tulis dan cabang di bawah); cegah laporan penolakan tak tertangani.
    janji.catch(() => {});
    try {
      await tulis(janji);
      setTersalin(true);
      penghitung.current = setTimeout(() => setTersalin(false), 2_000);
    } catch {
      try {
        setCadangan(await janji);
      } catch (galatJanji) {
        setGalat(galatJanji instanceof GalatAksi ? galatJanji.message : 'Terjadi kesalahan. Coba lagi sebentar lagi.');
      }
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={sibuk}
        onClick={salin}
        className={
          kelas ??
          'min-h-12 rounded-tl-tombol border-[1.5px] border-tl-aksi bg-tl-permukaan px-4 text-[16px] font-bold text-tl-aksi disabled:border-tl-garis-medan disabled:text-tl-teks-sekunder'
        }
      >
        {tersalin ? 'Tersalin' : label}
      </button>
      <span role="status" className="sr-only">
        {tersalin ? 'Teks tagihan tersalin' : ''}
      </span>
      {galat && (
        <p role="alert" className="text-tl-label font-semibold text-tl-galat">
          {galat}
        </p>
      )}
      {cadangan !== null && (
        <div className="flex flex-col gap-1">
          <label htmlFor={idKotak} className="text-tl-label font-semibold text-tl-teks-redup">
            Salin teks ini secara manual
          </label>
          <textarea
            id={idKotak}
            readOnly
            value={cadangan}
            rows={Math.min(8, cadangan.split('\n').length + 1)}
            onFocus={(e) => e.currentTarget.select()}
            className="rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-3 py-2 text-tl-isi"
          />
        </div>
      )}
    </div>
  );
}
