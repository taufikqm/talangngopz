import { describe, it, expect } from 'vitest';
import { teksKlaim, waktuKlaim, waktuRiwayat } from './klaim-penalang';
import { susunRiwayat, type BarisPeristiwa } from './rincian-event';

describe('teks dan waktu klaim', () => {
  it('format kartu klaim persis seperti spesifikasi', () => {
    expect(
      teksKlaim({ id: 'k1', anggota: 'Dika', nominal: 235_000, waktu: '14:20', pengirim: 'BCA a.n. Dika', untuk: ['Futsal', 'Kopi Kenangan'] }),
    ).toBe('Dika · Rp235.000 · 14:20 · BCA a.n. Dika · untuk Futsal, Kopi Kenangan');
  });

  it('jam saja bila hari ini (zona Jakarta), tanggal bila hari lain', () => {
    // 07:20 UTC = 14:20 WIB.
    expect(waktuKlaim('2026-11-08T07:20:00Z', '2026-11-08')).toBe('14:20');
    expect(waktuKlaim('2026-11-08T07:20:00Z', '2026-11-10')).toBe('8 Nov 14:20');
  });

  it('melewati tengah malam WIB: 17:30 UTC sudah hari berikutnya di Jakarta', () => {
    expect(waktuKlaim('2026-11-08T17:30:00Z', '2026-11-09')).toBe('00:30');
    expect(waktuKlaim('2026-11-08T17:30:00Z', '2026-11-08')).toBe('9 Nov 00:30');
  });

  it('waktu riwayat selalu bertanggal', () => {
    expect(waktuRiwayat('2026-11-08T12:03:00Z')).toBe('8 Nov 19:03');
  });
});

let nomor = 0;
const peristiwa = (s: Partial<BarisPeristiwa> & Pick<BarisPeristiwa, 'aktor' | 'ke_status'>, nama = 'Dika'): BarisPeristiwa => ({
  id: ++nomor,
  dari_status: null,
  catatan: null,
  claim_id: null,
  created_at: '2026-11-08T12:03:00Z',
  shares: { members: { nama_panggilan: nama } },
  ...s,
});

describe('susunRiwayat', () => {
  it('melebur beberapa porsi satu klaim menjadi satu baris per keputusan', () => {
    const r = susunRiwayat(
      [
        peristiwa({ aktor: 'penalang', ke_status: 'lunas', claim_id: 'k1' }),
        peristiwa({ aktor: 'penalang', ke_status: 'lunas', claim_id: 'k1' }),
        peristiwa({ aktor: 'peserta', ke_status: 'menunggu_konfirmasi', claim_id: 'k1', created_at: '2026-11-08T07:20:00Z' }),
        peristiwa({ aktor: 'peserta', ke_status: 'menunggu_konfirmasi', claim_id: 'k1', created_at: '2026-11-08T07:20:00Z' }),
      ],
      'Arjuna',
    );
    expect(r.map((x) => `${x.teks} · ${x.waktu}`)).toEqual(['Arjuna konfirmasi klaim Dika · 8 Nov 19:03', 'Dika klaim bayar · 8 Nov 14:20']);
  });

  it('klaim ditolak membawa alasan; klaim baru atas porsi yang sama tetap baris tersendiri', () => {
    const r = susunRiwayat(
      [
        peristiwa({ aktor: 'peserta', ke_status: 'menunggu_konfirmasi', claim_id: 'k2' }),
        peristiwa({ aktor: 'penalang', ke_status: 'belum_bayar', claim_id: 'k1', catatan: 'transfernya tidak masuk' }),
        peristiwa({ aktor: 'peserta', ke_status: 'menunggu_konfirmasi', claim_id: 'k1' }),
      ],
      'Arjuna',
    );
    expect(r.map((x) => x.teks)).toEqual(['Dika klaim bayar', 'Arjuna tolak klaim Dika', 'Dika klaim bayar']);
    expect(r[1].alasan).toBe('transfernya tidak masuk');
    expect(r[0].alasan).toBeNull();
    expect(new Set(r.map((x) => x.kunci)).size).toBe(3);
  });

  it('pelunasan tunai (tanpa klaim) disebut tunai dan tidak diperlakukan sebagai konfirmasi', () => {
    const r = susunRiwayat([peristiwa({ aktor: 'penalang', ke_status: 'lunas', catatan: 'tunai' }, 'Citra')], 'Arjuna');
    expect(r[0].teks).toBe('Arjuna tandai lunas Citra (tunai)');
  });

  it('dua pelunasan tunai terpisah tidak dilebur', () => {
    const r = susunRiwayat(
      [peristiwa({ aktor: 'penalang', ke_status: 'lunas' }, 'Citra'), peristiwa({ aktor: 'penalang', ke_status: 'lunas' }, 'Budi')],
      'Arjuna',
    );
    expect(r).toHaveLength(2);
  });

  it('aktor sistem jatuh ke teks umum, bukan salah dibaca sebagai penalang', () => {
    const r = susunRiwayat([peristiwa({ aktor: 'sistem', ke_status: 'lunas' })], 'Arjuna');
    expect(r[0].teks).toBe('Sistem ubah status Dika ke lunas');
  });
});
