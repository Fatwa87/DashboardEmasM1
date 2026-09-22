FIX UPLOAD DATA MULIA / SUPABASE
================================

Perbaikan utama:
1. Upload DATA MULIA.xlsx tidak lagi dikirim ke Supabase dalam satu RPC besar.
   Data KOL 1 / LAR / NPL disimpan bertahap (batch) agar lebih stabil.
2. Data monitoring lama tidak langsung dihapus. Sistem memasukkan snapshot baru dulu,
   lalu baru menghapus snapshot lama setelah semua batch berhasil.
3. Jika upload terputus sebelum selesai, sistem mencoba membersihkan batch baru agar
   data monitoring lama tetap aman.
4. Upload CSV Nasabah Mulia Lunas juga diubah menjadi batch agar file besar tidak mudah gagal.
5. Status upload menampilkan persentase/progress dan pesan error yang lebih jelas.

DATA MULIA.xlsx yang dilampirkan sudah diuji pembacaannya:
- Baris sumber: 16.129
- KOL 1: 719
- LAR: 816
- NPL: 243

CARA UPDATE WEBSITE
-------------------
Upload/replace seluruh isi folder website ini ke hosting yang sama.
Supabase URL dan publishable key sudah tetap menggunakan project Anda.

Jika setelah replace website muncul pesan "akses database ditolak" / RLS / permission denied,
jalankan FIX_UPLOAD_SUPABASE.sql satu kali di Supabase > SQL Editor.
Script tersebut tidak menghapus data.

Login upload harus menggunakan akun Area (Admin).
