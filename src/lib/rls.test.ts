// Verifikasi RLS jalur penalang (T-03). Sengaja memakai kunci anon + sesi akun uji,
// bukan service_role atau MCP: keduanya melewati RLS sehingga tidak membuktikan apa pun.
// Tes ini berjalan terhadap proyek Supabase nyata dan butuh kredensial di .env.local.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Tiap tes memanggil jaringan beberapa kali; batas bawaan 5 detik pernah terlampaui saat
// jaringan lambat. Timeout bukan bukti RLS benar atau salah, jadi diberi ruang lebih.
vi.setConfig({ testTimeout: 30_000 });

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
  // Koneksi pertama ke Supabase sesekali melewati batas sambung 10 detik. Hanya galat
  // jaringan yang dicoba ulang; kredensial salah tetap langsung gagal.
  for (let percobaan = 1; ; percobaan++) {
    const { data, error } = await db.auth.signInWithPassword({
      email: wajib(`TEST_${label}_EMAIL`),
      password: wajib(`TEST_${label}_PASSWORD`),
    });
    if (!error && data.user) {
      return { label, db, uid: data.user.id, memberId: '', eventId: '', shareId: '', itemId: '' };
    }
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    }
  }
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

      const { data, error } = await l.db.from('events').select('judul, total').eq('id', l.eventId).single();
      expect(error).toBeNull();
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

      const { data, error } = await l.db.from('shares').select('status, total').eq('id', l.shareId).single();
      expect(error).toBeNull();
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

      const { data, error } = await l.db.from('bill_items').select('subtotal').eq('id', l.itemId).single();
      expect(error).toBeNull();
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

      const { data, error } = await l.db.from('v_piutang').select('belum_bayar').eq('member_id', l.memberId).single();
      expect(error).toBeNull();
      expect(data).toEqual({ belum_bayar: NOMINAL });
    });
  });
});

// ---------------------------------------------------------------------------
// T-07b: RLS klaim pembayaran, akun uji C terhadap D.
// Bukan A dan B: klaim meninggalkan payment_events sisip-saja sehingga event uji tidak
// pernah bisa dihapus, dan uji di atas mengandaikan A dan B hanya memuat datanya sendiri.
// service_role hanya dipakai untuk rpc('buat_klaim'); semua pemeriksaan memakai sesi.
// ---------------------------------------------------------------------------

type SesiKlaim = { label: 'C' | 'D'; db: SupabaseClient; uid: string; eventId: string; shareId: string; klaimId: string };

const PENANDA_KLAIM = `uji-klaim-rls-${Date.now()}`;
const NOMINAL_KLAIM = 20_000;
// Event berklaim terkunci riwayat sisip-saja (23514); anggota berporsi terkunci FK (23503).
const GALAT_BERSIH_KLAIM = new Set(['23514', '23503']);

async function masukKlaim(label: 'C' | 'D'): Promise<SesiKlaim> {
  const db = createClient(URL_SUPABASE, KUNCI_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let percobaan = 1; ; percobaan++) {
    const { data, error } = await db.auth.signInWithPassword({
      email: wajib(`TEST_${label}_EMAIL`),
      password: wajib(`TEST_${label}_PASSWORD`),
    });
    if (!error && data.user) return { label, db, uid: data.user.id, eventId: '', shareId: '', klaimId: '' };
    if (error?.name !== 'AuthRetryableFetchError' || percobaan >= 3) {
      throw new Error(`Masuk sebagai ${label} gagal: ${error?.message}`);
    }
  }
}

