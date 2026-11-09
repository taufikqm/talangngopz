import { describe, it, expect, vi, beforeEach } from 'vitest';

const ID = '2f1c3c1e-8a9b-4c2d-9e0f-1a2b3c4d5e6f';
const TOKEN_LAMA = 'a'.repeat(64);

let penalang: { id: string } | null = { id: 'uid-penalang' };
const db = { penanda: 'klien-sesi' };

vi.mock('@/lib/supabase/server', () => ({
  ambilPenalang: async () => penalang,
  buatKlienServer: async () => db,
}));

const sisipAnggota = vi.fn();
const ubahAnggota = vi.fn();
const hapusAnggotaDb = vi.fn();
const gantiTokenAkses = vi.fn();

vi.mock('@/lib/anggota', async (asli) => ({
  ...(await asli<typeof import('@/lib/anggota')>()),
  sisipAnggota: (...a: unknown[]) => sisipAnggota(...a),
  ubahAnggota: (...a: unknown[]) => ubahAnggota(...a),
  hapusAnggotaDb: (...a: unknown[]) => hapusAnggotaDb(...a),
  gantiTokenAkses: (...a: unknown[]) => gantiTokenAkses(...a),
}));

const { simpanAnggota, hapusAnggota, cabutToken } = await import('./anggota');
const galatKonsol = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  penalang = { id: 'uid-penalang' };
  process.env.SITE_URL = 'https://talang.contoh.id';
  for (const f of [sisipAnggota, ubahAnggota, hapusAnggotaDb, gantiTokenAkses]) f.mockReset();
  galatKonsol.mockClear();
});

describe('otorisasi', () => {
  it('tanpa sesi penalang, semua aksi ditolak tanpa menyentuh basis data', async () => {
    penalang = null;
    const hasil = [
      await simpanAnggota({ namaPanggilan: 'Dika' }),
      await hapusAnggota({ memberId: ID }),
      await cabutToken({ memberId: ID }),
    ];
    for (const h of hasil) expect(h).toMatchObject({ ok: false, kode: 'tidak_berwenang' });
    for (const f of [sisipAnggota, ubahAnggota, hapusAnggotaDb, gantiTokenAkses]) expect(f).not.toHaveBeenCalled();
  });

  it('memakai klien bersesi, bukan service_role', async () => {
    sisipAnggota.mockResolvedValue({ id: ID, namaPanggilan: 'Dika', whatsapp: null, aktif: true });
    await simpanAnggota({ namaPanggilan: 'Dika' });
    expect(sisipAnggota.mock.calls[0][0]).toBe(db);
  });
});

describe('simpanAnggota', () => {
  it('menolak nomor WhatsApp di luar format 62xxxxxxxxxx', async () => {
    const hasil = await simpanAnggota({ namaPanggilan: 'Dika', whatsapp: '081234567890' });
    expect(hasil).toMatchObject({ ok: false, kode: 'validasi', medan: { whatsapp: expect.any(String) } });
    expect(sisipAnggota).not.toHaveBeenCalled();
  });

  it('menormalkan nomor sebelum disimpan', async () => {
    sisipAnggota.mockResolvedValue({ id: ID, namaPanggilan: 'Dika', whatsapp: '6281234567890', aktif: true });
    await simpanAnggota({ namaPanggilan: ' Dika ', whatsapp: '+62 812-3456-7890' });
    expect(sisipAnggota).toHaveBeenCalledWith(db, { namaPanggilan: 'Dika', whatsapp: '6281234567890', aktif: undefined });
  });

  it('nonaktifkan tanpa mengirim whatsapp tidak menghapus nomornya', async () => {
    ubahAnggota.mockResolvedValue({ id: ID, namaPanggilan: 'Dika', whatsapp: '6281234567890', aktif: false });
    await simpanAnggota({ id: ID, namaPanggilan: 'Dika', aktif: false });
    expect(ubahAnggota).toHaveBeenCalledWith(db, ID, { namaPanggilan: 'Dika', whatsapp: undefined, aktif: false });
  });

  it('id bukan UUID dianggap tidak ditemukan', async () => {
    expect(await simpanAnggota({ id: 'x', namaPanggilan: 'Dika' })).toMatchObject({ ok: false, kode: 'tidak_ditemukan' });
  });
});

describe('hapusAnggota', () => {
  it('anggota berporsi (foreign key 23503) dibalas konflik dengan saran nonaktifkan', async () => {
    hapusAnggotaDb.mockRejectedValue({ code: '23503', message: 'violates foreign key constraint' });
    expect(await hapusAnggota({ memberId: ID })).toEqual({
      ok: false,
      kode: 'konflik',
      pesan: 'Anggota ini punya porsi. Nonaktifkan saja.',
      medan: undefined,
    });
  });

  it('anggota tanpa porsi terhapus', async () => {
    hapusAnggotaDb.mockResolvedValue(true);
    expect(await hapusAnggota({ memberId: ID })).toEqual({ ok: true, data: null });
  });
});

describe('cabutToken', () => {
  it('mengembalikan tautan dengan token baru', async () => {
    gantiTokenAkses.mockResolvedValue('b'.repeat(64));
    expect(await cabutToken({ memberId: ID })).toEqual({
      ok: true,
      data: { tautan: `https://talang.contoh.id/me/${'b'.repeat(64)}` },
    });
  });

  it('galat basis data tidak membocorkan token ke log maupun pesan', async () => {
    gantiTokenAkses.mockRejectedValue({
      code: '23505',
      message: `duplicate key value: (access_token)=(${TOKEN_LAMA})`,
      details: `Key (access_token)=(${TOKEN_LAMA}) already exists.`,
    });
    const hasil = await cabutToken({ memberId: ID });
    expect(hasil).toMatchObject({ ok: false, kode: 'internal' });
    expect(JSON.stringify(hasil)).not.toContain(TOKEN_LAMA);
    expect(JSON.stringify(galatKonsol.mock.calls)).not.toContain(TOKEN_LAMA);
  });
});
