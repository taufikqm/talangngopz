-- seed.sql
-- 12 anggota sirkel. Ganti nama panggilan dan nomor dengan yang sebenarnya
-- sebelum dijalankan di produksi.
--
-- access_token terisi otomatis oleh default kolom. Setelah seed dijalankan,
-- ambil tautan tiap orang dengan kueri di bagian bawah berkas ini.

insert into members (nama_panggilan, whatsapp) values
  ('Arjuna',  '628xxxxxxxxxx'),
  ('Anggota 2',  null),
  ('Anggota 3',  null),
  ('Anggota 4',  null),
  ('Anggota 5',  null),
  ('Anggota 6',  null),
  ('Anggota 7',  null),
  ('Anggota 8',  null),
  ('Anggota 9',  null),
  ('Anggota 10', null),
  ('Anggota 11', null),
  ('Anggota 12', null);

-- Menautkan anggota ke akun penalang setelah Arjuna login pertama kali:
--
--   update members m
--   set profile_id = p.id
--   from profiles p
--   where p.email = 'email-arjuna@contoh.com'
--     and m.nama_panggilan = 'Arjuna';

-- Mengambil tautan pribadi tiap anggota untuk dibagikan ke grup:
--
--   select nama_panggilan,
--          'https://app-kamu.vercel.app/me/' || access_token as tautan
--   from members
--   where aktif
--   order by nama_panggilan;