describe('RLS klaim (T-07b)', () => {
  let C: SesiKlaim | undefined;
  let D: SesiKlaim | undefined;
  let anggotaKlaim = '';
  const sesi = (label: 'C' | 'D'): SesiKlaim => {
    const s = label === 'C' ? C : D;
    if (!s) throw new Error(`Akun ${label} belum siap`);
    return s;
  };
  // C mengonfirmasi klaimnya; klaim D dibiarkan menunggu. Keduanya punya riwayat ber-claim_id.
  const STATUS_KLAIM = { C: 'dikonfirmasi', D: 'menunggu' } as const;

  beforeAll(async () => {
    C = await masukKlaim('C');
    D = await masukKlaim('D');
    expect(C.uid).not.toBe(D.uid);
    const peserta = createClient(URL_SUPABASE, wajib('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anggotaKlaim = await sisip(C.db, 'members', { nama_panggilan: `${PENANDA_KLAIM}-anggota` });
    for (const s of [C, D]) {
      s.eventId = await sisip(s.db, 'events', {
        payer_id: s.uid,
        judul: `${PENANDA_KLAIM}-${s.label}`,
        subtotal: NOMINAL_KLAIM,
        total: NOMINAL_KLAIM,
      });
      s.shareId = await sisip(s.db, 'shares', {
        event_id: s.eventId,
        member_id: anggotaKlaim,
        subtotal: NOMINAL_KLAIM,
        total: NOMINAL_KLAIM,
      });
      const { data, error } = await peserta.rpc('buat_klaim', {
        p_member: anggotaKlaim,
        p_shares: [s.shareId],
        p_waktu: '2026-11-09T07:20:00Z',
        p_pengirim: 'BCA a.n. Uji',
      });
      if (error || !data) throw new Error(`buat_klaim ${s.label} gagal: ${error?.code} ${error?.message}`);
      s.klaimId = String(data);
    }
    const konfirmasi = await C.db.rpc('putuskan_klaim', { p_claim: C.klaimId, p_keputusan: 'konfirmasi', p_alasan: null });
    if (konfirmasi.error) throw new Error(`putuskan_klaim C gagal: ${konfirmasi.error.code} ${konfirmasi.error.message}`);
  }, 60_000);

  afterAll(async () => {
    const galat: string[] = [];
    for (const s of [C, D]) {
      if (!s?.eventId) continue;
      const { error } = await s.db.from('events').delete().eq('id', s.eventId);
      if (error && !GALAT_BERSIH_KLAIM.has(error.code)) galat.push(`events ${s.label}: ${error.code} ${error.message}`);
    }
    if (C && anggotaKlaim) {
      const { error } = await C.db.from('members').delete().eq('id', anggotaKlaim);
      if (error && !GALAT_BERSIH_KLAIM.has(error.code)) galat.push(`members: ${error.code} ${error.message}`);
    }
    await C?.db.auth.signOut();
    await D?.db.auth.signOut();
    if (galat.length > 0) throw new Error(`Pembersihan klaim gagal:\n${galat.join('\n')}`);
  }, BATAS_WAKTU);

  describe.each([
    ['C', 'D'],
    ['D', 'C'],
  ] as const)('%s terhadap %s', (saya, lawan) => {
    it('payment_claims: select * hanya mengembalikan klaim untuk diri sendiri', async () => {
      const { data, error } = await sesi(saya).db.from('payment_claims').select('id, payer_id');
      expect(error).toBeNull();
      expect(data?.some((r) => r.id === sesi(saya).klaimId)).toBe(true);
      expect(data?.every((r) => r.payer_id === sesi(saya).uid)).toBe(true);
    });

    it('payment_claims dan payment_claim_shares lawan lewat id mengembalikan 0 baris', async () => {
      const s = sesi(saya);
      const klaim = await s.db.from('payment_claims').select('id').eq('id', sesi(lawan).klaimId);
      expect(klaim.error).toBeNull();
      expect(klaim.data).toEqual([]);
      const isi = await s.db.from('payment_claim_shares').select('claim_id').eq('claim_id', sesi(lawan).klaimId);
      expect(isi.error).toBeNull();
      expect(isi.data).toEqual([]);
    });

    it('payment_claim_shares: select * hanya berisi klaim untuk diri sendiri', async () => {
      const s = sesi(saya);
      const milik = await s.db.from('payment_claims').select('id');
      const isi = await s.db.from('payment_claim_shares').select('claim_id');
      expect(isi.error).toBeNull();
      const boleh = new Set((milik.data ?? []).map((r) => r.id));
      expect(isi.data?.every((r) => boleh.has(r.claim_id))).toBe(true);
    });

    it('payment_events: riwayat klaim lawan tidak terlihat, riwayat sendiri terlihat', async () => {
      const s = sesi(saya);
      const lawanKlaim = await s.db.from('payment_events').select('id').eq('claim_id', sesi(lawan).klaimId);
      expect(lawanKlaim.error).toBeNull();
      expect(lawanKlaim.data).toEqual([]);
      const lawanPorsi = await s.db.from('payment_events').select('id').eq('share_id', sesi(lawan).shareId);
      expect(lawanPorsi.error).toBeNull();
      expect(lawanPorsi.data).toEqual([]);
      const sendiri = await s.db.from('payment_events').select('id').eq('claim_id', s.klaimId);
      expect(sendiri.error).toBeNull();
      expect(sendiri.data?.length).toBeGreaterThan(0);
    });

    it('update dan delete klaim lawan tidak mengubah apa pun', async () => {
      const s = sesi(saya);
      const ubah = await s.db
        .from('payment_claims')
        .update({ status: 'ditolak', alasan_tolak: 'bocor' })
        .eq('id', sesi(lawan).klaimId)
        .select('id');
      expect(ubah.data ?? []).toEqual([]);
      const hapus = await s.db.from('payment_claims').delete().eq('id', sesi(lawan).klaimId).select('id');
      expect(hapus.data ?? []).toEqual([]);
      const { data, error } = await sesi(lawan)
        .db.from('payment_claims')
        .select('status, nominal')
        .eq('id', sesi(lawan).klaimId)
        .single();
      expect(error).toBeNull();
      expect(data).toEqual({ status: STATUS_KLAIM[lawan], nominal: NOMINAL_KLAIM });
    });

    it('update dan delete isi klaim lawan tidak mengubah apa pun', async () => {
      const s = sesi(saya);
      const ubah = await s.db
        .from('payment_claim_shares')
        .update({ share_id: s.shareId })
        .eq('claim_id', sesi(lawan).klaimId)
        .select('claim_id');
      expect(ubah.data ?? []).toEqual([]);
      const hapus = await s.db.from('payment_claim_shares').delete().eq('claim_id', sesi(lawan).klaimId).select('claim_id');
      expect(hapus.data ?? []).toEqual([]);
      const { data, error } = await sesi(lawan)
        .db.from('payment_claim_shares')
        .select('share_id')
        .eq('claim_id', sesi(lawan).klaimId);
      expect(error).toBeNull();
      expect(data).toEqual([{ share_id: sesi(lawan).shareId }]);
    });

    it('update dan delete riwayat klaim lawan ditolak', async () => {
      const s = sesi(saya);
      const sebelum = await sesi(lawan).db.from('payment_events').select('id').eq('claim_id', sesi(lawan).klaimId);
      const ubah = await s.db
        .from('payment_events')
        .update({ catatan: 'bocor' })
        .eq('claim_id', sesi(lawan).klaimId)
        .select('id');
      expect(ubah.error).not.toBeNull();
      const hapus = await s.db.from('payment_events').delete().eq('claim_id', sesi(lawan).klaimId).select('id');
      expect(hapus.error).not.toBeNull();
      const sesudah = await sesi(lawan).db.from('payment_events').select('id').eq('claim_id', sesi(lawan).klaimId);
      expect(sesudah.data).toEqual(sebelum.data);
    });

    it('insert klaim langsung, juga atas nama lawan, ditolak', async () => {
      const sisipan = await sesi(saya).db.from('payment_claims').insert({
        member_id: anggotaKlaim,
        payer_id: sesi(lawan).uid,
        nominal: 1,
        waktu_transfer: '2026-11-09T07:20:00Z',
        pengirim: 'bocor',
      });
      expect(sisipan.error).not.toBeNull();
    });
  });
});
