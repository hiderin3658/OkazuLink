-- =====================================================================
-- Phase 1: 買物記録・レシピ
-- 作成日: 2026-04-21
-- 対象: shopping_records, shopping_items, recipes, recipe_ingredients, saved_recipes
-- Phase 0 で先行作成（Phase 1 実装開始時にすぐ使える状態）
-- =====================================================================

-- =====================================================================
-- shopping_records: 買物単位（1レシート = 1レコード想定）
-- =====================================================================
create type public.shopping_source as enum ('receipt', 'manual');

create table public.shopping_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchased_at date not null,
  store_name text,
  total_amount int not null default 0,
  note text,
  image_paths text[] not null default '{}',
  source_type public.shopping_source not null default 'receipt',
  created_at timestamptz not null default now()
);

create index shopping_records_user_date_idx on public.shopping_records (user_id, purchased_at desc);

alter table public.shopping_records enable row level security;

create policy "shopping_records: self all"
  on public.shopping_records for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- shopping_items: 買物明細（食材単位）
-- =====================================================================
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  shopping_record_id uuid not null references public.shopping_records(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  raw_name text not null,
  display_name text,
  category public.food_category not null default 'other',
  quantity numeric(10, 3),
  unit text,
  unit_price int,
  total_price int not null default 0,
  discount int not null default 0,
  created_at timestamptz not null default now()
);

create index shopping_items_record_idx on public.shopping_items (shopping_record_id);
create index shopping_items_food_idx on public.shopping_items (food_id);

alter table public.shopping_items enable row level security;

-- 親 shopping_records の所有者のみ
create policy "shopping_items: via record"
  on public.shopping_items for all
  to authenticated
  using (
    exists (
      select 1 from public.shopping_records r
      where r.id = shopping_record_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shopping_records r
      where r.id = shopping_record_id and r.user_id = auth.uid()
    )
  );

-- =====================================================================
-- recipes: レシピ（AI生成・ユーザー保存・将来の外部API）
-- =====================================================================
create type public.cuisine as enum (
  'japanese', 'chinese', 'italian', 'french', 'ethnic',
  'korean', 'sweets', 'other'
);

create type public.recipe_source as enum ('ai_generated', 'user_saved', 'external');

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cuisine public.cuisine not null default 'other',
  description text,
  servings int default 1,
  time_minutes int,
  calories_kcal int,
  steps jsonb not null default '[]'::jsonb,
  source public.recipe_source not null default 'ai_generated',
  generated_prompt_hash text,
  created_at timestamptz not null default now()
);

create index recipes_prompt_hash_idx on public.recipes (generated_prompt_hash);

alter table public.recipes enable row level security;

-- 認証ユーザーなら読める（AI生成キャッシュを共有するため）
create policy "recipes: read for authenticated"
  on public.recipes for select
  to authenticated
  using (true);

-- Edge Function (service_role) のみ書き込み想定。フロントから直接書かない。
-- ただしデバッグ用に admin は書ける
create policy "recipes: admin insert"
  on public.recipes for insert
  to authenticated
  with check (public.is_admin());

-- =====================================================================
-- recipe_ingredients: レシピ材料
-- =====================================================================
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  name text not null,
  amount text,
  optional boolean not null default false
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

alter table public.recipe_ingredients enable row level security;

create policy "recipe_ingredients: read for authenticated"
  on public.recipe_ingredients for select
  to authenticated
  using (true);

-- =====================================================================
-- saved_recipes: ユーザーお気に入り
-- =====================================================================
create table public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, recipe_id)
);

alter table public.saved_recipes enable row level security;

create policy "saved_recipes: self all"
  on public.saved_recipes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
