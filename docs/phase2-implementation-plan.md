# Phase 2 実装計画

> 作成日: 2026-04-29  
> 対象: Phase 2（栄養アドバイザー）  
> 想定期間: 約 2〜3 週間  
> ロードマップ位置: 設計書 §11 Phase 2

---

## 1. 目的

Phase 1 で蓄積された買物データを活用して **「食生活の状態を可視化し、
目標達成のためのアクションを示す」** 機能を提供する。

> 月初に「先月の栄養はどうだった？」を開くと、PFC・ビタミン・ミネラルの
> 摂取量が一目でわかり、目標（ダイエット／筋力アップ／体調管理）に応じた
> 「来月の買い足し提案」と AI コーチコメントが得られる。

---

## 2. 機能スコープ

設計書 §3.1 の F-07 / F-08、F-12 の拡充、F-14 の栄養 CSV を実装。

| # | 機能 | 概要 | 画面 |
|---|---|---|---|
| F-07 | 栄養バランス分析 | 月間の PFC・食物繊維・ビタミン・鉄等を集計表示 | S-07 |
| F-08 | 目標別アドバイザー | AI が目標に応じた助言＋買い足し食材リストを生成 | S-08 |
| F-12 | プロフィール拡充 | 身長・目標体重・年齢を入力可能化、推奨摂取量を自動算出 | S-12 |
| F-14 | CSV（栄養） | 月別栄養サマリーをダウンロード | S-07 |

### スコープ外（Phase 3 以降）
- 体重・運動・食事ログとの連動（Phase 3）
- 週次の栄養レポート（将来拡張、月次で十分のため）
- 月次振り返りレポート自動生成 P-11（将来拡張）
- 摂取量の手動補正 UI（買物以外の食事入力は Phase 3 でカバー）

---

## 3. 現状の課題（Phase 1 で残った負債）

### 3.1 shopping_items.food_id のマッチング不足

**問題**: Phase 1 のレシート OCR / 手入力では `food_id` を `null` のままで
保存している。foods マスタ（2,478 件）と紐付ける処理が走っていないため、
栄養計算ができない。

**対応**: Phase 2 で **`raw_name` / `display_name` → foods マッチング** を
実装。レイヤ構成:
1. **完全一致** (foods.name または foods.aliases に含まれる)
2. **部分一致／正規化** (空白除去・カタカナひらがな統一)
3. **AI 補助** (estimate-food-nutrition Edge Function、Phase 1 計画で予定済)

### 3.2 推奨摂取量の基準

栄養を「足りているか」判定するには、ユーザーごとの**推奨摂取量**が必要。
日本人の食事摂取基準（2025 年版、厚労省）から年齢・性別別に算出。

Phase 2 では：
- プロフィールに `birth_year`, `height_cm`, `target_weight_kg` を入力可
- 性別は当面「女性」固定（一人暮らし女性向けアプリのため）
- 簡易計算: BMR (Harris-Benedict) × 活動係数 1.5（座位中心）

---

## 4. データフロー全体

```
[shopping_items]                        [foods]
  raw_name                                code, name, aliases,
  display_name           ─ match ─→     nutrition_per_100g (jsonb)
  quantity, unit                          (PFC, vitamin, mineral)
  food_id (null → 設定)
       │
       ▼
[match-foods バックフィル]               [user_profiles]
       │                                  goal_type, allergies,
       ▼                                  birth_year, height_cm,
[nutrition_monthly_summaries]              target_weight_kg
  user_id, month_start (date)
  summary (jsonb):
    energy_kcal, protein_g, fat_g,
    carb_g, fiber_g, ca, fe, vit_a,
    vit_c, vit_d, ...
  computed_at
       │
       ├──→ [S-07 栄養レポート]  ← 推奨摂取量との比較表示
       │
       ▼
[advise-nutrition Edge Function]
  入力: 月次サマリー + プロフィール
  出力: NutritionAdvice JSON
       │
       ▼
[S-08 アドバイザー画面]
  - コーチコメント
  - 不足栄養素一覧
  - 買い足し食材レコメンド (foods マスタから)
```

---

## 5. PR 分割計画

合計 **7 PR** に分割。**PR2-A → PR2-G の順で依存関係に従う**。

### PR2-A: foods マッチング基盤
**ブランチ**: `feature/phase-2-foods-matching`  
**目的**: shopping_items に food_id を埋めて栄養計算の前提を作る。

**含む**:
- `web/lib/foods/matcher.ts`: 純粋関数 matchFood(rawName, displayName, foodsMaster)
  - 完全一致 (name / aliases)
  - 正規化（trim, NFKC, ひらがな↔カタカナ）後の一致
  - 失敗時は null（AI 補助は別 PR）
