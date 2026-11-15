import type { RincianPorsi } from './dasbor';
import { tampilTanggalPendek } from './tanggal';
import { rupiah, type Rupiah } from './uang';

/**
 * Teks tagihan siap tempel ke WhatsApp (T-12). Murni: tidak membaca basis data dan tidak
 * menghitung ulang uang selain menjumlahkan baris yang ditampilkan, supaya total di teks
 * selalu sama dengan baris di atasnya.
 */

/** Hanya porsi belum_bayar: porsi yang sudah diklaim (menunggu) tidak ditagih lagi. */
export function porsiBelumBayar(rincian: readonly RincianPorsi[]): RincianPorsi[] {
  return rincian.filter((r) => r.status === 'belum_bayar' && r.total > 0);
}

const jumlah = (porsi: readonly { total: Rupiah }[]): Rupiah => porsi.reduce((a, p) => a + p.total, 0);

/** Teks pribadi untuk satu orang, dengan tautan tokennya. Hanya untuk chat pribadi. */
export function teksTagihanAnggota(nama: string, porsi: readonly RincianPorsi[], tautan: string): string {
  if (porsi.length === 0) throw new Error('teksTagihanAnggota dipanggil tanpa porsi');
  return [
    `Halo ${nama}, ini tagihan talangan kamu:`,
    ...porsi.map((p) => `• ${p.judul} (${tampilTanggalPendek(p.tanggal)}): ${rupiah(p.total)}`),
    `Total: ${rupiah(jumlah(porsi))}`,
    `Cek dan bayar di: ${tautan}`,
  ].join('\n');
}

/**
 * Teks untuk grup: nama dan nominal saja. Sengaja tanpa tautan pribadi, karena tautan memberi
 * akses ke utang, rekening, dan pengiriman klaim atas nama pemiliknya.
 */
export function teksTagihanSemua(daftar: readonly { nama: string; total: Rupiah }[]): string {
  if (daftar.length === 0) throw new Error('teksTagihanSemua dipanggil tanpa penunggak');
  return [
    'Tagihan talangan yang belum dibayar:',
    ...daftar.map((d) => `• ${d.nama}: ${rupiah(d.total)}`),
    `Total: ${rupiah(jumlah(daftar))}`,
  ].join('\n');
}
