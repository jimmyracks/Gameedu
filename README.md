# GameEdu

Aplikasi belajar interaktif untuk guru dan murid. Menyediakan pendaftaran dan login, bank soal, kelas, laporan belajar, kuis Speed Clash, Territory Grid, dan riwayat permainan murid.

Backend memakai SQLite bawaan Node.js (`node:sqlite`), jadi tidak perlu memasang server database terpisah. Gunakan Node.js 22.13 atau lebih baru.

## Struktur proyek

```text
frontend/
  public/              File statis dan ikon
  src/
    components/        Komponen UI kecil yang dipakai ulang
    features/
      auth/            Halaman login dan registrasi
      arena/           Dashboard murid, game, dan papan skor
      teacher/         Dashboard guru, bank soal, kelas, dan laporan
    lib/               Utilitas frontend, termasuk pemanggilan API
    styles/            Gaya halaman aplikasi
    App.jsx            Pengatur sesi dan pemilihan halaman
    main.jsx           Entry point React
  index.html
  vite.config.js
backend/
  lib/                 Helper HTTP dan sesi autentikasi
  routes/              Handler endpoint auth, arena, dan dashboard guru
  data/                Database SQLite lokal (dibuat saat server berjalan)
  database.js          Schema SQLite dan migrasi data lama
  index.js             Bootstrap server dan Vite
shared/
  game-data.js         Data soal bersama frontend dan backend
package.json           Perintah dan dependensi workspace
```

## Menjalankan aplikasi

```sh
npm install
npm run dev
```

Buka URL lokal yang ditampilkan di terminal (default `http://localhost:5173`). Perintah ini menjalankan frontend dan backend API bersama-sama.

Untuk uji coba dari perangkat lain pada jaringan lokal tepercaya, gunakan PowerShell:

```powershell
$env:HOST = "0.0.0.0"
npm run dev
```

Lalu buka `http://IP-KOMPUTER-GURU:5173` di perangkat murid. Jangan gunakan mode ini pada jaringan publik.

## Akun

Buat akun melalui halaman awal, lalu masuk dengan email, kata sandi, dan jenis akun yang sama. Database disimpan di `backend/data/ruangkelas.sqlite`; data akun, sesi login, arena, peserta, jawaban per soal, dan skor tetap tersedia setelah server dimulai ulang. Kata sandi disimpan sebagai hash scrypt, bukan teks biasa.

Jika sebelumnya sudah membuat akun dengan versi JSON, server akan memindahkannya ke SQLite saat pertama kali dijalankan dan menyimpan salinan lama sebagai `backend/data/users.json.migrated`. Jangan hapus file SQLite jika ingin mempertahankan data.

## Permainan

Akun guru dapat membuat arena dan membagikan kode enam digit. Saat membuat sesi, guru dapat memilih mapel, bab, jumlah soal, dan template game; soal yang tersedia diambil dari bank soal yang sudah disetujui. Tombol **Buat soal sendiri** pada halaman pembuatan sesi membuka formulir untuk menulis soal pilihan ganda, pilihan jawaban, kunci, dan pembahasan; soal disimpan ke bank milik guru dan bisa langsung dipilih untuk sesi. Guru juga dapat menambahkan soal ke mapel khusus melalui bank soal. Jika belum ada soal yang disetujui, tiga soal bawaan dapat dipakai. Durasi menjawab pada setiap soal mengikuti pengaturan bank soal. Murid dapat memasukkan kode arena untuk bergabung. Jawaban dan papan skor dibagikan melalui backend lokal dan disimpan di SQLite.

Territory Grid dimainkan secara individu dengan giliran bergantian pada papan 5×5. Jawaban benar merebut petak; jawaban salah membuat petak menjadi netral. Guru dapat melewati giliran, dan permainan berakhir saat semua petak terisi. Pemain dengan petak terbanyak menang.

## Dashboard guru

Dashboard guru menyediakan bank soal pilihan ganda (tambah, edit, hapus, dan filter), sesi game aktif, pembuatan kelas dengan kode undangan, daftar murid, analisis per kelas/per murid/per soal, serta ekspor laporan CSV. Murid dapat melihat riwayat permainan, pembahasan jawaban, target dan lencana berbasis hasil tersimpan, serta peringkat kelas opsional.

Untuk membuat build produksi dan menjalankannya:

```sh
npm run build
npm start
```

Atur port dengan environment variable `PORT` bila port default `5173` sedang digunakan.
