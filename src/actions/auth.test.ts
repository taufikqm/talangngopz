import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithPassword = vi.fn();
const signOut = vi.fn();
const cariProfil = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  buatKlienServer: async () => ({
    auth: { signInWithPassword, signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: cariProfil }) }) }),
  }),
}));

const { masuk, keluar } = await import('./auth');

const GAGAL = { ok: false, kode: 'tidak_berwenang', pesan: 'Surel atau password salah.', medan: undefined };
const KREDENSIAL = { email: 'arjuna@contoh.id', password: 'rahasia-benar' };

beforeEach(() => {
  signInWithPassword.mockReset().mockResolvedValue({ data: { user: { id: 'uid-arjuna' } }, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  cariProfil.mockReset().mockResolvedValue({ data: { id: 'uid-arjuna' }, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('masuk', () => {
  it('berhasil bila kredensial benar dan pengguna ada di profiles', async () => {
    expect(await masuk({ ...KREDENSIAL, email: '  Arjuna@Contoh.ID ' })).toEqual({ ok: true, data: null });
    expect(signInWithPassword).toHaveBeenCalledWith(KREDENSIAL);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('password salah dan surel tak dikenal menghasilkan galat yang sama persis', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials', status: 400 },
    });
    const sandiSalah = await masuk({ ...KREDENSIAL, password: 'salah' });
    const surelAsing = await masuk({ email: 'asing@contoh.id', password: 'apa-saja' });
    expect(sandiSalah).toEqual(GAGAL);
    expect(surelAsing).toEqual(GAGAL);
  });

  it('pengguna auth tanpa baris di profiles: sesi diakhiri, galat sama persis', async () => {
    cariProfil.mockResolvedValue({ data: null, error: null });
    expect(await masuk(KREDENSIAL)).toEqual(GAGAL);
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('galat auth apa pun (mis. surel belum dikonfirmasi) memakai pesan yang sama', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_not_confirmed', status: 400 },
    });
    expect(await masuk(KREDENSIAL)).toEqual(GAGAL);
  });

  it('masukan kosong ditolak dengan pesan yang sama tanpa memanggil auth', async () => {
    expect(await masuk({ email: '', password: '' })).toEqual(GAGAL);
    expect(await masuk({ email: 'arjuna@contoh.id', password: '' })).toEqual(GAGAL);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('galat tak terduga menjadi galat internal, bukan lemparan', async () => {
    signInWithPassword.mockRejectedValue(new Error('koneksi putus'));
    const hasil = await masuk(KREDENSIAL);
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.kode).toBe('internal');
  });
});

describe('keluar', () => {
  it('mengakhiri sesi', async () => {
    expect(await keluar()).toEqual({ ok: true, data: null });
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('galat signOut menjadi galat internal', async () => {
    signOut.mockResolvedValue({ error: new Error('gagal') });
    const hasil = await keluar();
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.kode).toBe('internal');
  });
});

describe('batas rahasia', () => {
  const akar = join(process.cwd(), 'src');

  function semuaBerkas(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? semuaBerkas(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  it('service.ts diawali penjaga server-only', () => {
    const isi = readFileSync(join(akar, 'lib/supabase/service.ts'), 'utf8');
    expect(isi.split('\n')[0].trim()).toBe("import 'server-only';");
  });

  it('tidak ada variabel NEXT_PUBLIC_ berisi kunci rahasia di kode', () => {
    for (const berkas of semuaBerkas(akar)) {
      const isi = readFileSync(berkas, 'utf8');
      expect(isi, berkas).not.toMatch(/NEXT_PUBLIC_\w*(SERVICE|SECRET|ROLE)/);
    }
  });

  it('service.ts tidak diimpor dari komponen klien', () => {
    for (const berkas of semuaBerkas(akar)) {
      const isi = readFileSync(berkas, 'utf8');
      if (/^['"]use client['"]/m.test(isi)) expect(isi, berkas).not.toMatch(/supabase\/service/);
    }
  });
});
