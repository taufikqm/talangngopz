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

## T-07b · Migrasi 0004: klaim pembayaran

**Status:** selesai. Bukti: commit `3bbc68c`, `0004` terpasang di remote,
`pnpm test` 233 lulus tanpa skipped.

**Tergantung:** T-07

Berkas baru `supabase/migrations/0004_klaim_pembayaran.sql`. Jangan mengubah
`0001`, `0002`, `0003`. Agen hanya menulis berkas dan ujinya. **Pengguna yang
menjalankan** `supabase db push --remote`.

**Isi:**

1. **Perbaikan pemicu riwayat (temuan T-03).** Fungsi pencatat riwayat di
   `0003_guards.sql` dibuat ulang dengan `security definer` dan
   `set search_path = public`, supaya perubahan status oleh sesi penalang
   benar-benar menulis baris ke `payment_events` walau RLS menolak insert
   langsung. Baca `0003_guards.sql` untuk nama fungsinya.
2. `payment_events` mendapat kolom `claim_id uuid null`.
3. Enum `klaim_status`: `menunggu`, `dikonfirmasi`, `ditolak`.
4. Tabel `payment_claims`: `id`, `member_id`, `payer_id` (penalang tujuan),
   `nominal bigint > 0`, `waktu_transfer timestamptz`, `pengirim text`,
   `status klaim_status` bawaan `menunggu`, `alasan_tolak text`,
   `claimed_at`, `decided_at`, `decided_by`.
5. Tabel `payment_claim_shares`: `claim_id`, `share_id`, kunci utama gabungan.
6. **Invarian**, dijaga di database:
   - `nominal` klaim sama dengan jumlah `shares.total` di dalamnya.
   - Semua share di satu klaim milik `member_id` yang sama, dan event-nya
     memiliki `payer_id` yang sama dengan `payer_id` klaim.
   - Satu share hanya boleh ada di satu klaim berstatus `menunggu` atau
     `dikonfirmasi` pada satu waktu. Share dari klaim `ditolak` boleh
     diklaim lagi.
7. **Dua fungsi `security definer`** dengan `set search_path = public`:
   - `buat_klaim(p_member uuid, p_shares uuid[], p_waktu timestamptz, p_pengirim text)`.
     Semua share harus milik anggota itu dan berstatus `belum_bayar`. Membuat
     klaim, mengubah share jadi `menunggu_konfirmasi`, menetapkan konteks aktor
     (`app.aktor = 'peserta'`) di transaksi yang sama. `EXECUTE` hanya untuk
     `service_role`; cabut dari `public`, `anon`, `authenticated`.
   - `putuskan_klaim(p_claim uuid, p_keputusan text, p_alasan text)`.
     Hanya jika `auth.uid()` sama dengan `payer_id` klaim. `konfirmasi`: share
     jadi `lunas`, klaim jadi `dikonfirmasi`. `tolak`: share kembali
     `belum_bayar`, klaim jadi `ditolak`, alasan wajib. Menetapkan
     `app.aktor = 'penalang'`. `EXECUTE` untuk `authenticated`.
8. **RLS** pada kedua tabel baru: penalang hanya membaca klaim dengan
   `payer_id` miliknya. Tidak ada kebijakan insert, update, atau delete untuk
   `authenticated`; semua perubahan lewat dua fungsi di atas.

**Selesai bila:**
- `supabase db push --remote` sukses (dijalankan pengguna).
- `src/lib/rls.test.ts` diperluas dengan data sungguhan di `payment_claims`
  dan `payment_events`: A tidak melihat klaim atau riwayat B dan sebaliknya,
  update dan delete langsung oleh A ke baris B ditolak atau tidak mengubah apa
  pun.
- Uji fungsi, semua lewat database:
  - Klaim dua share dengan total X menghasilkan `nominal = X`.
  - Klaim share yang sudah ada di klaim `menunggu` ditolak.
  - Klaim share milik anggota lain ditolak.
  - Klaim campuran dua penalang ditolak.
  - `putuskan_klaim` oleh penalang lain ditolak.
  - Tolak tanpa alasan ditolak.
  - Konfirmasi klaim berisi 2 share membuat 2 baris `payment_events` dengan
    `claim_id` yang sama dan aktor yang benar.

**Berhenti dan laporkan** bila ada kueri yang mengembalikan data penalang lain.

---

## T-08 · Tautan publik dan halaman peserta

**Tergantung:** T-07b

`/bill/[token]` dan `/me/[token]`. Route Handler memakai `service.ts`.

Jalur ini melewati RLS, jadi batasi baris secara manual: cocokkan token, ambil
`member_id`, batasi **setiap** kueri dengan `member_id` itu.

`/me/[token]`:
- "Halo <nama>" dan total utang (`belum_bayar` ditambah `menunggu_konfirmasi`).
- Tujuan transfer: nomor rekening dengan tombol salin, QRIS yang bisa
  diperbesar. Data rekening milik penalang yang bersangkutan.
