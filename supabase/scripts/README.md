# Supabase Seed Scripts

## 食品マスタ（foods）の投入

**出典**: 文部科学省 日本食品標準成分表（八訂）増補2023年

### 方針

MVP の `foods` テーブルは以下のカラム構成：

```
code                 食品番号（例: "01001"）
name                 標準食品名
aliases              text[] 表記ゆれ
category             食材カテゴリ（enum）
food_group           食品群名（例: "10 魚介類"）
nutrition_per_100g   jsonb（エネルギー、PFC、食物繊維、主要ビタミン・ミネラル）
source               出典テキスト
```

### 取得元

#### 公式（1次ソース）
- ポータル: https://www.mext.go.jp/a_menu/syokuhinseibun/mext_00001.html
- 本表 Excel: https://www.mext.go.jp/a_menu/syokuhinseibun/1365420.htm

Excel を直接パースする場合は、TypeScript の `xlsx` もしくは `exceljs` で読み取り、
`nutrition_per_100g` JSONB に以下のキーで格納する想定：

```
{
  "energy_kcal": number,
  "protein_g": number,
  "fat_g": number,
  "carb_g": number,
  "fiber_g": number,
  "salt_g": number,
  "calcium_mg": number,
  "iron_mg": number,
  "vitamin_a_ug": number,
  "vitamin_c_mg": number,
  "vitamin_d_ug": number,
  "vitamin_b1_mg": number,
  "vitamin_b2_mg": number,
  ...
}
```

数値で表現できない値（"Tr"、"-"、"(数値)"等）は `null` として扱う。

#### 補助（2次ソース）
- GitHub: https://github.com/katoharu432/standards-tables-of-food-composition-in-japan
- JSON 化済み・CSV ヘッダー日英併記。ライセンスは要確認（リポ README 参照）。
- 初期データの骨格に使い、差分は公式の最新版で補正する運用を推奨。

### 投入スクリプト

```bash
# TODO: Phase 0 の最後 or Phase 1 先頭で実装
pnpm -C web tsx ../scripts/seed-foods.ts
```

スクリプトは以下を行う：
1. Excel（または JSON）を読み込む
2. `foods` テーブルに `upsert`（`code` で重複判定、chunkSize=500 程度）
3. 失敗レコードは stderr に出力

### 出典表記

アプリ内のフッターまたは栄養ページに以下を明示する：

> 出典: 文部科学省 日本食品標準成分表（八訂）増補2023年

政府標準利用規約 2.0（CC BY 4.0 相当）により商用利用・再配布可。
