# Phase 0 末作業: foods マスタ投入 実装計画

> 作成日: 2026-04-26  
> 完了日: 2026-04-27  
> ブランチ: `feature/foods-seed`  
> 対象: `public.foods` テーブルの初期データ投入  
> ステータス: ✅ **実装完了**（2,478 件投入確認済）

## 実装結果サマリ

- 採用データソース: `katoharu432/standards-tables-of-food-composition-in-japan`（CC BY 4.0）
- データバージョン: 2020年版（八訂） — 増補2023年は将来差し替え可能な構造
- 投入件数: **2,478 件**（カテゴリ別: vegetable 691, fish 453, meat 310, seasoning 212, grain 205, sweet 185, fruit 183, other 96, beverage 61, dairy 59, egg 23）
- スクリプト配置: `web/scripts/`（モジュール解決の都合上、`supabase/scripts/` 配下では Node.js が `web/node_modules/` を解決できないため変更）
- データファイル配置: `supabase/scripts/data/foods-source.json`（seed 系データの自然な置き場）
- 環境変数分離: `SUPABASE_SERVICE_ROLE_KEY` を `web/.env.local` から `web/scripts/.env` に移動

---

---

## 1. 目的

Phase 1 で「レシート → 食材抽出 → 栄養計算」を実装するために、食材マスタが必要。
その初期データを **日本食品標準成分表（八訂）増補2023年** から投入する。

これにより：
- レシート OCR 結果 (`raw_name`) を `foods.name` / `foods.aliases` で正規名に紐付け可能
- レシピ材料に対し PFC・ビタミン・ミネラルを集計可能
- 月次栄養レポート（Phase 2）の基礎データになる

---

## 2. スコープ

### 含む
- 八訂増補2023年 本表（約 2,500 件）の `foods` テーブルへの投入
- 食品群 → `food_category` enum へのマッピング
- 主要栄養素を `nutrition_per_100g` (jsonb) に格納
- Idempotent な再実行（`code` で upsert）

### 含まない
- 表記ゆれ (`aliases`) の網羅的整備（Phase 1 で OCR 抽出結果を見ながら必要な分だけ追加する運用）
- 八訂以外の出典（楽天レシピ、外部 API 等）
- レシピマスタ投入（`recipes` は AI 生成で運用）

---

## 3. データソース選定

| 案 | 内容 | 工数 | 信頼性 | 推奨 |
|---|---|---|---|---|
| **A. 公式 Excel** をパース（MEXT） | xlsx ライブラリで `.xlsx` を直接読む | 大（複雑なヘッダー構造のパース） | ◎（一次ソース） | 不採用 |
| **B. katoharu432 GitHub JSON** を利用 | パース済みの JSON を使う | 小 | ○（要ライセンス確認） | **採用** |
| **C. 公式 CSV**（一部公開） | MEXT が CSV 配布する区分のみ取得 | 中 | ◎ | 補助的に使用 |

**採用: B（katoharu432 JSON 主体、必要な箇所だけ A/C で補正）**

理由:
- 最速で動かせる（Phase 1 着手を遅らせない）
- パース済みなので Excel 行番号調整・統合セル展開等の煩雑さが無い
- JSON のキー名が日英併記で扱いやすい
- 出典は MEXT のままなので、`source` 列に「文部科学省 日本食品標準成分表（八訂）増補2023年」を記載すれば帰属表記は守れる
- 万一 katoharu432 のライセンスに制約があれば、後で公式 Excel パーサーへ差し替えられる構造にする

### ライセンス確認事項（実装前に必須）

- katoharu432 リポジトリの `LICENSE` および README を確認
- MIT/CC BY 等の許諾的なライセンスでなければ採用却下 → 案 A に切替
- ⚠️ **PR レビュー前にこの確認を済ませてからコミットする**

### MEXT データの利用規約

- 政府標準利用規約 2.0（CC BY 4.0 相当） — 商用利用・再配布可
- 出典記載が必須 → `foods.source` および UI フッターで明示

---

## 4. データモデル マッピング

### 既存 `foods` テーブル（再掲）

```sql
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  code text unique,                      -- 食品番号（例: "01001"）
  name text not null,                    -- 標準食品名
  aliases text[] not null default '{}',  -- 表記ゆれ
  category public.food_category not null default 'other',
  food_group text,                       -- 食品群（例: "01 穀類"）
  nutrition_per_100g jsonb not null default '{}'::jsonb,
  source text not null default '文部科学省 日本食品標準成分表（八訂）増補2023年',
  created_at timestamptz not null default now()
);
```

### 食品群 → `food_category` マッピング（案）

`food_category` は以下の 11 値:
`vegetable | meat | fish | dairy | grain | seasoning | beverage | sweet | fruit | egg | other`

