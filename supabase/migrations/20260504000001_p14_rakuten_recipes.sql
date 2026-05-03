-- =====================================================================
-- P-14: 楽天レシピ API 併用のためのスキーマ拡張
-- 作成日: 2026-05-04
-- 対象: recipes（external_* カラム追加）, rakuten_recipe_cache（新設）,
--       user_profiles（default_recipe_source 追加）
-- 設計書: docs/p14-rakuten-recipe-design.md
-- =====================================================================

-- =====================================================================
-- 1. recipes テーブル拡張: 外部 API 由来レシピのメタを保持
-- =====================================================================
-- 既存 recipe_source enum は ('ai_generated', 'external')。
-- 'external' を使い、external_provider カラムで具体的 API（rakuten 等）を識別する。
-- これにより将来別 API（cookpad 等）追加時に enum 拡張が不要。
alter table public.recipes
  add column external_provider text,
  add column external_id bigint,
  add column external_url text,
  add column external_image_url text,
  add column external_meta jsonb;

-- source='external' のときは provider/id が必須であることを保証する。
-- ai_generated レコードは external_* がすべて null でよい。
alter table public.recipes
  add constraint recipes_external_consistency
  check (
    source <> 'external'
    or (external_provider is not null and external_id is not null)
  );

-- 同一外部レシピの重複 INSERT を防ぐユニーク制約。
-- partial index にすることで ai_generated 側には影響を与えない。
create unique index recipes_external_unique
  on public.recipes (external_provider, external_id)
  where source = 'external';

-- 検索性のため provider 単独 index も用意（"楽天レシピ一覧" のような用途）
create index recipes_external_provider_idx
  on public.recipes (external_provider)
  where source = 'external';

-- =====================================================================
-- 2. rakuten_recipe_cache: cuisine 単位のランキングキャッシュ
-- =====================================================================
-- 楽天 CategoryRanking API の呼出を抑制する目的のキャッシュ表。
-- TTL は 6 時間想定。Edge Function 側で fetched_at をもとに fresh/stale を判定する。
create table public.rakuten_recipe_cache (
  cuisine text primary key,                   -- 既存 cuisine enum と同値（"japanese" 等）
  rakuten_category_id text not null,          -- 楽天側カテゴリ ID（"27" 等）
  recipe_ids uuid[] not null,                 -- recipes.id の配列（順位順）
  fetched_at timestamptz not null default now(),
  api_response_meta jsonb                     -- 応答ヘッダ要約や HTTP ステータス等
);

alter table public.rakuten_recipe_cache enable row level security;

-- 認証ユーザーは全員が読み取り可（キャッシュ表で個人情報を含まない）
create policy "rakuten_recipe_cache: read for authenticated"
  on public.rakuten_recipe_cache for select
  to authenticated
  using (true);

-- 書き込みは Edge Function (service_role) のみ。authenticated に対する write 用ポリシーは
-- 意図的に作らない（service_role は RLS をバイパスするため別途許可不要）。

-- =====================================================================
-- 3. user_profiles 拡張: デフォルトのレシピソース選択
-- =====================================================================
-- ユーザーが /recipes 画面で毎回選択せず済むように、設定画面で永続化できる
-- デフォルト値を保持する。リクエスト時の上書きは引き続き可能。
alter table public.user_profiles
  add column default_recipe_source text not null default 'ai'
    check (default_recipe_source in ('ai', 'rakuten'));

-- =====================================================================
-- メモ:
-- - rakuten_recipe_cache は 8 cuisine 想定で件数は最大 8 行。indexは PRIMARY KEY のみで十分
-- - recipes.external_meta には楽天 API レスポンスの nickname, recipePublishday,
--   recipeIndication, recipeCost, rank などを保存する想定
-- - 既存 saved_recipes は recipes.id を参照するため、source 種別を問わずお気に入り保存可能
--   （Q-P14-01 の決定事項を満たす）
-- =====================================================================
