// Uji T-14: GET /api/cron/keepalive dipanggil langsung sebagai fungsi. Kueri benar-benar
// berjalan ke Supabase nyata (kunci anon); tidak ada data yang dibuat atau diubah.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// postgrest-js mengulang GET yang gagal jaringan beberapa kali dengan jeda, jadi kasus 500 butuh beberapa detik.
vi.setConfig({ testTimeout: 30_000 });

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

const { GET } = await import('./route');
const galat = vi.spyOn(console, 'error').mockImplementation(() => {});

const RAHASIA = 'rahasia-uji-keepalive-0123456789';
const asli = { rahasia: process.env.CRON_SECRET, url: process.env.NEXT_PUBLIC_SUPABASE_URL };

function panggil(authorization?: string) {
  return GET(new Request('http://localhost/api/cron/keepalive', { headers: authorization === undefined ? {} : { authorization } }));
}

beforeEach(() => {
  process.env.CRON_SECRET = RAHASIA;
  galat.mockClear();
});

afterEach(() => {
  if (asli.rahasia === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = asli.rahasia;
  process.env.NEXT_PUBLIC_SUPABASE_URL = asli.url;
});

describe('GET /api/cron/keepalive', () => {
  it('header benar: 200 { ok: true } tanpa data lain, tidak boleh disinggahkan', async () => {
    const r = await panggil(`Bearer ${RAHASIA}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });

  it('tanpa header, rahasia salah, skema salah, atau beda panjang: 401 dengan badan yang sama', async () => {
    const badan = { ok: false, pesan: 'Tidak diizinkan.' };
    for (const h of [undefined, '', 'Bearer', 'Bearer ', `Bearer ${RAHASIA}x`, `Bearer ${RAHASIA.slice(0, -1)}`, `Bearer ${'a'.repeat(RAHASIA.length)}`, RAHASIA, `Basic ${RAHASIA}`]) {
      const r = await panggil(h);
      expect(r.status, `header: ${h}`).toBe(401);
      expect(await r.json()).toEqual(badan);
    }
  });

  it('CRON_SECRET kosong atau tidak diisi: semua 401, termasuk "Bearer undefined" dan "Bearer ", dan galat dicatat', async () => {
    for (const nilai of [undefined, '']) {
      if (nilai === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = nilai;
      for (const h of ['Bearer undefined', 'Bearer ', 'Bearer', undefined]) {
        expect((await panggil(h)).status, `rahasia: ${nilai}, header: ${h}`).toBe(401);
      }
    }
    expect(galat).toHaveBeenCalledWith('keepalive: CRON_SECRET belum diisi');
  });

  it('401 tidak menjalankan kueri: URL basis data rusak tidak berpengaruh', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://basis-data-tidak-ada.invalid';
    expect((await panggil()).status).toBe(401);
    expect(galat).not.toHaveBeenCalled();
  });

  it('kueri gagal: 500 berpesan umum, tanpa rincian galat', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://basis-data-tidak-ada.invalid';
    const r = await panggil(`Bearer ${RAHASIA}`);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, pesan: 'Terjadi kesalahan.' });
    expect(galat).toHaveBeenCalled();
  });
});