| 食品群 | category |
|---|---|
| 01 穀類 | grain |
| 02 いも及びでん粉類 | vegetable |
| 03 砂糖及び甘味類 | seasoning |
| 04 豆類 | vegetable |
| 05 種実類 | other |
| 06 野菜類 | vegetable |
| 07 果実類 | fruit |
| 08 きのこ類 | vegetable |
| 09 藻類 | vegetable |
| 10 魚介類 | fish |
| 11 肉類 | meat |
| 12 卵類 | egg |
| 13 乳類 | dairy |
| 14 油脂類 | seasoning |
| 15 菓子類 | sweet |
| 16 し好飲料類 | beverage |
| 17 調味料及び香辛料類 | seasoning |
| 18 調理済み流通食品類 | other |

> 「いも類」「豆類」「種実類」を vegetable に寄せるか other に寄せるかは料理視点での合理性で決定。Phase 1 で OCR 結果と照合しながら微調整可能。

### `nutrition_per_100g` JSON 構造

```json
{
  "energy_kcal": 168,
  "protein_g": 20.0,
  "fat_g": 9.0,
  "carb_g": 0,
  "fiber_g": null,
  "salt_g": 0.1,
  "calcium_mg": 5,
  "iron_mg": 0.6,
  "vitamin_a_ug": 28,
  "vitamin_c_mg": 1,
  "vitamin_d_ug": null,
  "vitamin_b1_mg": 0.10,
  "vitamin_b2_mg": 0.15,
  "vitamin_b6_mg": 0.31,
  "vitamin_b12_ug": null,
  "folate_ug": null,
  "potassium_mg": 290,
  "magnesium_mg": 21,
  "phosphorus_mg": 200,
  "zinc_mg": 1.6
}
```

数値で表現できない値（`Tr`、`-`、`(数値)` 等）は `null`。  
`(数値)` のような括弧付き推定値も MVP では `null` 扱いし、Phase 2 で精度向上時に再評価。

---

## 5. 実装ステップ

### Step 1: 依存ライブラリ追加（web/package.json）

```bash
# パース系
pnpm -C web add -D tsx          # TypeScript スクリプト実行用
pnpm -C web add -D dotenv       # service_role key を .env から読む

# データソースが Excel になった場合のみ:
# pnpm -C web add -D xlsx
```

**コミット 1**: `chore: add tsx and dotenv for seed scripts`

### Step 2: データソース取得・配置

`supabase/scripts/data/foods-source.json` に katoharu432 のデータを配置（ライセンス OK 確認後）。

リポ内に保存する理由:
- 再現性（誰でも `pnpm seed:foods` で同じ結果）
- オフラインでも投入可能
- 後で公式版に差し替えても、コミット履歴で差分追跡可

ファイルサイズ目安: ~500KB〜1MB（圧縮なし JSON）。Git LFS 不要。

**コミット 2**: `chore: add foods source data (CC BY 4.0)`

### Step 3: 型定義 & マッピングテーブル（`supabase/scripts/foods-mapping.ts`）

```ts
import type { FoodCategory } from "@/types/database";

export const FOOD_GROUP_TO_CATEGORY: Record<string, FoodCategory> = {
  "01": "grain",
  "02": "vegetable",
  // ...
};

export type RawFoodRow = {
  code: string;
  name: string;
  food_group: string;
  // 栄養素フィールド
  energy_kcal: number | string | null;
  // ...
};

export type ParsedFood = {
  code: string;
  name: string;
  category: FoodCategory;
  food_group: string;
  nutrition_per_100g: Record<string, number | null>;
};
```

**コミット 3**: `feat(seed): add foods mapping types`

### Step 4: パーサー実装（`supabase/scripts/parse-foods.ts`）

純粋関数として、入力データを `ParsedFood[]` に変換。

```ts
export function parseFoodSource(raw: RawFoodRow[]): ParsedFood[] {
  return raw.map(row => ({
    code: row.code,
    name: normalizeName(row.name),
    category: foodGroupToCategory(row.food_group),
    food_group: row.food_group,
    nutrition_per_100g: extractNutrition(row),
  }));
}
```

**コミット 4**: `feat(seed): implement foods parser`

### Step 5: パーサー単体テスト（`supabase/scripts/parse-foods.test.ts`）

vitest で以下をテスト：
- "Tr" → `null` 変換
- "(数値)" → `null` 変換
- 食品群 → category マッピング
- 不正な数値の handling

**コミット 5**: `test(seed): add parser unit tests`

### Step 6: 投入スクリプト本体（`supabase/scripts/seed-foods.ts`）

```ts
import { createClient } from "@supabase/supabase-js";
import { parseFoodSource } from "./parse-foods";
import rawData from "./data/foods-source.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // RLS bypass
);

const CHUNK_SIZE = 500;

async function main() {
  const parsed = parseFoodSource(rawData);
  console.log(`Parsed ${parsed.length} foods`);

  for (let i = 0; i < parsed.length; i += CHUNK_SIZE) {
    const chunk = parsed.slice(i, i + CHUNK_SIZE);
    const { error, count } = await supabase
      .from("foods")
      .upsert(chunk, { onConflict: "code", count: "exact" });
    if (error) {
      console.error(`Chunk ${i}:`, error);
      process.exit(1);
    }
    console.log(`✓ Inserted/updated ${count} (offset ${i})`);
  }
}

main();
```

