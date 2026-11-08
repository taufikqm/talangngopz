# Backlog Tahap 1

Serahkan satu tiket per sesi agen. Jangan gabungkan. Tiket yang terlalu besar
membuat agen mengarang bagian yang tidak dispesifikasikan.

Urutan sudah memperhitungkan ketergantungan. Kerjakan dari atas.

**Aturan tetap untuk setiap tiket:** `pnpm test`, `pnpm typecheck`, dan
`pnpm lint` harus bersih sebelum tiket dinyatakan selesai. Lihat AGENTS.md.

---

## T-01 · Kerangka proyek

**Tergantung:** tidak ada

Next.js 15 App Router, TypeScript `strict`, Tailwind, shadcn/ui, Vitest.
Salin `AGENTS.md`, `src/lib/uang.ts`, `src/lib/parser.ts`,
`src/lib/__fixtures__/chatgpt.ts`, berkas uji, dan `src/lib/contracts.ts`
ke posisinya. Siapkan tata letak folder sesuai AGENTS.md.

**Selesai bila:** `pnpm dev` jalan, `pnpm test` hijau 52 uji.

**Jangan:** menyunting isi `uang.ts` atau `parser.ts`.

---

## T-02 · Migrasi dan seed

**Tergantung:** T-01

Pasang Supabase CLI. Jalankan `0001_schema.sql`, `0002_rls.sql`,
`0003_guards.sql`, lalu `seed.sql` pada proyek lokal.

**Selesai bila:**
- `supabase db reset` berjalan bersih dari nol
- 12 baris di `members`, masing-masing punya `access_token` unik
- Uji pemicu lolos, dijalankan manual lewat SQL editor:
  - `update payment_events set catatan='x'` → ditolak
  - `delete from payment_events` → ditolak
  - event dengan `terkunci = true`, lalu ubah `total` → ditolak
  - ubah `shares.status` → satu baris baru muncul di `payment_events`

---

## T-03 · Verifikasi RLS

**Tergantung:** T-02

Langkah ini tidak boleh dilewati dan tidak boleh digabung ke tiket lain.
Migrasi yang berhasil **tidak** berarti kebijakannya benar.

Buat dua akun penalang uji, A dan B. Buat satu event untuk masing-masing.

**Selesai bila:**
- Masuk sebagai A, kueri `select * from events` mengembalikan hanya event A
- Masuk sebagai A, kueri event B secara langsung lewat id mengembalikan 0 baris
- Hal yang sama berlaku untuk `shares`, `bill_items`, `payment_events`
- Hasilnya ditulis sebagai uji otomatis di `src/lib/rls.test.ts`

**Berhenti dan laporkan** bila ada satu saja kueri yang mengembalikan baris
milik orang lain. Jangan lanjut ke tiket berikutnya.

---

## T-04 · Autentikasi penalang

**Tergantung:** T-03

Magic link Supabase Auth. Halaman `/login`, middleware pelindung rute bersesi,
klien `supabase/server.ts` (kunci anon, sesi pengguna) dan `supabase/service.ts`
(service_role, hanya sisi server).

**Selesai bila:**
- Surel di luar `profiles` ditolak tanpa membocorkan surel mana yang terdaftar
- Sesi bertahan 30 hari
- `service.ts` punya penjaga `import 'server-only'`
- Tidak ada rahasia di berkas berawalan `NEXT_PUBLIC_`

---

## T-05 · Kelola anggota

**Tergantung:** T-04

Halaman `/anggota`. Aksi `simpanAnggota` dan `cabutToken` sesuai `contracts.ts`.

**Selesai bila:**
- 12 anggota tampil, tautan pribadi bisa disalin satu ketukan
- Anggota yang punya porsi tidak bisa dihapus, hanya dinonaktifkan
- Mencabut token membuat tautan lama mengembalikan 404

---

## T-06 · Buat event, mode bagi rata

**Tergantung:** T-05

Halaman `/event/baru` sesuai spesifikasi antarmuka bagian 3, mode `rata` saja.
Aksi `buatEvent` memakai `hitungPorsi()` dari `uang.ts`.

**Selesai bila:**
- Satu layar, tanpa perpindahan halaman
- Pratinjau langsung "5 orang × Rp30.000" berubah mengikuti masukan
- Klien tidak pernah mengirim nominal porsi; seluruhnya dihitung di server
- Uji: total 150.000 untuk 5 peserta menghasilkan 5 porsi 30.000, jumlah pas
- Uji: total 100.000 untuk 3 peserta menghasilkan jumlah pas 100.000
- Pemicu invarian di basis data tidak pernah menolak penyimpanan yang sah

---

## T-07 · Mode manual dan per item

**Tergantung:** T-06

Tab `Manual` dan `Per item`. Mode per item masih diisi tangan; impor menyusul
di Tahap 2. Pecah baris `qty > 1` memakai `uraiKeUnit()`.

