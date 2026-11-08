# AGENTS.md

Baca berkas ini sebelum menulis kode apa pun di repositori ini.

## Apa yang dibangun

Pencatat talangan dan pembagian tagihan untuk satu sirkel pertemanan berisi 12 orang.
Satu sampai tiga orang menalangi pembayaran, sisanya membayar kembali belakangan.

Masalah yang diselesaikan adalah **melacak siapa yang belum membayar**, bukan menghitung
pembagian. Perhitungan hanyalah pendukung. Jika sebuah fitur tidak membuat status utang
lebih jelas, fitur itu bukan prioritas.

Sistem tidak pernah memproses, menyimpan, atau memindahkan uang.

## Tumpukan teknologi

| Lapis | Pilihan |
| --- | --- |
| Kerangka kerja | Next.js 15, App Router, TypeScript mode `strict` |
| Antarmuka | Tailwind CSS, shadcn/ui |
| Basis data | Supabase PostgreSQL |
| Autentikasi | Supabase Auth, magic link, hanya untuk penalang |
| Hosting | Vercel |
| Uji | Vitest |

Seluruh layanan memakai paket gratis. Jangan menambahkan dependensi berbayar, layanan
pihak ketiga baru, atau penyedia model AI apa pun tanpa diminta.

---

## Aturan yang tidak boleh dilanggar

Sepuluh aturan berikut menutup hampir semua cara sistem ini bisa rusak tanpa terlihat.
Jika sebuah perubahan melanggar salah satunya, perubahan itu salah, walaupun ujinya hijau.

### Uang

1. **Nominal selalu bilangan bulat rupiah penuh.** `bigint` di PostgreSQL, `number` bulat
   di TypeScript. Tipe `float`, `numeric` berdesimal, dan satuan sen dilarang.

2. **Jumlah seluruh porsi harus sama persis dengan yang dibayar penalang.** Ini invarian
   utama. Setiap fungsi yang membagi uang wajib memeriksanya dan melempar galat bila
   gagal. Jangan pernah membulatkan diam-diam agar cocok.

3. **Jalur impor tidak pernah mengalokasi.** Data dari ChatGPT hampir selalu sudah
   mengandung pajak. Penentunya `selisih = total_tercetak - Σ subtotal`. Nilai `0` berarti
   harga final dan alokasi **tidak dijalankan sama sekali**. Lihat `src/lib/parser.ts`.

   Alokasi ganda tidak terdeteksi invarian nomor 2, karena datanya konsisten di level
   pasca-pajak. Hanya aturan `selisih` ini yang menjaganya.

4. **`subtotal` otoritatif, `satuan` hanya untuk ditampilkan.** Saat memecah baris
   `qty > 1` menjadi unit, bagi `subtotal`. Jangan mengalikan `satuan`: pada nilai yang
   tidak habis dibagi, perkalian balik meleset dari total.

5. **Jangan menulis ulang logika uang.** `src/lib/uang.ts` dan `src/lib/parser.ts` sudah
   final dan berisi uji dari data nyata. Pakai apa adanya. Jika sebuah kebutuhan tampak
   menuntut rumus baru, hentikan pekerjaan dan tanyakan.

### Keamanan

6. **`SUPABASE_SERVICE_ROLE_KEY` tidak pernah berawalan `NEXT_PUBLIC_`** dan tidak pernah
   masuk ke komponen klien, tanggapan API, atau log. Kunci ini melewati seluruh RLS.

7. **Setiap tabel baru wajib mengaktifkan RLS pada migrasi yang sama.** Tabel tanpa RLS
   terbaca penuh oleh siapa pun yang memegang kunci `anon`.

8. **Jalur peserta memakai `service_role`, jadi RLS tidak melindunginya.** Batasi baris
   secara manual di setiap kueri: cocokkan token lebih dulu, ambil `member_id`, lalu
   batasi kueri dengan `member_id` itu. Peserta hanya boleh mengubah kolom `status` dari
   `belum_bayar` ke `menunggu_konfirmasi`, tidak pernah kolom nominal.

9. **Teks tempelan adalah masukan tidak tepercaya.** Penguraian murni manipulasi string.
   Dilarang `eval`, `new Function`, dan `dangerouslySetInnerHTML` pada jalur impor.

10. **`payment_events` bersifat sisip-saja.** Tidak ada `UPDATE`, tidak ada `DELETE`,
    oleh peran mana pun. Riwayat ini satu-satunya jawaban saat terjadi perselisihan.

---

## Keputusan yang sudah ditutup

Jangan usulkan ulang tanpa diminta.

| Topik | Keputusan |
| --- | --- |
| OCR, pembacaan gambar struk | Tidak dikerjakan. Masukan selalu teks |
| Memanggil API model AI | Tidak dikerjakan. Penalang memakai langganannya sendiri |
| Mengotomasi antarmuka ChatGPT | Dilarang. Melanggar ketentuan layanan OpenAI |
| Akun untuk peserta | Tidak ada. Peserta memakai tautan bertoken |
| Payment gateway | Tidak dikerjakan |
| Obrolan di dalam aplikasi | Tidak dikerjakan. Sirkel sudah punya grup WhatsApp |

---

## Tata letak berkas

```
src/
  app/
    (penalang)/              route bersesi: dasbor, event, anggota, pengaturan
    (publik)/
      bill/[token]/          rekap satu event, tanpa login
      me/[token]/            rekap pribadi lintas event, tanpa login
    api/
  components/
    ui/                      shadcn, jangan disunting manual
  lib/
    uang.ts                  perhitungan uang. FINAL
    parser.ts                penguraian tabel. FINAL
    contracts.ts             tipe masukan dan keluaran Server Action
    supabase/
      server.ts              klien dengan sesi pengguna, memakai kunci anon
      service.ts             klien service_role. Hanya boleh diimpor dari sisi server
  actions/                   Server Action, satu berkas per bidang
supabase/
  migrations/
  seed.sql
docs/
```

## Perintah

```bash
pnpm dev
pnpm test            # wajib hijau sebelum menyatakan selesai
pnpm test -- --watch
pnpm typecheck
pnpm lint
supabase db reset    # jalankan ulang seluruh migrasi plus seed, lokal saja
```

## Gaya kode

- Bahasa Indonesia untuk nama domain (`porsi`, `talangan`, `penalang`, `lunas`).
  Bahasa Inggris untuk istilah kerangka kerja yang sudah baku.
- Teks antarmuka seluruhnya bahasa Indonesia. Nominal berformat `Rp1.234.567`.
- Komentar hanya untuk menjelaskan **mengapa**, bukan apa.
- Tanpa `any`. Tanpa `@ts-ignore`.
- Server Action mengembalikan `Hasil<T>` dari `contracts.ts`, bukan melempar galat ke klien.

## Definisi selesai

Sebuah tiket selesai hanya bila seluruh butir ini benar.

- [ ] `pnpm test` hijau, termasuk uji invarian uang
- [ ] `pnpm typecheck` dan `pnpm lint` bersih
- [ ] Tabel baru punya RLS aktif beserta kebijakannya
- [ ] Kriteria terima pada tiket terpenuhi dan diuji manual
- [ ] Tidak ada rahasia yang bertambah di berkas berawalan `NEXT_PUBLIC_`
- [ ] Antarmuka terbaca pada lebar 360 piksel

## Bila ragu

Hentikan pekerjaan dan tanyakan. Jangan menebak pada hal yang menyangkut uang, otorisasi,
atau penghapusan data. Menebak salah pada tiga hal itu baru ketahuan berminggu-minggu
kemudian, setelah ada yang merasa ditagih dua kali.