- Daftar event: judul, tanggal, nominal, status. Event `belum_bayar` punya
  kotak centang. Event yang sudah dalam klaim `menunggu` menampilkan lencana
  "Menunggu konfirmasi Arjuna" beserta jam klaim. Event `lunas` menampilkan
  tanggal pelunasan.
- Bila ada yang dicentang, bilah bawah menampilkan "Bayar Rp235.000 (2 event)".
  Event dari penalang berbeda tidak bisa dicentang bersamaan; tampilkan
  keterangan singkat.
- Menekan bilah itu membuka isian **jam transfer** (bawaan: sekarang) dan
  **nama pengirim atau bank** (bawaan: nama panggilan), lalu tombol
  **Saya sudah transfer**. Pengiriman klaim dibangun di T-09; di tiket ini
  tombolnya sudah ada dan menampilkan formulirnya.

`/bill/[token]`: satu event untuk semua peserta, daftar nama, nominal, status.

**Selesai bila:**
- Terbuka di jendela penyamaran tanpa diminta masuk.
- Tidak ada surel, nomor WhatsApp, atau nominal anggota lain di muatan
  jaringan. Uji otomatis memeriksa muatan respons. Pemeriksaan tab Network
  dilakukan pengguna sendiri.
- Header `X-Robots-Tag: noindex` dan `Referrer-Policy: no-referrer` terpasang.
- Token tidak dikenal mengembalikan 404 biasa tanpa menyebut token salah atau
  kedaluwarsa.
- Rekening bisa disalin satu ketukan, QRIS bisa diperbesar.

---

## T-09 · Klaim dan konfirmasi

**Tergantung:** T-08

`POST /api/claim` dan aksi penalang `konfirmasiKlaim`, `tolakKlaim`,
`tandaiLunasManual`. Perbarui `src/lib/contracts.ts` untuk bentuk baru; jangan
membuat bentuk galat baru di luar `KodeGalat`.

**Peserta, `POST /api/claim`:**
- Masukan: `token`, `shareIds[]`, `waktuTransfer`, `pengirim`. Tidak ada nominal
  dari klien.
- Server mencocokkan token ke `member_id`, lalu memanggil `buat_klaim`
  memakai `service.ts`.
- `shareId` milik orang lain mengembalikan 404, bukan 403.
- Share yang sudah `menunggu_konfirmasi` atau `lunas` mengembalikan 409.
- Klaim dua kali untuk share yang sama tidak membuat klaim atau riwayat kedua.
- Batas laju 10 permintaan per token per menit.

**Penalang:**
- `konfirmasiKlaim` dan `tolakKlaim` memanggil `putuskan_klaim` lewat sesi
  penalang, bukan `service_role`. Tolak wajib beralasan.
- `tandaiLunasManual` untuk pembayaran tunai: satu share, tanpa klaim, dicatat
  sebagai aktor `penalang` dengan catatan "tunai".
- Pelunasan pertama pada sebuah event mengunci event itu (pemicu 0003).

**Selesai bila:**
- Peserta hanya bisa mengubah `belum_bayar` ke `menunggu_konfirmasi`.
- Klaim dua event dalam satu transfer menghasilkan satu klaim dan dua share
  `menunggu_konfirmasi`.
- Satu ketukan konfirmasi membuat semua share di klaim itu `lunas`.
- Tolak mengembalikan semua share di klaim itu ke `belum_bayar` dan menyimpan
  alasannya.
- Setiap perubahan status tercatat di `payment_events` dengan aktor dan
  `claim_id`.
- Uji otomatis untuk 404 pada share orang lain, 409 pada share yang sudah
  diklaim, dan batas laju.

---

## T-10 · Dasbor piutang

**Tergantung:** T-09

Halaman `/` dari tampilan `v_piutang`, sesuai spesifikasi antarmuka bagian 2.

**Catatan:** `v_piutang` harus menyaring porsi Rp0.

**Selesai bila:**
- Kartu kuning paling atas menghitung **klaim** yang menunggu, bukan share:
  "2 klaim menunggu konfirmasi kamu"
- Umur piutang tertua tampil dalam hari
- Keadaan kosong dan semua-lunas punya tampilannya sendiri
- Dimuat di bawah 1,5 detik dengan 500 baris `shares` data benih

---

## T-11 · Rincian event dan riwayat

**Tergantung:** T-10

Halaman `/event/[id]`. Klaim tampil sebagai kartu untuk share yang menjadi
bagiannya, dengan format
"Dika · Rp235.000 · 14:20 · BCA a.n. Dika · untuk Futsal, Kopi Kenangan" dan
tombol **Konfirmasi** dan **Tolak** per klaim. Riwayat dari yang terbaru dan
menampilkan klaim, tanpa tombol hapus di mana pun.

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
