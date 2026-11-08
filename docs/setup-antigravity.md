# Persiapan sebelum tiket T-01

Kerjakan urut. Bagian 5 memuat peringatan keamanan yang jangan dilewati.

---

## 1. Perkakas lokal

| Perkakas | Versi | Cek |
| --- | --- | --- |
| Node | 22 LTS atau lebih baru | `node --version` |
| pnpm | 9 atau lebih baru | `pnpm --version` |
| Supabase CLI | terbaru | `supabase --version` |
| Git | apa saja | `git --version` |
| Docker Desktop | terbaru | `docker --version` |

Docker dipakai `supabase start` untuk menjalankan basis data lokal. Tanpa itu,
seluruh pekerjaan skema terpaksa langsung ke proyek awan, dan itu menghapus
jaring pengaman untuk bereksperimen.

```bash
npm install -g pnpm supabase
```

## 2. Akun dan proyek

**Supabase, dua proyek terpisah.** Beri nama `arjuna-dev` dan `arjuna-prod`.
Catat untuk masing-masing: Project URL, Project Ref, kunci `anon`, kunci
`service_role`.

Pemisahan ini bukan formalitas. Migrasi yang gagal separuh jalan di `prod`
berarti data talangan yang sedang berjalan rusak, dan tidak ada cadangannya
di paket gratis.

**Vercel.** Satu proyek, tautkan ke repositori Git yang akan dibuat.

**Token akses Supabase** untuk MCP. Pakai **scoped token**, bukan classic
token. Classic token memberi seluruh izin di semua organisasi dan proyek yang
kamu miliki; scoped token bisa dibatasi ke satu proyek saja.

Dasbor Supabase, Account, Access Tokens, buat token baru yang dibatasi ke
`arjuna-dev` saja. **Jangan beri akses ke `arjuna-prod`.**

## 3. Repositori

```bash
mkdir arjuna-split-bill && cd arjuna-split-bill
git init
```

Salin 14 berkas ke akar. Lalu, sebelum commit pertama:

```bash
cat > .gitignore <<'EOF'
node_modules/
.next/
.env*.local
.env
.agents/mcp_config.json
EOF
```

Baris terakhir mencegah token MCP ikut ter-commit bila kamu memilih
konfigurasi per-workspace.

## 4. MCP Supabase di Antigravity

### Lokasi berkas konfigurasi

Dua sumber menyebut path berbeda: dokumentasi Antigravity menyebut
`~/.gemini/config/mcp_config.json` untuk CLI dan
`<workspace>/.agents/mcp_config.json` untuk workspace, sementara panduan
instalasi GitHub menyebut `~/.gemini/antigravity/mcp_config.json`
(`C:\Users\<USERNAME>\.gemini\antigravity\mcp_config.json` di Windows).

Jangan menebak. Buka Antigravity, **Customizations**, **Installed**, scroll ke
**MCP Servers**, lalu tekan **Copy Config File Path**. Itu jawaban yang pasti
untuk versi yang kamu pasang.

Di Antigravity IDE jalurnya: tombol **…** di atas agent panel, **MCP Servers**,
**Manage MCP Servers**, **View raw config**.

### Konfigurasi — server hosted, pilihan utama

Tidak ada token yang tersimpan di berkas. Autentikasi lewat sign-in peramban.

```json
{
  "mcpServers": {
    "supabase-dev": {
      "serverUrl": "https://mcp.supabase.com/mcp?project_ref=REF_DEV_KAMU&read_only=true&features=database,docs"
    }
  }
}
```

Tiga parameter itu dipakai bersama, bukan salah satu:

| Parameter | Fungsi |
| --- | --- |
| `project_ref` | Mengunci ke satu proyek dan membuang sembilan tool tingkat akun |
| `read_only=true` | Menjalankan SQL sebagai pengguna Postgres read-only |
| `features=database,docs` | Hanya mengaktifkan grup tool yang dibutuhkan |

Pakai field `serverUrl`, bukan `url`. Antigravity menolak `url` dengan galat
`serverUrl or command must be specified`, dan `httpUrl` tidak didukung.

### Konfigurasi — server lokal, bila perlu

```json
{
  "mcpServers": {
    "supabase-dev": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase", "--read-only", "--project-ref=REF_DEV_KAMU"],
      "env": { "SUPABASE_ACCESS_TOKEN": "sbp_token_scoped_kamu" }
    }
  }
}
```

Nama flag di atas belum terverifikasi dari dokumentasi resmi Supabase.
Cek dulu dengan `npx -y @supabase/mcp-server-supabase --help` sebelum dipakai.

**Nama paketnya harus pakai scope `@supabase/`.** Paket tanpa scope,
`mcp-server-supabase`, pernah berisi malware pada Mei 2026.

### Setelah mengubah konfigurasi

