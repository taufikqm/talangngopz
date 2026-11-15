import { ImageResponse } from 'next/og';

// 180 untuk apple-touch-icon; iOS tidak membaca ikon dari manifest.
const UKURAN: Record<string, number> = { '180': 180, '192': 192, '512': 512 };

export function generateStaticParams() {
  return Object.keys(UKURAN).map((ukuran) => ({ ukuran }));
}

/**
 * Ikon dirender dari bentuk, bukan huruf, supaya tidak bergantung pada fon.
 * Huruf T putih di tengah latar aksi; seluruhnya di dalam zona aman ikon bulat (maskable).
 */
export async function GET(_request: Request, konteks: RouteContext<'/ikon/[ukuran]'>) {
  const { ukuran } = await konteks.params;
  const px = UKURAN[ukuran];
  if (!px) return new Response(null, { status: 404 });

  const lebar = Math.round(px * 0.5);
  const tebal = Math.round(px * 0.11);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B5C4D' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: lebar, height: lebar }}>
          <div style={{ width: lebar, height: tebal, background: '#FFFFFF', borderRadius: Math.round(tebal / 3) }} />
          <div style={{ width: tebal, height: lebar - tebal, background: '#FFFFFF', borderRadius: Math.round(tebal / 3) }} />
        </div>
      </div>
    ),
    { width: px, height: px, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
