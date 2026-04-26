-- =====================================================================
-- Design Review Fixes (2026-04-26)
-- Phase 0 マイグレーション適用後のレビューで発見した設計改善を一括反映
--
-- 対象:
--   H-1: email を case-insensitive に（lower() 統一）
--   H-2: recipe_source enum から 'user_saved' を削除（MVP では AI 生成のみ）
--   H-3: recipe_ingredients に admin 書込ポリシー追加（recipes と一貫させる）
--   H-4: body_composition_logs に UNIQUE(user_id, measured_on) を追加
--   Q-B: meal_logs に UNIQUE(user_id, eaten_on, meal_type) を追加
--   Q-D: nutrition_monthly_summaries.year_month を date 型へ変更
--   M-3: ai_advice_logs.kind にインデックス追加（コスト分析クエリ用）
-- =====================================================================

-- =====================================================================
-- H-1: email の case-insensitive 化
-- 比較側（関数）と保存側（CHECK）の両方で lower() を強制し、
-- Google JWT の email 表記揺れによるホワイトリスト判定ミスを防止
-- =====================================================================

create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(auth.jwt() ->> 'email');
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(auth.jwt() ->> 'email') and role = 'admin'
  );
$$;

-- 既存データを念のため小文字化（Phase 0 seed 投入前なら no-op）
update public.allowed_users
   set email = lower(email)
 where email <> lower(email);

-- 以後 allowed_users.email は必ず小文字で保存
alter table public.allowed_users
  add constraint allowed_users_email_lowercase
  check (email = lower(email));

-- =====================================================================
-- H-2: recipe_source enum から 'user_saved' を削除
-- ユーザー手入力レシピは MVP スコープ外。お気に入りは saved_recipes で実現
-- =====================================================================

-- enum の値削除は直接できないため、リネーム → 新規作成 → カラム再型付け の手順を取る
alter type public.recipe_source rename to recipe_source_old;

create type public.recipe_source as enum ('ai_generated', 'external');

-- recipes テーブルは空想定。万一データがあれば 'user_saved' は 'ai_generated' に寄せる
alter table public.recipes
  alter column source drop default,
  alter column source type public.recipe_source
    using (
      case source::text
        when 'user_saved' then 'ai_generated'
        else source::text
      end::public.recipe_source
    ),
  alter column source set default 'ai_generated';

drop type public.recipe_source_old;

-- =====================================================================
-- H-3: recipe_ingredients に admin 書込ポリシー追加
-- recipes に admin insert ポリシーがあるのに recipe_ingredients に無いのは非対称
-- =====================================================================

create policy "recipe_ingredients: admin write"
  on public.recipe_ingredients for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- H-4: body_composition_logs に UNIQUE 制約追加
-- 同日 2 重入力で集計がダブルカウントになるのを防ぐ
-- =====================================================================

alter table public.body_composition_logs
  add constraint body_composition_logs_user_date_unique
  unique (user_id, measured_on);

-- =====================================================================
-- Q-B: meal_logs に UNIQUE 制約追加
-- 同じ日の同じ食種（朝/昼/夕/間食）は 1 レコードに制限
-- 複数の間食を 1 行内に集約するか別レコードにするかは UI 側で判断
-- =====================================================================

alter table public.meal_logs
  add constraint meal_logs_user_date_type_unique
  unique (user_id, eaten_on, meal_type);

-- =====================================================================
-- Q-D: nutrition_monthly_summaries.year_month を date 型に変更
-- text の 'YYYY-MM' 形式から、月初日（YYYY-MM-01）を表す date 型へ
-- 並び替え・範囲検索が SQL 標準で扱えるようになる
-- =====================================================================

-- 既存の UNIQUE 制約とインデックスを drop
alter table public.nutrition_monthly_summaries
  drop constraint nutrition_monthly_summaries_user_id_year_month_key;

drop index if exists public.nutrition_monthly_summaries_user_idx;

-- カラムを差し替え（テーブルが空のため drop & add で安全）
alter table public.nutrition_monthly_summaries
  drop column year_month;

alter table public.nutrition_monthly_summaries
  add column month_start date not null;

-- 月初日（毎月 1 日）であることを強制
alter table public.nutrition_monthly_summaries
  add constraint nutrition_monthly_summaries_month_start_first_day
  check (extract(day from month_start) = 1);

alter table public.nutrition_monthly_summaries
  add constraint nutrition_monthly_summaries_user_month_unique
  unique (user_id, month_start);

create index nutrition_monthly_summaries_user_idx
  on public.nutrition_monthly_summaries (user_id, month_start desc);

-- =====================================================================
-- M-3: ai_advice_logs.kind にインデックス追加
-- 月次レポートで「OCR の今月コスト合計」等を集計する際に有効
-- =====================================================================

create index ai_advice_logs_kind_created_idx
  on public.ai_advice_logs (kind, created_at desc);