Tutup dan buka lagi Antigravity. Di App tersedia **Restart** per server lewat
menu **⋮**; di CLI ketik `/mcp` untuk memuat ulang.

Jaga agar jumlah total tool yang aktif di bawah 50. Itu sebabnya
`features=database,docs` dibatasi, bukan dibiarkan penuh.

---

## 5. Peringatan keamanan

Bagian ini bukan formalitas. Baca sampai habis sebelum menyambungkan MCP.

**Mode read-only tidak menghormati Row Level Security.** Pengguna
`supabase_read_only_user` memiliki atribut `BYPASSRLS` dan keanggotaan
`pg_read_all_data`. Pengguna itu dapat membaca seluruh tabel, termasuk
`auth.users` yang berisi surel setiap orang yang mendaftar.

Konsekuensi langsung untuk proyek ini: **jangan pernah memverifikasi RLS lewat
MCP.** Tiket T-03 akan selalu lolos, bahkan ketika kebijakannya salah total,
karena MCP melewati kebijakan itu secara desain. Verifikasi RLS wajib memakai
dua sesi login sungguhan dengan kunci `anon`, persis seperti yang tertulis di
T-03.

**Read-only hanya menutup separuh serangan prompt injection.** Pada
demonstrasi Juni 2025 oleh General Analysis, sebuah tiket dukungan berisi
instruksi yang ditujukan ke agent. Agent membaca tabel token dan menuliskan
isinya kembali ke tiket, lalu penyerang membacanya. Kutipan laporannya:
"No permissions were violated." Read-only menutup bagian menulis ke basis
data, bukan bagian membaca lalu membocorkan.

Supabase membungkus hasil SQL dengan peringatan agar model tidak mengikuti
instruksi di dalam data, dan sejak versi 0.13.0 meminta konfirmasi untuk SQL
yang tampak merusak. Supabase sendiri menyebut keduanya "not a security
guarantee".

**Aturan untuk proyek ini:**

1. MCP hanya pernah menunjuk `arjuna-dev`. Project ref produksi tidak pernah
   dimasukkan ke konfigurasi mana pun.
2. Token yang dipakai adalah scoped token yang hanya bisa menyentuh `arjuna-dev`.
3. Biarkan prompt persetujuan Antigravity tetap aktif untuk setiap pemanggilan
   tool. Jangan pakai `skip_elicitations`.
4. Jangan menempelkan teks tidak tepercaya ke sesi yang sama dengan MCP aktif.
   Untuk proyek ini artinya konkret: **jangan menempelkan hasil ChatGPT Arjuna
   ke chat agent yang sedang tersambung MCP.** Pakai fikstur di
   `src/lib/__fixtures__/chatgpt.ts` untuk pengujian.
5. Migrasi ke produksi dijalankan lewat Supabase CLI dari terminal kamu
   sendiri, bukan lewat agent.

---

## 6. Bootstrap basis data

```bash
supabase init
supabase start            # Postgres lokal lewat Docker
supabase db reset         # menjalankan migrations/ lalu seed.sql
```

Sebelum `seed.sql` berjalan di proyek awan, kerjakan bootstrap penalang
pertama yang tertulis di kepala berkas itu. Tanpa baris di `profiles`, tidak
ada seorang pun yang bisa login, dan agent cenderung "memperbaikinya" dengan
membuang pemeriksaan surel.

## 7. Variabel lingkungan

`.env.local`, jangan di-commit:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://REF_DEV.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Periksa sekali lagi: `SUPABASE_SERVICE_ROLE_KEY` tidak berawalan
`NEXT_PUBLIC_`. Awalan itu menanamkan nilainya ke berkas JavaScript yang
dikirim ke peramban, dan kunci itu melewati seluruh RLS. Kebocorannya tidak
bisa ditarik kembali; kuncinya harus langsung dicabut dan dibuat ulang.

---

## 8. Prompt pertama ke Antigravity

```
Baca AGENTS.md dan docs/backlog-tahap-1.md terlebih dahulu.

Kerjakan HANYA tiket T-01. Jangan menyentuh tiket lain.

Jangan mengubah isi src/lib/uang.ts, src/lib/parser.ts, atau
src/lib/__fixtures__/chatgpt.ts. Ketiganya sudah final dan teruji.

Setelah selesai, jalankan pnpm test dan tunjukkan hasilnya.
Harus 52 uji hijau.
```

Satu tiket per sesi. Sesi baru untuk tiket berikutnya, supaya konteksnya
bersih dan agent tidak membawa asumsi dari pekerjaan sebelumnya.

---

## Sumber

- [MCP — Antigravity](https://antigravity.google/docs/mcp/)
- [Installing GitHub MCP Server in Antigravity](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-antigravity.md)
- [Supabase MCP Server: What Read-Only Mode Doesn't Stop](https://fastero.com/blog/supabase-mcp-server)
