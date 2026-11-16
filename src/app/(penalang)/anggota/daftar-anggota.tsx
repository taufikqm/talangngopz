'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AnggotaDaftar } from '@/lib/contracts';
import { cabutToken, hapusAnggota, simpanAnggota } from '@/actions/anggota';

const KONFIRMASI_CABUT = 'Tautan lama akan langsung mati dan kamu harus kirim yang baru. Lanjut?';

// Gaya Beranda (docs/gaya-visual.md): semua warna dan ukuran dari token tl-* di globals.css.
const KELAS_MEDAN = 'min-h-12 w-full rounded-tl-tombol border-[1.5px] border-tl-garis-medan bg-tl-permukaan px-3 text-[16px] text-tl-teks';
const KELAS_LABEL = 'text-tl-label font-bold uppercase tracking-[0.4px] text-tl-teks-redup';
const KELAS_GALAT = 'text-tl-label font-semibold text-tl-galat';
const KELAS_ITEM_MENU =
  'flex min-h-11 w-full items-center px-3 text-left text-tl-isi font-semibold hover:bg-tl-permukaan-redup disabled:text-tl-teks-redup';
const KELAS_TOMBOL_UTAMA =
  'min-h-12 flex-1 rounded-tl-tombol bg-tl-aksi px-4 text-[16px] font-bold text-white disabled:bg-tl-nonaktif disabled:text-tl-teks-redup';
const KELAS_TOMBOL_SEKUNDER =
  'min-h-12 flex-1 rounded-tl-tombol border-[1.5px] border-tl-aksi bg-tl-permukaan px-4 text-[16px] font-bold text-tl-aksi';

async function salinKePapanKlip(teks: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    return false;
  }
}

