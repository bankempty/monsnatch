# Monsnatch Deck Builder

เว็บจัด Deck Monsnatch (ชุด First Bond 181 ใบ) จัด Deck 10 ใบ ไม่เกิน 25 ดาว ชื่อไม่ซ้ำ ดูชนะ/แพ้รายธาตุ วิเคราะห์ แนวทางการเล่น แนวทางแก้ทาง พร้อมรูปการ์ด และบันทึก/แชร์ Deck ผ่านลิงก์

เป็นเว็บแบบ static ไม่ต้อง build ไม่ต้องติดตั้งอะไร Vercel อัปขึ้นได้ทันที ต่อ Supabase ผ่าน REST โดยตรง

> เครื่องมือของแฟนเกม ข้อมูลและรูปการ์ดเป็นของ Momon Wonder Co., Ltd.

## สิ่งที่ต้องทำเอง (ประมาณ 15 นาที)

### 1) Supabase (ฐานข้อมูล)
1. สมัคร/เข้า https://supabase.com แล้วกด **New project** (ตั้งรหัสผ่านฐานข้อมูลเก็บไว้)
2. ไปที่ **SQL Editor** > New query
   - วางไฟล์ `supabase/schema.sql` ทั้งหมด แล้วกด **Run**
   - New query ใหม่ วางไฟล์ `supabase/seed.sql` (การ์ด 181 ใบ) แล้วกด **Run**
3. ไปที่ **Project Settings > API** แล้วคัดลอก 2 ค่า
   - **Project URL** (เช่น `https://abcdxyz.supabase.co`)
   - **anon public key**
4. เปิดไฟล์ `config.js` ใส่ 2 ค่านั้นลงไป
   ```js
   window.MONSNATCH_CONFIG = {
     SUPABASE_URL: "https://abcdxyz.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi..."
   };
   ```
   ค่านี้เป็นค่า public ใส่ใน Git ได้ ความปลอดภัยอยู่ที่ Row Level Security ใน `schema.sql`
   **ห้ามใช้ `service_role` key ในไฟล์นี้เด็ดขาด**

### 2) GitHub (Public)
ทางง่ายสุด (ไม่ต้องใช้คำสั่ง)
1. https://github.com/new ตั้งชื่อ repo เช่น `monsnatch-deck-builder` เลือก **Public** แล้วสร้าง
2. กด **uploading an existing file** ลากไฟล์และโฟลเดอร์ทั้งหมดในโปรเจกต์นี้ (หลังแก้ `config.js` แล้ว) ลงไป แล้วกด **Commit changes**

หรือใช้คำสั่ง
```bash
git init && git add . && git commit -m "Monsnatch Deck Builder"
git branch -M main
git remote add origin https://github.com/<ชื่อคุณ>/monsnatch-deck-builder.git
git push -u origin main
```

### 3) Vercel (ออนไลน์)
1. https://vercel.com > **Add New... > Project** > เลือก repo ที่เพิ่งสร้าง (**Import**)
2. **Framework Preset: Other** ไม่ต้องใส่ Build Command / Output Directory ปล่อยว่าง
3. กด **Deploy** ได้ลิงก์ `https://<ชื่อ>.vercel.app`
4. ต่อไปแค่ push ขึ้น GitHub ทุกครั้ง Vercel จะอัปเดตเว็บให้เอง

## โครงสร้าง
```
index.html            หน้าเว็บ
assets/app.js         ตรรกะทั้งหมด (จัด Deck, วิเคราะห์, Supabase)
assets/style.css      หน้าตา (โหมดสว่าง/มืดอัตโนมัติ)
config.js             ค่า Supabase (แก้ไฟล์นี้)
data/cards.json       ข้อมูลการ์ดสำรอง ใช้เมื่อเชื่อม Supabase ไม่ได้
supabase/schema.sql   ตารางและกฎความปลอดภัย (รันก่อน)
supabase/seed.sql     ข้อมูลการ์ด 181 ใบ (รันหลัง)
vercel.json           ตั้งค่า cache
```

## ระบบทำงานอย่างไร
- **การ์ด**: เว็บโหลดจากตาราง `cards` ใน Supabase ถ้าไม่ได้จะใช้ `data/cards.json` แทน
- **รูปการ์ด**: ดึงตรงจาก `img.monsnatch.com` (ไม่ได้คัดลอกไฟล์มาเก็บ) ถ้ารูปโหลดไม่ขึ้น หน้าเว็บจะแสดงกรอบสีธาตุแทน
- **บันทึก Deck**: เพิ่มแถวใหม่ในตาราง `decks` แล้วได้ลิงก์ `?deck=<id>` ทุกคนที่มีลิงก์เปิดดูได้ แก้ไขหรือลบไม่ได้ (ถ้าแก้ Deck ให้บันทึกเป็นลิงก์ใหม่)
- **ตรวจกติกาฝั่งฐานข้อมูล**: trigger `validate_deck` ปฏิเสธ Deck ที่ไม่ครบ 10 ใบ มีการ์ดซ้ำ ไม่มีรหัสการ์ดจริง หรือเกิน 25 ดาว
- **ไม่มีระบบล็อกอิน**: รายการ "Deck ที่ฉันบันทึกไว้" จำในเบราว์เซอร์เครื่องนั้น

## ปรับแต่ง
- เปลี่ยนกติกา (จำนวนใบ/ดาวสูงสุด): แก้ `MAXSTAR`, `DECKSIZE` ใน `assets/app.js` และตัวเลข 10 / 25 ใน `validate_deck` ของ `schema.sql`
- ชุดการ์ดใหม่: เพิ่มแถวในตาราง `cards` ผ่าน Supabase Table Editor หรือ SQL แบบ `seed.sql`
- โปรเจกต์ Supabase แบบฟรีจะถูกพักถ้าไม่มีการใช้งานนาน ๆ เข้า Dashboard กด Restore ได้

## ทดสอบในเครื่อง
```bash
python3 -m http.server 8000   # แล้วเปิด http://localhost:8000
```
