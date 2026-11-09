import { describe, it, expect } from 'vitest';
import { buangPorsiNol, porsiRata, teksPratinjau, urutkanPeserta } from './event';

const peserta = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `m-${String(i).padStart(2, '0')}`, namaPanggilan: `Orang ${String(i).padStart(2, '0')}` }));
const jumlah = (m: Map<string, { total: number }>) => [...m.values()].reduce((a, p) => a + p.total, 0);
const rataTanpaNol = (total: number, urut: ReturnType<typeof urutkanPeserta>) => buangPorsiNol(porsiRata(total, urut), urut);

describe('mode rata: porsi Rp0 tidak dibuat', () => {
  it('total 5 untuk 12 peserta: hanya peserta bernominal di atas 0 punya porsi, jumlah tetap 5', () => {
    const urut = urutkanPeserta(peserta(12), 'm-05');
    const { porsi, urut: tersisa } = rataTanpaNol(5, urut);
    expect([...porsi.values()].every((p) => p.total > 0)).toBe(true);
    expect(jumlah(porsi)).toBe(5);
    // Seluruh sisa jatuh ke peserta pertama, yaitu penalang.
    expect([...porsi.keys()]).toEqual(['m-05']);
    expect(tersisa.map((p) => p.id)).toEqual(['m-05']);
  });

  it('penalang tidak ikut: Rp5 jatuh ke peserta pertama menurut nama', () => {
    const { porsi } = rataTanpaNol(5, urutkanPeserta(peserta(12), null));
    expect(new Map([...porsi].map(([id, p]) => [id, p.total]))).toEqual(new Map([['m-00', 5]]));
  });

  it('150.000 untuk 5 dan 100.000 untuk 3 tidak berubah', () => {
    const lima = rataTanpaNol(150_000, urutkanPeserta(peserta(5), 'm-00')).porsi;
    expect([...lima.values()].map((p) => p.total)).toEqual([30_000, 30_000, 30_000, 30_000, 30_000]);
    const tiga = rataTanpaNol(100_000, urutkanPeserta(peserta(3), 'm-00')).porsi;
    expect([...tiga.values()].map((p) => p.total)).toEqual([33_334, 33_333, 33_333]);
  });
});

describe('pratinjau mode rata saat total lebih kecil dari jumlah peserta', () => {
  it('penalang ikut: menyebut "kamu"', () => {
    expect(teksPratinjau(5, urutkanPeserta(peserta(12), 'm-05'), 'm-05')).toBe(
      'Total lebih kecil dari jumlah orang: hanya kamu yang kebagian Rp5',
    );
  });

  it('penalang tidak ikut: menyebut peserta pertama menurut nama, bukan "kamu"', () => {
    const teks = teksPratinjau(5, urutkanPeserta(peserta(12), null), 'm-99');
    expect(teks).toBe('Total lebih kecil dari jumlah orang: hanya Orang 00 yang kebagian Rp5');
    expect(teks).not.toContain('kamu');
  });

  it('tidak menampilkan angka Rp0 yang menyesatkan', () => {
    expect(teksPratinjau(5, urutkanPeserta(peserta(12), null), null)).not.toContain('Rp0');
  });

  it('kasus lama tetap sama', () => {
    expect(teksPratinjau(150_000, urutkanPeserta(peserta(5), 'm-00'), 'm-00')).toBe('5 orang × Rp30.000');
    expect(teksPratinjau(100_000, urutkanPeserta(peserta(3), 'm-00'), 'm-00')).toBe('3 orang × Rp33.333, kamu Rp33.334');
    expect(teksPratinjau(0, urutkanPeserta(peserta(5), null), null)).toBe('5 orang × Rp0');
  });
});
