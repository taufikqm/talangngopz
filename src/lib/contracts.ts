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
  | 'validasi'          // 400/422: masukan tidak lolos skema
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
// Autentikasi penalang
// ---------------------------------------------------------------------------

/**
 * masuk — surel + password. Tidak ada pendaftaran; akun penalang dibuat manual.
 * Surel tak dikenal, password salah, dan pengguna tanpa baris di profiles
 * menerima galat yang sama persis, agar daftar penalang tidak dapat ditebak.
 */
export type Masuk = (m: {
  email: string;
  password: string;
}) => Promise<Hasil<null>>;

/** Mengakhiri sesi penalang. */
export type Keluar = () => Promise<Hasil<null>>;

// ---------------------------------------------------------------------------
// Aksi penalang
// ---------------------------------------------------------------------------

/**
 * buatEvent — menghitung porsi di server lalu menyisipkan events + shares
 * dalam satu transaksi. Klien tidak pernah mengirim nominal porsi.
 *
 * Bila `sudahTeralokasi` true, pajak/biayaLayanan/diskon diabaikan dan
 * alokasi dilewati. Nilai ini berasal dari parser, bukan dari penalang.
 *
 * Penanggung sisa pembulatan tidak dikirim klien: server memakai anggota milik
 * penalang (members.profile_id), atau peserta pertama menurut nama bila penalang
 * tidak ikut. Porsi penalang sendiri langsung berstatus lunas.
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
  sudahTeralokasi: boolean;
};

export type BuatEventKeluaran = {
  eventId: string;
  shareToken: string;
  porsi: PorsiRingkas[];
};

export type BuatEvent = (m: BuatEventMasukan) => Promise<Hasil<BuatEventKeluaran>>;

/** Hanya penalang tujuan klaim. Semua porsi di klaim jadi lunas dan eventnya terkunci. */
export type KonfirmasiKlaim = (m: { claimId: string }) => Promise<Hasil<{ claimId: string }>>;

/** Hanya penalang tujuan klaim. Semua porsi di klaim kembali belum_bayar. Alasan wajib. */
export type TolakKlaim = (m: { claimId: string; alasan: string }) => Promise<Hasil<{ claimId: string }>>;

/** Pembayaran tunai: satu porsi belum_bayar langsung lunas, tanpa klaim, bercatatan "tunai". */
export type TandaiLunasManual = (m: { shareId: string }) => Promise<Hasil<{ shareId: string }>>;

export type SimpanAnggota = (m: {
  id?: string;                          // kosong berarti membuat baru
  namaPanggilan: string;
  whatsapp?: string | null;
  aktif?: boolean;
}) => Promise<Hasil<Anggota>>;

/**
 * Hanya untuk anggota tanpa porsi. Anggota yang masih dirujuk shares ditolak
 * basis data (foreign key) dan dibalas 'konflik'; jalan keluarnya menonaktifkan.
 */
export type HapusAnggota = (m: {
  memberId: string;
}) => Promise<Hasil<null>>;

/** Baris halaman /anggota. `punyaPorsi` hanya menghitung porsi yang terlihat lewat RLS. */
export type AnggotaDaftar = Anggota & {
  tautan: string;
  punyaPorsi: boolean;
};

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
 * POST /api/claim. Satu transfer = satu klaim berisi satu atau lebih porsi.
 *
 * Token tidak dikenal dan shareId milik orang lain sama-sama mengembalikan
 * 'tidak_ditemukan' (404) dengan isi yang sama, agar keberadaan token tidak dapat
 * ditebak. Klaim ulang untuk porsi yang sama mengembalikan 'konflik' (409) tanpa
 * klaim atau riwayat kedua. Batas laju 10 permintaan per token per menit (429).
 * Nominal tidak pernah datang dari klien; server menjumlahkan shares.total.
 */
export type KlaimMasukan = {
  token: string;
  shareIds: string[];
  /** ISO 8601 dengan zona, misalnya 2026-11-09T14:20:00+07:00. */
  waktuTransfer: string;
  /** Nama di rekening pengirim atau nama bank. */
  pengirim: string;
};

export type KlaimKeluaran = {
  claimId: string;
  nominal: Rupiah;
};

/** Rekening tujuan satu penalang. Seorang anggota bisa berutang ke beberapa penalang. */
export type TujuanTransfer = {
  penalangId: string;
  nama: string;
  bank: string | null;
  noRekening: string | null;
  qrisUrl: string | null;
};

/** /me/[token]. Hanya data milik anggota pemegang token; tanpa surel atau WhatsApp. */
export type RekapPribadi = {
  namaPanggilan: string;
  /** belum_bayar ditambah menunggu_konfirmasi. */
  totalUtang: Rupiah;
  tujuan: TujuanTransfer[];
  perEvent: Array<{
    shareId: string;
    judul: string;
    tanggal: string;
    total: Rupiah;
    status: ShareStatus;
    penalangId: string;
    /** claimed_at klaim berstatus menunggu yang memuat porsi ini. */
    menungguSejak: string | null;
    lunasPada: string | null;
  }>;
};

/** /bill/[token]. Satu event untuk semua peserta; tanpa surel atau WhatsApp siapa pun. */
export type RekapEvent = {
  judul: string;
  tanggal: string;
  total: Rupiah;
  penalang: string;
  peserta: Array<{ nama: string; total: Rupiah; status: ShareStatus }>;
};
