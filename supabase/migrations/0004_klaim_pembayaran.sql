-- 0004_klaim_pembayaran.sql
-- Satu transfer = satu klaim. Lihat docs/perubahan-klaim-pembayaran.md (T-07b).
-- Tidak mengubah 0001-0003; hanya menambah dan membuat ulang catat_perubahan_status.

-- ---------------------------------------------------------------------------
-- 1. Tabel dan kolom
-- ---------------------------------------------------------------------------

create type klaim_status as enum ('menunggu', 'dikonfirmasi', 'ditolak');

create table payment_claims (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references members(id) on delete restrict,
  payer_id       uuid not null references profiles(id) on delete restrict,
  nominal        bigint not null check (nominal > 0),
  waktu_transfer timestamptz not null,
  pengirim       text not null check (btrim(pengirim) <> '' and length(pengirim) <= 100),
  status         klaim_status not null default 'menunggu',
  alasan_tolak   text,
  claimed_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references profiles(id),
  -- Klaim ditolak wajib beralasan; klaim yang belum diputuskan belum punya pemutus.
  check (status <> 'ditolak' or nullif(btrim(alasan_tolak), '') is not null),
  check ((status = 'menunggu') = (decided_at is null))
);

create table payment_claim_shares (
  claim_id uuid not null references payment_claims(id) on delete cascade,
  share_id uuid not null references shares(id) on delete cascade,
  primary key (claim_id, share_id)
);

alter table payment_events add column claim_id uuid null references payment_claims(id);

create index on payment_claims       (payer_id, status);
create index on payment_claims       (member_id);
create index on payment_claim_shares (share_id);
create index on payment_events       (claim_id);

-- ---------------------------------------------------------------------------
-- 2. Pencatat riwayat (temuan T-03)
--    Dibuat ulang security definer: tanpa itu insert ke payment_events dari sesi
--    penalang ditolak RLS, karena 0002 sengaja tidak memberi kebijakan insert.
--    Isinya sama dengan 0003 ditambah claim_id dari konteks transaksi.
-- ---------------------------------------------------------------------------