- `web/lib/foods/matcher.test.ts`: 表記ゆれの代表ケースを網羅
- 既存 shopping_items の food_id バックフィル: Server Action または
  CLI スクリプト（service_role で一括更新）
- 新規 OCR / 手入力時にもマッチを試行する Server Action 拡張

**含まない**: AI 補助マッチング（estimate-food-nutrition は別 PR）

**工数**: 1 日

---

### PR2-B: 月次栄養集計
**ブランチ**: `feature/phase-2-nutrition-aggregation`  
**依存**: PR2-A

**含む**:
- `supabase/migrations/2026MMDD_phase2_nutrition_view.sql`:
  PostgreSQL の View または関数で `shopping_items × foods` を結合し、
  月別合計栄養を算出する SQL を実装。
- `web/lib/nutrition/aggregate.ts`: View を読み出して
  nutrition_monthly_summaries に upsert する Server Action
- `web/lib/nutrition/types.ts`: NutritionSummary 型（PFC + ビタミン + ミネラル）
- 集計タイミング: ユーザーが S-07 を開いた時に on-demand（fresh = 24h）。
  バッチ ジョブは Phase 3 以降で検討
- テスト: aggregate のロジック（純粋関数部分）を vitest 化

**工数**: 1.5 日

---

### PR2-C: 栄養レポート画面 (S-07)
**ブランチ**: `feature/phase-2-nutrition-report`  
**依存**: PR2-B

**含む**:
- `/nutrition` (S-07): 既存スタブを置換
  - 月セレクタ（直近 6 ヶ月）
  - PFC 円グラフまたは積み上げバー
  - ビタミン / ミネラル の充足度バー（推奨量比 %）
  - 「マッチできなかった食材一覧」（食材名と件数、補正導線への入口）
- 推奨摂取量計算: `web/lib/nutrition/recommended.ts`（年齢別、女性固定）
- 表示用コンポーネント: `components/nutrition/macro-bar.tsx`,
  `nutrition-table.tsx`
- グラフライブラリ: 設計書 §5.2 の **Recharts** を採用（軽量、SSR 対応）

**工数**: 2 日

---

### PR2-D: advise-nutrition Edge Function
**ブランチ**: `feature/phase-2-advise-nutrition-fn`  
**依存**: PR2-B

**含む**:
- `supabase/functions/advise-nutrition/`
  - `index.ts`: 入力検証 → 月次サマリーを取得 → Gemini 3 Pro でアドバイス生成 →
    `ai_advice_logs` に記録 → 返却
  - `validate.ts`: NutritionAdvice JSON の形検証（純粋関数 / vitest）
  - `validate.test.ts`
- `supabase/functions/_shared/prompts.ts` に `buildNutritionAdvicePrompt`
  を追加（既存ファイルに関数追加）
- キャッシュ戦略: user_id + year_month + summary の hash で
  `ai_advice_logs` を再利用（同月同条件は再呼出しない）
- モデル: `MODEL_ADVICE` 環境変数（デフォルト `gemini-3-pro`）

**工数**: 1.5 日

---

### PR2-E: アドバイザー画面 (S-08)
**ブランチ**: `feature/phase-2-advisor-ui`  
**依存**: PR2-C, PR2-D

**含む**:
- `/nutrition/advice` または `/nutrition` の内タブで
  「アドバイス」セクションを追加（UX は MVP 段階で柔軟）
- アドバイス取得ボタン → loading → 結果表示
- 不足栄養素ごとに「買い足し提案」を foods マスタから抽出して表示
  - 例: 鉄分不足 → 「ほうれん草、レバー、あさり」
- 同月再呼出は前回結果を表示（キャッシュバッジ）
- お気に入り保存などはまだ未実装で OK（将来の P-04 拡張）

**工数**: 1.5 日

---

### PR2-F: プロフィール拡充 (F-12)
**ブランチ**: `feature/phase-2-profile-extended`  
**依存**: PR2-C（推奨摂取量計算が動くため）

**含む**:
- `/settings` のプロフィール フォームに以下を追加:
  - 生年（数値、1900-2026）
  - 身長 (cm)
  - 目標体重 (kg)
- バリデーション拡充（Zod スキーマ）
- 推奨摂取量を S-07 で利用するための glue コード
- 性別は当面「女性」固定（コメントで明記）

**工数**: 1 日

---

### PR2-G: CSV エクスポート（栄養）+ Phase 2 完了テスト
**ブランチ**: `feature/phase-2-finalize`  
**依存**: 全 PR

**含む**:
- `/api/nutrition/export`: 月別の summary を CSV で吐き出す
  （年月、栄養素ごとの値、推奨量、達成率）
