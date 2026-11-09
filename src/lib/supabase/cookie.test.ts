import { describe, it, expect } from 'vitest';
import { opsiCookieSesi, UMUR_SESI_DETIK } from './cookie';

describe('opsiCookieSesi', () => {
  it('menimpa maxAge 400 hari bawaan @supabase/ssr menjadi 30 hari', () => {
    const opsi = opsiCookieSesi({ maxAge: 400 * 24 * 60 * 60, path: '/' });
    expect(opsi.maxAge).toBe(60 * 60 * 24 * 30);
    expect(UMUR_SESI_DETIK).toBe(2_592_000);
  });

  it('mempertahankan maxAge 0 supaya keluar benar-benar menghapus cookie', () => {
    expect(opsiCookieSesi({ maxAge: 0 }).maxAge).toBe(0);
  });

  it('cookie sesi tidak terbaca JavaScript peramban', () => {
    const opsi = opsiCookieSesi({ httpOnly: false, sameSite: 'none' });
    expect(opsi.httpOnly).toBe(true);
    expect(opsi.sameSite).toBe('lax');
  });
});
