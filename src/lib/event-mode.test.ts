import { describe, it, expect } from 'vitest';
import { barisItemManual, porsiManual, porsiPerItem, ringkasManual, ringkasPerItem, teksSelisih, urutkanPeserta } from './event';
import { uraiKeUnit } from './parser';
import { GalatInvarian } from './uang';

const NAMA = new Map([
  ['m-arjuna', 'Arjuna'],
  ['m-budi', 'Budi'],
  ['m-citra', 'Citra'],
  ['m-dika', 'Dika'],
]);
const urut = (ids: string[], penalang: string | null) =>
  urutkanPeserta(ids.map((id) => ({ id, namaPanggilan: NAMA.get(id) ?? '' })), penalang);
const jumlah = (m: Map<string, { total: number }>) => [...m.values()].reduce((a, p) => a + p.total, 0);

describe('mode manual', () => {
  it('selisih tampil benar', () => {
    expect(teksSelisih(new Map([['m-budi', 40_000], ['m-citra', 50_000]]), 100_000)).toBe('Kurang Rp10.000');
    expect(teksSelisih(new Map([['m-budi', 55_000], ['m-citra', 50_000]]), 100_000)).toBe('Lebih Rp5.000');
    expect(teksSelisih(new Map([['m-budi', 50_000], ['m-citra', 50_000]]), 100_000)).toBe('Pas');
    expect(teksSelisih(new Map(), 100_000)).toBe('Kurang Rp100.000');
  });

  it('simpan terkunci sampai selisih nol: porsiManual menolak bila belum pas', () => {
    const peserta = urut(['m-budi', 'm-citra'], null);
    expect(() => porsiManual(new Map([['m-budi', 40_000], ['m-citra', 50_000]]), 100_000, peserta)).toThrow(GalatInvarian);
    const h = porsiManual(new Map([['m-budi', 50_000], ['m-citra', 50_000]]), 100_000, peserta);
    expect(jumlah(h)).toBe(100_000);
  });

  it('nominal dipakai apa adanya, tanpa sisa', () => {
    const h = porsiManual(new Map([['m-arjuna', 33_333], ['m-budi', 33_333], ['m-citra', 33_334]]), 100_000, urut(['m-budi', 'm-citra', 'm-arjuna'], 'm-arjuna'));
    expect(h.get('m-citra')?.total).toBe(33_334);
    expect(h.get('m-arjuna')?.total).toBe(33_333);
  });
});

describe('mode per item', () => {
  it('item qty 3 tampil sebagai 3 unit terurai sejak awal', () => {
    const unit = uraiKeUnit([barisItemManual('Nasi Putih', 3, 15_000)]);
    expect(unit.map((u) => [u.nama, u.ke, u.dari, u.subtotal, u.penanggung])).toEqual([
      ['Nasi Putih', 1, 3, 5_000, []],
      ['Nasi Putih', 2, 3, 5_000, []],
      ['Nasi Putih', 3, 3, 5_000, []],
    ]);
  });

  it('item 30.000 ditanggung 2 orang menghasilkan 15.000 tiap orang', () => {
    const unit = uraiKeUnit([barisItemManual('Pizza', 1, 30_000)]);
    unit[0].penanggung = ['m-budi', 'm-citra'];
    const { porsi } = porsiPerItem(unit, NAMA, 'm-arjuna');
    expect(porsi.get('m-budi')?.total).toBe(15_000);
    expect(porsi.get('m-citra')?.total).toBe(15_000);
    expect(jumlah(porsi)).toBe(30_000);
  });

  it('item 10.000 untuk 3 orang: jumlah tetap 10.000 dan sisa ke penalang', () => {
    const unit = uraiKeUnit([barisItemManual('Es Teh', 1, 10_000)]);
    unit[0].penanggung = ['m-citra', 'm-budi', 'm-arjuna'];
    const { porsi, urut: u } = porsiPerItem(unit, NAMA, 'm-arjuna');
    expect(porsi.get('m-arjuna')?.total).toBe(3_334);
    expect(porsi.get('m-budi')?.total).toBe(3_333);
    expect(porsi.get('m-citra')?.total).toBe(3_333);
    expect(jumlah(porsi)).toBe(10_000);
    expect(u[0].id).toBe('m-arjuna');
  });

  it('penalang tidak ikut menanggung: sisa unit ke penanggung pertama menurut nama', () => {
    const unit = uraiKeUnit([barisItemManual('Es Teh', 1, 10_000)]);
    unit[0].penanggung = ['m-dika', 'm-citra', 'm-budi'];
    const { porsi } = porsiPerItem(unit, NAMA, 'm-arjuna');
    expect(porsi.get('m-budi')?.total).toBe(3_334);
    expect(porsi.has('m-arjuna')).toBe(false);
    expect(jumlah(porsi)).toBe(10_000);
  });

  it('unit belum ditandai ditolak; unit gratis boleh tanpa penanggung', () => {
    const unit = uraiKeUnit([barisItemManual('Nasi', 2, 10_000), barisItemManual('Kerupuk', 1, 0, true)]);
    unit[0].penanggung = ['m-budi'];
    expect(() => porsiPerItem(unit, NAMA, null)).toThrow(/1 unit belum ditandai/);
    unit[1].penanggung = ['m-citra'];
    expect(jumlah(porsiPerItem(unit, NAMA, null).porsi)).toBe(10_000);
  });

  it('barisItemManual: satuan hanya tampilan, subtotal otoritatif', () => {
    expect(barisItemManual('Nasi', 3, 20_000)).toMatchObject({ qty: 3, subtotal: 20_000, satuan: 6_666, valid: false, diturunkan: true });
    expect(barisItemManual('Nasi', 2, 20_000)).toMatchObject({ satuan: 10_000, valid: true });
  });
});

describe('kunci tombol simpan (dipakai langsung oleh formulir)', () => {
  it('manual: terkunci selama selisih belum nol, terbuka saat pas', () => {
    expect(ringkasManual(new Map([['m-budi', 40_000], ['m-citra', 50_000]]), 100_000)).toEqual({
      pratinjau: '2 orang · Kurang Rp10.000',
      siap: false,
    });
    expect(ringkasManual(new Map([['m-budi', 55_000], ['m-citra', 50_000]]), 100_000)).toEqual({
      pratinjau: '2 orang · Lebih Rp5.000',
      siap: false,
    });
    expect(ringkasManual(new Map([['m-budi', 50_000], ['m-citra', 50_000]]), 100_000)).toEqual({
      pratinjau: '2 orang · Pas',
      siap: true,
    });
    expect(ringkasManual(new Map(), 100_000).siap).toBe(false);
  });

  it('per item: terkunci selama ada unit belum ditandai atau jumlah item belum sama dengan total', () => {
    const items = [barisItemManual('Nasi Putih', 3, 15_000)];
    const unit = uraiKeUnit(items);
    expect(ringkasPerItem(unit, [15_000], 15_000)).toEqual({ pratinjau: '3 unit belum ditandai', siap: false });
    unit.forEach((u) => (u.penanggung = ['m-budi']));
    expect(ringkasPerItem(unit, [15_000], 20_000)).toEqual({ pratinjau: 'Item kurang Rp5.000 dari total', siap: false });
    expect(ringkasPerItem(unit, [15_000], 15_000)).toEqual({ pratinjau: '3 unit · Pas', siap: true });
    expect(ringkasPerItem([], [], 15_000).siap).toBe(false);
  });
});
