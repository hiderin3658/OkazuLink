# Phase 1 実装計画

> 作成日: 2026-04-27  
> 対象: Phase 1（レシート → 食材抽出 → ジャンル別レシピ提案）  
> 想定期間: 約 2〜3 週間  
> ロードマップ位置: 設計書 §11 Phase 1（最優先）

---

## 1. 目的

Phase 0 で整備した基盤の上に、本アプリの**コア体験**を組み上げる:

> 買い物帰りにレシートを撮影 → 1 操作で食材リスト化 → 手持ちでジャンル別レシピ提案を受ける

これにより、利用者が初日から得られる価値が「ログインできる」から
「料理判断のサポートがある」に進化する。

---

## 2. 機能スコープ

設計書 §3.1 の F-02 〜 F-06、F-14（一部）を実装。

| # | 機能 | 概要 | 画面 |
|---|---|---|---|
| F-02 | 買物登録（レシート画像アップ） | レシート画像 → AI で食材抽出 | S-02 |
| F-03 | 食材抽出結果の編集 | OCR 結果を確認・修正・確定 | S-02 |
| F-04 | ジャンル別レシピ提案 | 手持ち食材＋ジャンルで AI が候補生成 | S-05 |
| F-05 | レシピ詳細表示 | 材料・手順・所要・カロリー | S-06 |
| F-06 | 買物履歴／月間サマリー | 月単位で購入と金額を可視化 | S-03 |
| F-14 | CSV エクスポート（買物のみ） | 月別ダウンロード | S-03 |
| P-04 | お気に入りレシピ保存（軽実装） | 1 タップで saved_recipes に登録 | S-06 |

### スコープ外（Phase 2 以降）
- 月間栄養分析・アドバイザー（F-07, F-08）
- 体重・運動・食事ログ（F-09 〜 F-11）
- 楽天レシピ API 併用（P-14、将来拡張）
- 食材在庫トラッカー（P-01〜P-03、将来拡張）

---

## 3. 技術構成（Phase 0 から追加するもの）

### 3.1 Supabase Edge Functions

Phase 1 で 2 つの Edge Function を追加する。

| 関数名 | 入力 | 出力 | モデル |
|---|---|---|---|
| `extract-receipt` | 画像 URL（署名付き） | 食材 JSON | Gemini 3 Flash → 失敗時 Pro |
| `suggest-recipes` | 食材リスト＋ジャンル＋プロフィール | レシピ候補 JSON（3〜5件） | Gemini 3 Flash |

共通要素:
- Deno ランタイム（Supabase Edge Functions は Deno）
- `_shared/` に Gemini API クライアントと `ai_advice_logs` 記録ロジックを集約
- 入出力は **JSON Schema 固定**、サーバー側でバリデーション
- 失敗時はエラーコード返却、画面側でリトライ UI

### 3.2 環境変数（追加）

| 変数 | 配置先 | 機密性 | 取得方法 |
|---|---|---|---|
| `GEMINI_API_KEY` | Edge Function secrets | **絶対秘密** | Google AI Studio で取得 |
| `MODEL_OCR` | Edge Function env（任意） | 公開可 | デフォルト `gemini-3-flash` |
| `MODEL_OCR_FALLBACK` | 同上 | 公開可 | デフォルト `gemini-3-pro` |
| `MODEL_RECIPE` | 同上 | 公開可 | デフォルト `gemini-3-flash` |
| `MONTHLY_AI_BUDGET_JPY` | 同上 | 公開可 | デフォルト 1000 |
| `AI_BUDGET_MODE` | 同上 | 公開可 | `soft` / `hard`、デフォルト `soft` |

### 3.3 既存リソースの活用（DDL 追加なし）

Phase 0 末時点で以下が用意済みのため、Phase 1 では DDL マイグレーションは原則不要:
- `shopping_records` / `shopping_items`
- `recipes` / `recipe_ingredients` / `saved_recipes`
- `foods`（2,478 件投入済）
- `ai_advice_logs`
- Storage `receipts` バケット（path-prefix RLS 設定済）

---

## 4. PR 分割計画

合計 **8 PR** に分割。**実装順序を依存関係で並べた**もの。

### PR-A: 買物登録（手入力モード）+ 履歴 ★ 最優先で着手
**ブランチ**: `feature/phase-1-shopping-manual`  
**目的**: AI 抜きで利用者が **その日から使える状態** にする。OCR はまだ整わなくても、利用者の購入履歴ログ蓄積を先行開始できる。

**含む**:
- `/shopping`（S-03）: 履歴一覧、月別フィルタ
- `/shopping/new`（S-02 手入力）: 食材リストの手入力 → 確定
- `/shopping/[id]`（編集・削除）
- DB: `shopping_records` + `shopping_items` の CRUD（Server Actions 利用）
- Zod バリデーション
- 単体テスト（form schema、サマリー集計）
- ダッシュボード（S-01）に直近買物の簡易表示を追加

**含まない**: 画像アップロード／OCR／レシピ提案／CSV

