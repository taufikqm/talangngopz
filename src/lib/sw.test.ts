// Menjalankan public/sw.js apa adanya di sandbox node:vm dengan self, caches, dan fetch palsu.
// Yang dijaga: halaman peserta dan data bersesi tidak pernah masuk cache.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';

type Pendengar = (event: Record<string, unknown>) => void;

function muatSw(jaringan: (url: string) => Promise<string>) {
  const pendengar: Record<string, Pendengar> = {};
  const ditulis: string[] = [];
  const dihapus: string[] = [];
  let cacheAda = ['talangan-v0', 'talangan-v1', 'milik-lain'];
  const cache = {
    addAll: async (daftar: string[]) => void ditulis.push(...daftar),
    put: async (url: string) => void ditulis.push(url),
  };
  const sandbox = {
    self: {
      location: { origin: 'https://talangan.test' },
      addEventListener: (nama: string, fn: Pendengar) => void (pendengar[nama] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => cacheAda,
      delete: async (n: string) => {
        dihapus.push(n);
        cacheAda = cacheAda.filter((x) => x !== n);
        return true;
      },
      match: async (url: string) => `CACHE:${url}`,
    },
    fetch: (r: { url: string }) => jaringan(r.url),
    URL,
    Promise,
  };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), sandbox);
  return { pendengar, ditulis, dihapus };
}

async function kirim(
  sw: ReturnType<typeof muatSw>,
  request: { url: string; method?: string; mode?: string },
): Promise<{ ditangani: boolean; hasil?: unknown }> {
  let janji: Promise<unknown> | undefined;
  sw.pendengar.fetch({ request: { method: 'GET', mode: 'navigate', ...request }, respondWith: (p: Promise<unknown>) => (janji = p) });
  return janji ? { ditangani: true, hasil: await janji } : { ditangani: false };
}

const daring = async (url: string) => `JARINGAN:${url}`;
const putus = async () => {
  throw new TypeError('Failed to fetch');
};

describe('public/sw.js', () => {
  it('instalasi hanya menyinggahkan halaman luring dan ikon', async () => {
    const sw = muatSw(daring);
    await new Promise<void>((selesai) => sw.pendengar.install({ waitUntil: (p: Promise<unknown>) => void p.then(() => selesai()) }));
    expect(sw.ditulis).toEqual(['/offline.html', '/ikon/192']);
  });

  it('aktivasi membuang cache talangan versi lama saja', async () => {
    const sw = muatSw(daring);
    await new Promise<void>((selesai) => sw.pendengar.activate({ waitUntil: (p: Promise<unknown>) => void p.then(() => selesai()) }));
    expect(sw.dihapus).toEqual(['talangan-v0']);
  });

  it('navigasi daring: lewat jaringan, tanpa menulis ke cache', async () => {
    const sw = muatSw(daring);
    for (const jalur of ['/', '/event/abc', '/me/token-rahasia', '/bill/token-rahasia']) {
      const h = await kirim(sw, { url: `https://talangan.test${jalur}` });
      expect(h).toEqual({ ditangani: true, hasil: `JARINGAN:https://talangan.test${jalur}` });
    }
    expect(sw.ditulis).toEqual([]);
  });

  it('navigasi luring: halaman luring, termasuk untuk halaman peserta', async () => {
    const sw = muatSw(putus);
    for (const jalur of ['/', '/me/token-rahasia', '/bill/token-rahasia']) {
      const h = await kirim(sw, { url: `https://talangan.test${jalur}` });
      expect(h).toEqual({ ditangani: true, hasil: 'CACHE:/offline.html' });
    }
  });

  it('bukan navigasi, bukan GET, atau beda asal: tidak disentuh sama sekali', async () => {
    const sw = muatSw(daring);
    const kasus = [
      { url: 'https://talangan.test/api/claim', mode: 'cors' },
      { url: 'https://talangan.test/me/token-rahasia', mode: 'cors' },
      { url: 'https://talangan.test/_next/static/chunks/a.js', mode: 'no-cors' },
      { url: 'https://talangan.test/', method: 'POST' },
      { url: 'https://luar.test/', mode: 'navigate' },
    ];
    for (const k of kasus) expect((await kirim(sw, k)).ditangani).toBe(false);
    expect(sw.ditulis).toEqual([]);
  });
});
