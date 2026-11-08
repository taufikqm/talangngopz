// Verifikasi RLS jalur penalang (T-03). Sengaja memakai kunci anon + sesi akun uji,
// bukan service_role atau MCP: keduanya melewati RLS sehingga tidak membuktikan apa pun.
// Tes ini berjalan terhadap proyek Supabase nyata dan butuh kredensial di .env.local.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  // Lingkungan CI boleh menyuntik variabel langsung tanpa berkas.
}

function wajib(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return nilai;
}

const URL_SUPABASE = wajib('NEXT_PUBLIC_SUPABASE_URL');
const KUNCI_ANON = wajib('NEXT_PUBLIC_SUPABASE_ANON_KEY');

const PENANDA = `uji-rls-${Date.now()}`;
const NOMINAL = 30_000;
const BATAS_WAKTU = 30_000;

type Akun = {
  label: 'A' | 'B';
  db: SupabaseClient;
  uid: string;
  memberId: string;
  eventId: string;
  shareId: string;
  itemId: string;
};

async function masuk(label: 'A' | 'B'): Promise<Akun> {
  const db = createClient(URL_SUPABASE, KUNCI_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.signInWithPassword({
    email: wajib(`TEST_${label}_EMAIL`),
    password: wajib(`TEST_${label}_PASSWORD`),
  });
  if (error || !data.user) throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
  return { label, db, uid: data.user.id, memberId: '', eventId: '', shareId: '', itemId: '' };
}

async function sisip(db: SupabaseClient, tabel: string, baris: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(tabel).insert(baris).select('id').single();
  if (error || !data) throw new Error(`Sisip ${tabel} gagal: ${error?.message}`);
  return String(data.id);
}

async function siapkanData(akun: Akun): Promise<void> {
  const { db } = akun;
  akun.memberId = await sisip(db, 'members', { nama_panggilan: `${PENANDA}-${akun.label}` });
  akun.eventId = await sisip(db, 'events', {
    payer_id: akun.uid,
    judul: `${PENANDA}-${akun.label}`,
    subtotal: NOMINAL,
    total: NOMINAL,
  });
  // Satu porsi senilai total supaya pemicu invarian porsi lolos.
  akun.shareId = await sisip(db, 'shares', {
    event_id: akun.eventId,
    member_id: akun.memberId,
    subtotal: NOMINAL,
    total: NOMINAL,
  });
  akun.itemId = await sisip(db, 'bill_items', {
    event_id: akun.eventId,
    nama: `${PENANDA}-${akun.label}`,
    harga: NOMINAL,
    subtotal: NOMINAL,
  });
}

async function bersihkan(akun: Akun | undefined): Promise<string[]> {
  if (!akun) return [];
  const galat: string[] = [];
  if (akun.eventId) {
    // Cascade menghapus shares dan bill_items milik event ini.
    const { error } = await akun.db.from('events').delete().eq('id', akun.eventId);
    if (error) galat.push(`events ${akun.label}: ${error.message}`);
  }
  if (akun.memberId) {
    const { error } = await akun.db.from('members').delete().eq('id', akun.memberId);
    if (error) galat.push(`members ${akun.label}: ${error.message}`);
  }
  await akun.db.auth.signOut();
  return galat;
}

let A: Akun | undefined;
let B: Akun | undefined;

function akun(label: 'A' | 'B'): Akun {
  const a = label === 'A' ? A : B;
  if (!a) throw new Error(`Akun ${label} belum siap`);
  return a;
}

beforeAll(async () => {
  A = await masuk('A');
  B = await masuk('B');
  expect(A.uid).not.toBe(B.uid);
  await siapkanData(A);
  await siapkanData(B);
}, BATAS_WAKTU);

afterAll(async () => {
  const galat = [...(await bersihkan(A)), ...(await bersihkan(B))];
  if (galat.length > 0) throw new Error(`Pembersihan gagal:\n${galat.join('\n')}`);
}, BATAS_WAKTU);

describe.each([
  ['A', 'B'],
  ['B', 'A'],
] as const)('RLS: %s terhadap %s', (saya, lawan) => {
  describe('events', () => {
    it('select * hanya mengembalikan event milik sendiri', async () => {
      const s = akun(saya);
      const { data, error } = await s.db.from('events').select('id, payer_id');
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toContain(s.eventId);
      expect(data?.every((r) => r.payer_id === s.uid)).toBe(true);
    });

    it('select event lawan lewat id mengembalikan 0 baris', async () => {
      const { data, error } = await akun(saya).db.from('events').select('id').eq('id', akun(lawan).eventId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('update dan delete event lawan tidak mengubah apa pun', async () => {
      const s = akun(saya);
      const l = akun(lawan);
      const ubah = await s.db.from('events').update({ judul: 'bocor', total: 1 }).eq('id', l.eventId).select('id');
      expect(ubah.data ?? []).toEqual([]);
      const hapus = await s.db.from('events').delete().eq('id', l.eventId).select('id');
      expect(hapus.data ?? []).toEqual([]);

      const { data } = await l.db.from('events').select('judul, total').eq('id', l.eventId).single();
      expect(data).toEqual({ judul: `${PENANDA}-${lawan}`, total: NOMINAL });
    });
  });

  describe('shares', () => {
    it('select * hanya mengembalikan porsi dari event sendiri', async () => {
      const s = akun(saya);
      const { data, error } = await s.db.from('shares').select('id, event_id');
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toContain(s.shareId);
      expect(data?.map((r) => r.id)).not.toContain(akun(lawan).shareId);
      expect(data?.every((r) => r.event_id === s.eventId)).toBe(true);
    });

    it('select porsi lawan lewat id mengembalikan 0 baris', async () => {
      const { data, error } = await akun(saya).db.from('shares').select('id').eq('id', akun(lawan).shareId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('update dan delete porsi lawan tidak mengubah apa pun', async () => {
      const s = akun(saya);
      const l = akun(lawan);
      const ubah = await s.db.from('shares').update({ status: 'lunas' }).eq('id', l.shareId).select('id');
      expect(ubah.data ?? []).toEqual([]);
      const hapus = await s.db.from('shares').delete().eq('id', l.shareId).select('id');
      expect(hapus.data ?? []).toEqual([]);

      const { data } = await l.db.from('shares').select('status, total').eq('id', l.shareId).single();
      expect(data).toEqual({ status: 'belum_bayar', total: NOMINAL });
    });
  });

  describe('bill_items', () => {
    it('select * hanya mengembalikan item dari event sendiri', async () => {
      const s = akun(saya);
      const { data, error } = await s.db.from('bill_items').select('id, event_id');
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toContain(s.itemId);
      expect(data?.every((r) => r.event_id === s.eventId)).toBe(true);
    });

    it('select item lawan lewat id mengembalikan 0 baris', async () => {
      const { data, error } = await akun(saya).db.from('bill_items').select('id').eq('id', akun(lawan).itemId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('update dan delete item lawan tidak mengubah apa pun', async () => {
      const s = akun(saya);
      const l = akun(lawan);
      const ubah = await s.db.from('bill_items').update({ subtotal: 1 }).eq('id', l.itemId).select('id');
      expect(ubah.data ?? []).toEqual([]);
      const hapus = await s.db.from('bill_items').delete().eq('id', l.itemId).select('id');
      expect(hapus.data ?? []).toEqual([]);

      const { data } = await l.db.from('bill_items').select('subtotal').eq('id', l.itemId).single();
      expect(data).toEqual({ subtotal: NOMINAL });
    });
  });

  // Sengaja tanpa baris riwayat: membuatnya butuh ubah shares.status, dan baris yang
  // jadi tidak bisa dihapus (trg_riwayat_immutable menolak cascade), sehingga data uji
  // menetap permanen. Lagi pula catat_perubahan_status bukan security definer dan
  // payment_events tidak punya kebijakan INSERT, jadi ubah status lewat sesi penalang
  // kemungkinan ditolak RLS. Temuan ini diselesaikan di T-09.
  describe('payment_events', () => {
    it('select * hanya mengembalikan riwayat porsi sendiri', async () => {
      const s = akun(saya);
      const { data, error } = await s.db.from('payment_events').select('share_id');
      expect(error).toBeNull();
      expect(data?.every((r) => r.share_id === s.shareId)).toBe(true);
    });

    it('select riwayat porsi lawan mengembalikan 0 baris', async () => {
      const { data, error } = await akun(saya)
        .db.from('payment_events')
        .select('id')
        .eq('share_id', akun(lawan).shareId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('update dan delete riwayat porsi lawan ditolak', async () => {
      const s = akun(saya);
      const ubah = await s.db
        .from('payment_events')
        .update({ catatan: 'bocor' })
        .eq('share_id', akun(lawan).shareId)
        .select('id');
      expect(ubah.error).not.toBeNull();
      const hapus = await s.db.from('payment_events').delete().eq('share_id', akun(lawan).shareId).select('id');
      expect(hapus.error).not.toBeNull();
    });
  });

  describe('v_piutang', () => {
    it('select * hanya mengembalikan piutang milik sendiri', async () => {
      const s = akun(saya);
      const { data, error } = await s.db.from('v_piutang').select('member_id, payer_id, belum_bayar');
      expect(error).toBeNull();
      expect(data?.every((r) => r.payer_id === s.uid)).toBe(true);
      expect(data).toContainEqual({ member_id: s.memberId, payer_id: s.uid, belum_bayar: NOMINAL });
    });

    it('select piutang lawan lewat member_id mengembalikan 0 baris', async () => {
      const { data, error } = await akun(saya)
        .db.from('v_piutang')
        .select('member_id')
        .eq('member_id', akun(lawan).memberId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('update dan delete lewat view tidak mengubah porsi lawan', async () => {
      const s = akun(saya);
      const l = akun(lawan);
      const ubah = await s.db.from('v_piutang').update({ belum_bayar: 0 }).eq('member_id', l.memberId).select('member_id');
      expect(ubah.data ?? []).toEqual([]);
      const hapus = await s.db.from('v_piutang').delete().eq('member_id', l.memberId).select('member_id');
      expect(hapus.data ?? []).toEqual([]);

      const { data } = await l.db.from('v_piutang').select('belum_bayar').eq('member_id', l.memberId).single();
      expect(data).toEqual({ belum_bayar: NOMINAL });
    });
  });
});
