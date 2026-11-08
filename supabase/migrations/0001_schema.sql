-- 0001_schema.sql
-- Tabel inti. Nominal selalu bigint rupiah penuh, tidak pernah float.

create extension if not exists pgcrypto;

create type share_status as enum ('belum_bayar', 'menunggu_konfirmasi', 'lunas');
create type split_mode   as enum ('rata', 'manual', 'per_item');

-- Penalang yang punya akun. 1 sampai 3 orang dari 12 anggota.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  nama        text not null,
  bank        text,
  no_rekening text,
  qris_url    text,
  created_at  timestamptz not null default now()
);

-- 12 anggota sirkel. Sebagian besar tanpa akun.
create table members (
  id             uuid primary key default gen_random_uuid(),
  nama_panggilan text not null,
  whatsapp       text,
  profile_id     uuid references profiles(id) on delete set null,
  access_token   text not null unique default encode(gen_random_bytes(24), 'base64'),
  aktif          boolean not null default true,
  created_at     timestamptz not null default now()
);

create table events (
  id            uuid primary key default gen_random_uuid(),
  payer_id      uuid not null references profiles(id) on delete restrict,
  judul         text not null,
  tanggal       date not null default current_date,

  subtotal      bigint not null check (subtotal      >= 0),
  pajak         bigint not null default 0 check (pajak         >= 0),
  biaya_layanan bigint not null default 0 check (biaya_layanan >= 0),
  diskon        bigint not null default 0 check (diskon        >= 0),
  total         bigint not null check (total >= 0),

  mode          split_mode not null default 'rata',
  pembulatan_ke uuid references members(id),

  -- true bila nominal berasal dari impor dan sudah mengandung pajak.
  -- Saat true, rumus alokasi SRS 6.3 TIDAK dijalankan. Lihat AGENTS.md aturan 3.
  sudah_teralokasi boolean not null default false,

  share_token   text not null unique default encode(gen_random_bytes(16), 'base64'),
  terkunci      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Hanya terisi bila mode = 'per_item'.
create table bill_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  nama       text not null,
  harga      bigint not null check (harga >= 0),   -- harga satuan, tampilan saja
  subtotal   bigint not null check (subtotal >= 0), -- otoritatif
  qty        int not null default 1 check (qty > 0),
  gratis     boolean not null default false,
  penanggung uuid[] not null default '{}'
);

-- Tabel inti. Satu baris = utang satu orang pada satu event.
create table shares (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  member_id   uuid not null references members(id) on delete restrict,
  subtotal    bigint not null check (subtotal >= 0),
  pajak_porsi bigint not null default 0,
  total       bigint not null check (total >= 0),
  status      share_status not null default 'belum_bayar',
  claimed_at  timestamptz,
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (event_id, member_id)
);

-- Sisip-saja. Tidak pernah diubah atau dihapus. Lihat 0003_guards.sql.
create table payment_events (
  id          bigserial primary key,
  share_id    uuid not null references shares(id) on delete cascade,
  dari_status share_status,
  ke_status   share_status not null,
  aktor       text not null,   -- 'peserta' | 'penalang' | 'sistem'
  aktor_id    uuid,
  catatan     text,
  ip          inet,
  created_at  timestamptz not null default now()
);

create index on shares         (member_id, status);
create index on shares         (event_id);
create index on bill_items     (event_id);
create index on payment_events (share_id, created_at desc);
create index on events         (payer_id, tanggal desc);

-- Dasbor membaca tampilan ini agar logika penjumlahan tidak tersebar.
create view v_piutang as
select
  s.member_id,
  m.nama_panggilan,
  e.payer_id,
  coalesce(sum(s.total) filter (where s.status = 'belum_bayar'), 0)         as belum_bayar,
  coalesce(sum(s.total) filter (where s.status = 'menunggu_konfirmasi'), 0) as menunggu,
  count(*) filter (where s.status <> 'lunas')                               as jumlah_event,
  max(current_date - e.tanggal) filter (where s.status <> 'lunas')          as umur_tertua_hari
from shares s
  join events  e on e.id = s.event_id
  join members m on m.id = s.member_id
group by s.member_id, m.nama_panggilan, e.payer_id;
