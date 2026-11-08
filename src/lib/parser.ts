/**
 * Penguraian tabel split bill dari ChatGPT. FINAL — jangan tulis ulang.
 *
 * Masukan adalah teks jawaban ChatGPT apa adanya, disalin penalang lewat tombol
 * salin. Penalang memakai prompt bebas; sistem yang menyesuaikan, bukan sebaliknya.
 *
 * Tidak ada OCR, tidak ada pemanggilan model, tidak ada kunci API.
 *
 * Keamanan: teks ini tidak tepercaya walaupun berasal dari penalang sendiri.
 * Penguraian murni manipulasi string. Dilarang eval, new Function, dan
 * JSON.parse atas teks bebas. Lihat AGENTS.md aturan 9.
 */

import { uraiUnit, type Rupiah } from './uang';

export const BATAS_PANJANG = 100_000;
export const BATAS_BARIS = 300;

/** Kolom dikenali dari kata kunci pada header, bukan dari posisinya. */
const POLA = {
  nama: /^(menu|item|nama|pesanan|makanan|deskripsi)/i,
  subtotal: /^(subtotal|total|jumlah harga|harga total)/i,
  satuan: /(harga|per\s*(pcs|porsi|item|unit))/i,
  qty: /^(jumlah|qty|porsi|banyak|pcs)\s*$/i,
} as const;

const BARIS_TOTAL = /^\**\s*(total|grand total|jumlah bayar|total bayar)\b/i;
const GRATIS = /gratis|bonus|free/i;

/** Membuang semua non-digit. Rupiah di sini tidak pernah berdesimal. */
export const angka = (s = ''): Rupiah =>
  GRATIS.test(s) ? 0 : Number(String(s).replace(/\D/g, '') || 0);

const isPemisah = (b: string) => /^\|?[\s|:-]+\|?$/.test(b) && b.includes('-');

const selDari = (b: string): string[] =>
  b.includes('|')
    ? b.replace(/^\||\|$/g, '').split('|').map((s) => s.trim())
    : b.split(/\s{2,}|\t/).map((s) => s.trim());

const bersihkan = (s = '') =>
  s.replace(/\*\*/g, '').replace(/\\$/, '').trim();

export type BarisItem = {
  nama: string;
  qty: number;
  /** Hanya untuk ditampilkan. Jangan dikalikan. Lihat AGENTS.md aturan 4. */
  satuan: Rupiah;
  /** Otoritatif. Inilah yang dibagi saat memecah unit. */
  subtotal: Rupiah;
  gratis: boolean;
  /** true bila satuan dihitung dari subtotal / qty, bukan dibaca dari tabel. */
  diturunkan: boolean;
  /**
   * Hasil cek aritmetika baris. Perlu dibaca bersama `diturunkan`:
   * saat satuan diturunkan, cek qty x satuan = subtotal bersifat melingkar,
   * sehingga yang diperiksa adalah subtotal habis dibagi qty.
   */
  valid: boolean;
};

export type HasilUrai = {
  items: BarisItem[];
  /** Total yang tercetak pada baris total. null bila tabel tidak punya. */
  total: Rupiah | null;
  /**
   * total - Σ subtotal. Penentu alokasi, lihat AGENTS.md aturan 3.
   *   0   harga sudah final, JANGAN alokasi apa pun
   *   > 0 ada biaya belum teralokasi sebesar nilai ini
   *   < 0 ada diskon belum teralokasi sebesar nilai ini
   */
  selisih: Rupiah;
  /** true bila harga per item sudah mengandung pajak. Setara selisih === 0. */
  sudahTeralokasi: boolean;
  cocokTotal: boolean;
  /** Cek ketiga: Σ qty lawan jumlah item pada baris total, bila tercantum. */
  cocokQty: boolean;
};

export class GalatUrai extends Error {
  constructor(
    message: string,
    readonly kode: 'terlalu_panjang' | 'tabel_tidak_dikenali' | 'tabel_kosong',
  ) {
    super(message);
    this.name = 'GalatUrai';
  }
}

