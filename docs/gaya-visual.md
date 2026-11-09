# Gaya visual: Talangan

Berkas ini menerjemahkan prototipe klikable (artifact "Prototype Talangan Arjuna") menjadi aturan yang bisa dipakai agen kode. Prototipe adalah acuan visual saja. Perilaku, susunan, dan keadaan layar tetap mengikuti `ui-spec-tahap-1.md`. Bila keduanya bertentangan, `ui-spec-tahap-1.md` dan `perubahan-klaim-pembayaran.md` yang berlaku.

Nama, nominal, dan event di prototipe adalah contoh. Jangan menyalinnya ke kode.

## Prinsip

Tampilan terang yang hangat, tenang, dan mudah dibaca di bawah matahari sambil berdiri di kasir. Satu warna aksi (hijau tua), satu warna perhatian (kuning), dan status selalu punya label teks, tidak pernah hanya warna. Rancang untuk lebar 360 piksel; prototipe digambar di 390 piksel, jadi tata letak harus tetap rapi di 360 tanpa gulir horizontal.

## Warna

| Peran | Nilai | Dipakai untuk |
| --- | --- | --- |
| Latar halaman | `#F6F4EE` | Latar seluruh layar, bilah bawah |
| Permukaan | `#FFFFFF` | Kartu, medan isian, kancing belum terpilih |
| Permukaan redup | `#FBFAF6` | Isi panel yang dibuka |
| Garis | `#E4E0D5` | Bingkai kartu, pemisah bilah bawah |
| Garis halus | `#EFECE3` | Pemisah baris di dalam kartu |
| Garis medan | `#CFCABD` | Bingkai medan isian |
| Teks utama | `#1C1B17` | Judul, nominal, isi |
| Teks sekunder | `#4F4B42` | Label tombol sekunder, keterangan |
| Teks redup | `#6A665B` | Label kecil, tanggal, keterangan |
| Aksi (hijau tua) | `#0B5C4D` | Tombol utama, kancing terpilih, tautan aksi, bingkai total |
| Tombol nonaktif | `#D8D4C8` dengan teks `#4F4B42` | Simpan terkunci |
| Perhatian (kuning) | `#FFEFB8` dengan teks `#4A3000` | Kartu "klaim menunggu konfirmasi" di dasbor |
| Piutang lama | `#9A4A00` | Keterangan umur piutang lebih dari 14 hari |
| Galat / tolak | `#9A2A12` | Pesan galat, tombol kirim penolakan |
| Lunas | latar `#D9F0E0`, teks `#11602F`, batang `#1E8A4C` | Lencana dan batang progres |
| Menunggu | latar `#FFEFB8`, teks `#6B4700`, batang `#E3A81B` | Lencana dan batang progres |
| Belum bayar | latar `#ECE9E1`, teks `#4F4B42` | Lencana |
| Tumpuk modal | `rgba(28,27,23,.82)` | Latar gelap di belakang QRIS diperbesar |

Status pembayaran selalu tampil sebagai lencana berlabel teks ("Lunas", "Menunggu konfirmasi", "Belum bayar"). Warna hanya penguat.

## Tipografi

Font: Plus Jakarta Sans (400, 500, 600, 700, 800) dari Google Fonts, dengan cadangan `system-ui, sans-serif`. Semua angka nominal memakai `font-variant-numeric: tabular-nums` dan berawalan `Rp` dengan titik ribuan (`Rp1.234.567`).

| Peran | Ukuran / bobot |
| --- | --- |
| Angka besar (total piutang, total utang) | 44 px / 800, tinggi baris 1,1 |
| Judul halaman (`h1` rincian event) | 24 px / 800 |
| Sapaan peserta | 22 px / 700 |
| Medan total di event baru | 34 px / 800 |
| Nominal rekening | 22 px / 800 |
| Judul item, nama anggota | 16 px / 700 |
| Nominal baris | 17 px / 800 |
| Teks isi | 14 sampai 15 px / 500 sampai 600 |
| Label medan | 13 px / 600, warna redup |
| Judul bagian (huruf kapital) | 13 px / 700, jarak huruf 0,4 px, warna redup |
| Lencana | 12 sampai 13 px / 700 |

## Bentuk dan jarak

- Padding halaman: 20 px kiri dan kanan.
- Kartu: latar putih, bingkai 1 px `#E4E0D5`, radius 14 px, padding 14 sampai 16 px, jarak antar kartu 8 px.
- Medan isian: tinggi 48 px (44 px bila di dalam baris), radius 10 sampai 12 px, bingkai 1,5 px `#CFCABD`. Medan total: tinggi 72 px, radius 14 px, bingkai 2 px hijau tua.
- Tombol utama: tinggi 52 px (48 px di dalam kartu), radius 12 sampai 14 px, latar hijau tua, teks putih 16 px / 700.
- Tombol sekunder: tinggi 44 sampai 48 px, latar putih, bingkai 1,5 px hijau tua atau `#B8B2A3`, teks sesuai.
- Kancing nama: tinggi minimal 44 px, radius 22 px, padding horizontal 16 px. Terpilih: latar hijau tua, teks putih. Belum: latar putih, bingkai 1,5 px `#CFCABD`.
- Tab cara bagi: wadah radius 14 px latar `#E9E5DA`, padding 4 px. Tab aktif putih dengan teks hijau tua, tab lain transparan.
- Lencana: radius penuh (999 px), padding 4 sampai 5 px × 10 px.
- Sasaran ketuk minimal 44 × 44 piksel di mana pun.

