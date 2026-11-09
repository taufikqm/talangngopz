import { GalatInvarian, bagiRata, hitungPorsi, periksaManual, rupiah, uraiUnit, type Porsi, type Rupiah } from './uang';
import { subtotalPerAnggota, type BarisItem, type Unit } from './parser';

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

// ---------------------------------------------------------------------------
// Mode manual dan per item (T-07). Hanya merangkai fungsi uang.ts dan parser.ts.
// ---------------------------------------------------------------------------

/** "Pas", "Kurang Rp10.000", atau "Lebih Rp5.000" terhadap total. */
export function teksSelisih(nominal: ReadonlyMap<string, Rupiah>, total: Rupiah): string {
  const selisih = periksaManual(nominal, total);
  if (selisih === 0) return 'Pas';
  return selisih > 0 ? `Kurang ${rupiah(selisih)}` : `Lebih ${rupiah(-selisih)}`;
}

/**
 * Porsi mode manual. Nominal per orang diketik penalang dan wajib berjumlah tepat
 * total; tidak ada sisa pembulatan untuk dibagi. urut menentukan pembulatanKe.
 */
export function porsiManual(nominal: ReadonlyMap<string, Rupiah>, total: Rupiah, urut: readonly PesertaUrut[]): Map<string, Porsi> {
  if (urut.length === 0) throw new RangeError('Peserta tidak boleh kosong');
  const selisih = periksaManual(nominal, total);
  if (selisih !== 0) throw new GalatInvarian(total, total - selisih, 'porsiManual');
  return hitungPorsi({
    subtotalPeserta: new Map(urut.map((p) => [p.id, nominal.get(p.id) ?? 0])),
    subtotal: total,
    pajak: 0,
    biayaLayanan: 0,
    diskon: 0,
    pembulatanKe: urut[0].id,
    sudahTeralokasi: false,
  });
}

/**
 * Menyusun ulang penanggung tiap unit: penalang di depan bila ikut, lalu urut nama.
 * subtotalPerAnggota menaruh sisa pembulatan unit pada penanggung pertama, jadi
 * urutan inilah yang membuat sisa jatuh ke penalang bila ia ikut menanggung.
 */
export function urutkanPenanggung(unit: readonly Unit[], nama: ReadonlyMap<string, string>, memberPenalang: string | null): Unit[] {
  return unit.map((u) => ({
    ...u,
    penanggung: urutkanPeserta(
      u.penanggung.map((id) => ({ id, namaPanggilan: nama.get(id) ?? '' })),
      memberPenalang,
    ).map((p) => p.id),
  }));
}

/** Porsi mode per item dari unit yang sudah ditandai. Unit bernominal 0 boleh tanpa penanggung. */
export function porsiPerItem(
  unit: readonly Unit[],
  nama: ReadonlyMap<string, string>,
  memberPenalang: string | null,
): { porsi: Map<string, Porsi>; urut: PesertaUrut[] } {
  const bertanda = urutkanPenanggung(unit.filter((u) => u.subtotal > 0 || u.penanggung.length > 0), nama, memberPenalang);
  const subtotalPeserta = subtotalPerAnggota(bertanda);
  const urut = urutkanPeserta(
    [...subtotalPeserta.keys()].map((id) => ({ id, namaPanggilan: nama.get(id) ?? '' })),
    memberPenalang,
  );
  if (urut.length === 0) throw new RangeError('Belum ada unit yang ditandai');
  const total = [...subtotalPeserta.values()].reduce((a, b) => a + b, 0);
  const porsi = hitungPorsi({
    subtotalPeserta: new Map(urut.map((p) => [p.id, subtotalPeserta.get(p.id) ?? 0])),
    subtotal: total,
    pajak: 0,
    biayaLayanan: 0,
    diskon: 0,
    pembulatanKe: urut[0].id,
    sudahTeralokasi: false,
  });
  return { porsi, urut };
}

/** Baris item isian tangan menjadi BarisItem; satuan hanya untuk tampilan. */
export function barisItemManual(nama: string, qty: number, subtotal: Rupiah, gratis = false): BarisItem {
  const bagian = uraiUnit(subtotal, qty);
  return {
    nama,
    qty,
    satuan: bagian[bagian.length - 1],
    subtotal,
    gratis,
    diturunkan: true,
    valid: subtotal % qty === 0,
  };
}

export type Ringkasan = { pratinjau: string; siap: boolean };

/** Pratinjau dan kunci tombol simpan mode manual: terbuka hanya bila selisih nol. */
export function ringkasManual(nominal: ReadonlyMap<string, Rupiah>, total: Rupiah): Ringkasan {
  if (nominal.size === 0) return { pratinjau: 'Pilih siapa yang ikut', siap: false };
  const selisih = teksSelisih(nominal, total);
  return { pratinjau: `${nominal.size} orang · ${selisih}`, siap: total > 0 && selisih === 'Pas' };
}

/** Pratinjau dan kunci tombol simpan mode per item. */
export function ringkasPerItem(unit: readonly Unit[], subtotalItem: readonly Rupiah[], total: Rupiah): Ringkasan {
  if (subtotalItem.length === 0) return { pratinjau: 'Tambahkan item', siap: false };
  const belum = unit.filter((u) => u.subtotal > 0 && u.penanggung.length === 0).length;
  if (belum > 0) return { pratinjau: `${belum} unit belum ditandai`, siap: false };
  const selisih = teksSelisih(new Map(subtotalItem.map((s, i) => [String(i), s])), total);
  if (selisih !== 'Pas') {
    return { pratinjau: `Item ${selisih.charAt(0).toLowerCase()}${selisih.slice(1)} dari total`, siap: false };
  }
  return { pratinjau: `${unit.length} unit · Pas`, siap: total > 0 };
}
