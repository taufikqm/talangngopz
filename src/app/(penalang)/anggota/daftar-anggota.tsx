'use client';

import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AnggotaDaftar } from '@/lib/contracts';
import { cabutToken, hapusAnggota, simpanAnggota } from '@/actions/anggota';

const KONFIRMASI_CABUT = 'Tautan lama akan langsung mati dan kamu harus kirim yang baru. Lanjut?';

const KELAS_MEDAN =
  'min-h-11 w-full rounded-lg border border-zinc-400 bg-white px-3 text-base text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50';
const KELAS_ITEM_MENU =
  'flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-zinc-100 disabled:text-zinc-500 dark:hover:bg-zinc-800';

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
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Belum ada anggota. Tambahkan lewat isian di bawah.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {anggota.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium">
                  <span className="truncate">{a.namaPanggilan}</span>
                  {!a.aktif && (
                    <span className="shrink-0 rounded bg-zinc-200 px-1.5 text-xs font-normal text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100">
                      Nonaktif
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">{a.whatsapp ?? 'Tanpa nomor WhatsApp'}</p>
              </div>

              <button
                type="button"
                onClick={() => salin(a)}
                className="min-h-11 shrink-0 rounded-lg border border-zinc-400 px-3 text-sm font-medium dark:border-zinc-600"
              >
                {tersalin === a.id ? 'Tersalin' : 'Salin tautan'}
              </button>

              <details className="relative shrink-0">
                <summary
                  aria-label={`Menu ${a.namaPanggilan}`}
                  className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-xl [&::-webkit-details-marker]:hidden"
                >
                  ⋯
                </summary>
                <div className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  <button type="button" disabled={sedangProses} className={KELAS_ITEM_MENU} onClick={(e) => { tutupMenu(e.currentTarget); mulaiSunting(a); }}>
                    Sunting
                  </button>
                  <button type="button" disabled={sedangProses} className={KELAS_ITEM_MENU} onClick={(e) => { tutupMenu(e.currentTarget); ubahAktif(a); }}>
                    {a.aktif ? 'Nonaktifkan' : 'Aktifkan lagi'}
                  </button>
                  {a.punyaPorsi ? (
                    <p className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                      Tidak bisa dihapus karena punya porsi. Nonaktifkan saja supaya riwayatnya tetap utuh.
                    </p>
                  ) : (
                    <button type="button" disabled={sedangProses} className={KELAS_ITEM_MENU} onClick={(e) => { tutupMenu(e.currentTarget); hapus(a); }}>
                      Hapus
                    </button>
                  )}
                  <button type="button" disabled={sedangProses} className={`${KELAS_ITEM_MENU} text-red-700 dark:text-red-400`} onClick={(e) => { tutupMenu(e.currentTarget); cabut(a); }}>
                    Cabut tautan
                  </button>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className={`min-h-5 text-sm ${pesan?.jenis === 'galat' ? 'text-red-700 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
        {pesan?.teks}
      </p>

      <form onSubmit={simpan} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <h2 className="text-base font-semibold">{suntingId ? 'Sunting anggota' : 'Tambah anggota'}</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="nama" className="text-sm font-medium">Nama panggilan</label>
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
          {galatMedan.namaPanggilan && <p id="galat-nama" className="text-sm text-red-700 dark:text-red-400">{galatMedan.namaPanggilan}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="whatsapp" className="text-sm font-medium">Nomor WhatsApp</label>
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
          <p id="petunjuk-wa" className={`text-sm ${galatMedan.whatsapp ? 'text-red-700 dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
            {galatMedan.whatsapp ?? 'Awali dengan 62, tanpa 0 di depan. Boleh dikosongkan.'}
          </p>
        </div>
        <div className="flex gap-2">
          {suntingId && (
            <button type="button" onClick={batalSunting} className="min-h-11 flex-1 rounded-lg border border-zinc-400 px-4 text-base font-medium dark:border-zinc-600">
              Batal
            </button>
          )}
          <button
            type="submit"
            disabled={sedangProses}
            className="min-h-11 flex-1 rounded-lg bg-zinc-900 px-4 text-base font-medium text-white disabled:bg-zinc-500 dark:bg-zinc-50 dark:text-zinc-900 dark:disabled:bg-zinc-400"
          >
            {sedangProses ? 'Menyimpan…' : suntingId ? 'Simpan' : 'Tambah'}
          </button>
        </div>
      </form>
    </div>
  );
}