**Selesai bila:**
- Manual menampilkan selisih langsung dan mengunci simpan sampai nol
- Per item memperlihatkan unit sudah terurai sejak awal, bukan setelah diklik
- Satu unit bisa ditandai ke beberapa orang
- Uji: item 30.000 ditanggung 2 orang menghasilkan 15.000 tiap orang

---

## T-08 · Tautan publik dan halaman peserta

**Tergantung:** T-06

`/bill/[token]` dan `/me/[token]`. Route Handler memakai `service.ts`.

Jalur ini melewati RLS, jadi batasi baris secara manual: cocokkan token,
ambil `member_id`, batasi kueri dengan `member_id` itu.

**Selesai bila:**
- Terbuka di jendela penyamaran tanpa diminta masuk
- Tidak ada surel, nomor WhatsApp, atau nominal anggota lain di muatan jaringan.
  Periksa langsung di tab Network, bukan hanya di tampilan
- Header `noindex` terpasang, dan `Referrer-Policy: no-referrer`
- Token tidak dikenal mengembalikan 404 biasa
- Nomor rekening bisa disalin satu ketukan, QRIS bisa diperbesar

---

## T-09 · Klaim dan konfirmasi

**Tergantung:** T-08

`POST /api/claim` dan aksi `konfirmasiPembayaran`, `tolakKlaim`,
`tandaiLunasManual`.

Sebelum mengubah `shares.status`, tetapkan konteks aktor di transaksi yang sama
supaya pemicu riwayat mencatat pelakunya:

```sql
select set_config('app.aktor', 'peserta', true);
select set_config('app.aktor_id', '<member uuid>', true);
```

**Selesai bila:**
- Peserta hanya bisa mengubah status dari `belum_bayar` ke `menunggu_konfirmasi`
- `shareId` milik orang lain mengembalikan 404, bukan 403
- Klaim dua kali tidak membuat baris riwayat kedua
- Porsi `lunas` membalas 409 saat peserta mencoba mengklaim
- Batas laju 10 permintaan per token per menit
- Pelunasan pertama mengunci eventnya
- Tolak klaim mengembalikan status dan menyimpan alasannya

---

## T-10 · Dasbor piutang

**Tergantung:** T-09

Halaman `/` dari tampilan `v_piutang`, sesuai spesifikasi antarmuka bagian 2.

**Selesai bila:**
- `menunggu_konfirmasi` terpisah di kartu paling atas
- Umur piutang tertua tampil dalam hari
- Keadaan kosong dan semua-lunas punya tampilannya sendiri
- Dimuat di bawah 1,5 detik dengan 500 baris `shares` data benih

---

## T-11 · Rincian event dan riwayat

**Tergantung:** T-10

Halaman `/event/[id]`. Baris menunggu konfirmasi naik ke atas. Riwayat dari
yang terbaru, tanpa tombol hapus di mana pun.

---

## T-12 · Teks tagihan

**Tergantung:** T-10

Aksi `buatTeksTagihan`. Menghasilkan teks siap tempel ke WhatsApp berisi nama,
nominal, dan tautan pribadi tiap penunggak.

**Selesai bila:** satu ketukan menyalin ke papan klip, dan tautan di dalamnya
benar-benar bisa dibuka.

---

## T-13 · PWA

**Tergantung:** T-12

Manifest, ikon 192 dan 512, service worker.

**Selesai bila:**
- Lighthouse PWA lolos installable
- Mode pesawat menampilkan kerangka plus spanduk, bukan galat peramban
- Terpasang di Chrome Android dan Safari iOS pada perangkat nyata
- Halaman peserta **tidak** disinggahkan

---

## T-14 · Cron penjaga

**Tergantung:** T-13

`GET /api/cron/keepalive`, dilindungi `Authorization: Bearer $CRON_SECRET`.
Satu kueri ringan harian supaya proyek Supabase tidak dihentikan karena
tidak aktif.

**Selesai bila:** terdaftar di `vercel.json`, dan pemanggilan tanpa header
yang benar mengembalikan 401.

---

## T-15 · Rilis

**Tergantung:** T-14

Ikuti SRS bagian 10.4 persis, urut.

**Sebelum data nyata masuk**, ulangi verifikasi RLS dari T-03 di proyek
produksi. Kebijakan di produksi bisa berbeda dari lokal bila ada migrasi yang
gagal separuh jalan.

Periksa sekali lagi bahwa `SUPABASE_SERVICE_ROLE_KEY` tidak berawalan
`NEXT_PUBLIC_` di dasbor Vercel.

**Selesai bila:** 17 kriteria terima SRS bagian 11.1 lolos di produksi.

---

## Tahap 2 — setelah dua minggu pemakaian nyata

Jangan mulai sebelum Arjuna benar-benar memakai ledger-nya.

| Tiket | Isi |
| --- | --- |
| T-16 | Kotak tempel dan layar koreksi, memakai `uraikanTabel()` |
| T-17 | Pencocokan nama dan dropdown wajib pilih |
| T-18 | Simpan luring ke IndexedDB lalu sinkron |
| T-19 | Notifikasi web push, pengingat H+3 |
