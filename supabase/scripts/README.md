# Supabase Seed Scripts

## 食品マスタ（foods）の投入

**出典**: 文部科学省 日本食品標準成分表2020年版（八訂）  
**ライセンス**: 政府標準利用規約 2.0（CC BY 4.0 相当）／ データ JSON 化リポは CC BY 4.0  
**実行スクリプト**: `web/scripts/seed-foods.ts`（このリポは Next.js 単一パッケージ構成のため、
スクリプトは `web/` 配下に配置して `web/node_modules/` を解決させる運用）

### ディレクトリ構成

| パス | 役割 |
|---|---|
| `supabase/scripts/data/foods-source.json` | 入力データ（CC BY 4.0、Git 管理対象） |
| `web/scripts/seed-foods.ts` | 投入スクリプト本体 |
| `web/scripts/parse-foods.ts` | 純粋関数のパーサー |
| `web/scripts/foods-mapping.ts` | 食品群 → category enum 等のマッピング定数 |
| `web/scripts/parse-foods.test.ts` | パーサーの単体テスト（vitest） |
| `web/scripts/.env` | `SUPABASE_SERVICE_ROLE_KEY` 等（**Git ignore 済**） |

### foods テーブルのスキーマ（再掲）

```
code                 食品番号（5 桁ゼロ埋めの text、例: "01001"）
name                 標準食品名
aliases              text[] 表記ゆれ（初期は空、運用しながら追加）
category             食材カテゴリ enum
food_group           食品群名（例: "10 魚介類"）
nutrition_per_100g   jsonb（エネルギー、PFC、食物繊維、塩、主要ビタミン・ミネラル）
source               出典テキスト
```

### 実行手順

#### 1. `web/scripts/.env` を用意

```bash
# web/scripts/.env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

`SUPABASE_SERVICE_ROLE_KEY` は Supabase ダッシュボード → Settings → API Keys で確認可能。
**絶対にクライアント側に渡さないこと**。

#### 2. Dry run でデータ確認

```bash
cd web
FOODS_SEED_DRYRUN=1 pnpm seed:foods
```

→ 1 件目のパース結果が JSON 表示される（DB 書込なし）。

#### 3. 小規模テスト（10 件のみ投入）

```bash
cd web
FOODS_SEED_LIMIT=10 pnpm seed:foods
```

#### 4. 本番投入（全件）

```bash
cd web
pnpm seed:foods
```

データ件数: 約 2,478 件、所要時間: 数秒〜数十秒（5 chunk × 500 件）。

#### 5. 確認 SQL（Supabase Studio）

```sql
-- 件数
select count(*) from public.foods;

-- カテゴリ分布
select category, count(*) from public.foods group by category order by count(*) desc;

-- 表記ゆれの確認用検索
select code, name, food_group from public.foods where name ilike '%豚%' limit 10;
```

### 環境変数オプション

| 変数 | 用途 | デフォルト |
|---|---|---|
| `FOODS_SEED_LIMIT` | 先頭 N 件のみ投入（小規模テスト用） | 全件 |
| `FOODS_SEED_DRYRUN` | `=1` で実投入せず件数だけ確認 | off |
| `FOODS_SEED_CHUNK` | upsert chunk サイズ | 500 |

### 冪等性と再実行

`code` を一意キーとして `upsert` するため、繰り返し実行しても重複行は増えない。
`aliases` を後から手動で更新した行は、再実行で書き戻されないように
スクリプト側で `aliases` を含めない設計（`parse-foods.ts` の `ParsedFood` 参照）。

### データ更新時

`supabase/scripts/data/foods-source.json` を新しいバージョン（例: 増補2023年）に
置き換えて `pnpm seed:foods` を再実行する。スキーマが変わる場合は
`foods-mapping.ts` / `parse-foods.ts` の修正と単体テスト追加が必要。

### 出典表記

アプリ内のフッターまたは栄養ページに以下を明示する:

> 出典: 文部科学省 日本食品標準成分表2020年版（八訂）
