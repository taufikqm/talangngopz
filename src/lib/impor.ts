import { gagal, sukses, type Hasil, type PratinjauImpor } from './contracts';
import { ITEM_MAKS, PANJANG_JUDUL_MAKS, QTY_MAKS, TOTAL_MAKS } from './event';
import { BATAS_PANJANG, GalatUrai, uraiKeUnit, uraikanTabel } from './parser';

export type KeluaranPratinjau = Extract<Awaited<ReturnType<PratinjauImpor>>, { ok: true }>['data'];

/** Format yang pasti terbaca parser; diuji di impor.test.ts supaya contoh di layar tidak melenceng. */
export const CONTOH_TABEL = `| Menu | Qty | Harga | Subtotal |
| Nasi Putih | 2 | Rp5.000 | Rp10.000 |
| Es Teh | 1 | Rp4.000 | Rp4.000 |
| Total | | | Rp14.000 |`;

const PESAN_URAI = {
  terlalu_panjang: `Teks terlalu panjang, maksimal ${BATAS_PANJANG.toLocaleString('id-ID')} karakter.`,
  tabel_kosong: 'Tidak ada baris item yang terbaca.',
  tabel_tidak_dikenali: 'Tabel tidak dikenali. Pastikan ada kolom nama item dan harga.',
} as const;

const angkaSah = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= TOTAL_MAKS;

/**
 * Pratinjau impor: murni, tidak menyimpan apa pun. Teks adalah masukan tidak tepercaya,
 * jadi hasil parser diperiksa dulu sebelum diuraikan ke unit. Tanpa itu, sel "Jumlah"
 * berisi 1000000000 membuat satu baris menjadi satu miliar unit, dan deretan digit
 * sangat panjang menjadi Infinity yang merusak seluruh hitungan selisih.
 */
export function pratinjauDariTeks(teks: unknown): Hasil<KeluaranPratinjau> {
  if (typeof teks !== 'string' || teks.trim() === '') {
    return gagal('validasi', 'Tempel dulu jawaban ChatGPT yang berisi tabel.', { teks: 'Kotak masih kosong.' });
  }

  let urai: ReturnType<typeof uraikanTabel>;
  try {
    urai = uraikanTabel(teks);
  } catch (e) {
    if (e instanceof GalatUrai) return gagal('validasi', PESAN_URAI[e.kode], { teks: PESAN_URAI[e.kode] });
    throw e;
  }

  if (urai.items.length > ITEM_MAKS) {
    return gagal('validasi', `Terlalu banyak item, maksimal ${ITEM_MAKS}.`, { teks: `Terbaca ${urai.items.length} item.` });
  }
  const kebanyakan = urai.items.find((it) => !Number.isSafeInteger(it.qty) || it.qty > QTY_MAKS);
  if (kebanyakan) {
    return gagal('validasi', `Jumlah "${kebanyakan.nama.slice(0, 30)}" lebih dari ${QTY_MAKS}.`, { teks: 'Jumlah item tidak masuk akal.' });
  }
  const jumlah = urai.items.reduce((a, it) => a + it.subtotal, 0);
  if (!urai.items.every((it) => angkaSah(it.subtotal)) || (urai.total !== null && !angkaSah(urai.total)) || !angkaSah(jumlah)) {
    return gagal('validasi', 'Ada angka yang terlalu besar.', { teks: 'Periksa angka pada tabel.' });
  }

  // Nama dipotong ke batas simpan agar item yang lolos urai juga lolos buatEvent.
  const items = urai.items.map((it) => ({ ...it, nama: it.nama.slice(0, PANJANG_JUDUL_MAKS) }));
  return sukses({
    items,
    unit: uraiKeUnit(items),
    total: urai.total,
    selisih: urai.selisih,
    sudahTeralokasi: urai.sudahTeralokasi,
    cocokTotal: urai.cocokTotal,
    cocokQty: urai.cocokQty,
    // Parser membaca nama item, bukan nama orang; pencocokan nama anggota adalah T-17.
    namaTidakCocok: [],
  });
}
