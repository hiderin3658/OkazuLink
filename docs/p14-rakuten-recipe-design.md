# P-14 楽天レシピ API 併用 設計書

> 作成日: 2026-05-04
> 対象: P-14（外部レシピ API 併用）
> ロードマップ位置: 設計書 §11 将来拡張、Q-03 段階導入の第 2 段階
> 想定期間: 約 1〜1.5 週間（PR 5 本）

---

## 1. 目的

Phase 1 で実装した **AI 生成レシピ提案**（Gemini Flash）に加え、**楽天レシピ API による実在レシピ取得**を併用可能にする。

> 設計書 Q-03: 「Phase 1 は AI 生成のみ、将来 P-14 で楽天レシピ API を併用検討」

ユーザー価値:

| AI 生成（既存）| 楽天レシピ（新規） |
|---|---|
| 手持ち食材 + ジャンルで動的生成 | 実在の人気レシピ（カテゴリランキング上位） |
| AI コスト発生（¥1〜程度／呼出）| **無料**（API 利用無料、商用条件は要確認） |
| 食材プールに合わせ調整される | 食材指定不可、カテゴリ別ランキングのみ |
| 数十秒の生成時間 | 数百 ms〜1 秒程度 |
| 詳細手順を含む | レシピ URL（楽天サイト）への遷移が前提 |

両者は**性質が異なる**ため、単純置き換えではなく **設定で切り替え可能なハイブリッド構成** を採る。

---

## 2. 機能スコープ

### 2.1 含むもの

| # | 内容 |
|---|---|
| F-04' | レシピ提案の **AI / 楽天** 切替（リクエスト毎 + プロフィールにデフォルト保存）|
| F-05' | 楽天レシピの詳細表示（外部 URL リンク + サムネイル + 材料リスト）|
| - | 楽天 API 結果のキャッシュ（カテゴリ単位、TTL 6 時間程度）|
| - | レート制限への対応（楽天: 1 req/sec / 600,000 req/day）|
| - | API 障害時の挙動（明示エラー、AI フォールバックは Phase 内で**しない**）|

### 2.2 含まないもの

- 楽天レシピの**お気に入り保存**（`saved_recipes`）連携 → 別 PR（後追い）
- 楽天レシピの **栄養素計算**（材料テキストから自動算出）→ AI 補助前提なので Phase 3+
- 楽天レシピの **食材マッチング**（手持ち食材で絞り込み）→ 楽天 API はキーワード検索非対応のため不可。Phase 内で**実装しない**
- カテゴリ一覧 API による動的カテゴリ表示 → 既存 8 種 cuisine とのマッピングで十分

### 2.3 設計判断（重要）

楽天レシピ API は **食材指定検索が不可** なので、選んだ食材は楽天モード時には**送信されない**（UI 上は disabled で表示するが結果には反映されない）。
ユーザーには「ジャンル人気ランキングを表示する」モードであることを UI で明示する。

---

## 3. 楽天レシピ API の仕様

### 3.1 提供 API

| API 名 | エンドポイント | 用途 |
|---|---|---|
| カテゴリ一覧 | `https://app.rakuten.co.jp/services/api/Recipe/CategoryList/20170426` | カテゴリ ID 取得（初期セットアップ時に 1 回実行）|
| カテゴリ別ランキング | `https://app.rakuten.co.jp/services/api/Recipe/CategoryRanking/20170426` | 上位 4 件のレシピ取得 |

### 3.2 認証

- `applicationId` クエリパラメータ必須（楽天デベロッパーで取得）
- API キー単位で 1 req/sec / 600,000 req/day のレート制限
- HTTPS 必須

### 3.3 レスポンス（CategoryRanking）抜粋

```json
{
  "result": [
    {
      "rank": "1",
      "recipeId": 1234567,
      "recipeTitle": "簡単♪基本の親子丼",
      "recipeUrl": "https://recipe.rakuten.co.jp/recipe/...",
      "foodImageUrl": "https://image.space.rakuten.co.jp/...",
      "mediumImageUrl": "...",
      "smallImageUrl": "...",
      "recipeDescription": "ご飯がすすむ...",
      "recipeMaterial": ["鶏もも肉", "玉ねぎ", "卵", "..."],
      "recipeIndication": "約15分",
      "recipeCost": "300円前後",
      "recipePublishday": "2020/05/01",
      "nickname": "投稿者名",
      "shop": 0,
      "pickup": 0
    }
  ]
}
```