create or replace function catat_perubahan_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into payment_events (share_id, dari_status, ke_status, aktor, aktor_id, catatan, ip, claim_id)
    values (
      new.id,
      old.status,
      new.status,
      coalesce(nullif(current_setting('app.aktor', true), ''), 'sistem'),
      nullif(current_setting('app.aktor_id', true), '')::uuid,
      nullif(current_setting('app.catatan',  true), ''),
      nullif(current_setting('app.ip',       true), '')::inet,
      nullif(current_setting('app.claim_id', true), '')::uuid
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Invarian klaim, dijaga basis data (berlaku juga untuk service_role)
-- ---------------------------------------------------------------------------

-- Klaim ditolak adalah riwayat: porsinya boleh diubah dan diklaim lagi, jadi
-- invarian hanya mengikat klaim menunggu dan dikonfirmasi.
-- security definer: pemeriksaan "satu share satu klaim aktif" harus melihat klaim
-- semua penalang, bukan hanya yang terlihat lewat RLS pemanggil.
create or replace function periksa_klaim(p_claim uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k        payment_claims;
  v_jumlah bigint;
  v_porsi  int;
  v_asing  int;
begin
  select * into k from payment_claims where id = p_claim;
  if not found or k.status = 'ditolak' then return; end if;

  select count(*),
         coalesce(sum(s.total), 0),
         count(*) filter (where s.member_id <> k.member_id or e.payer_id <> k.payer_id)
    into v_porsi, v_jumlah, v_asing
  from payment_claim_shares pcs
    join shares s on s.id = pcs.share_id
    join events e on e.id = s.event_id
  where pcs.claim_id = p_claim;

  if v_porsi = 0 then
    raise exception 'Klaim % tidak berisi porsi', p_claim using errcode = 'check_violation';
  end if;
  if v_asing > 0 then
    raise exception 'Klaim % berisi porsi anggota atau penalang lain', p_claim using errcode = 'check_violation';
  end if;
  if v_jumlah <> k.nominal then
    raise exception 'Invarian gagal pada klaim %: nominal % tidak sama dengan jumlah porsi %',
      p_claim, k.nominal, v_jumlah using errcode = 'check_violation';
  end if;
  if exists (
    select 1
    from payment_claim_shares a
      join payment_claim_shares b on b.share_id = a.share_id and b.claim_id <> a.claim_id
      join payment_claims c on c.id = b.claim_id
    where a.claim_id = p_claim and c.status in ('menunggu', 'dikonfirmasi')
  ) then
    raise exception 'Porsi pada klaim % sudah ada di klaim aktif lain', p_claim using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function periksa_klaim_dari_klaim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform periksa_klaim(new.id);
  return null;
end;
$$;

create or replace function periksa_klaim_dari_isi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform periksa_klaim(coalesce(new.claim_id, old.claim_id));
  return null;
end;
$$;

create or replace function periksa_klaim_dari_porsi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim uuid;
begin
  for v_claim in select claim_id from payment_claim_shares where share_id = new.id loop
    perform periksa_klaim(v_claim);
  end loop;
  return null;
end;
$$;

-- Ditangguhkan: klaim disisipkan sebelum isinya, dalam satu transaksi.
create constraint trigger trg_invarian_klaim
  after insert or update on payment_claims
  deferrable initially deferred
  for each row execute function periksa_klaim_dari_klaim();

create constraint trigger trg_invarian_klaim_isi
  after insert or delete on payment_claim_shares
  deferrable initially deferred
  for each row execute function periksa_klaim_dari_isi();

create constraint trigger trg_invarian_klaim_porsi
  after update of total, member_id, event_id on shares
  deferrable initially deferred
  for each row execute function periksa_klaim_dari_porsi();

-- Klaim hanya bergerak menunggu -> dikonfirmasi atau ditolak, sekali saja, dan
-- isi transfernya tidak boleh diubah. Berlaku juga untuk service_role.
create or replace function jaga_status_klaim()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'menunggu' or new.status = 'menunggu' then
    raise exception 'Klaim % tidak dapat diubah dari % ke %', old.id, old.status, new.status
      using errcode = 'check_violation';
  end if;
  if new.member_id      is distinct from old.member_id
  or new.payer_id       is distinct from old.payer_id
  or new.nominal        is distinct from old.nominal
  or new.waktu_transfer is distinct from old.waktu_transfer
  or new.pengirim       is distinct from old.pengirim
  or new.claimed_at     is distinct from old.claimed_at then
    raise exception 'Isi klaim % tidak dapat diubah', old.id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_status_klaim
  before update on payment_claims
  for each row execute function jaga_status_klaim();

-- ---------------------------------------------------------------------------
-- 4. Fungsi klaim
--    Kode galat dipakai T-09 untuk memetakan respons:
--      P0002 porsi/klaim tidak ditemukan atau bukan milik pemanggil  -> 404
--      55000 porsi sudah diklaim atau lunas; klaim sudah diputuskan  -> 409
--      22023 masukan tidak sah                                       -> 400
--      42501 tanpa sesi                                              -> 401
-- ---------------------------------------------------------------------------

create or replace function buat_klaim(p_member uuid, p_shares uuid[], p_waktu timestamptz, p_pengirim text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jumlah_id int := coalesce(cardinality(p_shares), 0);
  v_claim     uuid;
  v_ditemukan int;
  v_terpakai  int;
  v_penalang  int;
  v_payer     uuid;
  v_nominal   bigint;
begin
  if p_member is null or p_waktu is null or nullif(btrim(p_pengirim), '') is null then
    raise exception 'Jam transfer dan pengirim wajib diisi' using errcode = '22023';
  end if;
  if v_jumlah_id = 0 or array_position(p_shares, null) is not null then
    raise exception 'Pilih minimal satu porsi' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_shares) x) <> v_jumlah_id then
    raise exception 'Porsi tidak boleh berulang' using errcode = '22023';
  end if;

  -- Kunci berurutan id: dua klaim serentak atas porsi yang sama saling menunggu,
  -- lalu yang kedua melihat status menunggu_konfirmasi dan ditolak.
  perform 1 from shares where id = any(p_shares) order by id for update;

  select count(*),
         count(*) filter (where s.status <> 'belum_bayar'),
         count(distinct e.payer_id),
         min(e.payer_id::text)::uuid,
         coalesce(sum(s.total), 0)
    into v_ditemukan, v_terpakai, v_penalang, v_payer, v_nominal
  from shares s
    join events e on e.id = s.event_id
  where s.id = any(p_shares) and s.member_id = p_member;

  -- Porsi milik anggota lain diperlakukan sama dengan porsi yang tidak ada.
  if v_ditemukan <> v_jumlah_id then
    raise exception 'Porsi tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_terpakai > 0 then
    raise exception 'Porsi sudah diklaim atau lunas' using errcode = '55000';
  end if;
  if v_penalang <> 1 then
    raise exception 'Satu klaim hanya untuk satu penalang' using errcode = '22023';
  end if;

  insert into payment_claims (member_id, payer_id, nominal, waktu_transfer, pengirim)
  values (p_member, v_payer, v_nominal, p_waktu, btrim(p_pengirim))
  returning id into v_claim;

  insert into payment_claim_shares (claim_id, share_id)
  select v_claim, x from unnest(p_shares) x;

  perform set_config('app.aktor',    'peserta',        true);
  perform set_config('app.aktor_id', p_member::text,   true);
  perform set_config('app.claim_id', v_claim::text,    true);
  perform set_config('app.catatan',  '',               true);

  update shares
     set status = 'menunggu_konfirmasi', claimed_at = now()
   where id = any(p_shares);

  return v_claim;
end;
$$;

create or replace function putuskan_klaim(p_claim uuid, p_keputusan text, p_alasan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  k     payment_claims;
begin
  if v_uid is null then
    raise exception 'Harus masuk sebagai penalang' using errcode = '42501';
  end if;

  select * into k from payment_claims where id = p_claim for update;
  -- Klaim penalang lain dilaporkan sama dengan klaim yang tidak ada.
  if not found or k.payer_id <> v_uid then
    raise exception 'Klaim tidak ditemukan' using errcode = 'P0002';
  end if;
  if k.status <> 'menunggu' then
    raise exception 'Klaim sudah diputuskan' using errcode = '55000';
  end if;
  if p_keputusan is null or p_keputusan not in ('konfirmasi', 'tolak') then
    raise exception 'Keputusan harus konfirmasi atau tolak' using errcode = '22023';
  end if;
  if p_keputusan = 'tolak' and nullif(btrim(p_alasan), '') is null then
    raise exception 'Alasan penolakan wajib diisi' using errcode = '22023';
  end if;

  perform set_config('app.aktor',    'penalang',   true);
  perform set_config('app.aktor_id', v_uid::text,  true);
  perform set_config('app.claim_id', p_claim::text, true);
  perform set_config('app.catatan',
    case when p_keputusan = 'tolak' then btrim(p_alasan) else '' end, true);

  -- Hanya porsi yang masih menunggu: porsi yang sudah dilunasi manual tidak
  -- boleh dikembalikan ke belum_bayar oleh penolakan klaim.
  if p_keputusan = 'konfirmasi' then
    update shares
       set status = 'lunas', settled_at = now()
     where id in (select share_id from payment_claim_shares where claim_id = p_claim)
       and status = 'menunggu_konfirmasi';
    update payment_claims
       set status = 'dikonfirmasi', decided_at = now(), decided_by = v_uid
     where id = p_claim;
  else
    update shares
       set status = 'belum_bayar', claimed_at = null
     where id in (select share_id from payment_claim_shares where claim_id = p_claim)
       and status = 'menunggu_konfirmasi';
    update payment_claims
       set status = 'ditolak', alasan_tolak = btrim(p_alasan), decided_at = now(), decided_by = v_uid
     where id = p_claim;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Hak eksekusi
--    Supabase memberi EXECUTE ke anon dan authenticated secara bawaan untuk fungsi
--    baru di skema public, jadi pencabutan harus menyebut keduanya.
-- ---------------------------------------------------------------------------

revoke all on function buat_klaim(uuid, uuid[], timestamptz, text) from public, anon, authenticated;
grant execute on function buat_klaim(uuid, uuid[], timestamptz, text) to service_role;

revoke all on function putuskan_klaim(uuid, text, text) from public, anon;
grant execute on function putuskan_klaim(uuid, text, text) to authenticated;

-- Pembantu security definer tidak boleh dipanggil langsung lewat RPC. Fungsi
-- bertipe trigger tidak perlu dicabut: Postgres menolak memanggilnya di luar pemicu.
revoke all on function periksa_klaim(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RLS: penalang hanya membaca klaim untuknya. Tidak ada kebijakan tulis;
--    semua perubahan lewat buat_klaim dan putuskan_klaim.
-- ---------------------------------------------------------------------------

alter table payment_claims       enable row level security;
alter table payment_claim_shares enable row level security;

create policy klaim_baca on payment_claims
  for select using (payer_id = auth.uid());

create policy klaim_porsi_baca on payment_claim_shares
  for select using (exists (
    select 1 from payment_claims c
    where c.id = payment_claim_shares.claim_id and c.payer_id = auth.uid()
  ));

revoke insert, update, delete, truncate on payment_claims       from anon, authenticated;
revoke insert, update, delete, truncate on payment_claim_shares from anon, authenticated;
