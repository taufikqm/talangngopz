-- 0002_rls.sql
-- RLS melindungi jalur penalang (kunci anon + sesi).
-- Jalur peserta memakai service_role yang MELEWATI seluruh kebijakan di sini,
-- sehingga pembatasan barisnya ditulis manual di kode. Lihat AGENTS.md aturan 8.

alter table profiles       enable row level security;
alter table members        enable row level security;
alter table events         enable row level security;
alter table bill_items     enable row level security;
alter table shares         enable row level security;
alter table payment_events enable row level security;

-- Penalang hanya melihat profilnya sendiri.
create policy profil_sendiri on profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Seluruh penalang berbagi satu daftar anggota sirkel.
create policy anggota_baca on members
  for select using (auth.uid() is not null);

create policy anggota_tulis on members
  for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Penalang hanya melihat dan mengubah event miliknya.
create policy event_milik_sendiri on events
  for all
  using (payer_id = auth.uid())
  with check (payer_id = auth.uid());

create policy item_lewat_event on bill_items
  for all
  using (exists (
    select 1 from events e
    where e.id = bill_items.event_id and e.payer_id = auth.uid()
  ))
  with check (exists (
    select 1 from events e
    where e.id = bill_items.event_id and e.payer_id = auth.uid()
  ));

create policy porsi_lewat_event on shares
  for all
  using (exists (
    select 1 from events e
    where e.id = shares.event_id and e.payer_id = auth.uid()
  ))
  with check (exists (
    select 1 from events e
    where e.id = shares.event_id and e.payer_id = auth.uid()
  ));

-- Riwayat boleh dibaca pemilik event, tidak boleh diubah siapa pun.
create policy riwayat_baca on payment_events
  for select using (exists (
    select 1 from shares s join events e on e.id = s.event_id
    where s.id = payment_events.share_id and e.payer_id = auth.uid()
  ));

revoke update, delete on payment_events from anon, authenticated;
