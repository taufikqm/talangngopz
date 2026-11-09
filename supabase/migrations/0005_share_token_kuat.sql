-- 0005_share_token_kuat.sql
-- share_token dari satu UUID v4 hanya membawa 122 bit acak, di bawah batas 128 bit
-- untuk tautan publik /bill/[token]. Disamakan dengan members.access_token:
-- dua UUID v4 tanpa tanda hubung, 64 karakter hex, 244 bit acak.

alter table events
  alter column share_token
  set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Token lama dibuat ulang. /bill belum pernah dirilis, jadi belum ada tautan yang tersebar.
-- Pemicu trg_event_terkunci hanya menjaga kolom nominal, jadi event terkunci tetap boleh.
update events
   set share_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
