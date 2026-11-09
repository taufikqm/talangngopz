import type { SupabaseClient } from '@supabase/supabase-js';
import type { Anggota } from './contracts';

// ---------------------------------------------------------------------------
// Murni
// ---------------------------------------------------------------------------

const POLA_WHATSAPP = /^62\d{8,13}$/;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PANJANG_NAMA_MAKS = 40;

export type HasilWhatsapp = { ok: true; nilai: string | null } | { ok: false };

/** Kosong berarti tanpa nomor. Spasi, tanda hubung, dan `+` di depan diabaikan. */
export function normalisasiWhatsapp(masukan: string | null | undefined): HasilWhatsapp {
  const bersih = (masukan ?? '').replace(/[\s-]/g, '').replace(/^\+/, '');
  if (bersih === '') return { ok: true, nilai: null };
  return POLA_WHATSAPP.test(bersih) ? { ok: true, nilai: bersih } : { ok: false };
}

export function normalisasiNama(masukan: string | null | undefined): string | null {
  const nama = (masukan ?? '').trim().replace(/\s+/g, ' ');
  return nama.length >= 1 && nama.length <= PANJANG_NAMA_MAKS ? nama : null;
}

export function idSah(id: unknown): id is string {
  return typeof id === 'string' && POLA_UUID.test(id);
}

/** Format sama dengan default kolom members.access_token: dua UUID tanpa tanda hubung. */
export function buatTokenAkses(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

export function tautanPribadi(token: string): string {
  const situs = process.env.SITE_URL;
  if (!situs) throw new Error('SITE_URL belum diisi');
  return `${situs.replace(/\/+$/, '')}/me/${token}`;
}

// ---------------------------------------------------------------------------
// Basis data. Menerima klien bersesi supaya RLS tetap berlaku; galat Postgrest
// dilempar apa adanya dan dipetakan ke Hasil oleh Server Action.
// ---------------------------------------------------------------------------

type BarisMember = {
  id: string;
  nama_panggilan: string;
  whatsapp: string | null;
  aktif: boolean;
};

const KOLOM_ANGGOTA = 'id, nama_panggilan, whatsapp, aktif';

function keAnggota(b: BarisMember): Anggota {
  return { id: b.id, namaPanggilan: b.nama_panggilan, whatsapp: b.whatsapp, aktif: b.aktif };
}

export type AnggotaDenganToken = Anggota & { accessToken: string; punyaPorsi: boolean };

export async function daftarAnggota(db: SupabaseClient): Promise<AnggotaDenganToken[]> {
  const [anggota, porsi] = await Promise.all([
    db
      .from('members')
      .select(`${KOLOM_ANGGOTA}, access_token`)
      .order('nama_panggilan')
      .returns<(BarisMember & { access_token: string })[]>(),
    db.from('shares').select('member_id').returns<{ member_id: string }[]>(),
  ]);
  if (anggota.error) throw anggota.error;
  if (porsi.error) throw porsi.error;

  const berporsi = new Set(porsi.data.map((p) => p.member_id));
  return anggota.data.map((b) => ({
    ...keAnggota(b),
    accessToken: b.access_token,
    punyaPorsi: berporsi.has(b.id),
  }));
}

export async function sisipAnggota(
  db: SupabaseClient,
  m: { namaPanggilan: string; whatsapp: string | null; aktif?: boolean },
): Promise<Anggota> {
  const { data, error } = await db
    .from('members')
    .insert({ nama_panggilan: m.namaPanggilan, whatsapp: m.whatsapp, aktif: m.aktif ?? true })
    .select(KOLOM_ANGGOTA)
    .single<BarisMember>();
  if (error) throw error;
  return keAnggota(data);
}

/** null bila anggota tidak ditemukan. */
export async function ubahAnggota(
  db: SupabaseClient,
  id: string,
  m: { namaPanggilan: string; whatsapp?: string | null; aktif?: boolean },
): Promise<Anggota | null> {
  const ubahan: Partial<BarisMember> = { nama_panggilan: m.namaPanggilan };
  if (m.whatsapp !== undefined) ubahan.whatsapp = m.whatsapp;
  if (m.aktif !== undefined) ubahan.aktif = m.aktif;

  const { data, error } = await db
    .from('members')
    .update(ubahan)
    .eq('id', id)
    .select(KOLOM_ANGGOTA)
    .maybeSingle<BarisMember>();
  if (error) throw error;
  return data ? keAnggota(data) : null;
}

/** false bila anggota tidak ditemukan. Anggota berporsi melempar galat 23503. */
export async function hapusAnggotaDb(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db.from('members').delete().eq('id', id).select('id');
  if (error) throw error;
  return data.length > 0;
}

/**
 * Mengganti token, bukan menambah: token lama tidak tersisa di tabel mana pun,
 * jadi tautan lama tidak bisa dicocokkan lagi. null bila anggota tidak ditemukan.
 */
export async function gantiTokenAkses(db: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await db
    .from('members')
    .update({ access_token: buatTokenAkses() })
    .eq('id', id)
    .select('access_token')
    .maybeSingle<{ access_token: string }>();
  if (error) throw error;
  return data?.access_token ?? null;
}
