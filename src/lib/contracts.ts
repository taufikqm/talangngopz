/**
 * Kontrak Server Action dan Route Handler.
 *
 * Seluruh aksi mengembalikan Hasil<T>, tidak pernah melempar galat ke klien.
 * Galat yang tidak terduga ditangkap di pembungkus dan diubah jadi kode 'internal'.
 */

import type { Rupiah } from './uang';
import type { BarisItem, Unit } from './parser';

export type KodeGalat =
  | 'tidak_berwenang'   // 401/403: tidak ada sesi, atau bukan pemilik event
  | 'tidak_ditemukan'   // 404: juga dipakai saat token salah, agar tidak bocor
  | 'validasi'          // 422: masukan tidak lolos skema
  | 'tidak_seimbang'    // 422: jumlah porsi tidak sama dengan total
  | 'event_terkunci'    // 409: event sudah punya pelunasan
  | 'konflik'           // 409: status sudah berubah, atau sudah lunas
  | 'batas_laju'        // 429
  | 'internal';         // 500

export type Galat = {
  kode: KodeGalat;
  pesan: string;                        // bahasa Indonesia, layak ditampilkan
  medan?: Record<string, string>;       // galat per medan untuk formulir
};

export type Hasil<T> = { ok: true; data: T } | { ok: false } & Galat;

export const sukses = <T>(data: T): Hasil<T> => ({ ok: true, data });
export const gagal = (kode: KodeGalat, pesan: string, medan?: Record<string, string>): Hasil<never> =>
  ({ ok: false, kode, pesan, medan });

// ---------------------------------------------------------------------------
// Tipe bersama
// ---------------------------------------------------------------------------

export type ShareStatus = 'belum_bayar' | 'menunggu_konfirmasi' | 'lunas';
export type SplitMode = 'rata' | 'manual' | 'per_item';

export type Anggota = {
  id: string;
  namaPanggilan: string;
  whatsapp: string | null;
  aktif: boolean;
};

export type PorsiRingkas = {
  shareId: string;
  memberId: string;
  namaPanggilan: string;
  total: Rupiah;
  status: ShareStatus;
  claimedAt: string | null;
  settledAt: string | null;
};

// ---------------------------------------------------------------------------
// Aksi penalang
// ---------------------------------------------------------------------------

/**
 * buatEvent — menghitung porsi di server lalu menyisipkan events + shares
 * dalam satu transaksi. Klien tidak pernah mengirim nominal porsi.
 *
 * Bila `sudahTeralokasi` true, pajak/biayaLayanan/diskon diabaikan dan
 * alokasi dilewati. Nilai ini berasal dari parser, bukan dari penalang.
 */
export type BuatEventMasukan = {
  judul: string;
  tanggal: string;                      // YYYY-MM-DD
  mode: SplitMode;
  subtotal: Rupiah;
  pajak: Rupiah;
  biayaLayanan: Rupiah;
  diskon: Rupiah;
  /** Wajib untuk mode 'rata'. Untuk mode lain diturunkan dari porsi/unit. */
  pesertaIds?: string[];
  /** Mode 'manual': nominal yang diketik per anggota. */
  nominalManual?: Record<string, Rupiah>;
  /** Mode 'per_item': unit yang sudah ditandai di layar koreksi. */
  unit?: Unit[];
  /** Baris asal, disimpan ke bill_items untuk rujukan. */
  items?: BarisItem[];
  pembulatanKe: string;                 // memberId
  sudahTeralokasi: boolean;
};

export type BuatEventKeluaran = {
  eventId: string;
  shareToken: string;
  porsi: PorsiRingkas[];
};

export type BuatEvent = (m: BuatEventMasukan) => Promise<Hasil<BuatEventKeluaran>>;

/** Hanya pemilik event. Mengisi settled_at dan memicu penguncian event. */
export type KonfirmasiPembayaran = (m: {
  shareId: string;
  catatan?: string;
}) => Promise<Hasil<{ status: ShareStatus; settledAt: string }>>;

/** Mengembalikan status ke belum_bayar. Alasan wajib. */
export type TolakKlaim = (m: {
  shareId: string;
  alasan: string;
}) => Promise<Hasil<{ status: ShareStatus }>>;

/** Pembayaran tunai: melewati tahap klaim. */
export type TandaiLunasManual = (m: {
  shareId: string;
  catatan?: string;
}) => Promise<Hasil<{ status: ShareStatus; settledAt: string }>>;

export type SimpanAnggota = (m: {
  id?: string;                          // kosong berarti membuat baru
  namaPanggilan: string;
  whatsapp?: string | null;
  aktif?: boolean;
}) => Promise<Hasil<Anggota>>;

/** Membuat ulang token pribadi anggota. Tautan lama langsung mati. */
export type CabutToken = (m: {
  memberId: string;
}) => Promise<Hasil<{ tautan: string }>>;

/**
 * Teks tagihan siap salin. Tidak mengubah data.
 * memberId kosong berarti seluruh penunggak.
 */
export type BuatTeksTagihan = (m: {
  memberId?: string;
}) => Promise<Hasil<{ teks: string }>>;

/**
 * Pratinjau impor. TIDAK menyimpan apa pun — hasilnya mengisi layar koreksi.
 * Penyimpanan terjadi lewat buatEvent setelah penalang menekan konfirmasi.
 */
export type PratinjauImpor = (m: {
  teks: string;
}) => Promise<
  Hasil<{
    items: BarisItem[];
    unit: Unit[];
    total: Rupiah | null;
    selisih: Rupiah;
    sudahTeralokasi: boolean;
    cocokTotal: boolean;
    cocokQty: boolean;
    /** Nama pada tabel yang tidak cocok dengan members. Wajib dipetakan. */
    namaTidakCocok: string[];
  }>
>;

// ---------------------------------------------------------------------------
// Jalur peserta — tanpa sesi, otorisasi lewat token
// ---------------------------------------------------------------------------

/**
 * POST /api/claim
 *
 * Token tidak dikenal dan shareId milik orang lain sama-sama mengembalikan
 * 'tidak_ditemukan', agar keberadaan token tidak dapat ditebak dari beda pesan.
 * Idempoten: klaim ulang mengembalikan ok tanpa baris riwayat kedua.
 * Batas laju 10 permintaan per token per menit.
 */
export type KlaimMasukan = {
  memberToken: string;
  shareId: string;
  catatan?: string;
};

export type KlaimKeluaran = {
  status: ShareStatus;
  claimedAt: string;
};

export type RekapPribadi = {
  namaPanggilan: string;
  totalUtang: Rupiah;
  perEvent: Array<{
    shareId: string;
    judul: string;
    tanggal: string;
    total: Rupiah;
    status: ShareStatus;
    penalang: string;
  }>;
  tujuanTransfer: {
    nama: string;
    bank: string | null;
    noRekening: string | null;
    qrisUrl: string | null;
  };
};
