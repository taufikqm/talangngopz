# Prompt siap tempel untuk Antigravity

Satu tiket per sesi. Sesi baru untuk tiket berikutnya, supaya agent tidak
membawa asumsi dari pekerjaan sebelumnya.

## Pola setiap prompt

Lima bagian, selalu urut. Prompt yang kehilangan salah satunya membuat agent
melebar ke tiket lain atau mengarang bagian yang tidak dispesifikasikan.

1. Suruh baca `AGENTS.md` dan tiketnya lebih dulu
2. Batasi ke satu tiket, sebutkan nomornya
3. Sebutkan berkas yang terkunci
4. Sebutkan perintah verifikasi
5. Sebutkan kapan harus berhenti dan lapor

---

## Sesi 0 — orientasi, sebelum menulis kode

Jalankan ini sekali. Tujuannya memastikan agent benar-benar membaca aturannya,
bukan menebak dari nama berkas.

```
Baca AGENTS.md, docs/backlog-tahap-1.md, dan docs/ui-spec-tahap-1.md.

Jangan menulis atau mengubah berkas apa pun pada sesi ini.

Jawab dalam bahasa Indonesia:
1. Sebutkan 10 aturan yang tidak boleh dilanggar, masing-masing satu kalimat.
2. Apa penentu apakah alokasi pajak dijalankan? Sebutkan nilainya.
3. Berkas mana saja yang tidak boleh kamu ubah?
4. Mengapa subtotal otoritatif dan satuan tidak?
5. Ada berapa tiket di Tahap 1, dan mana yang tidak boleh digabung dengan tiket lain?
```

Jawaban nomor 2 harus menyebut `selisih === 0`. Jawaban nomor 5 harus menyebut
T-03. Kalau meleset, agent belum membaca AGENTS.md dengan benar — ulangi dan
tunjuk berkasnya secara eksplisit sebelum lanjut.

---

## T-01 — Kerangka proyek

```
Baca AGENTS.md dan docs/backlog-tahap-1.md terlebih dahulu.

Kerjakan HANYA tiket T-01. Jangan menyentuh tiket lain, jangan membuat
halaman, jangan membuat Server Action.

Berkas berikut sudah final dan TIDAK boleh kamu ubah isinya, hanya dipindahkan
ke posisinya sesuai tata letak di AGENTS.md:
  src/lib/uang.ts
  src/lib/uang.test.ts
  src/lib/parser.ts
  src/lib/parser.test.ts
  src/lib/__fixtures__/chatgpt.ts
  src/lib/contracts.ts

Setelah selesai, jalankan dan tunjukkan hasilnya apa adanya:
  pnpm test
  pnpm typecheck
  pnpm lint

Syarat selesai: 52 uji hijau dan typecheck bersih.

Kalau ada uji yang merah, JANGAN mengubah berkas uji atau berkas lib untuk
membuatnya hijau. Laporkan galatnya dan berhenti.
```

Kalimat terakhir itu penting. Cara paling umum agent "menyelesaikan" uji yang
merah adalah dengan melonggarkan ujinya.

---

## T-02 — Migrasi dan seed

```
Baca AGENTS.md dan tiket T-02 di docs/backlog-tahap-1.md.

Kerjakan HANYA T-02.

Jalankan ketiga migrasi di supabase/migrations/ secara berurutan pada proyek
LOKAL (supabase start), bukan proyek awan. Jangan menyentuh proyek produksi.

Jangan mengubah isi berkas .sql yang sudah ada. Kalau ada yang gagal,
laporkan pesan galat Postgres apa adanya dan berhenti.

Setelah migrasi berhasil, uji kelima pemicu lewat SQL dan tunjukkan hasil
tiap perintah:
  1. update payment_events set catatan='x'   -> harus ditolak
  2. delete from payment_events               -> harus ditolak
  3. set terkunci=true pada satu event, lalu ubah kolom total -> harus ditolak
  4. ubah shares.status -> satu baris baru muncul di payment_events
  5. sisipkan shares yang jumlahnya tidak sama dengan events.total -> harus ditolak saat commit

Syarat selesai: supabase db reset berjalan bersih dari nol, dan kelima uji
di atas berperilaku seperti yang diharapkan.
```

---

## T-03 — Verifikasi RLS

Tiket paling sering dirusak. Prompt-nya memuat larangan eksplisit.

