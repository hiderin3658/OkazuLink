-- =====================================================================
-- Seed データ
-- 作成日: 2026-04-21
-- 更新日: 2026-04-26（admin email を実際のテストアカウントに変更）
-- =====================================================================

-- 初期 admin ユーザー（作成者）
-- 注意:
--   - email 一致でホワイトリスト判定するため、ログインする Google アカウントの
--     email と一致させること
--   - email は必ず全部小文字で記載（CHECK 制約 email = lower(email) があるため）
insert into public.allowed_users (email, role, note)
values ('hiderinchan3658@gmail.com', 'admin', 'Creator / Admin')
on conflict (email) do nothing;

-- 初期利用者（必要に応じてコメントを外し、実際の利用者 email を全部小文字で記入）
-- insert into public.allowed_users (email, role, note)
-- values ('<end-user-email@gmail.com>', 'user', 'Primary user')
-- on conflict (email) do nothing;

-- foods マスタは別スクリプト（scripts/seed-foods.ts）で取り込む
-- 取得元: https://www.mext.go.jp/a_menu/syokuhinseibun/1365420.htm
-- 取り込み手順は README を参照
