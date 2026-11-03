// ตั้งค่า Supabase (ค่าเหล่านี้เป็นค่า public ใส่ใน Git ได้)
// เอามาจาก Supabase > Project Settings > API
//   SUPABASE_URL      = Project URL เช่น https://abcdxyz.supabase.co
//   SUPABASE_ANON_KEY = anon public key (ห้ามใช้ service_role key เด็ดขาด)
// ปล่อยว่างไว้ = เว็บทำงานแบบออฟไลน์ (ใช้ไฟล์ data/cards.json และบันทึก Deck ในเบราว์เซอร์เท่านั้น)
window.MONSNATCH_CONFIG = {
  SUPABASE_URL: "https://mzghqqibaustzqldmjlw.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_GbE15HXpBCCl-CUqRo6s2w_Dho7XQLr"
};
