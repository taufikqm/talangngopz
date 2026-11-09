import { describe, it, expect } from 'vitest';
import { labelUmur, selisihHari, susunDasbor } from './dasbor';

describe('umur piutang: selisih tanggal kalender', () => {
  it('batas 0, 14 (tanpa "sudah"), dan 15 hari ("sudah 15 hari")', () => {
    expect(labelUmur(selisihHari('2026-11-10', '2026-11-10'))).toEqual({ teks: '0 hari', lama: false });
    expect(labelUmur(selisihHari('2026-10-27', '2026-11-10'))).toEqual({ teks: '14 hari', lama: false });
    expect(labelUmur(selisihHari('2026-10-26', '2026-11-10'))).toEqual({ teks: 'sudah 15 hari', lama: true });
  });

  it('dihitung per tanggal, bukan kelipatan 24 jam; melewati bulan dan tahun', () => {
    expect(selisihHari('2026-11-09', '2026-11-10')).toBe(1);
    expect(selisihHari('2026-12-31', '2027-01-01')).toBe(1);
    expect(selisihHari('2026-02-28', '2026-03-01')).toBe(1);
    expect(selisihHari('2028-02-28', '2028-03-01')).toBe(2);
  });
});

const view = (member_id: string, nama_panggilan: string, belum_bayar: number, menunggu = 0, jumlah_event = 1) => ({
  member_id,
  nama_panggilan,
  belum_bayar,
  menunggu,
  jumlah_event,
});
const porsi = (id: string, member_id: string, total: number, tanggal: string, status: 'belum_bayar' | 'menunggu_konfirmasi' | 'lunas' = 'belum_bayar') => ({
  id,
  member_id,
  total,
  status,
  events: { judul: `ev-${id}`, tanggal },
});

describe('susunDasbor', () => {
  it('kosong bila penalang belum punya event; lunas bila ada event tapi tidak ada piutang', () => {
    expect(susunDasbor([], [], 0, 0, '2026-11-10')).toEqual({ keadaan: 'kosong', klaimMenunggu: 0 });
    expect(susunDasbor([view('m1', 'Budi', 0)], [], 0, 3, '2026-11-10')).toEqual({ keadaan: 'lunas', klaimMenunggu: 0 });
  });

  it('menyaring anggota berpiutang Rp0 dan porsi lunas', () => {
    const d = susunDasbor(
      [view('m1', 'Budi', 0), view('m2', 'Citra', 10_000)],
      [porsi('s1', 'm1', 5_000, '2026-11-01', 'lunas'), porsi('s2', 'm2', 10_000, '2026-11-05')],
      0,
      2,
      '2026-11-10',
    );
    expect(d.keadaan).toBe('piutang');
    if (d.keadaan !== 'piutang') return;
    expect(d.anggota.map((a) => a.nama)).toEqual(['Citra']);
    expect(d.anggota[0].rincian.map((r) => r.shareId)).toEqual(['s2']);
  });

  it('urut dari piutang terbesar; total = belum bayar + menunggu; umur dari tanggal event tertua', () => {
    const d = susunDasbor(
      [view('m1', 'Budi', 10_000, 0, 1), view('m2', 'Citra', 5_000, 20_000, 2)],
      [porsi('s1', 'm1', 10_000, '2026-11-08'), porsi('s2', 'm2', 5_000, '2026-10-20'), porsi('s3', 'm2', 20_000, '2026-11-09', 'menunggu_konfirmasi')],
      1,
      2,
      '2026-11-10',
    );
    if (d.keadaan !== 'piutang') throw new Error('harus piutang');
    expect(d.totalPiutang).toBe(35_000);
    expect(d.klaimMenunggu).toBe(1);
    expect(d.anggota.map((a) => [a.nama, a.total, a.umurHari])).toEqual([
      ['Citra', 25_000, 21],
      ['Budi', 10_000, 2],
    ]);
  });
});
