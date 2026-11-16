// Proxy dengan klien Supabase tiruan: yang diuji hanya keputusan rute (tayang, rewrite, atau alih).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

let uid: string | null;
let adaProfil: boolean;
const signOut = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: uid ? { claims: { sub: uid } } : null }), signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: adaProfil ? { id: uid } : null }) }) }) }),
  }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-uji';
const { proxy } = await import('./proxy');

const panggil = (jalur: string) => proxy(new NextRequest(`http://talangan.test${jalur}`));
const lolos = (r: Response) => r.headers.get('x-middleware-next') === '1';

beforeEach(() => {
  uid = null;
  adaProfil = true;
  signOut.mockReset();
});

describe('proxy: pengunjung tanpa sesi', () => {
  it('"/" ditayangkan sebagai halaman sambutan di URL yang sama, bukan dialihkan ke login', async () => {
    const r = await panggil('/');
    expect(r.status).toBe(200);
    expect(r.headers.get('x-middleware-rewrite')).toBe('http://talangan.test/sambutan');
    expect(r.headers.get('location')).toBeNull();
  });

  it.each(['/anggota', '/klaim', '/event/baru', '/event/abc'])('%s tetap dialihkan ke /login', async (jalur) => {
    const r = await panggil(jalur);
    expect(r.status).toBe(307);
    expect(r.headers.get('location')).toBe('http://talangan.test/login');
  });

  it('/login dan /sambutan terbuka tanpa sesi', async () => {
    expect(lolos(await panggil('/login'))).toBe(true);
    expect(lolos(await panggil('/sambutan'))).toBe(true);
  });
});

describe('proxy: penalang', () => {
  it('dengan sesi dan profil: "/" dan rute penalang lolos apa adanya', async () => {
    uid = 'u-1';
    for (const jalur of ['/', '/anggota', '/klaim']) expect(lolos(await panggil(jalur))).toBe(true);
  });

  it('sesi tanpa baris profiles: sesi diakhiri, lalu diperlakukan sebagai tanpa sesi', async () => {
    uid = 'u-asing';
    adaProfil = false;
    const beranda = await panggil('/');
    expect(beranda.headers.get('x-middleware-rewrite')).toBe('http://talangan.test/sambutan');
    const anggota = await panggil('/anggota');
    expect(anggota.headers.get('location')).toBe('http://talangan.test/login');
    expect(signOut).toHaveBeenCalledTimes(2);
  });
});