```
Baca AGENTS.md dan tiket T-03 di docs/backlog-tahap-1.md.

Kerjakan HANYA T-03. Ini tiket verifikasi, bukan tiket fitur.

LARANGAN KERAS: jangan memakai Supabase MCP untuk verifikasi ini.
Pengguna read-only MCP punya atribut BYPASSRLS, sehingga setiap kueri akan
selalu lolos walaupun kebijakannya salah total. Verifikasi WAJIB memakai
klien supabase-js dengan kunci anon dan sesi pengguna sungguhan.

Buat dua akun penalang uji, A dan B, masing-masing dengan satu event.

Tulis uji otomatis di src/lib/rls.test.ts yang membuktikan, untuk tabel
events, shares, bill_items, dan payment_events:
  - masuk sebagai A, select mengembalikan hanya baris milik A
  - masuk sebagai A, select baris milik B lewat id mengembalikan 0 baris
  - masuk sebagai A, update baris milik B tidak mengubah apa pun

Kalau ada SATU saja kueri yang mengembalikan baris milik orang lain:
berhenti, laporkan kebijakan mana yang bocor, dan JANGAN lanjut memperbaiki
sendiri sebelum saya konfirmasi.
```

---

## T-04 sampai T-15 — templat

Ganti nomor dan dua baris khususnya.

```
Baca AGENTS.md dan tiket T-<NN> di docs/backlog-tahap-1.md.
Untuk tiket yang menyentuh antarmuka, baca juga bagian yang relevan di
docs/ui-spec-tahap-1.md.

Kerjakan HANYA tiket T-<NN>. Jangan mengerjakan tiket berikutnya walaupun
terlihat sepele.

Jangan mengubah src/lib/uang.ts, src/lib/parser.ts, atau
src/lib/__fixtures__/chatgpt.ts.

Pakai tipe dari src/lib/contracts.ts. Jangan membuat bentuk galat baru.

Sebelum menulis kode, tulis dulu rencanamu dalam 5 sampai 10 baris:
berkas apa yang akan dibuat atau diubah, dan mengapa. Tunggu saya setujui.

Setelah selesai jalankan pnpm test, pnpm typecheck, pnpm lint, lalu tunjukkan
hasilnya apa adanya.

Terakhir, salin daftar "Selesai bila" dari tiket ini dan tandai satu per satu
mana yang sudah kamu buktikan dan bagaimana cara membuktikannya.
```

Bagian "tulis rencana dulu, tunggu saya setujui" itu yang paling banyak
menghemat waktu. Jauh lebih murah menolak rencana daripada menolak 15 berkas
yang sudah terlanjur ditulis.

---

## Prompt untuk situasi yang pasti terjadi

### Agent minta mengubah berkas terkunci

```
Tidak. uang.ts dan parser.ts sudah final dan teruji dengan data nyata.

Kalau tiket ini terasa menuntut perubahan di sana, berarti pemahamanmu
terhadap tiketnya yang keliru, bukan berkasnya.

Jelaskan dalam 3 kalimat apa tepatnya yang kamu butuhkan dan mengapa fungsi
yang ada tidak cukup. Jangan menulis kode dulu.
```

### Uji merah dan agent mulai mengotak-atik ujinya

```
Berhenti. Jangan mengubah berkas uji apa pun.

Uji itu menangkap kesalahan nyata yang pernah terjadi. Kalau merah, kode
barumu yang salah.

Tempelkan pesan galat lengkapnya, lalu jelaskan penyebabnya sebelum menulis
perbaikan apa pun.
```

### Agent melebar ke tiket lain

```
Kamu keluar dari ruang lingkup T-<NN>.

Batalkan perubahan pada berkas yang tidak disebut di tiket ini, lalu
tunjukkan diff akhirnya saja.
```

### Agent bilang selesai tapi kamu ingin memastikan

```
Tunjukkan output mentah dari ketiga perintah ini, jangan diringkas:
  pnpm test
  pnpm typecheck
  git diff --stat

Lalu jawab: adakah berkas yang kamu ubah tapi tidak disebut di tiket T-<NN>?
```

### Antara tiket, sebelum memulai yang berikutnya

```
Tanpa mengubah apa pun, periksa pekerjaan T-<NN> terhadap 10 aturan di
AGENTS.md.

Untuk tiap aturan, jawab: patuh, dilanggar, atau tidak relevan. Sertakan
path berkas dan nomor baris untuk setiap pelanggaran.
```

---

## Yang jangan dimasukkan ke prompt

**Jangan menempelkan hasil ChatGPT Arjuna** ke sesi yang tersambung Supabase
MCP. Itu teks dari luar, dan kombinasi teks tidak tepercaya dengan akses basis
data adalah pola yang dipakai demonstrasi prompt injection. Untuk pengujian,
rujuk fikstur yang sudah ada:

```
Pakai fikstur di src/lib/__fixtures__/chatgpt.ts untuk pengujian.
Jangan meminta saya menempelkan keluaran ChatGPT yang baru.
```

**Jangan menyuruh agent menjalankan migrasi ke produksi.** Itu kamu kerjakan
sendiri lewat Supabase CLI dari terminalmu, mengikuti SRS bagian 10.4.
