'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { tandaiLunasManual } from '@/actions/klaim';
import { rupiah, type Rupiah } from '@/lib/uang';
import { usePesanAksi } from '../../pesan-aksi';

type Props = { shareId: string; nama: string; total: Rupiah; eventTerkunci: boolean };

/** Menu kelebihan baris belum_bayar. Dua langkah: pelunasan tunai tidak bisa dibatalkan. */
export function MenuTunai({ shareId, nama, total, eventTerkunci }: Props) {
  const router = useRouter();
  const { tampilkan } = usePesanAksi();
  const [terbuka, setTerbuka] = useState(false);
  const [yakin, setYakin] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();
  const idPanel = useId();

  function tutup() {
    setTerbuka(false);
    setYakin(false);
    setGalat(null);
  }

  function lunasi() {
    setGalat(null);
    mulai(async () => {
      const hasil = await tandaiLunasManual({ shareId });
      if (hasil.ok) {
        tampilkan({ teks: `${nama} ${rupiah(total)} ditandai lunas (tunai).`, galat: false });
        router.refresh();
        return;
      }
      if (hasil.kode === 'konflik' || hasil.kode === 'tidak_ditemukan') {
        // Baris ini akan berubah setelah muat ulang, jadi pesannya dipindah ke atas halaman.
        tampilkan({ teks: hasil.pesan, galat: true });
        router.refresh();
      } else {
        setGalat(hasil.pesan);
      }
    });
  }

  return (
    <div className="relative flex flex-col items-end">
      <button
        type="button"
        aria-label={`Aksi untuk ${nama}`}
        aria-expanded={terbuka}
        aria-controls={idPanel}
        onClick={() => (terbuka ? tutup() : setTerbuka(true))}
        className="flex size-11 items-center justify-center rounded-tl-tombol text-[20px] font-bold text-tl-teks-sekunder"
      >
        <span aria-hidden>⋯</span>
      </button>
      {terbuka && (
        <div
          id={idPanel}
          className="absolute top-full right-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-tl-kartu border border-tl-garis bg-tl-permukaan p-3 shadow-md"
        >
          {!yakin ? (
            <button
              type="button"
              onClick={() => setYakin(true)}
              className="min-h-11 rounded-tl-tombol border-[1.5px] border-tl-garis-medan px-3 text-left text-tl-isi font-bold text-tl-teks"
            >
              Tandai lunas (tunai)
            </button>
          ) : (
            <>
              <p className="text-tl-isi font-semibold">
                Tandai {nama} {rupiah(total)} lunas tunai?
                {!eventTerkunci && ' Event akan terkunci.'} Tidak bisa dibatalkan.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={lunasi}
                  className="min-h-11 flex-1 rounded-tl-tombol bg-tl-aksi text-tl-isi font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-sekunder"
                >
                  Ya, tandai lunas
                </button>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={tutup}
                  className="min-h-11 flex-1 rounded-tl-tombol border-[1.5px] border-tl-garis-medan text-tl-isi font-bold text-tl-teks-sekunder disabled:bg-tl-nonaktif"
                >
                  Batal
                </button>
              </div>
            </>
          )}
          {galat && (
            <p role="alert" className="text-tl-label font-semibold text-tl-galat">
              {galat}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
