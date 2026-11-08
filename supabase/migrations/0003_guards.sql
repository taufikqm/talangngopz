-- 0003_guards.sql
-- Pemicu penjaga. Ini lapis terakhir: berlaku juga untuk service_role,
-- yang melewati seluruh kebijakan RLS di 0002.

-- 1. Event yang sudah punya pelunasan tidak boleh berubah nominalnya.
create or replace function cegah_ubah_event_terkunci()
returns trigger
language plpgsql
as $$
begin
  if old.terkunci and (
       new.subtotal         is distinct from old.subtotal
    or new.pajak            is distinct from old.pajak
    or new.biaya_layanan    is distinct from old.biaya_layanan
    or new.diskon           is distinct from old.diskon
    or new.total            is distinct from old.total
    or new.mode             is distinct from old.mode
    or new.sudah_teralokasi is distinct from old.sudah_teralokasi
  ) then
    raise exception 'Event % terkunci: nominal tidak dapat diubah', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger trg_event_terkunci
  before update on events
  for each row execute function cegah_ubah_event_terkunci();

-- 2. Pelunasan pertama mengunci eventnya.
--    Hanya mengubah kolom terkunci, jadi lolos pemicu nomor 1.
create or replace function kunci_event_saat_lunas()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'lunas' and old.status is distinct from 'lunas' then
    update events set terkunci = true
    where id = new.event_id and not terkunci;
  end if;
  return new;
end;
$$;

create trigger trg_kunci_event
  after update on shares
  for each row execute function kunci_event_saat_lunas();

-- 3. Setiap perubahan status menghasilkan tepat satu baris riwayat.
--    Pemicu, bukan kode aplikasi, supaya tidak ada jalur yang bisa melewatinya.
--
--    Aplikasi WAJIB menetapkan konteks aktor di transaksi yang sama:
--      select set_config('app.aktor',    'penalang', true);
--      select set_config('app.aktor_id', '<uuid>',   true);
--      select set_config('app.catatan',  'transfer BCA 14:20', true);
--    Tanpa itu aktor tercatat sebagai 'sistem'.
create or replace function catat_perubahan_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    insert into payment_events (share_id, dari_status, ke_status, aktor, aktor_id, catatan, ip)
    values (
      new.id,
      old.status,
      new.status,
      coalesce(nullif(current_setting('app.aktor', true), ''), 'sistem'),
      nullif(current_setting('app.aktor_id', true), '')::uuid,
      nullif(current_setting('app.catatan',  true), ''),
      nullif(current_setting('app.ip',       true), '')::inet
    );
  end if;
  return new;
end;
$$;

create trigger trg_catat_status
  after update on shares
  for each row execute function catat_perubahan_status();

-- 4. Riwayat sisip-saja, termasuk untuk service_role.
create or replace function tolak_ubah_riwayat()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment_events bersifat sisip-saja'
    using errcode = 'check_violation';
end;
$$;

create trigger trg_riwayat_immutable
  before update or delete on payment_events
  for each row execute function tolak_ubah_riwayat();

-- 5. Invarian uang di tingkat basis data: jumlah porsi harus sama dengan total event.
--    Pemeriksaan ditangguhkan sampai akhir transaksi, karena porsi disisipkan bertahap.
create or replace function periksa_invarian_porsi()
returns trigger
language plpgsql
as $$
declare
  v_event uuid := coalesce(new.event_id, old.event_id);
  v_total bigint;
  v_jumlah bigint;
begin
  select total into v_total from events where id = v_event;
  if v_total is null then return null; end if;   -- event ikut terhapus

  select coalesce(sum(total), 0) into v_jumlah from shares where event_id = v_event;

  if v_jumlah <> v_total then
    raise exception 'Invarian gagal pada event %: jumlah porsi % tidak sama dengan total %',
      v_event, v_jumlah, v_total
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger trg_invarian_porsi
  after insert or update or delete on shares
  deferrable initially deferred
  for each row execute function periksa_invarian_porsi();
