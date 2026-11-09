import { describe, it, expect, afterEach } from 'vitest';
import { buatTokenAkses, idSah, normalisasiNama, normalisasiWhatsapp, tautanPribadi } from './anggota';

describe('normalisasiWhatsapp', () => {
  it.each([
    ['6281234567890', '6281234567890'],
    ['62 812-3456-7890', '6281234567890'],
    ['+6281234567890', '6281234567890'],
    ['6281234567', '6281234567'],
  ])('menerima %s', (masukan, hasil) => {
    expect(normalisasiWhatsapp(masukan)).toEqual({ ok: true, nilai: hasil });
  });

  it.each([['081234567890'], ['8123456789'], ['62812'], ['62812345678901234'], ['62abc4567890'], ['+1 555 0100']])(
    'menolak %s',
    (masukan) => {
      expect(normalisasiWhatsapp(masukan)).toEqual({ ok: false });
    },
  );

  it('kosong berarti tanpa nomor', () => {
    expect(normalisasiWhatsapp('')).toEqual({ ok: true, nilai: null });
    expect(normalisasiWhatsapp('   ')).toEqual({ ok: true, nilai: null });
    expect(normalisasiWhatsapp(null)).toEqual({ ok: true, nilai: null });
  });
});

describe('normalisasiNama', () => {
  it('merapikan spasi', () => {
    expect(normalisasiNama('  Dika   Pratama ')).toBe('Dika Pratama');
  });

  it('menolak kosong dan lebih dari 40 karakter', () => {
    expect(normalisasiNama('   ')).toBeNull();
    expect(normalisasiNama('x'.repeat(41))).toBeNull();
    expect(normalisasiNama('x'.repeat(40))).toBe('x'.repeat(40));
  });
});

describe('buatTokenAkses', () => {
  it('64 karakter heksadesimal tanpa tanda hubung, sama dengan default kolom', () => {
    expect(buatTokenAkses()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tidak berulang', () => {
    const token = new Set(Array.from({ length: 1000 }, buatTokenAkses));
    expect(token.size).toBe(1000);
  });
});

describe('tautanPribadi', () => {
  const asli = process.env.SITE_URL;
  afterEach(() => {
    process.env.SITE_URL = asli;
  });

  it('memakai SITE_URL tanpa garis miring ganda', () => {
    process.env.SITE_URL = 'https://talang.contoh.id/';
    expect(tautanPribadi('abc')).toBe('https://talang.contoh.id/me/abc');
  });

  it('galat SITE_URL kosong tidak menyebut token', () => {
    delete process.env.SITE_URL;
    expect(() => tautanPribadi('token-rahasia')).toThrow(/^SITE_URL belum diisi$/);
  });
});

describe('idSah', () => {
  it('hanya UUID', () => {
    expect(idSah('2f1c3c1e-8a9b-4c2d-9e0f-1a2b3c4d5e6f')).toBe(true);
    expect(idSah('1 or 1=1')).toBe(false);
    expect(idSah(undefined)).toBe(false);
  });
});
