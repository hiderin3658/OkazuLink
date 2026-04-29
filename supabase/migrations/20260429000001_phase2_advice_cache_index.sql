-- =====================================================================
-- Phase 2: advise-nutrition のキャッシュ検索を高速化するインデックス
-- 作成日: 2026-04-29
-- =====================================================================
--
-- advise-nutrition Edge Function は同条件の再呼出を ai_advice_logs から
-- 再利用してコストを抑える。検索条件は:
--   WHERE kind = 'nutrition'
--     AND user_id = $1
--     AND request_payload->>'input_hash' = $2
--
-- 既存インデックスは (user_id, created_at desc) と (kind, created_at desc)
-- のみ。input_hash の jsonb 抽出を含む等価検索は SEQ SCAN になるため、
-- nutrition kind に絞った partial index を追加する。

create index if not exists ai_advice_logs_nutrition_input_hash_idx
  on public.ai_advice_logs ((request_payload->>'input_hash'))
  where kind = 'nutrition';

-- 将来 recipe / coach 等でも input_hash キャッシュを採用する場合は、
-- 同様の partial index を kind ごとに追加する想定。
