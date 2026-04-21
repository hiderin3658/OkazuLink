-- =====================================================================
-- Phase 3: 体重・運動・食事記録
-- 作成日: 2026-04-21
-- Phase 0 で先行作成（後で Phase 3 実装時にすぐ使える状態）
-- =====================================================================

-- =====================================================================
-- weight_logs: 体重記録
-- =====================================================================
create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index weight_logs_user_date_idx on public.weight_logs (user_id, measured_on desc);

alter table public.weight_logs enable row level security;

create policy "weight_logs: self all"
  on public.weight_logs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- body_composition_logs: 体組成記録（将来の体脂肪率等）
-- =====================================================================
create table public.body_composition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  body_fat_pct numeric(4, 1),
  muscle_mass_kg numeric(5, 2),
  waist_cm numeric(5, 1),
  note text,
  created_at timestamptz not null default now()
);

create index body_composition_logs_user_date_idx on public.body_composition_logs (user_id, measured_on desc);

alter table public.body_composition_logs enable row level security;

create policy "body_composition_logs: self all"
  on public.body_composition_logs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- exercise_logs: 運動記録
-- =====================================================================
create type public.exercise_intensity as enum ('low', 'mid', 'high');

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  performed_on date not null,
  activity text not null,
  intensity public.exercise_intensity not null default 'mid',
  duration_min int not null,
  estimated_kcal int,
  note text,
  created_at timestamptz not null default now()
);

create index exercise_logs_user_date_idx on public.exercise_logs (user_id, performed_on desc);

alter table public.exercise_logs enable row level security;

create policy "exercise_logs: self all"
  on public.exercise_logs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- meal_logs: 食事ログ
-- =====================================================================
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  eaten_on date not null,
  meal_type public.meal_type not null,
  note text,
  image_path text,
  created_at timestamptz not null default now()
);

create index meal_logs_user_date_idx on public.meal_logs (user_id, eaten_on desc);

alter table public.meal_logs enable row level security;

create policy "meal_logs: self all"
  on public.meal_logs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- meal_items: 食事の明細
-- =====================================================================
create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null references public.meal_logs(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  raw_name text not null,
  amount text,
  calories_kcal int
);

create index meal_items_meal_idx on public.meal_items (meal_log_id);

alter table public.meal_items enable row level security;

create policy "meal_items: via meal"
  on public.meal_items for all
  to authenticated
  using (
    exists (
      select 1 from public.meal_logs m
      where m.id = meal_log_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meal_logs m
      where m.id = meal_log_id and m.user_id = auth.uid()
    )
  );

-- =====================================================================
-- nutrition_monthly_summaries: Phase 2 の月次集計キャッシュ
-- =====================================================================
create table public.nutrition_monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year_month text not null, -- 'YYYY-MM'
  summary jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (user_id, year_month)
);

create index nutrition_monthly_summaries_user_idx on public.nutrition_monthly_summaries (user_id, year_month desc);

alter table public.nutrition_monthly_summaries enable row level security;

create policy "nutrition_monthly_summaries: self all"
  on public.nutrition_monthly_summaries for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
