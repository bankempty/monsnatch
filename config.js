// ตั้งค่า Supabase (ค่าเหล่านี้เป็นค่า public ใส่ใน Git ได้)
// เอามาจาก Supabase > Project Settings > API
//   SUPABASE_URL      = Project URL เช่น https://abcdxyz.supabase.co
//   SUPABASE_ANON_KEY = anon public key (ห้ามใช้ service_role key เด็ดขาด)
// ปล่อยว่างไว้ = เว็บทำงานแบบออฟไลน์ (ใช้ไฟล์ data/cards.json และบันทึก Deck ในเบราว์เซอร์เท่านั้น)
window.MONSNATCH_CONFIG = {
  SUPABASE_URL: "https://mzghqqibaustzqldmjlw.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16Z2hxcWliYXVzdHpxbGRtamx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2OTA1ODcsImV4cCI6MjEwOTI2NjU4N30.Z1YArIa9E-FHRSnCRaBFolFB9AeSFg82X6jx0MPMjls"
};