注意点:
- 1 レスポンスは **常に 4 件**（指定不可、count パラメータなし）
- 食材指定は不可（ランキングのみ）
- 栄養素データは含まれない

### 3.4 既存 8 cuisine との マッピング

| 既存 cuisine | 楽天大カテゴリ | categoryId |
|---|---|---|
| japanese | 和食 | 27 |
| chinese | 中華料理 | 28 |
| italian | イタリアン | 29 |
| french | フレンチ | 30 |
| ethnic | エスニック・各国料理 | 31 |
| korean | 韓国料理 | 32 |
| sweets | お菓子 | 21 |
| other | その他のカテゴリ | 33 |

> categoryId は楽天側で改変される可能性あり。`scripts/fetch-rakuten-categories.ts` で年次再取得。

---

## 4. データフロー全体

```
[/recipes ページ]
  ├─ source ラジオボタン: AI / 楽天
  │   （初期値: 設定画面の default_recipe_source）
  ├─ ジャンル選択
  └─ 「レシピを提案」
        │
        ▼
[suggest-recipes Edge Function]
  ├─ source === "ai"   → 既存ロジック（Gemini Flash）
  └─ source === "rakuten" → 新規ロジック:
        ├─ rakuten_recipe_cache を SELECT (cuisine, fetched_at)
        │   └─ fresh (TTL 6h 以内) → そのまま返す
        ├─ stale or 未キャッシュ → Rakuten CategoryRanking API call
        ├─ レスポンスを recipes テーブルに upsert (source='rakuten', external_id)
        ├─ rakuten_recipe_cache を UPDATE (fetched_at)
        └─ ai_advice_logs に呼出記録 (kind='recipe_external', cost_usd=0)
        │
        ▼
[/recipes 結果カード一覧]
  ├─ AI: 既存の RecipeCard（材料・所要・カロリー）
  └─ 楽天: 楽天用 RecipeCard（サムネイル + recipe_url 外部リンク + 材料）
        │
        ▼
[/recipes/[id] 詳細]
  ├─ AI: 既存（材料・手順・お気に入り保存）
  └─ 楽天: タイトル + 楽天サイトへのリンクボタン + 材料 + サムネイル
        ※ 手順は楽天規約上、外部に転載不可。リンクで誘導する。
```

---

## 5. データモデル

### 5.1 `recipes` テーブル拡張

既存:
```sql
recipes (
  id uuid pk,
  prompt_hash text,
  cuisine text,
  title text,
  description text,
  ingredients jsonb,
  steps jsonb,
  servings int,
  time_minutes int,
  calories_kcal numeric,
  source text default 'ai_generated',  -- 既存 enum: ai_generated, external
  created_at timestamptz
)
```

追加カラム（マイグレーション `20260504000001_p14_rakuten_recipes.sql`）:

```sql
ALTER TABLE recipes
  ADD COLUMN external_id bigint,           -- 楽天 recipeId
  ADD COLUMN external_url text,            -- 楽天レシピページ URL
  ADD COLUMN external_image_url text,      -- mediumImageUrl
  ADD COLUMN external_meta jsonb;          -- nickname, recipePublishday 等

-- external_id 重複防止（同じ楽天レシピを 2 回 INSERT しない）
CREATE UNIQUE INDEX recipes_external_unique
  ON recipes(source, external_id)
  WHERE source = 'rakuten';
```

`source = 'rakuten'` のレコードでは:
- `prompt_hash` は NULL（カテゴリ + 日付で別キャッシュ）
- `steps` は NULL（楽天は外部リンク前提）
- `calories_kcal` は NULL（楽天 API は栄養素データなし）

### 5.2 `rakuten_recipe_cache` 新規テーブル

カテゴリ単位のランキングキャッシュ:

