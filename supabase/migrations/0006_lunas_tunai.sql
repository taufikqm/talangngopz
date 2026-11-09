-- 0006_lunas_tunai.sql
-- Pelunasan tunai oleh penalang: satu porsi belum_bayar langsung lunas, tanpa klaim.
-- Butuh fungsi, bukan update dari aplikasi: lewat PostgREST, set_config dan update jatuh
-- di dua transaksi berbeda, sehingga pemicu riwayat mencatat aktor 'sistem'.
-- Pola set_config dan kode galat mengikuti buat_klaim dan putuskan_klaim di 0004.
-- catat_perubahan_status (0004) sudah membaca app.catatan, jadi tidak diubah.
--
-- Kode galat:
--   42501 tanpa sesi
--   22023 p_share kosong
--   P0002 porsi tidak ada, atau eventnya milik penalang lain
--   55000 porsi bukan belum_bayar (termasuk yang sedang di klaim menunggu, atau sudah lunas)

create or replace function lunasi_tunai(p_share uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_status share_status;
begin
  if v_uid is null then
    raise exception 'Harus masuk sebagai penalang' using errcode = '42501';
  end if;
  if p_share is null then
    raise exception 'Porsi wajib diisi' using errcode = '22023';
  end if;

  select s.status into v_status
  from shares s
    join events e on e.id = s.event_id
  where s.id = p_share and e.payer_id = v_uid
  for update of s;

  -- Porsi milik event penalang lain dilaporkan sama dengan porsi yang tidak ada.
  if not found then
    raise exception 'Porsi tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_status <> 'belum_bayar' then
    raise exception 'Porsi sudah diklaim atau lunas' using errcode = '55000';
  end if;

  perform set_config('app.aktor',    'penalang',  true);
  perform set_config('app.aktor_id', v_uid::text, true);
  perform set_config('app.catatan',  'tunai',     true);
  perform set_config('app.claim_id', '',          true);

  -- Pemicu 0003 mencatat riwayat dan mengunci event pada pelunasan pertama.
  update shares
     set status = 'lunas', settled_at = now()
   where id = p_share;
end;
$$;

revoke all on function lunasi_tunai(uuid) from public, anon;
grant execute on function lunasi_tunai(uuid) to authenticated, service_role;
