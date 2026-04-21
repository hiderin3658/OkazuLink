-- =====================================================================
-- Seed データ
-- 作成日: 2026-04-21
-- =====================================================================

-- 初期 admin ユーザー（作成者）
-- 注意: email 一致でホワイトリスト判定するため、アプリでログインする Google アカウントの email と一致させること
insert into public.allowed_users (email, role, note)
values ('h.hamada@i-seifu.jp', 'admin', 'Creator / Admin — does not use the app as end user')
on conflict (email) do nothing;

-- 初期利用者（Phase 0 開始時に実際の利用者 email をここに追記）
-- insert into public.allowed_users (email, role, note)
-- values ('<end-user-email@gmail.com>', 'user', 'Primary user')
-- on conflict (email) do nothing;

-- foods マスタは別スクリプト（scripts/seed-foods.ts）で取り込む
-- 取得元: https://www.mext.go.jp/a_menu/syokuhinseibun/1365420.htm
-- 取り込み手順は README を参照