```sql
CREATE TABLE rakuten_recipe_cache (
  cuisine text PRIMARY KEY,         -- "japanese" 等の cuisine キー
  rakuten_category_id text NOT NULL,
  recipe_ids uuid[] NOT NULL,       -- recipes.id の配列（順位順）
  fetched_at timestamptz NOT NULL,
  api_response_meta jsonb           -- リクエスト時刻、HTTP ヘッダ抜粋等
);
```

TTL は 6 時間（`now() - fetched_at < interval '6 hours'`）で fresh 判定。
RLS は service_role 限定（Edge Function からのみ書込／読込）。

### 5.3 `user_profiles` 拡張

```sql
ALTER TABLE user_profiles
  ADD COLUMN default_recipe_source text NOT NULL DEFAULT 'ai'
    CHECK (default_recipe_source IN ('ai', 'rakuten'));
```

設定画面で変更可能。リクエスト時の上書きも可能（UI でラジオ選択）。

---

## 6. UI 設計

### 6.1 `/recipes` ページ

```
┌─────────────────────────────────┐
│ レシピ提案                  [お気に入り] │
├─────────────────────────────────┤
│ 提案ソース: ◉ AI ◯ 楽天人気レシピ ⓘ │
│                                  │
│ ジャンル: [和食 ▼]                │
│                                  │
│ ┌─ AI モード時のみ表示 ──────────┐│
│ │ 手持ち食材:                    ││
│ │ [玉ねぎ] [鶏もも] [×] ...      ││
│ │ 候補数: ◉ 3 ◯ 4 ◯ 5            ││
│ └────────────────────────────┘│
│                                  │
│ ┌─ 楽天モード時の説明 ──────────┐│
│ │ ⓘ 食材指定はできません。       ││
│ │   選んだジャンルの人気ランキング ││
│ │   上位 4 件を表示します。       ││
│ └────────────────────────────┘│
│                                  │
│        [レシピを提案]            │
└─────────────────────────────────┘
```

### 6.2 `RecipeCard` の出し分け

- AI: 既存（タイトル / 所要 / カロリー / 材料抜粋）
- 楽天: タイトル / サムネイル画像 / 「楽天で見る ↗」バッジ / 材料抜粋

ソースが分かるよう、カード右上に小さくバッジ表示:
- 🤖 AI 生成
- 🛒 楽天

### 6.3 `/recipes/[id]` 詳細

`source` カラムで分岐:

| AI | 楽天 |
|---|---|
| 既存（材料・手順・カロリー・お気に入り保存）| タイトル / サムネイル / 材料リスト / **「楽天レシピで作り方を見る ↗」ボタン** / 投稿者名 |

楽天規約: 手順テキストの外部転載は不可。**ユーザーは楽天サイトに遷移**して手順を見る。

### 6.4 `/settings` 拡張

プロフィール編集に追加:

```
レシピ提案のデフォルトソース:
  ◉ AI 生成（おすすめ・自分の食材で）
  ◯ 楽天レシピ（無料・人気ランキング）
```

---

## 7. PR 分割計画

合計 **5 PR**。Phase 1+2 と同じく順次マージ。

### PR-A: マイグレーション + データモデル拡張
**ブランチ**: `feature/p14-schema`
**含む**:
- `supabase/migrations/20260504000001_p14_rakuten_recipes.sql`
  - `recipes` に external_* カラム追加
  - `recipes_external_unique` ユニークインデックス
  - `rakuten_recipe_cache` テーブル新設（RLS service_role 限定）
  - `user_profiles.default_recipe_source` 追加
- `web/types/database.ts` の対応型更新
- マイグレーション dry-run 確認

**工数**: 0.5 日

---

### PR-B: 楽天 API クライアント（Edge Function 共有モジュール）
**ブランチ**: `feature/p14-rakuten-client`
**依存**: PR-A
**含む**:
- `supabase/functions/_shared/rakuten.ts`:
  - `fetchRakutenRanking(categoryId, appId, fetchImpl?)` 純粋関数
  - レート制限対応（429 リトライ、最大 1 回 backoff 1s）
  - レスポンスの JSON Schema バリデート（Zod 風 type guard）
  - 失敗時は構造化エラー（CODE: `RAKUTEN_API_FAILED` / `RAKUTEN_RATE_LIMIT`）
