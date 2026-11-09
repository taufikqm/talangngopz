import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { envSupabasePublik, opsiCookieSesi } from '@/lib/supabase/cookie';

/** Rute yang boleh dibuka tanpa sesi penalang. */
function rutePublik(path: string): boolean {
  return path === '/login';
}

export async function proxy(request: NextRequest) {
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
  // Halaman peserta (/bill, /me) dan API bertoken tidak memakai sesi penalang,
  // jadi tidak dilewatkan ke sini sama sekali.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|bill/|me/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
