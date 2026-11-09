import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { envSupabasePublik, opsiCookieSesi } from '@/lib/supabase/cookie';
import { GalatPemuat, tokenDikenal, type JenisToken } from '@/lib/publik';

/** Rute yang boleh dibuka tanpa sesi penalang. */
function rutePublik(path: string): boolean {
  return path === '/login';
}

const RUTE_PESERTA = /^\/(me|bill)(?:\/|$)/;
const TOKEN_DI_RUTE = /^\/(?:me|bill)\/([^/]+)\/?$/;

const HEADER_PESERTA = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
} as const;

/**
 * Halaman peserta tidak memakai sesi. Token diperiksa di sini, bukan di halaman:
 * notFound() di dalam Suspense terjadi setelah streaming dimulai dan berstatus 200.
 * Token tidak dikenal, berformat salah, atau rute bersarang mendapat 404 yang sama.
 */
async function jagaRutePeserta(request: NextRequest, jenis: JenisToken): Promise<NextResponse> {
  const token = TOKEN_DI_RUTE.exec(request.nextUrl.pathname)?.[1] ?? '';
  let dikenal: boolean;
  try {
    dikenal = await tokenDikenal(jenis, token);
  } catch (e) {
    // Galat basis data diteruskan ke halaman, yang menampilkan pesan gagal muat sendiri.
    console.error('proxy rute peserta: pemeriksaan token gagal', e instanceof GalatPemuat ? e.kode : 'tidak_dikenal');
    dikenal = true;
  }
  const respons = dikenal
    ? NextResponse.next()
    : NextResponse.rewrite(new URL('/_tidak-ditemukan', request.url), { status: 404 });
  for (const [nama, nilai] of Object.entries(HEADER_PESERTA)) respons.headers.set(nama, nilai);
  return respons;
}

export async function proxy(request: NextRequest) {
  const peserta = RUTE_PESERTA.exec(request.nextUrl.pathname);
  if (peserta) return jagaRutePeserta(request, peserta[1] as JenisToken);

  let respons = NextResponse.next({ request });
  const { url, kunciAnon } = envSupabasePublik();

  const db = createServerClient(url, kunciAnon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (daftar) => {
        // Token segar harus terlihat oleh halaman (lewat request) dan disimpan peramban
        // (lewat respons); tanpa keduanya penyegaran terjadi berulang di setiap permintaan.
        for (const { name, value } of daftar) request.cookies.set(name, value);
        respons = NextResponse.next({ request });
        for (const { name, value, options } of daftar) {
          respons.cookies.set(name, value, opsiCookieSesi(options));
        }
      },
    },
  });

  const { data: klaim } = await db.auth.getClaims();
  const uid = klaim?.claims.sub;
  const path = request.nextUrl.pathname;

  if (rutePublik(path)) return respons;
  if (!uid) return keLogin(request, respons);

  const { data: profil } = await db.from('profiles').select('id').eq('id', uid).maybeSingle();
  if (!profil) {
    await db.auth.signOut();
    return keLogin(request, respons);
  }
  return respons;
}

function keLogin(request: NextRequest, respons: NextResponse): NextResponse {
  const alih = NextResponse.redirect(new URL('/login', request.url));
  // Bawa cookie hasil penyegaran atau penghapusan sesi ke respons pengalihan.
  for (const cookie of respons.cookies.getAll()) alih.cookies.set(cookie);
  return alih;
}

export const config = {
  // API bertoken tidak memakai sesi penalang, jadi tidak dilewatkan ke sini. Halaman
  // peserta (/bill, /me) lewat untuk pemeriksaan token, tanpa menyentuh sesi.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