**コミット 6**: `feat(seed): implement foods upsert script`

### Step 7: package.json にスクリプトコマンド追加

```json
{
  "scripts": {
    "seed:foods": "tsx ../supabase/scripts/seed-foods.ts"
  }
}
```

実行例:
```bash
cd web
pnpm seed:foods
```

**コミット 7**: `chore: add seed:foods script command`

### Step 8: 小規模テスト（10件で本番DBに投入確認）

データを 10 件に絞り、リモート Supabase に upsert →  Studio で確認。  
問題なければ全件投入へ。

### Step 9: 本番投入

```bash
cd web
pnpm seed:foods  # 約 2,500 件 × 5 chunk
```

完了後の確認 SQL（Supabase Studio）:

```sql
select count(*) from public.foods;
-- 期待値: ~2,400〜2,500
select category, count(*) from public.foods group by category order by 2 desc;
select * from public.foods where name like '%豚ロース%' limit 5;
```

### Step 10: ドキュメント更新

- `supabase/scripts/README.md`: 実行手順を確定版に更新
- `README.md`: Phase 0 セットアップ手順を「foods 投入も完了」に更新
- `docs/design.md`: Phase 0 完了状態を v0.4 で記録

**コミット 8**: `docs: update foods seed instructions and design v0.4`

---

## 6. 環境変数の扱い

### 必須

| 変数 | 設定先 | 機密性 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `web/.env.local` | 公開可 |
| `SUPABASE_SERVICE_ROLE_KEY` | **`supabase/scripts/.env`**（Git ignore 済） | **絶対秘密** |

設計レビュー時にも指摘した通り、`SUPABASE_SERVICE_ROLE_KEY` は本来 `web/.env.local` には不要な値。
seed 実行のためだけに **`supabase/scripts/.env`** を新規作成しそこに格納する運用に変更。

### `.gitignore` 追加

`supabase/scripts/.env` および `supabase/scripts/data/*.json` の前者は ignore、後者はコミット可（公開データ）。

---

## 7. ロールバック手段

万一マスタが汚れた場合の復旧手順：

```sql
-- 開発環境のみ。本番では絶対実行しない
delete from public.foods;
```

その後 `pnpm seed:foods` で再投入。

`shopping_items.food_id` 等の外部参照は `on delete set null` なので、削除しても他テーブルは壊れない。

---

## 8. 工数見積もり

| Step | 想定時間 |
|---|---|
| 1. 依存追加 | 10分 |
| 2. データソース取得・ライセンス確認 | 30分 |
| 3〜4. 型定義・パーサー実装 | 1〜2時間 |
| 5. 単体テスト | 30分 |
| 6〜7. 投入スクリプト・コマンド | 30分 |
| 8〜9. テスト投入・本番投入 | 30分 |
| 10. ドキュメント | 30分 |
| **合計** | **約 4〜5時間** |

---

## 9. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| katoharu432 のライセンスが採用不可だった | 工数 +1日（Excel パーサー実装） | Step 2 のライセンス確認で早期判明させる |
| `food_category` enum マッピングが Phase 1 で不適切と判明 | 微調整必要 | マッピングテーブル 1 ファイルに集約済み、再実行で更新可 |
| Supabase の rate limit で connection error | 一時失敗 | chunk size 500 → 100 に下げて再実行 |
| 全件投入後の容量・性能 | テーブル 2,500 件は問題なし | 念のため `vacuum analyze` を seed 後に実行 |
| service_role key の流出 | 重大 | `supabase/scripts/.env` を新規作成して .gitignore、`web/.env.local` から削除（別 commit で対応） |

---

## 10. 完了の定義（DoD）

- [ ] `select count(*) from public.foods` ≥ 2,400 件
- [ ] 食品群 → category マッピングが 18 群すべて埋まっている
- [ ] パーサーの単体テストが全 pass
- [ ] CI（lint/typecheck/build/test）が緑
- [ ] `pnpm seed:foods` が冪等（再実行しても重複行が増えない）
- [ ] PR レビュー後 main にマージ

---

## 11. 次の判断ポイント

### user に確認したい事項

1. **ライセンス確認の進め方**: 私の方で katoharu432 リポの LICENSE を確認 → 結果報告で良いか
2. **service_role key の管理**: `supabase/scripts/.env` 新設で良いか（`web/.env.local` からの移動も推奨だが、別 PR で対応か同時か）
3. **ロードマップ位置付け**: 全件投入まで完了後、その PR をマージしてから Phase 1 着手か、並行作業か
4. **コミット粒度**: 上記 8 コミットが冗長と感じる場合、まとめても可

---

承認いただければ Step 1（依存追加）から順次実装に入ります。