export function uraikanTabel(teks: string): HasilUrai {
  if (teks.length > BATAS_PANJANG) {
    throw new GalatUrai(
      'Teks terlalu panjang. Salin bagian tabelnya saja.',
      'terlalu_panjang',
    );
  }

  const baris = teks
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, BATAS_BARIS);

  const skor = (sel: string[]) =>
    Object.values(POLA).filter((p) => sel.some((s) => p.test(s))).length;

  const iHeader = baris.findIndex(
    (b) => selDari(b).length >= 2 && skor(selDari(b)) >= 2,
  );
  if (iHeader === -1) {
    throw new GalatUrai(
      'Tabel tidak dikenali. Pastikan menyalin seluruh jawaban ChatGPT, ' +
        'termasuk baris judul kolomnya.',
      'tabel_tidak_dikenali',
    );
  }

  const pakaiPipa = baris[iHeader].includes('|');
  const kol: Record<string, number> = {};
  selDari(baris[iHeader]).forEach((sel, i) => {
    for (const [f, p] of Object.entries(POLA)) {
      if (kol[f] === undefined && p.test(sel)) kol[f] = i;
    }
  });

  const items: BarisItem[] = [];
  let total: Rupiah | null = null;
  let totalQty: number | null = null;

  for (const b of baris.slice(iHeader + 1)) {
    // Berhenti di ujung tabel. Tanpa dua break ini, prose setelah tabel
    // ikut terbaca jadi item hantu, dan baris "Grand total: ..." di bawahnya
    // menimpa total yang sudah benar.
    if (pakaiPipa && !b.includes('|')) break;
    if (isPemisah(b)) continue;

    const r = selDari(b);
    if (r.length < 2) break;

    if (BARIS_TOTAL.test(r[0] ?? '')) {
      total = angka(r[kol.subtotal]);
      totalQty = kol.qty !== undefined ? angka(r[kol.qty]) || null : null;
      break; // baris total selalu yang terakhir
    }

    const nama = bersihkan(r[kol.nama] ?? r[0]);
    if (!nama) continue;

    const mSat = kol.satuan !== undefined ? (r[kol.satuan] ?? '') : '';
    const mSub = kol.subtotal !== undefined ? (r[kol.subtotal] ?? '') : '';
    const ada = (s: string) => /\d/.test(s) || GRATIS.test(s);

    // Baris tanpa angka sama sekali bukan item. Menjaga dari prose yang
    // kebetulan lolos pemisahan kolom.
    if (!ada(mSat) && !ada(mSub)) continue;

    const qty = angka(r[kol.qty]) || 1;
    let satuan = angka(mSat);
    let subtotal = angka(mSub);
    let diturunkan = false;
    let habisDibagi = true;

    if (!ada(mSub)) subtotal = satuan * qty;
    if (!ada(mSat)) {
      satuan = Math.floor(subtotal / qty);
      diturunkan = true;
      habisDibagi = subtotal % qty === 0;
    }

    items.push({
      nama,
      qty,
      satuan,
      subtotal,
      gratis: GRATIS.test(mSat) || (ada(mSub) && subtotal === 0),
      diturunkan,
      valid: diturunkan ? habisDibagi : satuan * qty === subtotal,
    });
  }

  if (items.length === 0) {
    throw new GalatUrai('Tabel dikenali tetapi tidak berisi item.', 'tabel_kosong');
  }

  const jumlah = items.reduce((a, b) => a + b.subtotal, 0);
  const jumlahQty = items.reduce((a, b) => a + b.qty, 0);
  const selisih = (total ?? jumlah) - jumlah;

  return {
    items,
    total,
    selisih,
    sudahTeralokasi: selisih === 0,
    cocokTotal: total === null || jumlah === total,
    cocokQty: totalQty === null || jumlahQty === totalQty,
  };
}

export type Unit = {
  /** Indeks baris asal pada HasilUrai.items. */
  indukIndeks: number;
  nama: string;
  /** Nomor unit ke berapa dari baris itu, mulai 1. */
  ke: number;
  dari: number;
  subtotal: Rupiah;
  gratis: boolean;
  /** Anggota yang menanggung unit ini. Kosong berarti belum ditandai. */
  penanggung: string[];
};

/**
 * Memecah tiap baris qty > 1 menjadi unit terpisah yang dapat ditandai
 * sendiri-sendiri.
 *
 * Ini keadaan awal layar koreksi, bukan opsi. Pada data nyata empat dari enam
 * baris punya qty lebih dari satu. Tanpa penguraian, penalang mudah menandai
 * satu baris ke tiga orang sebagai patungan padahal seharusnya satu unit untuk
 * tiap orang.
 *
 * Membagi subtotal, bukan mengalikan satuan. Lihat AGENTS.md aturan 4.
 */
export function uraiKeUnit(items: readonly BarisItem[]): Unit[] {
  const unit: Unit[] = [];
  items.forEach((item, indukIndeks) => {
    const bagian = uraiUnit(item.subtotal, item.qty);
    bagian.forEach((subtotal, k) => {
      unit.push({
        indukIndeks,
        nama: item.nama,
        ke: k + 1,
        dari: item.qty,
        subtotal,
        gratis: item.gratis,
        penanggung: [],
      });
    });
  });
  return unit;
}

/**
 * Menjumlahkan unit yang sudah ditandai menjadi subtotal per anggota.
 * Unit yang ditanggung beberapa orang dibagi rata di antara mereka,
 * dengan sisa pembulatan jatuh ke penanggung pertama.
 *
 * Melempar bila masih ada unit tanpa penanggung: tombol simpan seharusnya
 * terkunci sebelum sampai ke sini.
 */
export function subtotalPerAnggota(unit: readonly Unit[]): Map<string, Rupiah> {
  const belum = unit.filter((u) => u.penanggung.length === 0);
  if (belum.length > 0) {
    throw new RangeError(
      `${belum.length} unit belum ditandai: ${belum.map((u) => u.nama).join(', ')}`,
    );
  }

  const hasil = new Map<string, Rupiah>();
  for (const u of unit) {
    const bagian = uraiUnit(u.subtotal, u.penanggung.length);
    u.penanggung.forEach((id, k) => {
      hasil.set(id, (hasil.get(id) ?? 0) + bagian[k]);
    });
  }
  return hasil;
}
