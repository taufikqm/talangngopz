# Spesifikasi Antarmuka — Tahap 1

Delapan layar. Seluruh teks bahasa Indonesia, nominal berformat `Rp1.234.567`.

## Prinsip

Dirancang untuk satu tangan, sambil berdiri di kasir, dengan sinyal jelek.

1. **Jalur utama satu layar.** Membuat event tidak boleh berpindah halaman.
2. **Bagi rata adalah bawaan.** Mode lain disembunyikan di balik satu ketukan.
3. **Status tidak pernah hanya warna.** Selalu ada label teks di sebelahnya.
4. **Sasaran ketuk minimal 44 x 44 piksel.** Jempol, bukan kursor.
5. **Rancang untuk lebar 360 piksel.** Layar lebar hanya menambah ruang kosong di tepi.
6. **Setiap keadaan dirancang:** muat, kosong, galat, luring. Jangan sisakan layar putih.

## Sistem desain

| Hal | Nilai |
| --- | --- |
| Warna status | `belum_bayar` abu, `menunggu_konfirmasi` kuning, `lunas` hijau |
| Angka | Tabular nums, rata kanan, selalu berawalan `Rp` |
| Aksi utama | Satu tombol penuh lebar, menempel di bawah layar |
| Aksi merusak | Butuh konfirmasi; tidak pernah jadi ketukan tunggal |
| Papan ketik | `inputMode="numeric"` pada setiap medan nominal |

---

## 1. `/login`

Satu medan surel, satu tombol.

| Keadaan | Tampilan |
| --- | --- |
| Awal | Medan surel, tombol **Kirim tautan masuk** |
| Terkirim | "Cek surel kamu. Tautannya berlaku 1 jam." Tombol jadi hitung mundur 60 detik |
| Ditolak | "Surel ini belum terdaftar sebagai penalang." Tanpa memberi tahu surel mana yang ada |

Hanya surel yang ada di `profiles` boleh masuk.

> **Diganti keputusan T-04:** bagian ini tidak berlaku lagi. Magic link diganti
> surel + password (`signInWithPassword`), sehingga keadaan *Terkirim* dan hitung
> mundur kirim ulang tidak dibangun. Tidak ada halaman daftar; akun penalang dibuat
> manual di dasbor Supabase.
>
> | Keadaan | Tampilan |
> | --- | --- |
> | Awal | Medan surel, medan password (`type="password"`), tombol **Masuk** |
> | Gagal | "Surel atau password salah." |
>
> Pesan *Gagal* sama persis untuk surel tak dikenal, password salah, dan akun yang
> tidak ada di `profiles` (sesinya langsung diakhiri), supaya tidak membocorkan siapa
> yang terdaftar. Keadaan *Ditolak* di atas tidak dibangun.

---

## 2. `/` — Dasbor piutang

Layar yang paling sering dibuka. Menjawab satu pertanyaan: **siapa yang masih utang.**

**Susunan dari atas:**

1. Satu angka besar: total piutang seluruh orang.
2. Bila ada yang berstatus `menunggu_konfirmasi`, muncul kartu kuning paling atas:
   "3 klaim menunggu konfirmasi kamu" dengan tombol langsung ke daftarnya.
   Ini butuh tindakan penalang, jadi dipisah dari sisanya.
3. Daftar anggota, diurutkan dari piutang terbesar. Tiap baris:
   nama, nominal, umur piutang tertua dalam hari, jumlah event.
4. Umur lebih dari 14 hari: nominalnya diberi penanda teks "sudah 18 hari",
   bukan hanya diwarnai.

**Tombol aksi utama:** `+ Talangan baru`, menempel di bawah layar.

| Keadaan | Tampilan |
| --- | --- |
| Kosong | "Belum ada talangan. Tekan tombol di bawah setelah kamu bayarin temen." |
| Semua lunas | "Semua sudah bayar." Tanpa daftar |
| Muat | Kerangka 3 baris, bukan pemutar |

Mengetuk satu anggota membuka rincian per event miliknya, beserta tombol
**Salin tagihan** untuk orang itu saja.

---

## 3. `/event/baru` — Satu layar

Target 60 detik. Tidak ada perpindahan halaman.

**Urutan medan, dari atas:**

1. **Judul** — terisi otomatis `Nongki <tanggal>`, bisa diubah.
2. **Tanggal** — terisi hari ini, tersembunyi di balik ketukan jika tidak diubah.
3. **Total dibayar** — medan terbesar di layar, papan ketik angka, fokus otomatis.
4. **Siapa yang ikut** — kancing nama 12 anggota. Penalang tercentang otomatis.
   Ada `Pilih semua`. Nama ditampilkan sebagai kancing besar, bukan kotak centang kecil.
5. **Cara bagi** — tiga tab: `Rata` (bawaan) · `Manual` · `Per item`.
6. **Pajak dan biaya layanan** — terlipat. Hanya dibuka bila perlu.
   Terlipat berarti nol.

**Pratinjau langsung** di atas tombol simpan: "5 orang × Rp30.000".
Berubah setiap kali masukan berubah.

**Tombol:** `Simpan` penuh lebar, menempel di bawah.

**Mode Manual:** satu medan nominal per peserta. Di bawahnya muncul
"Kurang Rp10.000" atau "Lebih Rp5.000" secara langsung. Tombol simpan nonaktif
selama belum nol.

**Mode Per item:** daftar baris item yang bisa ditambah manual, **atau** tombol
`Tempel dari ChatGPT` yang membuka layar 4. Pada Tahap 1 hanya jalur manual
yang dibangun; tombol tempel muncul di Tahap 2.

