'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { konfirmasiKlaim, tolakKlaim } from '@/actions/klaim';
import type { Hasil } from '@/lib/contracts';
import { teksKlaim, type KlaimTampil } from '@/lib/klaim-penalang';
import { rupiah } from '@/lib/uang';
import { usePesanAksi } from '../pesan-aksi';

const PANJANG_ALASAN_MAKS = 200;

function KartuKlaim({ k }: { k: KlaimTampil }) {
  const router = useRouter();
  const { tampilkan } = usePesanAksi();
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [galatAlasan, setGalatAlasan] = useState<string | null>(null);
  const [sibuk, mulai] = useTransition();
  const idPanel = useId();
  const idGalatAlasan = useId();

  function putuskan(jalankan: () => Promise<Hasil<{ claimId: string }>>, pesanSukses: string) {
    setGalat(null);
    setGalatAlasan(null);
    mulai(async () => {
      const hasil = await jalankan();
      if (hasil.ok) {
        tampilkan({ teks: pesanSukses, galat: false });
        router.refresh();
        return;
      }
      if (hasil.medan?.alasan) {
        setGalatAlasan(hasil.medan.alasan);
      } else if (hasil.kode === 'konflik' || hasil.kode === 'tidak_ditemukan') {
        // Kartu ini akan hilang setelah muat ulang, jadi pesannya dipindah ke atas halaman.
        tampilkan({ teks: hasil.pesan, galat: true });
        router.refresh();
      } else {
        setGalat(hasil.pesan);
      }
    });
  }

  const ringkas = `Klaim ${k.anggota} ${rupiah(k.nominal)}`;
  const alasanBersih = alasan.trim();

  return (
    <li className="rounded-tl-kartu border border-tl-garis bg-tl-permukaan p-4">
      <p className="text-tl-isi font-semibold">{teksKlaim(k)}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={sibuk}
          onClick={() => putuskan(() => konfirmasiKlaim({ claimId: k.id }), `${ringkas} dikonfirmasi.`)}
          className="min-h-12 flex-1 rounded-tl-tombol bg-tl-aksi text-[16px] font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-sekunder"
        >
          Konfirmasi
        </button>
        <button
          type="button"
          disabled={sibuk}
          aria-expanded={tolak}
          aria-controls={idPanel}
          onClick={() => setTolak((v) => !v)}
          className="min-h-12 flex-1 rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan text-[16px] font-bold text-tl-teks-sekunder disabled:bg-tl-nonaktif"
        >
          Tolak
        </button>
      </div>
      {tolak && (
        <div id={idPanel} className="mt-3 flex flex-col gap-2">
          <label htmlFor={`${idPanel}-alasan`} className="text-tl-label font-semibold text-tl-teks-redup">
            Alasan penolakan
          </label>
          <textarea
            id={`${idPanel}-alasan`}
            value={alasan}
            maxLength={PANJANG_ALASAN_MAKS}
            rows={2}
            disabled={sibuk}
            aria-invalid={galatAlasan !== null}
            aria-describedby={galatAlasan ? idGalatAlasan : undefined}
            onChange={(e) => setAlasan(e.target.value)}
            className="rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-3 py-2 text-tl-isi"
          />
          {galatAlasan && (
            <p id={idGalatAlasan} className="text-tl-label font-semibold text-tl-galat">
              {galatAlasan}
            </p>
          )}
          <button
            type="button"
            disabled={sibuk || alasanBersih === ''}
            onClick={() => putuskan(() => tolakKlaim({ claimId: k.id, alasan: alasanBersih }), `${ringkas} ditolak.`)}
            className="min-h-12 rounded-tl-tombol bg-tl-galat text-[16px] font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-sekunder"
          >
            Kirim penolakan
          </button>
        </div>
      )}
      {galat && (
        <p role="alert" className="mt-2 text-tl-label font-semibold text-tl-galat">
          {galat}
        </p>
      )}
    </li>
  );
}

export function DaftarKlaim({ klaim }: { klaim: KlaimTampil[] }) {
  if (klaim.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {klaim.map((k) => (
        <KartuKlaim key={k.id} k={k} />
      ))}
    </ul>
  );
}