**工数**: 1 〜 1.5 日

---

### PR-B: Phase 1 基盤（Edge Function + Gemini クライアント）
**ブランチ**: `feature/phase-1-edge-function-base`  
**目的**: 後続 PR の前提となる共通基盤。

**含む**:
- `supabase/functions/_shared/`:
  - `gemini.ts`: Gemini API クライアント（モデル切替、リトライ、コスト計算）
  - `ai-log.ts`: `ai_advice_logs` への INSERT ヘルパー
  - `cors.ts`: CORS ヘッダー
  - `auth.ts`: JWT 検証 + `allowed_users` チェック
- `supabase/functions/_shared/gemini.test.ts`（モックベースの単体テスト）
- ローカル動作確認用の `supabase/functions/hello/`（疎通確認）
- 環境変数のサンプル `supabase/functions/.env.sample`
- ドキュメント: Edge Function ローカル開発手順

**含まない**: 実機能の Edge Function

**工数**: 1 日

**前提作業 (user)**:
- Google AI Studio で `GEMINI_API_KEY` 取得
- `supabase functions secrets set GEMINI_API_KEY=...`

---

### PR-C: extract-receipt Edge Function
**ブランチ**: `feature/phase-1-extract-receipt-fn`  
**依存**: PR-B

**含む**:
- `supabase/functions/extract-receipt/index.ts`
  - 入力: `{ imagePath: string }`（Supabase Storage の signed URL を内部生成）
  - 出力: `OCRResult` JSON（store_name, purchased_at, items[], discounts[], confidence）
  - Gemini 3 Flash で実行 → 失敗時 Pro へフォールバック
  - 出力を JSON Schema バリデート
  - `ai_advice_logs` 記録
- ローカル CLI からの動作確認手順（`supabase functions serve`）
- テスト用レシート画像 1〜2 枚（`pic/receipts/test-*.jpg`）でテスト
- Edge Function 単体テスト（モック AI レスポンスで）

**工数**: 1.5 日

---

### PR-D: 買物登録 - 画像アップロード + OCR 連携 (S-02 完成)
**ブランチ**: `feature/phase-1-shopping-with-ocr`  
**依存**: PR-A, PR-C

**含む**:
- `/shopping/new` に画像アップロード UI 追加
- Supabase Storage `receipts` バケットへ直接アップロード
- アップ完了 → `extract-receipt` 呼び出し → ローディング UI
- 抽出結果（OCRResult）→ 編集 UI（既存の手入力フォームを流用）
- 確定 → DB 保存（PR-A の Server Action 流用）
- 失敗時のリトライ UI

**工数**: 2 日

---

### PR-E: suggest-recipes Edge Function
**ブランチ**: `feature/phase-1-suggest-recipes-fn`  
**依存**: PR-B

**含む**:
- `supabase/functions/suggest-recipes/index.ts`
  - 入力: `{ ingredients: string[], cuisine: string, profile?: { allergies?, disliked? } }`
  - 出力: `RecipeSuggestion[]`（3〜5 件）
  - キャッシュキー: `prompt_hash`（同じ条件は `recipes` テーブルから返す）
  - キャッシュ未ヒット時のみ Gemini 3 Flash 呼び出し
  - `recipes` + `recipe_ingredients` への INSERT（service_role）
- 単体テスト（モック AI レスポンス）

**工数**: 1.5 日

---

### PR-F: レシピ提案・詳細画面 (S-05 / S-06)
**ブランチ**: `feature/phase-1-recipes-ui`  
**依存**: PR-A, PR-E

**含む**:
- `/recipes`（S-05）: ジャンル選択 → 候補カード一覧（3〜5 件）
  - 食材プール選択 UI（最近の買物履歴 N 件分から）
  - ジャンル選択（chip 形式）
  - 「レシピを提案」ボタン → Edge Function 呼出 → 候補表示
- `/recipes/[id]`（S-06）: レシピ詳細
  - 材料・手順・所要・カロリー目安
  - お気に入り保存ボタン（saved_recipes upsert）
- ダッシュボードに「レシピ提案」リンク

**工数**: 2 日

---

### PR-G: お気に入りレシピ + 設定画面拡充
**ブランチ**: `feature/phase-1-saved-recipes`  
**依存**: PR-F

**含む**:
- `/recipes/saved`（お気に入り一覧）
- 設定画面に「ユーザープロフィール（簡易）」: `allergies` / `disliked_foods` を編集可能化（Phase 2 で完全版）
- これらを `suggest-recipes` のプロンプトに反映

**工数**: 1 日

---

### PR-H: CSV エクスポート + Phase 1 完了テスト
**ブランチ**: `feature/phase-1-csv-and-finalize`  
**依存**: 全 PR

**含む**:
- `/shopping` に CSV ダウンロードボタン（買物履歴のみ）
- E2E テスト（Playwright）の最低限シナリオ: ログイン → 買物登録 → レシピ提案 → 詳細
- README.md / docs/design.md を Phase 1 完了状態に更新（v0.5）

