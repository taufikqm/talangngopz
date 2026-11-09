import { bagiRata, hitungPorsi, rupiah, type Porsi, type Rupiah } from './uang';

/** Batas atas total satu event: jauh di atas kebutuhan sirkel, jauh di bawah batas bilangan aman JS. */
export const TOTAL_MAKS: Rupiah = 1_000_000_000;
export const PANJANG_JUDUL_MAKS = 80;
export const ZONA_WAKTU = 'Asia/Jakarta';

export type PesertaUrut = { id: string; namaPanggilan: string };

/**
 * Urutan peserta menentukan siapa yang menanggung sisa pembulatan: elemen pertama.
 * Penalang di depan bila ikut; selebihnya urut nama. Dipakai server untuk menghitung
 * dan klien untuk pratinjau, supaya keduanya selalu sepakat.
 */
export function urutkanPeserta(peserta: readonly PesertaUrut[], memberPenalang: string | null): PesertaUrut[] {
  const urut = [...peserta].sort(
    (a, b) =>
      a.namaPanggilan.localeCompare(b.namaPanggilan, 'id', { sensitivity: 'base' }) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const i = memberPenalang ? urut.findIndex((p) => p.id === memberPenalang) : -1;
  if (i > 0) urut.unshift(...urut.splice(i, 1));
  return urut;
}

/**
 * Porsi mode rata. bagiRata menaruh sisa di bagian pertama, dan hitungPorsi menaruh
 * sisa alokasi di pembulatanKe; keduanya menunjuk peserta pertama dari urutkanPeserta.
 */
export function porsiRata(total: Rupiah, urut: readonly PesertaUrut[]): Map<string, Porsi> {
  if (urut.length === 0) throw new RangeError('Peserta tidak boleh kosong');
  const bagian = bagiRata(total, urut.length);
  return hitungPorsi({
    subtotalPeserta: new Map(urut.map((p, i) => [p.id, bagian[i]])),
    subtotal: total,
    pajak: 0,
    biayaLayanan: 0,
    diskon: 0,
    pembulatanKe: urut[0].id,
    sudahTeralokasi: false,
  });
}

/** "5 orang × Rp30.000", atau rincian penanggung sisa bila tidak habis dibagi. */
export function teksPratinjau(total: Rupiah, urut: readonly PesertaUrut[], memberPenalang: string | null): string {
  if (urut.length === 0) return 'Pilih siapa yang ikut';
  if (!Number.isSafeInteger(total) || total <= 0) return `${urut.length} orang × Rp0`;
  const bagian = bagiRata(total, urut.length);
  const dasar = bagian[bagian.length - 1];
  if (bagian[0] === dasar) return `${urut.length} orang × ${rupiah(dasar)}`;
  const penanggung = urut[0].id === memberPenalang ? 'kamu' : urut[0].namaPanggilan;
  return `${urut.length} orang × ${rupiah(dasar)}, ${penanggung} ${rupiah(bagian[0])}`;
}

/** Tanggal hari ini (YYYY-MM-DD) di zona sirkel, sama di server dan peramban. */
export function hariIni(sekarang: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_WAKTU }).format(sekarang);
}

export function tanggalSah(tanggal: unknown): tanggal is string {
  if (typeof tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false;
  const d = new Date(`${tanggal}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === tanggal;
}

/** "Nongki 9 Nov" */
export function judulBawaan(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  return `Nongki ${label.replace('.', '')}`;
}