- `supabase/functions/_shared/rakuten.test.ts`:
  - モック fetch でハッピーパス / 4xx / 5xx / レート制限を網羅
- `supabase/functions/_shared/cuisine-rakuten-map.ts`:
  - `CUISINE_TO_RAKUTEN_CATEGORY` マッピング辞書
  - 8 cuisine すべてカバー、漏れがないことのテスト

**含まない**: Edge Function 本体への組み込み

**工数**: 1 日

---

### PR-C: suggest-recipes Edge Function 拡張
**ブランチ**: `feature/p14-suggest-recipes-source`
**依存**: PR-B
**含む**:
- `supabase/functions/suggest-recipes/index.ts` を分岐対応:
  - 入力に `source: "ai" | "rakuten"`（デフォルト "ai"）追加
  - `source === "ai"` → 既存ロジック維持（regression なし）
  - `source === "rakuten"` → 以下の流れ:
    1. `rakuten_recipe_cache` を読む（fresh なら直接返す）
    2. stale/未キャッシュなら Rakuten API call
    3. `recipes` に upsert（onConflict: source,external_id）
    4. `rakuten_recipe_cache` を UPDATE
    5. `ai_advice_logs` に kind='recipe_external', cost_usd=0 で記録
- `validate.ts` で source パラメータ検証
- `validate.test.ts` 追加分テスト
- `supabase/functions/.env.sample` / README.md に `RAKUTEN_APP_ID` 追記

**工数**: 1.5 日

---

### PR-D: フロント UI 切替 + RecipeCard 出し分け
**ブランチ**: `feature/p14-recipes-ui`
**依存**: PR-C
**含む**:
- `web/components/recipes/source-picker.tsx`（新規）: AI / 楽天 ラジオ
- `web/components/recipes/recipe-suggest-form.tsx`:
  - source 状態管理、source に応じて食材プール UI を disabled
  - 楽天モード時の説明テキスト追加
  - Edge Function 呼出ペイロードに source を追加
- `web/components/recipes/recipe-card.tsx`:
  - source バッジ表示
  - 楽天時: サムネイル + 「楽天で見る ↗」アンカー
- `web/app/(app)/recipes/[id]/page.tsx`:
  - source 別の詳細表示（楽天は外部リンクボタン）
- `web/lib/profile/queries.ts` 拡張: `default_recipe_source` を form 初期値として読み込む

**工数**: 1.5 日

---

### PR-E: 設定画面 + 完了テスト
**ブランチ**: `feature/p14-settings-and-finalize`
**依存**: PR-D
**含む**:
- `web/components/profile/profile-form.tsx`: `default_recipe_source` ラジオ追加
- `web/lib/profile/schema.ts`: Zod 拡張
- E2E スモーク: 楽天モードでレシピ提案 → 詳細画面で外部リンクが見えることを Playwright で確認（モック API なら可、実 API は手動テスト）
- `docs/design.md` v0.7 へ（P-14 反映）
- `README.md` セットアップ手順に楽天デベロッパー登録の節を追加

**工数**: 1 日

---

## 8. 工数合計

| PR | 工数 |
|---|---|
| PR-A スキーマ | 0.5 日 |
| PR-B 楽天 API クライアント | 1 日 |
| PR-C Edge Function 分岐 | 1.5 日 |
| PR-D フロント UI | 1.5 日 |
| PR-E 設定 + 完了 | 1 日 |
| **合計** | **5.5 日（1〜1.5 週間）** |

---

## 9. 環境変数の段取り

PR-C 着手時に user に依頼する作業:

1. **楽天デベロッパー登録**: https://webservice.rakuten.co.jp/
2. **アプリ ID 発行**: 「アプリ ID 発行」→ 該当 URL を入力（`https://okazu-link.vercel.app` 等）
3. **Supabase Edge Function に登録**:
   ```bash
   supabase secrets set RAKUTEN_APP_ID=1234567890123456789
   ```
4. **動作確認**: ローカル `supabase functions serve` で疎通確認

---

