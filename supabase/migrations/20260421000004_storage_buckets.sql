-- =====================================================================
-- Storage バケット定義
-- 作成日: 2026-04-21
-- =====================================================================

-- receipts: レシート画像（所有者のみアクセス可）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760, -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- meals: 食事写真
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meals',
  'meals',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- receipts バケット: 所有者のみアクセス
-- パス命名規則: receipts/{user_id}/{uuid}.ext
create policy "receipts: self read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts: self insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts: self delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- meals バケット: 所有者のみアクセス
create policy "meals: self read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "meals: self insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "meals: self delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text
  );
