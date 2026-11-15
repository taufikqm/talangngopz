'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type Pesan = { teks: string; galat: boolean };
type Nilai = { pesan: Pesan | null; tampilkan: (p: Pesan | null) => void };

const Konteks = createContext<Nilai | null>(null);

/**
 * Pesan hasil aksi hidup di satu tempat di atas halaman, bukan di kartu: setelah router.refresh()
 * kartu yang baru diputuskan hilang dari daftar, dan pesannya ikut hilang bila disimpan di sana.
 */
export function PenyediaPesan({ children }: { children: ReactNode }) {
  const [pesan, tampilkan] = useState<Pesan | null>(null);
  return <Konteks value={{ pesan, tampilkan }}>{children}</Konteks>;
}

export function usePesanAksi(): Nilai {
  const nilai = useContext(Konteks);
  if (!nilai) throw new Error('usePesanAksi dipakai di luar PenyediaPesan');
  return nilai;
}

export function TampilPesan() {
  const { pesan } = usePesanAksi();
  // Wadah selalu ada: pembaca layar hanya mengumumkan isi yang berubah di wilayah yang sudah ada.
  return (
    <div role={pesan?.galat ? 'alert' : 'status'}>
      {pesan && (
        <p
          className={`rounded-tl-kartu border px-4 py-3 text-tl-isi font-bold ${
            pesan.galat ? 'border-tl-galat text-tl-galat' : 'border-tl-garis bg-tl-permukaan text-tl-teks'
          }`}
        >
          {pesan.teks}
        </p>
      )}
    </div>
  );
}
