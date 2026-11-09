import { describe, it, expect } from 'vitest';
import { buatBatasLaju } from './batas-laju';

function jam(mulai = 1_000_000) {
  let t = mulai;
  return { sekarang: () => t, maju: (ms: number) => (t += ms) };
}

describe('batas laju 10 per menit per kunci', () => {
  it('10 permintaan lolos, ke-11 ditolak dengan sisa detik jendela', () => {
    const j = jam();
    const b = buatBatasLaju({ maks: 10, jendelaMs: 60_000, kapasitas: 100, sekarang: j.sekarang });
    for (let i = 0; i < 10; i++) expect(b.periksa('tok')).toEqual({ boleh: true });
    j.maju(15_000);
    expect(b.periksa('tok')).toEqual({ boleh: false, cobaLagiDetik: 45 });
  });

  it('jendela baru setelah 60 detik', () => {
    const j = jam();
    const b = buatBatasLaju({ maks: 10, jendelaMs: 60_000, kapasitas: 100, sekarang: j.sekarang });
    for (let i = 0; i < 11; i++) b.periksa('tok');
    j.maju(60_000);
    expect(b.periksa('tok')).toEqual({ boleh: true });
  });

  it('kunci berbeda dihitung terpisah', () => {
    const b = buatBatasLaju({ maks: 1, jendelaMs: 60_000, kapasitas: 100, sekarang: jam().sekarang });
    expect(b.periksa('a').boleh).toBe(true);
    expect(b.periksa('a').boleh).toBe(false);
    expect(b.periksa('b').boleh).toBe(true);
  });

  it('Map tidak tumbuh melewati kapasitas oleh token acak', () => {
    const j = jam();
    const b = buatBatasLaju({ maks: 10, jendelaMs: 60_000, kapasitas: 50, sekarang: j.sekarang });
    for (let i = 0; i < 5_000; i++) {
      b.periksa(`acak-${i}`);
      j.maju(1);
    }
    expect(b.ukuran).toBeLessThanOrEqual(50);
  });

  it('entri kedaluwarsa dibuang lebih dulu daripada entri yang masih aktif', () => {
    const j = jam();
    const b = buatBatasLaju({ maks: 1, jendelaMs: 60_000, kapasitas: 3, sekarang: j.sekarang });
    b.periksa('lama-1');
    b.periksa('lama-2');
    j.maju(61_000);
    b.periksa('aktif');
    expect(b.periksa('aktif').boleh).toBe(false);
    b.periksa('baru'); // memicu perapian: dua entri lama dibuang, 'aktif' tetap diingat
    expect(b.periksa('aktif').boleh).toBe(false);
  });
});