export function DaftarAnggota({ anggota }: { anggota: AnggotaDaftar[] }) {
  const router = useRouter();
  const [sedangProses, mulai] = useTransition();
  const [pesan, setPesan] = useState<{ jenis: 'galat' | 'info'; teks: string } | null>(null);
  const [tersalin, setTersalin] = useState<string | null>(null);

  const [suntingId, setSuntingId] = useState<string | null>(null);
  const [nama, setNama] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [galatMedan, setGalatMedan] = useState<Record<string, string>>({});
  const medanNama = useRef<HTMLInputElement>(null);

  function tutupMenu(el: HTMLElement) {
    el.closest('details')?.removeAttribute('open');
  }

  async function salin(a: AnggotaDaftar) {
    if (await salinKePapanKlip(a.tautan)) {
      setTersalin(a.id);
      setTimeout(() => setTersalin((id) => (id === a.id ? null : id)), 2000);
    } else {
      // Papan klip bisa ditolak peramban (mis. bukan https); tampilkan tautan untuk disalin tangan.
      window.prompt(`Salin tautan ${a.namaPanggilan}:`, a.tautan);
    }
  }

  function mulaiSunting(a: AnggotaDaftar) {
    setSuntingId(a.id);
    setNama(a.namaPanggilan);
    setWhatsapp(a.whatsapp ?? '');
    setGalatMedan({});
    setPesan(null);
    medanNama.current?.focus();
  }

  function batalSunting() {
    setSuntingId(null);
    setNama('');
    setWhatsapp('');
    setGalatMedan({});
  }

  function simpan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    mulai(async () => {
      const hasil = await simpanAnggota({ id: suntingId ?? undefined, namaPanggilan: nama, whatsapp });
      if (hasil.ok) {
        setPesan({ jenis: 'info', teks: suntingId ? 'Perubahan disimpan.' : `${hasil.data.namaPanggilan} ditambahkan.` });
        batalSunting();
        router.refresh();
      } else {
        setGalatMedan(hasil.medan ?? {});
        setPesan({ jenis: 'galat', teks: hasil.pesan });
      }
    });
  }

  function ubahAktif(a: AnggotaDaftar) {
    mulai(async () => {
      const hasil = await simpanAnggota({ id: a.id, namaPanggilan: a.namaPanggilan, aktif: !a.aktif });
      setPesan(
        hasil.ok
          ? { jenis: 'info', teks: `${a.namaPanggilan} ${a.aktif ? 'dinonaktifkan' : 'diaktifkan lagi'}.` }
          : { jenis: 'galat', teks: hasil.pesan },
      );
      if (hasil.ok) router.refresh();
    });
  }

  function hapus(a: AnggotaDaftar) {
    if (!window.confirm(`Hapus ${a.namaPanggilan} dari daftar anggota?`)) return;
    mulai(async () => {
      const hasil = await hapusAnggota({ memberId: a.id });
      setPesan(hasil.ok ? { jenis: 'info', teks: `${a.namaPanggilan} dihapus.` } : { jenis: 'galat', teks: hasil.pesan });
      if (hasil.ok) {
        if (suntingId === a.id) batalSunting();
        router.refresh();
      }
    });
  }

  function cabut(a: AnggotaDaftar) {
    if (!window.confirm(KONFIRMASI_CABUT)) return;
    mulai(async () => {
      const hasil = await cabutToken({ memberId: a.id });
      setPesan(
        hasil.ok
          ? { jenis: 'info', teks: `Tautan ${a.namaPanggilan} sudah diganti. Salin dan kirim yang baru.` }
          : { jenis: 'galat', teks: hasil.pesan },
      );
      if (hasil.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {anggota.length === 0 ? (
        <p className="text-tl-isi text-tl-teks-sekunder">Belum ada anggota. Tambahkan lewat isian di bawah.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-tl-garis-halus rounded-tl-kartu border border-tl-garis bg-tl-permukaan">
          {anggota.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-tl-nama font-bold">
                  <span className="truncate">{a.namaPanggilan}</span>
                  {!a.aktif && (
                    <span className="shrink-0 rounded-full bg-tl-belum px-2 py-0.5 text-tl-lencana font-bold text-tl-belum-teks">
                      Nonaktif
                    </span>
                  )}
                </p>
                <p className="truncate text-tl-label text-tl-teks-redup">{a.whatsapp ?? 'Tanpa nomor WhatsApp'}</p>
              </div>

              <button
                type="button"
                onClick={() => salin(a)}
                className="min-h-11 shrink-0 rounded-tl-tombol border-[1.5px] border-tl-aksi bg-tl-permukaan px-3 text-tl-label font-bold text-tl-aksi"
              >
                {tersalin === a.id ? 'Tersalin' : 'Salin tautan'}
              </button>

              <details className="relative shrink-0">
                <summary
                  aria-label={`Menu ${a.namaPanggilan}`}
                  className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-tl-tombol text-xl text-tl-teks-sekunder [&::-webkit-details-marker]:hidden"
                >
                  ⋯
                </summary>
                <div className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-tl-kartu border border-tl-garis bg-tl-permukaan shadow-lg">
                  <button type="button" disabled={sedangProses} className={KELAS_ITEM_MENU} onClick={(e) => { tutupMenu(e.currentTarget); mulaiSunting(a); }}>
                    Sunting
                  </button>
                  <button type="button" disabled={sedangProses} className={KELAS_ITEM_MENU} onClick={(e) => { tutupMenu(e.currentTarget); ubahAktif(a); }}>
                    {a.aktif ? 'Nonaktifkan' : 'Aktifkan lagi'}
                  </button>
                  {a.punyaPorsi ? (
                    <p className="px-3 py-2 text-tl-label text-tl-teks-redup">
                      Tidak bisa dihapus karena punya porsi. Nonaktifkan saja supaya riwayatnya tetap utuh.
                    </p>
                  ) : (
                    <button type="button" disabled={sedangProses} className={KELAS_ITEM_MENU} onClick={(e) => { tutupMenu(e.currentTarget); hapus(a); }}>
                      Hapus
                    </button>
                  )}
                  <button type="button" disabled={sedangProses} className={`${KELAS_ITEM_MENU} text-tl-galat`} onClick={(e) => { tutupMenu(e.currentTarget); cabut(a); }}>
                    Cabut tautan
                  </button>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className={`min-h-5 text-tl-isi font-semibold ${pesan?.jenis === 'galat' ? 'text-tl-galat' : 'text-tl-teks-sekunder'}`}>
        {pesan?.teks}
      </p>

      <form onSubmit={simpan} className="flex flex-col gap-3 rounded-tl-kartu border border-tl-garis bg-tl-permukaan p-4">
        <h2 className="text-tl-nama font-extrabold">{suntingId ? 'Sunting anggota' : 'Tambah anggota'}</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="nama" className={KELAS_LABEL}>Nama panggilan</label>
          <input
            id="nama"
            ref={medanNama}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            required
            maxLength={40}
            autoComplete="off"
            aria-invalid={galatMedan.namaPanggilan ? true : undefined}
            aria-describedby={galatMedan.namaPanggilan ? 'galat-nama' : undefined}
            className={KELAS_MEDAN}
          />
          {galatMedan.namaPanggilan && <p id="galat-nama" className={KELAS_GALAT}>{galatMedan.namaPanggilan}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="whatsapp" className={KELAS_LABEL}>Nomor WhatsApp</label>
          <input
            id="whatsapp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="6281234567890"
            autoComplete="off"
            aria-invalid={galatMedan.whatsapp ? true : undefined}
            aria-describedby="petunjuk-wa"
            className={KELAS_MEDAN}
          />
          <p id="petunjuk-wa" className={`text-tl-label ${galatMedan.whatsapp ? 'font-semibold text-tl-galat' : 'text-tl-teks-redup'}`}>
            {galatMedan.whatsapp ?? 'Awali dengan 62, tanpa 0 di depan. Boleh dikosongkan.'}
          </p>
        </div>
        <div className="flex gap-2">
          {suntingId && (
            <button type="button" onClick={batalSunting} className={KELAS_TOMBOL_SEKUNDER}>
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={sedangProses}
            className={KELAS_TOMBOL_UTAMA}
          >
            {sedangProses ? 'Menyimpan…' : suntingId ? 'Simpan' : 'Tambah'}
          </button>
        </div>
      </form>
    </div>
  );
}