| Keadaan | Tampilan |
| --- | --- |
| Luring | Spanduk "Kamu sedang luring. Event tetap bisa disimpan dan akan terkirim nanti." Simpan tetap aktif |
| Belum sinkron | Event muncul di dasbor dengan penanda "menunggu terkirim" |
| Galat simpan | Pesan di bawah tombol, data formulir tidak hilang |

---

## 4. `/event/baru/koreksi` — Layar koreksi (Tahap 2)

Dirancang sekarang supaya struktur datanya tidak berubah belakangan.

**Dari atas:**

1. **Papan cek**, tiga lencana berdampingan:
   `Baris ✓` · `Total ✓ Rp222.200` · `Jumlah item ✓ 13`
   Yang gagal jadi merah dengan penjelasan satu baris.
2. Bila `selisih ≠ 0`: spanduk kuning "Ada Rp20.200 yang belum dibagi ke item.
   Akan dibagi proporsional." Bila `selisih = 0`, **tidak ada spanduk apa pun** —
   diam berarti harga sudah final.
3. **Daftar unit, sudah terurai.** Baris `qty 3` tampil sebagai tiga baris:
   `Nasi Putih (1/3)`, `(2/3)`, `(3/3)`. Ini keadaan awal, bukan pilihan.
4. Tiap unit punya baris kancing nama untuk ditandai. Satu unit boleh ditandai
   ke beberapa orang; nominalnya lalu dibagi rata.
5. Nama item dan nominal bisa disunting di tempat.
6. Item gratis ditampilkan dengan lencana `Gratis` dan nominal `Rp0`.
   Tetap ditampilkan supaya orang tahu ada bonus.

**Tombol simpan nonaktif** selama masih ada unit tanpa penanggung. Teks di
atasnya menyebut berapa yang tersisa: "4 unit belum ditandai."

| Keadaan | Tampilan |
| --- | --- |
| Gagal urai | Pesan spesifik plus contoh format benar, dan tombol `Isi manual saja` |
| Nama tak dikenal | Dropdown pilih anggota di sebelah nama itu, bertanda merah |

---

## 5. `/event/[id]` — Rincian event

Daftar porsi, satu baris per orang: nama, nominal, lencana status.

Baris berstatus `menunggu_konfirmasi` naik ke atas dan menampilkan dua tombol:
`Konfirmasi` dan `Tolak`. Menolak membuka isian alasan, wajib diisi.

Baris `belum_bayar` punya menu kelebihan berisi `Tandai lunas (tunai)`.

Di bawah daftar: riwayat, dari yang terbaru. "Dika klaim bayar · 8 Nov 14:20",
"Arjuna konfirmasi · 8 Nov 19:03". Riwayat tidak bisa dihapus dan tidak punya
tombol hapus.

Event terkunci menampilkan lencana `Terkunci` dan menonaktifkan penyuntingan
nominal, dengan keterangan "Sudah ada yang lunas, nominal tidak bisa diubah."

---

## 6. `/anggota`

Daftar 12 orang. Tiap baris: nama, nomor WhatsApp, tombol `Salin tautan`.

Menambah anggota lewat satu baris isian di bawah daftar.

Anggota yang masih punya porsi tidak bisa dihapus; yang tersedia hanya
`Nonaktifkan`, dengan keterangan alasannya.

`Cabut tautan` ada di balik menu kelebihan, dengan konfirmasi: "Tautan lama
akan langsung mati dan kamu harus kirim yang baru. Lanjut?"

---

## 7. `/pengaturan`

Nama, bank, nomor rekening, unggah gambar QRIS dengan pratinjau.

Satu peringatan tetap di bawah: "Nomor rekening dan QRIS kamu terlihat oleh
siapa pun yang punya tautan tagihan."

---

## 8. `/bill/[token]` dan `/me/[token]` — Halaman peserta

Dibuka tanpa akun. **Tidak boleh ada tombol masuk, tidak boleh ada ajakan daftar.**

`/me/[token]` adalah yang paling sering dibuka peserta.

**Dari atas:**

1. "Halo Dika" lalu satu angka besar: total utang.
2. Tujuan transfer: nomor rekening dengan tombol salin satu ketukan, dan gambar
   QRIS yang bisa diperbesar.
3. Daftar per event: judul, tanggal, nominal, status.
4. Tiap baris `belum_bayar` punya tombol `Sudah bayar`.
   Setelah ditekan, berubah jadi lencana `Menunggu konfirmasi Arjuna`
   beserta jam klaimnya. Tombolnya hilang, bukan sekadar nonaktif.
5. Baris `lunas` menampilkan tanggal pelunasan dan tidak punya tombol.

**Yang tidak boleh tampil:** surel siapa pun, nomor WhatsApp anggota lain,
nominal anggota lain, dan tautan ke bagian penalang.

`/bill/[token]` menampilkan satu event untuk semua peserta: daftar nama dan
nominal masing-masing beserta statusnya. Ini yang dibagikan ke grup.

| Keadaan | Tampilan |
| --- | --- |
| Token tidak dikenal | Halaman 404 biasa. Jangan sebut token salah atau kedaluwarsa |
| Sudah lunas semua | "Kamu sudah lunas semua. Makasih!" |

---

## Kemampuan PWA

- Manifest dengan ikon 192 dan 512 piksel, `display: standalone`.
- Service worker menyinggahkan kerangka aplikasi. Luring menampilkan kerangka
  beserta spanduk, bukan halaman galat peramban.
- Event yang dibuat saat luring masuk IndexedDB dan terkirim saat jaringan pulih.
- Halaman peserta **tidak** disinggahkan: status pembayaran harus selalu segar.

## Aksesibilitas

- Kontras teks minimal 4,5 banding 1.
- Status selalu punya label teks di samping warnanya.
- Setiap medan punya `label`, bukan hanya `placeholder`.
- Papan cek di layar koreksi memakai `aria-live="polite"`.