## Komponen yang berulang

**Bilah atas penalang.** Kiri: nama aplikasi "Talangan" (15 px / 800, hijau tua). Kanan: nama penalang dan lingkaran inisial 32 px hijau tua. Layar dalam memakai tautan kembali "‹ Dasbor" atau "‹ Batal" setinggi 44 px.

**Bilah bawah menempel.** Latar sama dengan halaman, garis atas 1 px, padding 12 px × 20 px. Berisi aksi utama satu lebar penuh. Di event baru, pratinjau ("5 orang × Rp30.000") ada di atas tombol Simpan dengan `role="status"`. Isi gulir diberi padding bawah cukup supaya tidak tertutup bilah.

**Kartu anggota di dasbor.** Satu tombol selebar kartu setinggi minimal 64 px: nama dan umur piutang di kiri, nominal di kanan. Diketuk membuka panel rincian per event dan tombol "Salin tagihan". Umur lebih dari 14 hari ditulis "sudah N hari" dengan warna `#9A4A00` dan bobot 700.

**Kartu klaim penalang.** Kartu putih berisi nama, nominal, jam transfer, dan nama pengirim, dengan dua tombol sejajar: Konfirmasi (hijau, terisi) dan Tolak (bingkai abu). Tolak membuka isian alasan wajib dan tombol "Kirim penolakan" merah tua yang nonaktif sampai alasan terisi.

**Batang progres event.** Tinggi 10 px, radius 5 px, latar `#ECE9E1`, segmen lunas hijau lalu menunggu kuning, dengan tiga baris legenda bernominal di bawahnya.

**Kartu tujuan transfer (halaman peserta).** Nomor rekening 22 px / 800 dengan tombol "Salin" yang berubah jadi "Tersalin"; di bawahnya pemicu QRIS setinggi 64 px yang membuka tumpuk modal berisi QRIS 260 px dan tombol Tutup.

**Halaman peserta** tidak punya tombol masuk, tautan ke bagian penalang, atau ajakan daftar. Teks penutup kecil (12 px, redup): "Halaman ini hanya untuk kamu. Jangan bagikan tautannya ke orang lain."

## Keadaan

Setiap layar punya keadaan muat (kerangka, bukan pemutar), kosong, galat, dan luring sesuai `ui-spec-tahap-1.md`. Pesan galat memakai `#9A2A12` dengan `role="alert"`. Tombol utama yang tidak bisa dipakai tampil nonaktif abu, bukan hilang.

## Aksesibilitas

- Kontras teks minimal 4,5 banding 1. Teks redup `#6A665B` di atas `#F6F4EE` dipakai hanya untuk teks kecil sekunder; periksa ulang bila warna diubah.
- Setiap medan punya `<label>`, bukan hanya placeholder.
- Kancing dan tab memakai `aria-pressed`; panel yang dibuka memakai `aria-expanded`.
- Tombol dan tautan memakai elemen asli, bukan `div` dengan `onClick`.

## Bagian prototipe yang sudah usang (jangan ditiru)

- **Login:** prototipe menampilkan tautan masuk lewat surel (magic link), hitung mundur "Kirim ulang dalam 60 detik", dan keadaan "Ditolak". Yang berlaku: medan surel, medan password, tombol Masuk, satu pesan gagal "Surel atau password salah." (lihat `ui-spec-tahap-1.md` bagian 1).
- **Halaman peserta:** prototipe memakai tombol "Sudah bayar" per event. Yang berlaku: kotak centang per event `belum_bayar`, bilah bawah "Bayar Rp235.000 (2 event)", lalu isian jam transfer dan nama pengirim dengan tombol "Saya sudah transfer" (lihat bagian 8 ui-spec dan T-08, T-09).
- **Rincian event:** konfirmasi dan tolak berlaku per **klaim** (satu transfer), bukan per baris porsi. Kartu klaim berformat "Dika · Rp235.000 · 14:20 · BCA a.n. Dika · untuk Futsal, Kopi Kenangan".
- **Tab Per item:** tombol "Tempel dari ChatGPT" adalah Tahap 2 dan tidak dibangun di Tahap 1.
- **Nama penalang:** prototipe memakai "Arjuna" sebagai contoh. Aplikasi memakai nama penalang dari data, dan label "(kamu)" mengikuti anggota yang `profile_id`-nya cocok dengan akun yang masuk.
- **Teks bantu Rata:** "Sisa pembulatan ditanggung Arjuna" harus memakai nama penalang dari data, dan bila penalang tidak ikut, sisa ke peserta pertama menurut urutan nama.