- S-07 に「CSV」ボタン
- E2E スモーク（authenticated path は引き続き手動、unauthorized
  redirect のみ Playwright 自動化）
- README.md / docs/design.md を Phase 2 完了状態に更新（v0.6）

**工数**: 1 日

---

## 6. 工数合計

| PR | 工数 |
|---|---|
| PR2-A foods マッチング基盤 | 1 日 |
| PR2-B 月次栄養集計 | 1.5 日 |
| PR2-C 栄養レポート画面 | 2 日 |
| PR2-D advise-nutrition Function | 1.5 日 |
| PR2-E アドバイザー画面 | 1.5 日 |
| PR2-F プロフィール拡充 | 1 日 |
| PR2-G CSV + 完了テスト | 1 日 |
| **合計** | **約 9.5 日（2〜3 週間）** |

Phase 1 と同じく「PR ごとに独立コードレビュー → ユーザーが承認 → マージ」の
ワークフローで進める。

---

## 7. 環境変数の追加（PR2-D 着手時）

```bash
supabase secrets set MODEL_ADVICE=gemini-3-pro
# MONTHLY_AI_BUDGET_JPY / AI_BUDGET_MODE は Phase 1 で設定済みなら追加不要
```

`gemini-3-pro` の単価が高いため、Phase 1 と比べて月次コストが上がる可能性あり。
hard モードでの予算切れを発生させないよう、初期は **soft モード** で実運用しながら
コスト推移を `ai_advice_logs` で観察する。

---

## 8. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| foods マッチング率が低い (例: 60% 未満) | 栄養計算が不正確 | PR2-A で代表ケースをテスト、率が低ければ aliases を追加 or AI 補助 (P-11 部分先行) |
| 月次予算 ¥1,000 を Pro モデル使用で超過 | 一時的に AI 呼出停止 | soft モード運用 + ai_advice_logs で日次集計監視、必要に応じ MODEL_ADVICE を Flash に下げる |
| 推奨摂取量計算の不正確さ | アドバイスが的外れ | 厚労省の食事摂取基準 (2025 年版) を出典明記 + 簡易計算であることをアプリ内に注記 |
| OCR 結果の食材表記が foods に無い (例: 商品名「○○の極み弁当」) | 完全一致しない | display_name に「弁当」など一般名を入れる UX を S-02 で促進、Phase 3 で食事ログ拡充 |
| Gemini 3 Pro の API 仕様変更 | Edge Function 失敗 | PR2-D を mock テストで先行、実 API 連携は確認後 |
| view の集計クエリが遅い | UI 体感低下 | 件数 < 1,000 想定なので問題なし。Phase 3 で件数増加時に materialized view 検討 |

---

## 9. テスト戦略

| レイヤ | ツール | 範囲 |
|---|---|---|
| 純粋関数 | vitest | matcher、aggregate（pure 部）、recommended、validate |
| Server Action | 統合（手動） | DB 反映まで実機で確認 |
| Edge Function | vitest（mock） + supabase functions serve（実 API） | advise-nutrition のレスポンス整合性 |
| UI | 手動 + Playwright スモーク | 主要シナリオ通し |
| コスト | ai_advice_logs 監視 | 日次集計クエリで予算観察 |

---

## 10. ドキュメント更新

| PR | 更新箇所 |
|---|---|
| 各 PR | PR 本文に Test plan |
| PR2-A | foods マッチング戦略を `docs/` に簡潔メモ |
| PR2-G | README.md に Phase 2 機能・実機確認手順、`docs/design.md` v0.6 へ |

---

## 11. 完了の定義（Phase 2 DoD）

- [ ] /nutrition で月次の PFC + 主要栄養素が表示される
- [ ] 直近 1 ヶ月の買物データから自動集計される（手動再集計ボタンあり）
- [ ] 目標別アドバイスが Gemini 3 Pro で生成され、買い足し提案リストが foods マスタから引かれる
- [ ] /settings で身長・目標体重・年齢を編集できる
- [ ] /nutrition から月別栄養 CSV をダウンロードできる
- [ ] foods マッチング率が 70% 以上（代表ケースで検証）
- [ ] vitest 全 pass、CI 緑、独立コードレビュー対応済み

---

## 12. 次のアクション

このドキュメントを確定し、続けて **PR2-A（foods マッチング基盤）** の実装に着手する。

PR2-A 着手時の対象ファイル（予定）:
- `web/lib/foods/matcher.ts`（新規）
- `web/lib/foods/matcher.test.ts`（新規）
- `web/lib/foods/queries.ts`（既存があれば拡張、無ければ新規）
- shopping_items への食材登録時に matchFood を呼び出す Server Action 拡張
- 既存 shopping_items の food_id バックフィル スクリプトまたは Action

---

（以上）
