import type { MetadataRoute } from 'next';

// Warna sama dengan --color-tl-aksi dan --color-tl-latar di globals.css; manifest tidak bisa membaca CSS.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Talangan',
    short_name: 'Talangan',
    description: 'Pencatat talangan sirkel',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'id',
    background_color: '#F6F4EE',
    theme_color: '#0B5C4D',
    // Satu gambar melayani dua tujuan: latar penuh sampai tepi dan huruf di zona aman 80%.
    icons: [
      { src: '/ikon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/ikon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/ikon/192', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/ikon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
