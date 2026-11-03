-- Monsnatch Deck Builder: database schema
-- วิธีใช้: Supabase > SQL Editor > New query > วางไฟล์นี้ทั้งหมด > Run แล้วค่อยรัน seed.sql
-- รันซ้ำได้ ไม่ทำให้ข้อมูลหาย

-- 1) การ์ด: ทุกคนอ่านได้ แก้ไขได้เฉพาะเจ้าของโปรเจกต์ผ่าน Dashboard
create table if not exists public.cards (
  code        text primary key,
  name        text not null,
  element     text not null,
  power       int  not null,
  stars       int  not null,
  rarity      text,
  sight       text[] not null default '{}',
  beats       text[] not null default '{}',
  ability     text not null default '',
  ability_th  text not null default '',
  traits      text[] not null default '{}',
  image_url   text,
  thumb_url   text,
  updated_at  timestamptz not null default now()
);
alter table public.cards enable row level security;
drop policy if exists "cards are readable by everyone" on public.cards;
create policy "cards are readable by everyone" on public.cards for select using (true);

-- 2) Deck ที่บันทึก: อ่านได้ด้วยลิงก์ เพิ่มได้ แก้/ลบไม่ได้ (เป็น snapshot ที่แชร์ได้)
create table if not exists public.decks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Deck ไม่มีชื่อ',
  cards        text[] not null,
  total_stars  int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists decks_created_at_idx on public.decks (created_at desc);
alter table public.decks enable row level security;
drop policy if exists "decks are readable by link" on public.decks;
create policy "decks are readable by link" on public.decks for select using (true);
drop policy if exists "anyone can save a valid deck" on public.decks;
create policy "anyone can save a valid deck" on public.decks for insert with check (true);

-- 3) ตรวจกติกาฝั่งฐานข้อมูลทุกครั้งที่บันทึก: 10 ใบ ไม่ซ้ำ มีอยู่จริง รวมไม่เกิน 25 ดาว
create or replace function public.validate_deck() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int; u int; s int; f int;
begin
  new.name := left(btrim(coalesce(new.name, '')), 60);
  if new.name = '' then new.name := 'Deck ไม่มีชื่อ'; end if;
  n := coalesce(array_length(new.cards, 1), 0);
  if n <> 10 then raise exception 'Deck ต้องมี 10 ใบพอดี'; end if;
  select count(distinct c) into u from unnest(new.cards) as c;
  if u <> 10 then raise exception 'ห้ามมีการ์ดซ้ำใน Deck'; end if;
  select coalesce(sum(stars), 0), count(*) into s, f from public.cards where code = any (new.cards);
  if f <> 10 then raise exception 'มีรหัสการ์ดที่ไม่มีอยู่จริง'; end if;
  if s > 25 then raise exception 'Deck เกิน 25 ดาว (% ดาว)', s; end if;
  new.total_stars := s;
  return new;
end $$;
drop trigger if exists decks_validate on public.decks;
create trigger decks_validate before insert on public.decks for each row execute function public.validate_deck();
