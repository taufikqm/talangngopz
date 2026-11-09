import { describe, it, expect } from 'vitest';
import { hariIni, judulBawaan, porsiRata, tanggalSah, teksPratinjau, urutkanPeserta, type PesertaUrut } from './event';

const p = (id: string, namaPanggilan: string): PesertaUrut => ({ id, namaPanggilan });
const LIMA = [p('m-eka', 'Eka'), p('m-arjuna', 'Arjuna'), p('m-dika', 'Dika'), p('m-citra', 'Citra'), p('m-budi', 'Budi')];

function jumlah(m: Map<string, { total: number }>): number {
  return [...m.values()].reduce((a, x) => a + x.total, 0);
}

describe('urutkanPeserta', () => {
  it('penalang di depan, sisanya urut nama', () => {
    expect(urutkanPeserta(LIMA, 'm-dika').map((x) => x.namaPanggilan)).toEqual(['Dika', 'Arjuna', 'Budi', 'Citra', 'Eka']);
  });

  it('penalang tidak ikut: urut nama saja', () => {
    expect(urutkanPeserta(LIMA, 'm-tidak-ikut').map((x) => x.namaPanggilan)).toEqual(['Arjuna', 'Budi', 'Citra', 'Dika', 'Eka']);
    expect(urutkanPeserta(LIMA, null)[0].namaPanggilan).toBe('Arjuna');
  });

  it('tidak bergantung urutan masukan', () => {
    expect(urutkanPeserta([...LIMA].reverse(), 'm-citra')).toEqual(urutkanPeserta(LIMA, 'm-citra'));
  });
});

describe('porsiRata', () => {
  it('total 150.000 untuk 5 peserta menghasilkan 5 porsi 30.000, jumlah pas', () => {
    const h = porsiRata(150_000, urutkanPeserta(LIMA, 'm-arjuna'));
    expect([...h.values()].map((x) => x.total)).toEqual([30_000, 30_000, 30_000, 30_000, 30_000]);
    expect(jumlah(h)).toBe(150_000);
  });

  it('total 100.000 untuk 3 peserta menghasilkan jumlah pas 100.000, sisa ke penalang', () => {
    const tiga = [p('m-budi', 'Budi'), p('m-arjuna', 'Arjuna'), p('m-citra', 'Citra')];
    const h = porsiRata(100_000, urutkanPeserta(tiga, 'm-citra'));
    expect(jumlah(h)).toBe(100_000);
    expect(h.get('m-citra')?.total).toBe(33_334);
    expect(h.get('m-arjuna')?.total).toBe(33_333);
    expect(h.get('m-budi')?.total).toBe(33_333);
  });

  it('penalang tidak ikut: sisa ke peserta pertama menurut nama', () => {
    const h = porsiRata(100_000, urutkanPeserta([p('m-citra', 'Citra'), p('m-budi', 'Budi'), p('m-dika', 'Dika')], null));
    expect(h.get('m-budi')?.total).toBe(33_334);
    expect(jumlah(h)).toBe(100_000);
  });

  it('tanpa pajak: subtotal sama dengan total dan pajakPorsi nol', () => {
    for (const x of porsiRata(90_000, urutkanPeserta(LIMA.slice(0, 3), null)).values()) {
      expect(x).toEqual({ subtotal: 30_000, pajakPorsi: 0, total: 30_000 });
    }
  });

  it('menolak total pecahan dan peserta kosong', () => {
    expect(() => porsiRata(1000.5, LIMA)).toThrow(TypeError);
    expect(() => porsiRata(1000, [])).toThrow(RangeError);
  });
});

describe('teksPratinjau', () => {
  it('habis dibagi', () => {
    expect(teksPratinjau(150_000, urutkanPeserta(LIMA, 'm-arjuna'), 'm-arjuna')).toBe('5 orang × Rp30.000');
  });

  it('tidak habis dibagi: menyebut penanggung sisa sesuai urutan server', () => {
    const tiga = [p('m-budi', 'Budi'), p('m-arjuna', 'Arjuna'), p('m-citra', 'Citra')];
    expect(teksPratinjau(100_000, urutkanPeserta(tiga, 'm-citra'), 'm-citra')).toBe('3 orang × Rp33.333, kamu Rp33.334');
    expect(teksPratinjau(100_000, urutkanPeserta(tiga, null), null)).toBe('3 orang × Rp33.333, Arjuna Rp33.334');
  });

  it('keadaan awal', () => {
    expect(teksPratinjau(100_000, [], null)).toBe('Pilih siapa yang ikut');
    expect(teksPratinjau(0, LIMA, null)).toBe('5 orang × Rp0');
  });
});

describe('tanggal', () => {
  it('hariIni memakai zona Asia/Jakarta', () => {
    expect(hariIni(new Date('2026-11-09T18:30:00Z'))).toBe('2026-11-10');
    expect(hariIni(new Date('2026-11-09T16:59:00Z'))).toBe('2026-11-09');
  });

  it('tanggalSah menolak tanggal yang tidak ada', () => {
    expect(tanggalSah('2026-11-09')).toBe(true);
    expect(tanggalSah('2026-02-30')).toBe(false);
    expect(tanggalSah('9-11-2026')).toBe(false);
  });

  it('judulBawaan', () => {
    expect(judulBawaan('2026-11-09')).toBe('Nongki 9 Nov');
  });
});
