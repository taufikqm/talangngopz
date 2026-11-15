// Service worker talangan. Sengaja kecil: satu-satunya yang disinggahkan adalah halaman luring
// dan ikonnya. Tidak ada HTML dasbor, tidak ada respons API, tidak ada halaman peserta
// (/me, /bill) di cache, karena salinan basi menampilkan utang yang sudah lunas atau sebaliknya.
// Berubah di sini = naikkan VERSI supaya cache lama dibuang saat aktivasi.
const VERSI = 'talangan-v1';
const HALAMAN_LURING = '/offline.html';
const BERKAS_AWAL = [HALAMAN_LURING, '/ikon/192'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSI)
      .then((cache) => cache.addAll(BERKAS_AWAL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nama) => Promise.all(nama.filter((n) => n.startsWith('talangan-') && n !== VERSI).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Hanya navigasi yang disentuh, dan hasil jaringannya tidak pernah ditulis ke cache.
// Permintaan lain (API, Server Action, RSC, aset) lewat tanpa respondWith.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).catch(() => caches.match(HALAMAN_LURING)));
});
