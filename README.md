# 🗡️ Custom NPC Quest System (Minecraft Bedrock Add-On)

Sistem pembuatan Quest dan Manajemen NPC tercanggih untuk Minecraft Bedrock Edition (versi 1.21.0+). Seluruh manajemen sistem dirancang agar bisa kamu kendalikan 100% dari dalam game menggunakan **Graphical User Interface (GUI)**—tanpa perlu repot menyentuh baris kode (coding) sama sekali!

Sangat cocok digunakan untuk pembuatan **Story Map**, **RPG Realm**, maupun **Survival Server** yang ingin memiliki alur cerita dan misi interaktif.

---

## 🌟 Fitur Utama

- 🎨 **100% In-Game GUI**: Membuat, mengedit, dan menghapus Quest langsung dari UI dalam game.
- 🗣️ **Dynamic Dialog Tree**: NPC pintar yang merespon secara berbeda tergantung status pemain (Belum Punya Quest, Quest Tersedia, Sedang Berjalan, atau Quest Selesai).
- 📖 **Custom Menu Item (Player UI)**: Pemain biasa (Non-Admin) akan mendapatkan item buku fisik *Menu* secara otomatis saat pertama kali join. Klik kanan item untuk mengecek *Quest Tracker* tanpa menggunakan command! (Item anti-drop & keep-on-death).
- 🎯 **Auto-Tracking Objective**: Progress pemain (bunuh monster, kumpulkan item, pergi ke kordinat) terdeteksi dan tercatat secara *real-time* dengan notifikasi di *Action Bar*.
- 🧹 **Auto-Garbage Collection**: Menghapus Quest di *Quest Builder* akan otomatis menyapu bersih memori yang tertinggal di seluruh NPC dan data pemain di semua dimensi untuk mencegah kebocoran memori (memory leak).
- 🧍 **Custom Humanoid NPC**: NPC menggunakan kerangka standar Player 64x64 (Steve/Alex) sehingga kamu bisa mengganti skin-nya semudah me-replace satu file PNG saja.

---

## 📥 Pemasangan (Installation)

1. Unduh folder **Behavior Pack (BP)** dan **Resource Pack (RP)**.
2. Masukkan ke dalam folder `development_behavior_packs` dan `development_resource_packs` Minecraft kamu.
3. Pasang kedua pack tersebut ke dalam World.
4. **PENTING:** Pastikan fitur **Beta APIs** (Eksperimen) sudah diaktifkan di pengaturan World kamu!

---

## 🛠️ Panduan Penggunaan (Admin)

Secara default, semua pemain yang masuk dianggap sebagai pemain biasa. Agar kamu bisa mengakses Menu Admin dan memunculkan NPC, ikuti langkah berikut:

### 1. Mendapatkan Akses Admin
Ketik perintah ini di *chat bar*:
```mcfunction
/tag @s add admin
```
*(Gunakan `/tag @s remove admin` untuk kembali menjadi player biasa dan mengetes quest)*.

### 2. Membuat Quest Pertama
- Ketik perintah rahasia: `/scriptevent npc:builder`
- Klik **"✚ Buat Quest Baru"** dan isi formulirnya (Judul, Deskripsi, Tipe Misi, dll).
- Untuk tipe misi, kamu bisa memilih:
  - `kill_entity`: Target (contoh: `zombie`), Target Count (contoh: 10).
  - `collect_item`: Target (contoh: `diamond`), Target Count (contoh: 5).
  - `go_to_location`: Target koordinat X,Y,Z,Radius (contoh: `100,64,200,5`).
  - `talk_to`: Nama NPC spesifik.
- Masukkan *ID Item* dan *XP* sebagai hadiah (Reward).

### 3. Memunculkan NPC & Menyematkan Quest
- Berdirilah di posisi yang kamu inginkan, lalu ketik `/scriptevent npc:spawn`.
- Karena kamu memiliki pangkat Admin, **klik NPC tersebut** (Interact/Bicara) untuk memunculkan **Admin Panel**.
- Di Admin Panel, kamu bisa mengubah Nama NPC, mengedit Dialog (percakapan), dan **Assign Quest** (mencentang Quest yang sudah kamu buat sebelumnya agar dipegang oleh NPC ini).

---

## 🎮 Panduan Bermain (Player)

Pemain yang bermain di Mode Survival/Adventure tidak perlu mengetik command apapun.

1. **Auto-Item**: Saat pertama kali mendarat di dunia, pemain akan menerima Custom Item **"Menu"** di slot hotbar ujung kanan mereka.
2. **Quest Tracker**: Pemain cukup memegang item "Menu" tersebut (klik kanan/tahan di layar HP) untuk melihat daftar Quest yang sedang berjalan dan yang sudah selesai.
3. **Menerima Misi**: Dekati NPC dan klik "Bicara". Jika NPC memiliki quest, tombol "Tampilkan Quest" akan muncul.
4. **Mengklaim Hadiah**: Setelah notifikasi *Action Bar* menyatakan misi selesai, pemain tinggal mengklik kembali NPC pemberi tugas. NPC akan otomatis menyerahkan item hadiah & XP ke tas pemain!

---

## ⌨️ Daftar Command `/scriptevent`

Meskipun sistem berfokus pada UI, ada beberapa jalan pintas yang bisa digunakan jika item Menu hilang atau Admin ingin akses cepat:

| Command | Role | Deskripsi |
| :--- | :--- | :--- |
| `/scriptevent npc:admin` | Admin | Membuka Panel Admin Induk (Akses Cepat ke Builder & Tracker). |
| `/scriptevent npc:builder` | Admin | Membuka *Quest Builder* secara langsung. |
| `/scriptevent npc:spawn` | Admin | Memunculkan entitas NPC di titik pijakanmu saat ini. |
| `/scriptevent npc:tracker` | Semua Player | Alternatif manual untuk melihat Quest aktif (jika tidak mau pakai item buku). |
| `/scriptevent npc:help` | Semua Player | Membaca panduan singkat di kolom chat. |

---

## 🎨 Kustomisasi Skin NPC
Jika kamu ingin mengganti wajah/baju NPC:
1. Buka folder Resource Pack add-on ini.
2. Masuk ke `textures/entity/quest_npc/`.
3. Timpa (*replace*) file `skin.png` dengan gambar skin 64x64 (Steve format) milikmu sendiri.
4. Masuk ke game, dan penampilan semua NPC akan berubah!

---

*Dibuat untuk mempermudah kreator map Minecraft Bedrock Edition.* 🚀
