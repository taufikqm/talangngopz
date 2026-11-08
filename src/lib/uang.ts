/**
 * Perhitungan uang. FINAL — jangan tulis ulang. Lihat AGENTS.md aturan 1 sampai 5.
 *
 * Seluruh nominal adalah bilangan bulat rupiah penuh. Tidak ada desimal,
 * tidak ada float, tidak ada satuan sen.
 *
 * Invarian yang dijaga seluruh berkas ini:
 *   Σ porsi === total yang dibayar penalang
 * Setiap fungsi yang membagi uang memeriksanya dan melempar galat bila gagal.
 * Tidak ada pembulatan diam-diam.
 */

export type Rupiah = number;

export class GalatInvarian extends Error {
  constructor(
    readonly diharapkan: Rupiah,
    readonly didapat: Rupiah,
    konteks = '',
  ) {
    super(
      `Invarian gagal${konteks ? ` (${konteks})` : ''}: ` +
        `jumlah ${didapat} tidak sama dengan total ${diharapkan}`,
    );
    this.name = 'GalatInvarian';
  }
}

function pastikanBulat(nilai: number, nama: string): void {
  if (!Number.isInteger(nilai)) {
    throw new TypeError(`${nama} harus bilangan bulat rupiah penuh, dapat ${nilai}`);
  }
}

/**
 * Membagi satu nominal ke `n` bagian sama besar.
 * Sisa pembulatan dibebankan ke bagian pertama, sehingga jumlahnya selalu pas.
 *
 *   bagiRata(100_000, 3) -> [33_334, 33_333, 33_333]
 */
export function bagiRata(total: Rupiah, n: number): Rupiah[] {
  pastikanBulat(total, 'total');
  if (n < 1 || !Number.isInteger(n)) {
    throw new RangeError(`Jumlah bagian harus bilangan bulat positif, dapat ${n}`);
  }

  const dasar = Math.floor(total / n);
  const bagian = Array<Rupiah>(n).fill(dasar);
  bagian[0] += total - dasar * n;

  const jumlah = bagian.reduce((a, b) => a + b, 0);
  if (jumlah !== total) throw new GalatInvarian(total, jumlah, 'bagiRata');
  return bagian;
}

/**
 * Memecah satu baris tagihan menjadi `qty` unit yang dapat ditandai sendiri-sendiri.
 *
 * Membagi `subtotal`, BUKAN mengalikan harga satuan. Pada nilai yang tidak habis
 * dibagi, perkalian balik akan meleset dari total. Lihat AGENTS.md aturan 4.
 */
export function uraiUnit(subtotal: Rupiah, qty: number): Rupiah[] {
  return bagiRata(subtotal, qty);
}

/**
 * Membagi beban (pajak + biaya layanan - diskon) secara proporsional terhadap
 * subtotal tiap peserta.
 *
 * JANGAN panggil ini untuk data hasil impor: angkanya sudah mengandung pajak,
 * dan memanggilnya akan menghitung pajak dua kali tanpa terdeteksi invarian.
 * Penentunya `selisih === 0` dari parser. Lihat AGENTS.md aturan 3.
 *
 * Pembulatan ke bawah, sehingga jumlah sementara selalu kurang atau sama.
 * Sisanya dibereskan oleh hitungPorsi().
 */
export function alokasiProporsional(
  subtotalPeserta: ReadonlyMap<string, Rupiah>,
  beban: Rupiah,
  subtotal: Rupiah,
): Map<string, Rupiah> {
  pastikanBulat(beban, 'beban');
  pastikanBulat(subtotal, 'subtotal');

  const hasil = new Map<string, Rupiah>();
  for (const [id, sub] of subtotalPeserta) {
    pastikanBulat(sub, `subtotal peserta ${id}`);
    // subtotal 0 berarti tidak ada dasar pembagian; seluruh beban jatuh ke sisa.
    hasil.set(id, subtotal === 0 ? 0 : Math.floor((beban * sub) / subtotal));
  }
  return hasil;
}

export type Masukan = {
  /** Subtotal tiap peserta, sudah dihitung sesuai mode (rata, manual, per_item). */
  subtotalPeserta: ReadonlyMap<string, Rupiah>;
  subtotal: Rupiah;
  pajak: Rupiah;
  biayaLayanan: Rupiah;
  diskon: Rupiah;
  /** Peserta yang menanggung sisa pembulatan. Bawaannya penalang. */
  pembulatanKe: string;
  /**
   * true bila subtotalPeserta berasal dari impor dan sudah mengandung pajak.
   * Saat true, alokasi dilewati sepenuhnya dan pajak/biayaLayanan/diskon diabaikan.
   */
  sudahTeralokasi?: boolean;
};

export type Porsi = {
  subtotal: Rupiah;
  pajakPorsi: Rupiah;
  total: Rupiah;
};

/**
 * Menghitung porsi final tiap peserta.
 *
 * Melempar GalatInvarian bila jumlah porsi tidak sama persis dengan total dibayar.
 * Melempar RangeError bila pembulatanKe bukan peserta pada event ini.
 */
export function hitungPorsi(m: Masukan): Map<string, Porsi> {
  const sudah = m.sudahTeralokasi === true;

  const beban = sudah ? 0 : m.pajak + m.biayaLayanan - m.diskon;
  const totalDibayar = sudah
    ? [...m.subtotalPeserta.values()].reduce((a, b) => a + b, 0)
    : m.subtotal + m.pajak + m.biayaLayanan - m.diskon;

  if (!m.subtotalPeserta.has(m.pembulatanKe)) {
    throw new RangeError(
      `pembulatanKe "${m.pembulatanKe}" bukan peserta pada event ini`,
    );
  }

  const alokasi = sudah
    ? new Map<string, Rupiah>([...m.subtotalPeserta.keys()].map((id) => [id, 0]))
    : alokasiProporsional(m.subtotalPeserta, beban, m.subtotal);

  const hasil = new Map<string, Porsi>();
  for (const [id, sub] of m.subtotalPeserta) {
    const pajakPorsi = alokasi.get(id) ?? 0;
    hasil.set(id, { subtotal: sub, pajakPorsi, total: sub + pajakPorsi });
  }

  const sebelumSisa = [...hasil.values()].reduce((a, p) => a + p.total, 0);
  const sisa = totalDibayar - sebelumSisa;

  const penanggung = hasil.get(m.pembulatanKe)!;
  penanggung.pajakPorsi += sisa;
  penanggung.total += sisa;

  const jumlah = [...hasil.values()].reduce((a, p) => a + p.total, 0);
  if (jumlah !== totalDibayar) {
    throw new GalatInvarian(totalDibayar, jumlah, 'hitungPorsi');
  }
  return hasil;
}

/**
 * Validasi mode manual: jumlah nominal yang diketik harus sama dengan subtotal.
 * Mengembalikan selisihnya; 0 berarti seimbang.
 */
export function periksaManual(
  subtotalPeserta: ReadonlyMap<string, Rupiah>,
  subtotal: Rupiah,
): Rupiah {
  const jumlah = [...subtotalPeserta.values()].reduce((a, b) => a + b, 0);
  return subtotal - jumlah;
}

/** Format tampilan: 1234567 -> "Rp1.234.567" */
export function rupiah(nilai: Rupiah): string {
  return 'Rp' + nilai.toLocaleString('id-ID');
}