**工数**: 1 日

---

## 5. 工数合計

| PR | 主担当 | 工数 |
|---|---|---|
| PR-A 買物手入力 | (本計画書直後で着手) | 1.5 日 |
| PR-B Edge Function 基盤 | | 1 日 |
| PR-C extract-receipt | | 1.5 日 |
| PR-D OCR UI 連携 | | 2 日 |
| PR-E suggest-recipes | | 1.5 日 |
| PR-F レシピ画面 | | 2 日 |
| PR-G お気に入り | | 1 日 |
| PR-H CSV + 完了テスト | | 1 日 |
| **合計** | | **約 11.5 日（2〜3 週間）** |

---

## 6. 並行作業計画

依存関係グラフ:

```
PR-A (買物手入力)  ──┐
                     ├── PR-D (OCR UI)
PR-B (基盤) ── PR-C (extract-receipt) ┘
                  │
                  └── PR-E (suggest-recipes) ── PR-F (レシピ画面) ── PR-G (お気に入り)
                                                                       │
                                                                       └── PR-H (CSV + 完了)
```

**並行可能なペア**:
- PR-A と PR-B（依存なし、別領域）
- PR-C と PR-E は PR-B 完了後に並行可
- PR-D と PR-F は依存さえ整えば並行可

実運用では、エージェント並行よりも順次実行で品質統一する方が
バグ低減・レビュー楽の利点があるため、並行は最大 2 ストリームに留める。

---

## 7. 環境変数の段取り

PR-B 着手時に user に依頼する作業:

1. **Google AI Studio でアカウント作成**: https://aistudio.google.com/
2. **API キー発行**: 「Get API Key」→「Create API key」
3. **Supabase Edge Function に登録**:
   ```bash
   cd supabase
   supabase secrets set GEMINI_API_KEY=AIzaSy...
   supabase secrets set MODEL_OCR=gemini-3-flash
   supabase secrets set MODEL_OCR_FALLBACK=gemini-3-pro
   supabase secrets set MODEL_RECIPE=gemini-3-flash
   supabase secrets set MONTHLY_AI_BUDGET_JPY=1000
   supabase secrets set AI_BUDGET_MODE=soft
   ```
4. **Function deploy**: `supabase functions deploy <name>`

---

## 8. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| Gemini 3 系の API 仕様が公開仕様と異なる | Edge Function 実装やり直し | PR-B でモック先行、実 API 連携は確認後 |
| OCR 精度が想定より低い | UX 劣化 | フォールバック（Pro）と手入力経路（PR-A）の両建て |
| 月額コスト上限 1,000 円を超える | 開発中の請求発生 | `MONTHLY_AI_BUDGET_JPY` で `hard` 切替可能、`ai_advice_logs` で日次集計 |
| Storage 経由の signed URL 期限切れ | OCR 失敗 | TTL を OCR 完了想定時間より十分長く設定（300 秒程度） |
| レシート画像の HEIC（iPhone 標準） | Gemini が解釈できない | クライアント側で HEIC → JPEG 変換、または HEIC 受領後 Edge Function で変換 |
| Edge Function のコールドスタート | UX で目に見える待ち | ローディング UI を丁寧に、Phase 2 で warmup 検討 |

---

## 9. テスト戦略

| レイヤ | ツール | 範囲 |
|---|---|---|
| 単体テスト | vitest | バリデーション schema、純関数（合計算等）、Edge Function ハンドラ（モック） |
| Component テスト | vitest + Testing Library | フォーム入力フロー（任意、軽量に） |
| E2E | Playwright | 主要シナリオ 1〜2 本のみ。CI でも一部実行 |
| 手動テスト | 実機 | 各 PR で必須シナリオを通す |

---

## 10. ドキュメントの更新計画

| PR | docs 更新 |
|---|---|
| PR-A 〜 PR-H 各 | PR 本文に Test plan 記載 |
| PR-H | `docs/design.md` v0.5（Phase 1 完了反映）、`README.md` に Phase 1 セットアップ手順追記 |

---

## 11. 次のアクション

このドキュメントを確定し、続けて **PR-A（買物手入力）** の実装に着手する。

PR-A 着手時の対象ファイル（予定）:
- `web/app/(app)/shopping/page.tsx`（既存スタブを置き換え）
- `web/app/(app)/shopping/new/page.tsx`（新規）
- `web/app/(app)/shopping/[id]/page.tsx`（新規）
- `web/components/shopping/`（新規ディレクトリ）
  - `shopping-form.tsx`
  - `shopping-list.tsx`
  - `shopping-item-row.tsx`
- `web/lib/shopping/`（新規ディレクトリ）
  - `schema.ts`（Zod スキーマ）
  - `actions.ts`（Server Actions）
  - `schema.test.ts`
- `web/types/database.ts`: shopping 関連型を追加
- `web/app/(app)/dashboard/page.tsx`: 直近買物の簡易カード追加

---

（以上）
