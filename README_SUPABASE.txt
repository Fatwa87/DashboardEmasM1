DASHBOARD CLOSING EMAS - AREA MEDAN 1
VERSI ONLINE DENGAN SUPABASE


============================================================
PROJECT SUPABASE SUDAH DIHUBUNGKAN
============================================================
Project URL yang sudah dipasang di supabase-config.js:
https://halwqohiegmmxhfacrky.supabase.co

Publishable key juga sudah dipasang. Tidak perlu mengedit supabase-config.js lagi.

UNTUK MENGGANTI DATABASE LAMA DENGAN STRUKTUR BARU:
1. Buka Supabase Dashboard project tersebut.
2. Buka SQL Editor -> New query.
3. Copy seluruh isi file: reset-dan-install-closing-emas.sql
4. Klik Run.

Script reset hanya menghapus tabel/function/policy milik aplikasi Closing Emas
di schema public. User pada Supabase Authentication tidak dihapus.

Jika user Area / Outlet belum ada, buat setelah SQL selesai:
- area@closingemas.app / Area@123!
- outlet@closingemas.app / Outlet@123!

============================================================
RINGKASAN
============================================================
Versi ini tidak lagi memakai SQLite / server.py.
Database, login, role, dan penyimpanan data menggunakan Supabase PostgreSQL + Supabase Auth.
Frontend tetap berupa website statis sehingga dapat di-host di Netlify, Vercel, GitHub Pages,
Cloudflare Pages, shared hosting, atau hosting statis lainnya.

Semua perangkat yang membuka website online yang sama akan membaca database Supabase yang sama.

============================================================
1. BUAT PROJECT SUPABASE
============================================================
1. Masuk ke https://supabase.com/
2. Buat project baru.
3. Tunggu sampai project selesai dibuat.

============================================================
2. BUAT DATABASE
============================================================
1. Buka Supabase Dashboard -> SQL Editor.
2. Buka file: supabase-schema.sql
3. Copy seluruh isi file tersebut.
4. Paste ke SQL Editor lalu klik Run.

SQL tersebut otomatis membuat:
- profiles
- settings
- products
- locations
- realizations
- mulia_records
- risk_records
- risk_meta
- RLS / Row Level Security
- function bulk import CSV / Excel
- trigger role user
- target awal Rp 8.000.000.000
- master produk awal
- 96 pasangan cabang / outlet Area Medan 1

============================================================
3. BUAT 2 USER LOGIN DI SUPABASE AUTH
============================================================
Buka Supabase Dashboard -> Authentication -> Users -> Add user.
Buat user berikut dan pastikan email sudah Confirmed / Auto Confirm.

ADMIN
Email Supabase : area@closingemas.app
Password       : Area@123!
Login website  : Area
Role           : Admin
Hak akses      : Semua menu

UMUM
Email Supabase : outlet@closingemas.app
Password       : Outlet@123!
Login website  : Outlet
Role           : Umum
Hak akses      : Semua menu kecuali Report Realisasi dan Pengaturan

PENTING:
Website tetap meminta username Area / Outlet, bukan alamat email.
Pemetaan username -> email dilakukan otomatis di app.js.
Trigger database otomatis memberi role Admin / Umum berdasarkan email di atas.

Untuk website publik, sangat disarankan mengganti password default setelah instalasi.
Jika tidak membutuhkan pendaftaran user baru, matikan public sign-up di pengaturan Supabase Auth.
User lain yang tidak dikenali trigger akan diberi role Disabled dan tidak dapat membaca data aplikasi.

============================================================
4. HUBUNGKAN WEBSITE KE SUPABASE
============================================================
Di Supabase Dashboard buka Project Settings / API lalu copy:
- Project URL
- Publishable key (atau legacy anon key)

Buka file: supabase-config.js
Ubah menjadi contoh berikut:

window.CLOSING_EMAS_SUPABASE = {
  url: 'https://PROJECT_ID.supabase.co',
  key: 'PASTE_PUBLISHABLE_KEY_DISINI'
};

JANGAN menggunakan service_role key di browser / frontend.
Publishable / anon key memang digunakan di frontend dan keamanan data dikendalikan oleh RLS.

============================================================
5. TEST WEBSITE
============================================================
Setelah supabase-config.js diisi:
- Jalankan website melalui web server lokal, atau langsung deploy ke hosting statis.
- Login dengan:
  Area / Area@123!
  atau
  Outlet / Outlet@123!

Jika login gagal, cek:
1. supabase-config.js sudah berisi URL + key yang benar.
2. Dua user Auth sudah dibuat dan Confirmed.
3. supabase-schema.sql sudah dijalankan tanpa error.
4. Perangkat terhubung ke internet.

============================================================
6. DEPLOY AGAR BISA DIAKSES DI MANA SAJA
============================================================
Upload seluruh isi folder ini ke hosting statis pilihan Anda.
Contoh paling mudah: Netlify Drop / Vercel / GitHub Pages / Cloudflare Pages.

File yang WAJIB ikut di-upload:
- index.html
- styles.css
- app.js
- xlsx-mini.js
- supabase-config.js
- template-master-cabang-outlet-area-medan-1.csv
- template-nasabah-mulia-lunas.csv

File supabase-schema.sql dan README_SUPABASE.txt tidak wajib ikut dipublish,
tetapi simpan sebagai dokumentasi / backup struktur database.

============================================================
KEAMANAN & ROLE
============================================================
Role Admin:
- Semua menu.
- Dapat mengelola target, master produk, cabang/outlet.
- Dapat upload Mulia Lunas dan Excel KOL/LAR/NPL.
- Dapat menghapus Report Realisasi.

Role Umum:
- Dashboard.
- Input Realisasi.
- Daftar Nasabah Mulia Lunas.
- KOL 1 Emas.
- LAR Emas.
- NPL Emas.
- Tidak mendapatkan menu Report Realisasi dan Pengaturan.

Database juga memakai RLS, jadi pembatasan tidak hanya mengandalkan menu yang disembunyikan.

============================================================
DATA YANG TERSIMPAN ONLINE
============================================================
- Input Realisasi
- Target bulanan
- Master Produk
- Master Cabang & Outlet
- Nasabah Mulia Lunas
- KOL 1 Emas
- LAR Emas
- NPL Emas
- Metadata import

Data tersimpan di PostgreSQL Supabase dan dapat diakses dari perangkat berbeda setelah login.

============================================================
BACKUP
============================================================
Gunakan fitur backup / database export dari Supabase.
Untuk backup tambahan, data dapat diekspor dari menu aplikasi ke CSV sesuai fitur yang tersedia.

