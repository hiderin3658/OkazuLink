-- =====================================================================
-- Phase 0: 基盤テーブル
-- 作成日: 2026-04-21
-- 対象: allowed_users, user_profiles, foods, ai_advice_logs
-- Phase 1 以降で使用するテーブルも早めに作成しておく
-- =====================================================================

-- 拡張
create extension if not exists "pgcrypto";

-- =====================================================================
-- 1. allowed_users: Google 認証後のホワイトリスト
-- =====================================================================
create type public.user_role as enum ('admin', 'user');

create table public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role public.user_role not null default 'user',
  note text,
  created_at timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

-- =====================================================================
-- 認可用ヘルパー関数（SECURITY DEFINER で RLS をバイパスして再帰を防止）
-- =====================================================================

-- 現在の認証ユーザーの email を返す
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'email';
$$;

-- 現在の認証ユーザーが admin かどうか判定
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where email = auth.jwt() ->> 'email' and role = 'admin'
  );
$$;

grant execute on function public.current_email() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- =====================================================================
-- allowed_users ポリシー
-- =====================================================================

-- 自分の行だけ SELECT 可
create policy "allowed_users: self select"
  on public.allowed_users for select
  to authenticated
  using (email = public.current_email());

-- admin は全行 SELECT 可（is_admin が SECURITY DEFINER なので再帰しない）
create policy "allowed_users: admin select all"
  on public.allowed_users for select
  to authenticated
  using (public.is_admin());

-- admin のみ INSERT / UPDATE / DELETE
create policy "allowed_users: admin insert"
  on public.allowed_users for insert
  to authenticated
  with check (public.is_admin());

create policy "allowed_users: admin update"
  on public.allowed_users for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "allowed_users: admin delete"
  on public.allowed_users for delete
  to authenticated
  using (public.is_admin());

-- =====================================================================
-- 2. user_profiles: ユーザーの目標・プロフィール情報
-- =====================================================================
create type public.goal_type as enum ('diet', 'muscle', 'maintenance', 'custom');

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  birth_year int,
  height_cm numeric(5, 1),
  target_weight_kg numeric(5, 1),
  goal_type public.goal_type,
  allergies text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "user_profiles: self select"
  on public.user_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_profiles: self insert"
  on public.user_profiles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_profiles: self update"
  on public.user_profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- updated_at 自動更新
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. foods: 食材マスタ（日本食品標準成分表 八訂増補2023年 ベース）
-- =====================================================================
create type public.food_category as enum (
  'vegetable', 'meat', 'fish', 'dairy', 'grain',
  'seasoning', 'beverage', 'sweet', 'fruit', 'egg', 'other'
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  code text unique,              -- 食品番号（例: "01001"）
  name text not null,            -- 標準食品名
  aliases text[] not null default '{}',  -- 表記ゆれ（例: ["とりもも", "とりもも肉"]）
  category public.food_category not null default 'other',
  food_group text,               -- 食品群（例: "10 魚介類"）
  nutrition_per_100g jsonb not null default '{}'::jsonb,
  source text not null default '文部科学省 日本食品標準成分表（八訂）増補2023年',
  created_at timestamptz not null default now()
);

create index foods_name_idx on public.foods using gin (to_tsvector('simple', name));
create index foods_aliases_idx on public.foods using gin (aliases);

alter table public.foods enable row level security;

-- 認証ユーザーなら誰でも読める
create policy "foods: read for authenticated"
  on public.foods for select
  to authenticated
  using (true);

-- admin のみ書き込み
create policy "foods: admin write"
  on public.foods for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- 4. ai_advice_logs: AI 呼び出し履歴・コスト管理
-- =====================================================================
create type public.ai_kind as enum ('ocr', 'ocr_fallback', 'recipe', 'nutrition', 'coach', 'report', 'estimate_food');

create table public.ai_advice_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind public.ai_kind not null,
  model text not null,
  request_payload jsonb,
  response jsonb,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10, 6),
  error text,
  created_at timestamptz not null default now()
);

create index ai_advice_logs_user_created_idx on public.ai_advice_logs (user_id, created_at desc);
create index ai_advice_logs_created_idx on public.ai_advice_logs (created_at desc);

alter table public.ai_advice_logs enable row level security;

-- 自分の履歴のみ読める
create policy "ai_advice_logs: self select"
  on public.ai_advice_logs for select
  to authenticated
  using (user_id = auth.uid());

-- Edge Function (service_role) のみ書き込み
-- service_role は RLS をバイパスするため policy 不要
