'use server';

import {
  gagal,
  sukses,
  type Anggota,
  type CabutToken,
  type Hasil,
  type HapusAnggota,
  type SimpanAnggota,
} from '@/lib/contracts';
import {
  PANJANG_NAMA_MAKS,
  gantiTokenAkses,
  hapusAnggotaDb,
  idSah,
  normalisasiNama,
  normalisasiWhatsapp,
  sisipAnggota,
  tautanPribadi,
  ubahAnggota,
} from '@/lib/anggota';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';

const PESAN_INTERNAL = 'Terjadi kesalahan. Coba lagi sebentar lagi.';
const PESAN_TIDAK_DITEMUKAN = 'Anggota tidak ditemukan.';

/** Klien bersesi, atau null bila bukan penalang. Server Action bisa dipanggil langsung, jadi layout saja tidak cukup. */
async function klienPenalang() {
  return (await ambilPenalang()) ? buatKlienServer() : null;
}

function kodePostgres(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : 'tidak_dikenal';
}

/** Hanya kode galat yang dicatat: baris dan pesan Postgres bisa memuat token akses. */
function galatTakTerduga(aksi: string, e: unknown): Hasil<never> {
  const kode = kodePostgres(e);
  console.error(`${aksi}: galat basis data`, kode);
  if (kode === '42501') return gagal('tidak_berwenang', 'Kamu tidak berhak mengubah anggota.');
  return gagal('internal', PESAN_INTERNAL);
}

export const simpanAnggota: SimpanAnggota = async (m): Promise<Hasil<Anggota>> => {
  const nama = normalisasiNama(m.namaPanggilan);
  const wa = m.whatsapp === undefined ? undefined : normalisasiWhatsapp(m.whatsapp);
  const medan: Record<string, string> = {};
  if (!nama) medan.namaPanggilan = `Nama wajib diisi, maksimal ${PANJANG_NAMA_MAKS} karakter.`;
  if (wa && !wa.ok) medan.whatsapp = 'Nomor WhatsApp harus berformat 62xxxxxxxxxx.';
  if (!nama || (wa && !wa.ok)) return gagal('validasi', 'Periksa lagi isian anggota.', medan);
  if (m.id !== undefined && !idSah(m.id)) return gagal('tidak_ditemukan', PESAN_TIDAK_DITEMUKAN);

  const db = await klienPenalang();
  if (!db) return gagal('tidak_berwenang', 'Sesi berakhir. Masuk lagi.');

  const whatsapp = wa?.ok ? wa.nilai : undefined;
  try {
    if (m.id === undefined) {
      return sukses(await sisipAnggota(db, { namaPanggilan: nama, whatsapp: whatsapp ?? null, aktif: m.aktif }));
    }
    const hasil = await ubahAnggota(db, m.id, { namaPanggilan: nama, whatsapp, aktif: m.aktif });
    return hasil ? sukses(hasil) : gagal('tidak_ditemukan', PESAN_TIDAK_DITEMUKAN);
  } catch (e) {
    return galatTakTerduga('simpanAnggota', e);
  }
};

export const hapusAnggota: HapusAnggota = async ({ memberId }): Promise<Hasil<null>> => {
  if (!idSah(memberId)) return gagal('tidak_ditemukan', PESAN_TIDAK_DITEMUKAN);
  const db = await klienPenalang();
  if (!db) return gagal('tidak_berwenang', 'Sesi berakhir. Masuk lagi.');

  try {
    return (await hapusAnggotaDb(db, memberId)) ? sukses(null) : gagal('tidak_ditemukan', PESAN_TIDAK_DITEMUKAN);
  } catch (e) {
    // Foreign key dari shares (atau events.pembulatan_ke) adalah penjaga yang mengikat:
    // RLS shares menyembunyikan porsi di event penalang lain, jadi tampilan bisa keliru.
    if (kodePostgres(e) === '23503') {
      return gagal('konflik', 'Anggota ini punya porsi. Nonaktifkan saja.');
    }
    return galatTakTerduga('hapusAnggota', e);
  }
};

export const cabutToken: CabutToken = async ({ memberId }): Promise<Hasil<{ tautan: string }>> => {
  if (!idSah(memberId)) return gagal('tidak_ditemukan', PESAN_TIDAK_DITEMUKAN);
  const db = await klienPenalang();
  if (!db) return gagal('tidak_berwenang', 'Sesi berakhir. Masuk lagi.');

  try {
    const token = await gantiTokenAkses(db, memberId);
    if (!token) return gagal('tidak_ditemukan', PESAN_TIDAK_DITEMUKAN);
    // Menunggu T-08: /me/[token] belum ada. Saat dibangun, token yang tidak cocok
    // dengan baris mana pun wajib membalas 404 biasa; token lama sudah tidak ada di tabel.
    return sukses({ tautan: tautanPribadi(token) });
  } catch (e) {
    return galatTakTerduga('cabutToken', e);
  }
};
