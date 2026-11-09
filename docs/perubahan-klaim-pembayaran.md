# Perubahan: klaim pembayaran

Dokumen ini menggantikan T-08 dan T-09 di `backlog-tahap-1.md`, menambah tiket
T-07b, dan mengubah beberapa catatan di tiket lain. Bila bertentangan dengan
`backlog-tahap-1.md` yang lama, dokumen ini yang berlaku.

## Mengapa berubah

Rancangan lama: teman menekan **Sudah bayar** pada satu event, Arjuna
mengonfirmasi event itu. Masalahnya, di mutasi rekening Arjuna hanya terlihat
"Rp235.000 dari DIKA". Arjuna tidak tahu transfer itu untuk event yang mana,
dan kalau Dika membayar dua event dalam satu transfer, tombol per event tidak
cocok dengan satu baris mutasi tersebut.

Rancangan baru: **satu transfer sama dengan satu klaim.** Teman mencentang
event yang dia bayar, mengisi jam transfer dan nama pengirim, lalu mengirim
satu klaim. Arjuna melihat satu baris yang bisa dicocokkan dengan mutasi,
lalu mengonfirmasi atau menolak seluruh klaim itu sekaligus.

## Keputusan yang sudah diambil

- Satu klaim berisi satu atau lebih `shares` milik **satu anggota** dan
  **satu penalang** (satu transfer menuju satu rekening).
- Nominal klaim tidak diketik teman. Nominal dihitung server dari jumlah
  `shares.total` yang dicentang.
- Jam transfer dan nama pengirim (nama di rekening atau bank) wajib diisi.
- Bayar sebagian dan cicilan tidak ada. Satu share hanya lunas atau belum.
- Unggah bukti transfer tidak ada.
- Kode unik nominal tidak dipakai sekarang. Bisa ditambah kemudian bila
  pencocokan mutasi masih sering ambigu.
- Status `shares` tetap tiga: `belum_bayar`, `menunggu_konfirmasi`, `lunas`.
  Klaim punya status sendiri: `menunggu`, `dikonfirmasi`, `ditolak`.
- Hanya penalang yang bisa membuat share menjadi `lunas`.

---

## T-07b · Migrasi 0004: klaim pembayaran

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

## Perubahan pada tiket lain

**T-10 · Dasbor piutang:** kartu kuning teratas menghitung **klaim** yang
menunggu, bukan share. "2 klaim menunggu konfirmasi kamu".

**T-11 · Rincian event dan riwayat:** klaim tampil sebagai kartu di `/event/[id]`
untuk share yang menjadi bagiannya, dengan format
"Dika · Rp235.000 · 14:20 · BCA a.n. Dika · untuk Futsal, Kopi Kenangan" dan
tombol **Konfirmasi** dan **Tolak** per klaim. Riwayat menampilkan klaim.

**T-12 · Teks tagihan:** tidak berubah.

## Perubahan pada `ui-spec-tahap-1.md`

- Bagian 2 (dasbor): kartu kuning menghitung klaim.
- Bagian 5 (`/event/[id]`): baris menunggu diganti kartu klaim seperti di T-11.
- Bagian 8 (`/me/[token]`): ganti butir 4 dengan kotak centang, bilah bawah
  total, dan formulir jam transfer dan pengirim seperti di T-08.
- Bagian 1 (`/login`): login memakai surel dan password; keadaan "Ditolak"
  dan hitung mundur dibuang.

## Perubahan pada PRD dan SRS

Perbarui sebelum diekspor ke `docs/prd.md` dan `docs/srs.md`: autentikasi
penalang (password, bukan magic link), alur klaim pembayaran, dua tabel baru,
dan dua fungsi `security definer`.