## 10. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| 楽天 API 仕様変更 | カテゴリ ID やフィールド名がズレる | `scripts/fetch-rakuten-categories.ts` で年次再取得、レスポンスの type guard で早期検知 |
| レート制限超過（1 req/sec） | テスト中に 429 連発 | キャッシュ TTL 6h で実質的に低頻度。dev では mock fetch を推奨 |
| 楽天 API の商用利用条件 | サービス公開時に制約発生の可能性 | 利用規約を確認の上、規模に応じて利用申請。MVP〜数ユーザー規模なら問題なし想定 |
| ユーザー食材が反映されない違和感 | UX で不満が出る | UI 上で明示（「食材指定不可、ジャンル人気のみ」）+ AI モードを default に保つ |
| 楽天サイトの URL 切れ | 詳細リンクが 404 | recipes に external_url を保持しつつ、定期再フェッチで上書き |
| 楽天画像のホットリンク制限 | サムネ表示不可 | `<img referrerpolicy="no-referrer">` でリファラ除去、それでも NG なら別ストレージへ転送（Phase 2+ で検討） |
| `recipes` テーブル肥大化 | 全 cuisine × 4 件 = 32 件/6h × 多数ユーザー | カテゴリキャッシュで実書込は cuisine 数程度に収まる。長期運用で肥大化したら ttl カラムで定期 prune |

---

## 11. テスト戦略

| レイヤ | ツール | 範囲 |
|---|---|---|
| 純粋関数 | vitest | rakuten.ts のレスポンスパース / cuisine マッピング |
| Edge Function | vitest（mock）| suggest-recipes の source 分岐とキャッシュロジック |
| 統合 | 手動（実 API）| 楽天 applicationId を入れて実 API 叩く |
| UI | Playwright | source 切替、楽天カード表示、外部リンク href 確認 |
| 互換性 | 手動 | AI モードが既存通りに動くこと（regression 防止）|

---

## 12. 完了の定義（DoD）

- [ ] `/recipes` で AI / 楽天 をユーザーが切り替えられる
- [ ] 楽天モードで `categoryId` 8 種すべて 200 OK を返し、4 件のレシピが表示される
- [ ] 楽天レシピカードから recipe_url で楽天サイトに遷移できる
- [ ] `rakuten_recipe_cache` で TTL 6h のキャッシュヒットが効いている
- [ ] AI モードのレスポンス時間・コスト・成功率が PR 前と同等（regression なし）
- [ ] vitest 全 pass、CI 緑、独立コードレビュー対応済み
- [ ] `docs/design.md` v0.7 で P-14 を「実装済」に更新
- [ ] README に楽天デベロッパー登録手順を追記

---

## 13. 決定事項（旧オープンクエスチョン）

実装着手前のクエスチョンは 2026-05-04 に**すべて推奨デフォルトで確定**した。

| # | 内容 | 決定 |
|---|---|---|
| Q-P14-01 | お気に入り保存（saved_recipes）は楽天レシピも対象にするか？ | ✅ **対象にする**（recipes.id ベースなので DB 拡張不要、UI のみ source 別に調整）|
| Q-P14-02 | 楽天モードでも `candidateCount` UI は出すか？（楽天は常に 4 件固定）| ✅ **出さない**（楽天モード時は候補数選択を非表示にする）|
| Q-P14-03 | AI モード時の食材指定はそのまま、楽天モードは最初から無効化で OK？ | ✅ **OK**（楽天モード時は食材プール UI を disabled にする）|
| Q-P14-04 | 詳細画面で楽天レシピの「材料」を表示するか？（表示は規約で許容、手順は不可）| ✅ **表示する**（材料リストは AI モードと同様に見せる、手順は楽天サイトへの誘導）|
| Q-P14-05 | 楽天 API がダウンしたら AI に自動フォールバックするか？ | ✅ **しない**（明示エラーを返し、ユーザーが切替判断する）|

これらの決定は PR-A〜PR-E の実装方針に反映される。変更が生じた場合は本ドキュメントを更新する。

---

## 14. 次のアクション

このドキュメントを確定し、続けて **PR-A（マイグレーション + データモデル拡張）** の実装に着手する。

PR-A 着手時の対象ファイル（予定）:
- `supabase/migrations/20260504000001_p14_rakuten_recipes.sql`（新規）
- `web/types/database.ts`（recipes / user_profiles 型に新カラムを追加）

---

（以上）
