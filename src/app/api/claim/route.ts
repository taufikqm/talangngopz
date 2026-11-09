import { NextResponse } from 'next/server';
import { gagal, sukses, type Hasil, type KlaimKeluaran, type KodeGalat } from '@/lib/contracts';
import { buatBatasLaju } from '@/lib/batas-laju';
import { GalatPemuat, memberDariToken } from '@/lib/publik';
import { buatKlienService } from '@/lib/supabase/service';
import { waktuTransferSah } from '@/lib/waktu-transfer';

/**
 * POST /api/claim. Jalur peserta: tanpa sesi, otorisasi lewat token /me.
 * Proxy tidak melewati /api, jadi seluruh pemeriksaan ada di sini. buat_klaim hanya
 * bisa dieksekusi service_role dan membatasi porsinya sendiri ke anggota pemegang token.
 * Token tidak pernah ditulis ke log atau respons.
 */

const MAKS_PORSI = 20;
const PANJANG_PENGIRIM_MAKS = 100;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const batasLaju = buatBatasLaju({ maks: 10, jendelaMs: 60_000, kapasitas: 1_000 });

const STATUS: Record<KodeGalat, number> = {
  tidak_berwenang: 401,
  tidak_ditemukan: 404,
  validasi: 400,
  tidak_seimbang: 400,
  event_terkunci: 409,
  konflik: 409,
  batas_laju: 429,
  internal: 500,
};

// Satu pesan untuk token tak dikenal dan porsi milik orang lain, supaya tidak bisa dibedakan.
const TIDAK_DITEMUKAN = 'Tagihan ini tidak ditemukan. Minta tautan baru ke penalang.';

const KODE_BASIS_DATA: Record<string, [KodeGalat, string]> = {
  P0002: ['tidak_ditemukan', TIDAK_DITEMUKAN],
  '55000': ['konflik', 'Sebagian event sudah diklaim atau lunas. Halaman dimuat ulang.'],
  '22023': ['validasi', 'Klaim tidak sah. Satu transfer hanya untuk satu penalang.'],
  '42501': ['tidak_berwenang', 'Tidak diizinkan.'],
};

function jawab<T>(hasil: Hasil<T>, header: Record<string, string> = {}): NextResponse {
  const status = hasil.ok ? 200 : STATUS[hasil.kode];
  return NextResponse.json(hasil, { status, headers: { 'Cache-Control': 'private, no-store', ...header } });
}

type Tervalidasi = { token: string; shareIds: string[]; waktuTransfer: string; pengirim: string };

function validasi(masukan: unknown): Tervalidasi | Record<string, string> {
  const m = (typeof masukan === 'object' && masukan !== null ? masukan : {}) as Record<string, unknown>;
  const medan: Record<string, string> = {};
  const shareIds = Array.isArray(m.shareIds) ? m.shareIds : [];
  if (
    shareIds.length < 1 ||
    shareIds.length > MAKS_PORSI ||
    !shareIds.every((id): id is string => typeof id === 'string' && POLA_UUID.test(id)) ||
    new Set(shareIds.map((id) => String(id).toLowerCase())).size !== shareIds.length
  ) {
    medan.shareIds = `Pilih 1 sampai ${MAKS_PORSI} event.`;
  }
  if (!waktuTransferSah(m.waktuTransfer)) medan.waktuTransfer = 'Jam transfer tidak sah.';
  const pengirim = typeof m.pengirim === 'string' ? m.pengirim.trim() : '';
  if (pengirim.length < 1 || pengirim.length > PANJANG_PENGIRIM_MAKS) {
    medan.pengirim = `Isi nama pengirim atau bank, maksimal ${PANJANG_PENGIRIM_MAKS} karakter.`;
  }
  if (Object.keys(medan).length > 0) return medan;
  return {
    token: String(m.token),
    shareIds: shareIds as string[],
    waktuTransfer: m.waktuTransfer as string,
    pengirim,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  let masukan: unknown;
  try {
    masukan = await request.json();
  } catch {
    return jawab(gagal('validasi', 'Permintaan tidak sah.'));
  }
  const token = typeof (masukan as { token?: unknown } | null)?.token === 'string' ? (masukan as { token: string }).token : '';

  // Batas laju sebelum menyentuh basis data. Token kosong berbagi satu ember.
  const laju = batasLaju.periksa(token);
  if (!laju.boleh) {
    return jawab(gagal('batas_laju', `Terlalu sering mengirim. Coba lagi dalam ${laju.cobaLagiDetik} detik.`), {
      'Retry-After': String(laju.cobaLagiDetik),
    });
  }

  const v = validasi(masukan);
  if (!('token' in v)) return jawab(gagal('validasi', 'Periksa isian klaim.', v));

  try {
    const memberId = await memberDariToken(v.token);
    if (!memberId) return jawab(gagal('tidak_ditemukan', TIDAK_DITEMUKAN));

    const db = buatKlienService();
    const { data, error } = await db.rpc('buat_klaim', {
      p_member: memberId,
      p_shares: v.shareIds,
      p_waktu: v.waktuTransfer,
      p_pengirim: v.pengirim,
    });
    if (error) {
      const peta = error.code ? KODE_BASIS_DATA[error.code] : undefined;
      if (peta) return jawab(gagal(peta[0], peta[1]));
      console.error('POST /api/claim: buat_klaim gagal', error.code ?? 'tidak_dikenal');
      return jawab(gagal('internal', 'Klaim gagal dikirim. Coba lagi sebentar lagi.'));
    }
    const claimId = String(data);
    const klaim = await db.from('payment_claims').select('nominal').eq('id', claimId).eq('member_id', memberId).single<{ nominal: number }>();
    if (klaim.error) {
      console.error('POST /api/claim: membaca klaim gagal', klaim.error.code ?? 'tidak_dikenal');
      return jawab(gagal('internal', 'Klaim terkirim, tetapi gagal dibaca ulang. Muat ulang halaman.'));
    }
    return jawab(sukses<KlaimKeluaran>({ claimId, nominal: Number(klaim.data.nominal) }));
  } catch (e) {
    console.error('POST /api/claim: galat', e instanceof GalatPemuat ? e.kode : 'tidak_dikenal');
    return jawab(gagal('internal', 'Klaim gagal dikirim. Coba lagi sebentar lagi.'));
  }
}
