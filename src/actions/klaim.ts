'use server';

import {
  gagal,
  sukses,
  type Hasil,
  type KodeGalat,
  type KonfirmasiKlaim,
  type TandaiLunasManual,
  type TolakKlaim,
} from '@/lib/contracts';
import { idSah } from '@/lib/anggota';
import { ambilPenalang, buatKlienServer } from '@/lib/supabase/server';

/**
 * Aksi penalang atas klaim dan pelunasan tunai. Semuanya lewat sesi penalang (kunci anon),
 * bukan service_role: putuskan_klaim dan lunasi_tunai memeriksa auth.uid() sendiri.
 * Belum punya layar sampai T-11.
 */

const PANJANG_ALASAN_MAKS = 200;

const KODE_BASIS_DATA: Record<string, [KodeGalat, string]> = {
  P0002: ['tidak_ditemukan', 'Klaim atau porsi tidak ditemukan.'],
  '55000': ['konflik', 'Statusnya sudah berubah. Muat ulang halaman.'],
  '22023': ['validasi', 'Isian tidak sah.'],
  '42501': ['tidak_berwenang', 'Masuk sebagai penalang dulu.'],
};

async function jalankan<T>(aksi: string, rpc: string, argumen: Record<string, unknown>, data: T): Promise<Hasil<T>> {
  if (!(await ambilPenalang())) return gagal('tidak_berwenang', 'Masuk sebagai penalang dulu.');
  try {
    const db = await buatKlienServer();
    const { error } = await db.rpc(rpc, argumen);
    if (!error) return sukses(data);
    const peta = error.code ? KODE_BASIS_DATA[error.code] : undefined;
    if (peta) return gagal(peta[0], peta[1]);
    console.error(`${aksi}: galat basis data`, error.code ?? 'tidak_dikenal');
  } catch (e) {
    console.error(`${aksi}: galat`, typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : 'tidak_dikenal');
  }
  return gagal('internal', 'Terjadi kesalahan. Coba lagi sebentar lagi.');
}

export const konfirmasiKlaim: KonfirmasiKlaim = async ({ claimId }) => {
  if (!idSah(claimId)) return gagal('validasi', 'Klaim tidak sah.');
  return jalankan('konfirmasiKlaim', 'putuskan_klaim', { p_claim: claimId, p_keputusan: 'konfirmasi', p_alasan: null }, { claimId });
};

export const tolakKlaim: TolakKlaim = async ({ claimId, alasan }) => {
  if (!idSah(claimId)) return gagal('validasi', 'Klaim tidak sah.');
  const alasanBersih = typeof alasan === 'string' ? alasan.trim() : '';
  if (alasanBersih.length < 1 || alasanBersih.length > PANJANG_ALASAN_MAKS) {
    return gagal('validasi', 'Alasan penolakan wajib diisi.', { alasan: `Isi alasan, maksimal ${PANJANG_ALASAN_MAKS} karakter.` });
  }
  return jalankan('tolakKlaim', 'putuskan_klaim', { p_claim: claimId, p_keputusan: 'tolak', p_alasan: alasanBersih }, { claimId });
};

export const tandaiLunasManual: TandaiLunasManual = async ({ shareId }) => {
  if (!idSah(shareId)) return gagal('validasi', 'Porsi tidak sah.');
  return jalankan('tandaiLunasManual', 'lunasi_tunai', { p_share: shareId }, { shareId });
};
