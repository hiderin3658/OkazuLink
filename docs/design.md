# OkazuLink 設計書

> 一人暮らし女性向け「買い物 → 料理 → 栄養 → 健康管理」を一気通貫でサポートするパーソナル食生活アドバイザー Web アプリ。

- 作成日: 2026-04-21
- バージョン: 0.7
- 対象: MVP 〜 将来拡張までの全体像

### 変更履歴
- v0.1（2026-04-21）: 初期設計ドラフト
- v0.2（2026-04-21）: Q-01〜Q-12 の決定反映。OCR 対象をレシートに変更／AI を Gemini 3 系に変更／ロードマップを Phase 0〜3 + 拡張 の構成に再編
- v0.3（2026-04-26）: Phase 0 マイグレーション後の設計レビューを反映
  - email を case-insensitive 化（lower() 統一）
  - recipe_source enum から `user_saved` を削除（MVP では AI 生成のみ）
  - body_composition_logs / meal_logs に UNIQUE 制約追加
  - nutrition_monthly_summaries.year_month を date 型 (month_start) に変更
  - recipe_ingredients に admin 書込ポリシー追加
  - ai_advice_logs.kind にインデックス追加
- v0.4（2026-04-27）: Phase 0 末作業（foods マスタ投入）の実装結果を反映
  - 食材マスタを 2020年版（八訂）から 2,478 件投入（katoharu432 GitHub の CC BY 4.0 JSON を採用）
  - 増補2023年は採用見送り（公式 CSV/Excel 入手後にデータファイル差し替えで再投入する想定）
  - seed スクリプトは `web/scripts/seed-foods.ts` に配置（モジュール解決の都合）
  - service_role key の保管を `web/.env.local` から `web/scripts/.env` に分離
- v0.5（2026-04-29）: Phase 1 の実装結果を反映
  - 買物登録（手入力 + レシート OCR）、買物履歴・月別合計、CSV エクスポート (F-02 / F-03 / F-06 / F-14 一部)
  - AI レシピ提案（ジャンル + プロフィール反映）、詳細、お気に入り (F-04 / F-05)
  - Edge Function `extract-receipt` / `suggest-recipes`（Gemini 3 Flash + Pro フォールバック、JSON Schema バリデーション、ai_advice_logs 記録、月次予算チェック）
  - プロフィール簡易編集（アレルギー / 苦手 / 目標）を suggest-recipes へ反映
  - 全 8 PR (PR-A 〜 PR-H) で段階的にリリース、独立コードレビューを各 PR に実施
- v0.6（2026-04-30）: Phase 2 の実装結果を反映
  - foods マッチング基盤（normalize + buildFoodIndex + バックフィルスクリプト）
  - 月次栄養集計（純粋関数 aggregateMonthly + nutrition_monthly_summaries の 24h キャッシュ）
  - 栄養レポート画面 S-07（PFC バー + 達成率テーブル + 推奨摂取量[厚労省 2020年版・女性] 反映）
  - Edge Function `advise-nutrition`（Gemini 3 Pro、`ai_advice_logs.input_hash` キャッシュ）
  - アドバイザー画面 S-08（コーチコメント + 不足栄養素 + 買い足し提案）
  - プロフィール拡充（生年・身長・目標体重 → 年齢区分判定）
  - 月次栄養 CSV エクスポート（達成率 + 判定 + 計算前提付き）
  - ai_advice_logs.request_payload->input_hash 用 partial index 追加
  - 全 7 PR (PR2-A 〜 PR2-G) で段階的にリリース、独立コードレビューを各 PR に実施
- v0.7（2026-05-04）: P-14 楽天レシピ API 併用の実装結果を反映
  - recipes に external_provider / external_id / external_url / external_image_url / external_meta カラムを追加（既存 'external' enum + provider カラムでサブ識別）
  - rakuten_recipe_cache テーブル新設（cuisine 単位、TTL 6h）
  - user_profiles.default_recipe_source（'ai' / 'rakuten'）追加
  - suggest-recipes Edge Function に source 分岐を追加（AI 経路は完全互換維持、Q-P14-05 の決定通り楽天障害時の AI フォールバックは行わない）
  - フロント UI に SourcePicker（AI / 楽天）を追加、楽天モード時は食材プール / 候補数 UI を非表示、サムネ + 外部リンクで楽天詳細表示
  - 楽天規約準拠（手順テキストは転載せず楽天サイトへ誘導、画像は referrerPolicy="no-referrer"）
  - 全 5 PR (PR-A 〜 PR-E) で段階的にリリース、独立コードレビューを各 PR に実施

---

## 1. プロジェクト概要

### 1.1 背景・課題
- 一人暮らしで自炊をしているが、食材を買ったあと「何を作るか」で迷う。
- 月単位で見たときに何を食べているか／栄養が偏っていないかを把握しにくい。
- ダイエット・体調管理・筋力アップなど目的別のアドバイスを都度調べるのが大変。
- 体重・食事・運動が別々のアプリに分散しがちで一気通貫で見られない。

### 1.2 コンセプト
**「買ったもの」を起点に、食事・栄養・体重・運動までワンストップで管理しアドバイスを返す、スマホ完結のパーソナルコーチ。**

### 1.3 スコープ（MVP 含む全体）
- **レシート写真（レジ発行の紙レシート）** の画像アップロード
- 画像からの食材抽出（AI OCR）
- 食材ベースのジャンル別レシピ提案
- 月間購入履歴の蓄積と栄養バランス分析
- 目標別（ダイエット／筋力アップ／体調管理）アドバイス
- 体重・運動・食事の日次記録
- Google 認証（ホワイトリスト方式）
- CSV エクスポート

### 1.4 非スコープ（初期リリース外）
- ネイティブアプリ（iOS/Android）。ただし PWA で「ホーム画面に追加」対応。
- 手書き買物メモからの OCR（参考画像は設計検討用であり機能スコープ外）。
- 複数ユーザー間のソーシャル機能。
- レシピ動画の生成。
- スマートデバイス連携（体組成計／スマートウォッチ／Apple Health／Google Fit）— 将来拡張候補。
- プッシュ通知／メール通知。
- 生理周期トラッカー — 将来拡張候補。
- 一般公開（ユーザー登録・課金・プラン管理）。

---

## 2. ターゲット・ペルソナ

| 項目 | 内容 |
|------|------|
| 年齢層 | 20代後半〜40代の女性 |
| 状況 | 一人暮らし、平日はフルタイム勤務、週末中心に買い出し |
| 自炊頻度 | 週3〜5回 |
| IT リテラシ | スマホ中心、Web アプリは抵抗なし |
| モチベ | 健康維持・体型維持・食費管理 |
| 初期運用 | 作成者（admin、非利用者）＋利用者 1 名。将来的に数名まで拡張可能な設計 |

---

## 3. 機能要件

### 3.1 MVP 〜 Phase 3 機能一覧

| # | 機能 | 概要 | 実装フェーズ |
|---|------|------|-------------|
| F-01 | Google 認証 | ホワイトリスト登録者のみログイン可 | Phase 0 |
| F-02 | 買物登録（レシート画像アップ） | レシート写真をアップし AI で食材抽出 | Phase 1 |
| F-03 | 食材抽出結果の編集 | AI 抽出結果をユーザーが修正・確定 | Phase 1 |
| F-04 | ジャンル別レシピ提案 | 手持ち食材＋ジャンル（和・中・伊・仏・韓・エスニック等）で AI がレシピ候補生成 | Phase 1 |
| F-05 | レシピ詳細表示 | 材料・分量・手順・所要時間・カロリー目安 | Phase 1 |
| F-06 | 買物履歴／月間サマリー | 月単位で購入食材・金額をグラフと表で可視化 | Phase 1 |
| F-07 | 栄養バランス分析 | 月間の栄養素（PFC／食物繊維／ビタミン／鉄 等）を推定し偏りを表示 | Phase 2 |
| F-08 | 目標別アドバイザー | ダイエット／筋力アップ／体調管理 等の目標別に不足食材・献立例を AI 提示 | Phase 2 |
| F-09 | 体重記録 | 日次の体重を入力、グラフ化 | Phase 3 |
| F-10 | 運動記録 | 運動種別・時間・強度の手入力、消費カロリー目安を表示 | Phase 3 |
| F-11 | 食事ログ | 朝昼夕＋間食を記録（テキスト／画像） | Phase 3 |
| F-12 | 設定／プロフィール | 身長・目標体重・目標タイプ・アレルギー・苦手食材 | Phase 0 〜 Phase 3 で段階的に拡張 |
| F-13 | 管理者機能 | 許可ユーザー追加／削除（admin のみ） | Phase 0 |
| F-14 | CSV エクスポート | 買物・体重・食事・運動データを CSV で出力 | Phase 1 〜 Phase 3 で段階対応 |

### 3.2 追加提案機能（将来拡張候補）

| # | 機能 | 提案理由 |
|---|------|---------|
| P-01 | 食材在庫トラッカー | 消費マークを付けて残り食材から提案精度を上げる |
| P-02 | 消費期限アラート（通知なしで画面内表示のみ） | 生鮮の傷みを防ぐ |
| P-03 | 買い足しリスト自動生成 | 栄養不足や常備品切れを次回買物時に提案 |
| P-04 | お気に入りレシピ保存 | 気に入ったレシピを再現しやすく |
| P-05 | 予算／食費ダッシュボード | 月予算に対する消化率、食材／飲料／菓子別の内訳 |
| P-06 | 体組成推移 | BMI・体脂肪率・ウエスト等の推移グラフ |
| P-07 | 生理周期トラッカー | 女性向けアドバイス精度向上（オプトイン） |
| P-08 | 週間献立プラン | 手持ち食材と目標から 1 週間の献立を提案 |
| P-09 | PWA 強化 | オフライン閲覧、カメラ直起動 |
| P-10 | 音声入力 | 運動・食事ログを素早く記録 |
| P-11 | 月次振り返りレポート自動生成 | AI が所感コメント付きレポートを生成 |
| P-12 | アレルギー／嗜好フィルタ強化 | レシピ提案から自動除外 |
| P-13 | 複数画像の一括アップ | 1 回の買物で複数レシートがある場合の一括処理 |
| ~~P-14~~ | ~~外部レシピ API 併用（楽天レシピ）~~ | **v0.7 で実装済**（AI / 楽天 を設定で切替可能、詳細は §11 参照） |
| P-15 | スマート体重計・運動計連携 | Withings／Google Fit 等（将来） |
| P-16 | CSV 以外のエクスポート（JSON, PDF） | データ持ち出し手段の拡充 |

### 3.3 ユーザーストーリー（抜粋）

- **US-01**: ユーザーとして、買い物帰りにレシートを写真で撮って 1 操作でアップしたい。抽出結果は後で修正したい。
- **US-02**: 冷蔵庫の食材を眺めつつ「今夜は中華の気分」で選ぶと、3〜5 件のレシピ候補が出てほしい。
- **US-03**: 月末に「今月の栄養はどうだった？」を開くと、偏りと不足栄養素、ダイエット目標に対する示唆が得られる。
- **US-04**: 毎朝の体重計測後、アプリを開いて体重を 1 タップで記録し、直近 1 ヶ月の推移を見られる。
- **US-05**: 運動したらその場で「ウォーキング 30 分 / 中強度」と記録し、週次で集計を見られる。

---

## 4. 非機能要件

| 区分 | 要件 |
|------|------|
| デバイス | モバイルファースト。iPhone Safari／Android Chrome／PC ブラウザ対応 |
| パフォーマンス | 画面遷移 1 秒以内、通常操作 3 秒以内。AI 処理はローディング UI で吸収 |
| オフライン | PWA。履歴閲覧はオフライン可。記録系は再接続時に同期（将来） |
| セキュリティ | HTTPS 強制、Supabase RLS、AI 秘密鍵は Edge Function 経由のみ |
| 可用性 | 個人利用規模。SLA 99% 目標（Vercel / Supabase の標準に準ずる） |
| 国際化 | 日本語のみ（初期） |
| アクセシビリティ | 主要画面でコントラスト AA。大文字サイズ対応 |
| コスト（AI） | 月 ¥1,000 を環境変数による可変上限で監視。超過時は admin に表示アラート |
| 通知 | なし（MVP〜Phase 3） |
| ドメイン | Vercel デフォルト（`okazu-link.vercel.app` 等） |

---

## 5. システム構成

### 5.1 全体構成図（論理）

```
 ┌─────────────────────────────┐
 │  Mobile / PC Browser (PWA)  │
 │  Next.js App (Vercel)       │
 └───────────┬─────────────────┘
             │ HTTPS
 ┌───────────▼─────────────────┐
 │       Supabase              │
 │  ┌─────────┐ ┌────────────┐ │
 │  │ Auth    │ │ PostgreSQL │ │
 │  │ Google  │ │   + RLS    │ │
 │  └─────────┘ └────────────┘ │
 │  ┌─────────┐ ┌────────────┐ │
 │  │ Storage │ │Edge Function│ │
 │  │(images) │ │   (AI Hub)  │ │
 │  └─────────┘ └─────┬──────┘ │
 └────────────────────┼────────┘
                      │
           ┌──────────▼────────────┐
           │    Gemini API         │
           │  Flash / Pro / Lite   │
           └───────────────────────┘
```

### 5.2 技術スタック

| レイヤ | 採用技術 | 理由 |
|--------|---------|------|
| フロントエンド | Next.js 15 (App Router) + TypeScript | SSR/CSR 両対応、Vercel と親和性、開発速度 |
| UI | Tailwind CSS + shadcn/ui | モバイル対応・カスタマイズ性・軽量 |
| 状態管理 | TanStack Query + Zustand | サーバ状態とローカル状態の分離 |
| グラフ | Recharts | シンプルでモバイル表示に向く |
| 認証 | Supabase Auth（Google OAuth） | ホワイトリスト制御も容易 |
| DB | Supabase（PostgreSQL + RLS） | BaaS でフル機能、将来拡張時も PG 資産を活かせる |
| ストレージ | Supabase Storage | 画像の保存と署名付き URL |
| サーバ処理 | Supabase Edge Functions（Deno） | AI API 呼び出しの秘匿化 |
| AI | **Gemini API（3 系）** | 日本語精度高、Flash の速度・コスト優位、Pro は OCR 精度最高 |
| ホスティング | Vercel | Next.js 最適、PR プレビュー |
| テスト | Vitest + Playwright | 単体＋E2E |
| Lint / Format | ESLint + Prettier + TypeScript strict | 品質担保 |
| CI/CD | GitHub Actions | lint/test/build の自動化 |
| 監視 | Vercel Analytics + Sentry（任意） | エラーと性能の可視化 |

### 5.3 ディレクトリ構成（初期案）

```
OkazuLink/
├─ docs/
│   └─ design.md
├─ pic/                       # 参考画像（開発用、公開リポには含めない）
├─ web/                       # Next.js アプリ
│   ├─ app/
│   │   ├─ (auth)/login/
│   │   ├─ (app)/dashboard/
│   │   ├─ (app)/shopping/
│   │   ├─ (app)/recipes/
│   │   ├─ (app)/nutrition/
│   │   ├─ (app)/weight/
│   │   ├─ (app)/exercise/
│   │   ├─ (app)/meals/
│   │   └─ (app)/settings/
│   ├─ components/
│   ├─ lib/
│   ├─ hooks/
│   └─ types/
├─ supabase/
│   ├─ migrations/            # SQL マイグレーション
│   ├─ functions/             # Edge Functions
│   │   ├─ extract-receipt/
│   │   ├─ suggest-recipes/
│   │   └─ advise-nutrition/
│   └─ seed.sql
├─ .github/workflows/
└─ README.md
```

---

## 6. 画面設計

### 6.1 画面一覧とナビゲーション

| ID | 画面 | 概要 | Phase |
|----|------|------|-------|
| S-00 | ログイン | Google 認証ボタン | 0 |
| S-01 | ダッシュボード | 今月のサマリ、直近買物、レシピ提案への導線 | 1（段階拡充） |
| S-02 | 買物登録 | 画像アップ → 抽出結果編集 → 確定 | 1 |
| S-03 | 買物履歴 | 日別リスト・月別サマリー | 1 |
| S-04 | 食材在庫（P-01） | 在庫一覧・消費マーク | 将来 |
| S-05 | レシピ提案 | ジャンル選択 → 候補カード | 1 |
| S-06 | レシピ詳細 | 材料・手順・栄養 | 1 |
| S-07 | 栄養レポート | 月次 PFC／ビタミン／ミネラル／食物繊維 | 2 |
| S-08 | アドバイザー | 目標別アドバイス＋買い足し提案 | 2 |
| S-09 | 体重 | 日次入力＋折れ線グラフ | 3 |
| S-10 | 運動ログ | 入力フォーム＋週次集計 | 3 |
| S-11 | 食事ログ | 朝昼夕／間食入力 | 3 |
| S-12 | 設定 | プロフィール・目標・アレルギー・エクスポート | 0 〜 段階拡充 |
| S-13 | 管理（admin のみ） | 許可ユーザー管理 | 0 |

### 6.2 ナビゲーション
- モバイル: 下部タブバー（ダッシュボード / 買物 / レシピ / 記録 / 設定）。
- PC: 左サイドナビ。
- クイック追加ボタン（FAB）: 体重・運動・食事・買物を素早く追加。

### 6.3 Phase 1 主要フロー（買物登録 → レシピ提案）

```
[カメラ起動 / 画像選択]
     │
     ▼
[S-02 画像アップ] ── Storage に保存
     │
     ▼
[Edge Function: extract-receipt]
   Gemini 3 Flash（失敗時 Pro へフォールバック）で JSON 抽出
     │
     ▼
[S-02 抽出結果の確認・編集]
  - 食材名 / 数量 / 単価 / カテゴリ
  - 追加・削除・統合
     │
     ▼
[DB 保存: shopping_records + shopping_items]
     │
     ▼
[S-05 レシピ提案へ誘導]
  ジャンル選択 → 候補カード（3〜5件）
     │
     ▼
[S-06 レシピ詳細]
```

---

## 7. データモデル

### 7.1 ER 概要

```
users ─┬─ user_profiles (1:1)
       ├─ shopping_records (1:N) ─ shopping_items (1:N) ─ foods (N:1)
       ├─ saved_recipes (1:N) ─ recipes (N:1)
       ├─ weight_logs (1:N)              [Phase 3]
       ├─ body_composition_logs (1:N)    [Phase 3]
       ├─ exercise_logs (1:N)            [Phase 3]
       ├─ meal_logs (1:N) ─ meal_items (1:N)  [Phase 3]
       └─ ai_advice_logs (1:N)

allowed_users (ホワイトリスト)
foods (食材マスタ)
recipes / recipe_ingredients
nutrition_monthly_summaries (Phase 2 の集計キャッシュ)
```

### 7.2 主要テーブル（抜粋 DDL 仕様）

**allowed_users** — 許可されたメールアドレス
```
id (uuid, pk)
email (text, unique)
role (text: 'admin' | 'user')
created_at
```

**user_profiles**
```
user_id (uuid, pk, fk: auth.users)
display_name
birth_year, height_cm, target_weight_kg
goal_type (enum: diet, muscle, maintenance, custom)
allergies (text[])
disliked_foods (text[])
created_at, updated_at
```

**shopping_records**
```
id (uuid, pk)
user_id
purchased_at (date)
store_name (text)
total_amount (int, 円)
note (text)
image_paths (text[])       -- Storage 内のキー複数対応
source_type (enum: receipt, manual)
created_at
```

**shopping_items**
```
id (uuid, pk)
shopping_record_id (fk)
food_id (fk, nullable)    -- マスタ紐付け（紐付けできない場合は NULL）
raw_name (text)           -- 抽出された元の表記
display_name (text)
category (enum: vegetable, meat, fish, dairy, grain, seasoning, beverage, sweet, other)
quantity (numeric)
unit (text: 個, g, ml, パック 等)
unit_price (int)
total_price (int)
discount (int)
```

**foods（食材マスタ）**
```
id (uuid, pk)
name (text, unique)
aliases (text[])           -- 表記ゆれ
category
nutrition_per_100g (jsonb) -- {energy, protein, fat, carb, fiber, iron, calcium, vitamins: {...}}
source (text)              -- 例: "文部科学省 日本食品標準成分表（八訂）"
```

**recipes**
```
id (uuid, pk)
title (text)
cuisine (enum: japanese, chinese, italian, french, ethnic, korean, sweets, other)
description (text)
servings (int)
time_minutes (int)
calories_kcal (int)
steps (jsonb)              -- 手順配列
source (enum: ai_generated, external)  -- v0.3: user_saved は MVP スコープ外として削除
generated_prompt_hash (text)  -- 同条件キャッシュ用
created_at
```

**recipe_ingredients**
```
id (uuid, pk)
recipe_id (fk)
food_id (fk, nullable)
name (text)
amount (text)
optional (bool)
```

**saved_recipes**
```
id, user_id, recipe_id, note, created_at
```

**weight_logs**
```
id, user_id, measured_on (date), weight_kg (numeric), note
```

**body_composition_logs**
```
id, user_id, measured_on, body_fat_pct, muscle_mass_kg, waist_cm, note
```

**exercise_logs**
```
id, user_id, performed_on, activity (text), intensity (enum: low/mid/high), duration_min (int), estimated_kcal (int), note
```

**meal_logs**
```
id, user_id, eaten_on, meal_type (enum: breakfast/lunch/dinner/snack), note, image_path
```

**meal_items**
```
id, meal_log_id, food_id, raw_name, amount, calories_kcal
```

**ai_advice_logs**
```
id, user_id, kind (ocr/recipe/nutrition/coach), model, request_payload (jsonb), response (jsonb), tokens_in, tokens_out, cost_usd, created_at
```

### 7.3 Row Level Security（方針）

- 全ユーザーデータ系テーブル: `user_id = auth.uid()` を基本ポリシー
- `allowed_users` / `foods` / `recipes`: 読み取りは全許可ユーザー、書き込みは admin のみ
- Storage バケット:
  - `receipts/`: 所有者のみ read/write（署名付き URL 経由で閲覧）
  - `meals/`: 同上

---

## 8. 認証・認可設計

### 8.1 フロー
1. 画面で「Google でログイン」をタップ
2. Supabase Auth（Google OAuth）でサインイン
3. ログイン直後に `allowed_users` に自分のメールが存在するか確認
4. 存在しなければ即サインアウト & エラー画面
5. 存在すれば `user_profiles` を取得／未作成なら初期化

### 8.2 実装ポイント
- ホワイトリスト判定は **Supabase の DB トリガー or Edge Function** で実施。フロントのみに頼らない
- admin 判定は `allowed_users.role = 'admin'`。admin は集計・管理専用で、通常利用者とは別扱い
- admin 用の管理画面（S-13）でユーザーメール追加・削除を可能にし、**数名規模までの拡張性を確保**
- セッションは Supabase の cookie ベース。Next.js Middleware で保護ルートをガード

### 8.3 初期ホワイトリスト（seed）
- `h.hamada@i-seifu.jp`（作成者／admin、アプリは基本利用しない）
- 利用者 1 名の Google アカウント email（開発開始時に確認して登録）

---

## 9. AI 連携設計（Gemini 3 系）

### 9.1 モデル選定

| 用途 | モデル | 備考 |
|------|--------|------|
| レシート OCR（通常） | **Gemini 3 Flash** | 印字レシートで十分な精度、速度・コスト優位 |
| レシート OCR（フォールバック） | **Gemini 3 Pro** | かすれ・曲がり等で Flash 失敗時に自動リトライ |
| ジャンル別レシピ提案 | **Gemini 3 Flash** | 生成速度重視、日本語品質十分 |
| 月次栄養分析 | **Gemini 3 Pro** | 複数データ統合の高精度推論 |
| 目標別アドバイス | **Gemini 3 Pro** | 同上 |
| 月次振り返り自動生成（将来 P-11） | **Gemini 3.1 Flash Lite** | バッチ処理のコスト最小化 |

- モデル名はすべて環境変数化（`MODEL_OCR` / `MODEL_OCR_FALLBACK` / `MODEL_RECIPE` / `MODEL_ADVICE` / `MODEL_REPORT`）で差し替え可能
- Gemini 3 Flash: $0.50/1M 入力トークン、$3/1M 出力トークン（2026 年 4 月時点）

### 9.2 Edge Function 構成

| 関数名 | 入力 | 出力 | モデル |
|--------|------|------|--------|
| `extract-receipt` | 画像 URL（署名付き） | 食材 JSON | Flash（フォールバック Pro） |
| `suggest-recipes` | 食材リスト + ジャンル + プロフィール | レシピ候補 JSON（3〜5件） | Flash |
| `advise-nutrition` | 月間食材 + 目標 + 体重推移 | アドバイス本文 + 推奨食材 + 不足栄養素 | Pro |
| `estimate-food-nutrition` | 食材名 | 栄養推定 JSON（foods マスタで見つからない食材の補完） | Flash |

### 9.3 プロンプト設計指針
- **日本語で入出力**。出力は **JSON Schema で固定**し、サーバ側でバリデーション
- システムプロンプトに「一人暮らし女性の食生活コーチ」のペルソナ設定
- OCR はレジ発行レシートを主対象。店舗名・購入日・品目（品名・数量・価格）・合計・クーポン値引き を抽出
- コスト抑制: Gemini のコンテキストキャッシュを活用。食材マスタ・ユーザープロフィールはキャッシュヒット対象
- 失敗時はエラーコード返却、画面側でリトライ UI

### 9.4 OCR 抽出 JSON（例）

```json
{
  "purchased_at": "2026-04-21",
  "store_name": "ライフ",
  "total_amount": 1623,
  "items": [
    {"raw_name": "玉ねぎ", "quantity": 1, "unit": "袋", "total_price": 198, "category": "vegetable"},
    {"raw_name": "豚ロース", "quantity": 1, "unit": "パック", "total_price": 398, "category": "meat"}
  ],
  "discounts": [{"label": "クーポン", "amount": -60}],
  "confidence": 0.92
}
```

### 9.5 コスト管理
- **月間上限: ¥1,000（環境変数 `MONTHLY_AI_BUDGET_JPY` で可変）**
- `ai_advice_logs` に毎回のトークン数・コストを記録
- 月次で閾値超過時に admin 画面に警告表示（通知は送らない）
- 超過時の挙動は環境変数で切替（soft: 警告のみ継続 / hard: AI 呼び出しを一時停止）

### 9.6 栄養データソース
- **食材マスタ `foods` の初期データは日本食品標準成分表（八訂）から seed**（文部科学省、CSV 無料公開、商用利用可）
- レシート抽出食材名 → `foods.aliases` で表記ゆれ吸収してマッチ
- マッチしなかった食材は `estimate-food-nutrition` で AI 補助推定し、admin レビュー後にマスタへ追加

---

## 10. セキュリティ・プライバシー

- HTTPS 強制、HSTS
- Supabase RLS 全テーブル有効
- 画像は Supabase Storage の private バケット、閲覧は署名付き URL（TTL 60 分）
- AI API キーは Edge Function 環境変数のみ。クライアントに露出させない
- CSP を設定し外部スクリプトを制限
- 体重・食事等の健康情報は機微情報として扱い、ログ出力から除外
- バックアップ: Supabase の自動バックアップ＋月次で pg_dump を admin のみアクセス可能な場所へ
- プライバシーポリシー／利用規約ページを用意（将来のユーザー追加に備えて）

---

## 11. 開発ロードマップ

ユーザー合意により **Phase 0 + Phase 1 / 2 / 3 の 4 段構成**。各 Phase 終了時点で通しテストを行い、次に進む。

### Phase 0: 基盤整備（〜1 週）
- Next.js プロジェクト初期化、Supabase プロジェクト作成
- Google OAuth 設定、ホワイトリスト認可（F-01, F-13）
- 基本レイアウト・下部タブナビ・PWA 基本設定
- CI/CD（GitHub Actions）、Lint、Prettier、TypeScript strict
- 環境変数整理（AI モデル名、月額上限、ドメイン）
- Supabase マイグレーション基盤、seed 仕組み
- 日本食品標準成分表（八訂）の `foods` マスタ投入

### Phase 1: レシート → レシピ提案（〜2〜3 週）【最優先】
- S-02 買物登録画面（画像アップ、編集、確定）
- Edge Function `extract-receipt`（Gemini 3 Flash + Pro フォールバック）
- 食材抽出結果の編集 UI（F-02, F-03）
- `shopping_records` / `shopping_items` 保存、履歴一覧（F-06、S-03）
- Edge Function `suggest-recipes`、ジャンル選択 UI、候補カード（F-04、S-05）
- レシピ詳細画面（F-05、S-06）
- お気に入り保存（P-04、軽実装）
- CSV エクスポート：買物履歴（F-14 の一部）
- Phase 1 完了テスト：実レシートで通し動作検証

### Phase 2: 栄養アドバイザー（〜2〜3 週）
- `nutrition_monthly_summaries` 月次集計（SQL + View）
- S-07 栄養レポート（PFC、ビタミン、ミネラル、食物繊維）
- Edge Function `advise-nutrition`（Gemini 3 Pro）
- S-08 アドバイザー画面、目標別アドバイス＋買い足し提案
- 目標プロファイル設定拡充（F-12、S-12）
- CSV エクスポート：栄養サマリー

### Phase 3: 体重・運動・食事ログ（〜2 週）
- S-09 体重記録＋折れ線グラフ（F-09）
- S-10 運動ログ（手入力、テンプレ選択、METs でカロリー推定）（F-10）
- S-11 食事ログ（朝昼夕間食、テキスト／画像）（F-11）
- ダッシュボード統合：直近体重推移、今日の食事、今週の運動
- CSV エクスポート：体重／運動／食事

### 将来拡張（優先度順）
- P-11 月次振り返りレポート自動生成（Gemini 3.1 Flash Lite）
- P-01/P-02/P-03 食材在庫＋消費期限＋買い足しリスト
- ~~P-14 楽天レシピ API 併用~~（**v0.7 で実装済**）
- P-05 予算ダッシュボード
- P-06 体組成推移
- P-09 PWA 強化（オフライン、カメラ直起動）
- P-10 音声入力
- P-15 スマート体重計／運動計連携
- P-07 生理周期トラッカー（オプトイン）

---

## 12. 決定事項（Q-01〜Q-12）

| # | 項目 | 決定内容 |
|---|------|---------|
| Q-01 | 画像の主な入力形態 | **レシート（レジ発行紙レシート）がメイン**。手書きメモは対象外 |
| Q-02 | AI モデル | **Gemini 3 系で統一**。タスク別に Flash / Pro / Flash Lite を使い分け（環境変数で差替可） |
| Q-03 | レシピ提案の出典 | **段階導入**。Phase 1 で AI 生成（Gemini Flash）を実装、v0.7（P-14）で楽天レシピ API 併用を実装。設定画面 (`default_recipe_source`) でユーザーが AI / 楽天 を選択可能。リクエスト毎の上書きも可。設計詳細は `docs/p14-rakuten-recipe-design.md`。 |
| Q-04 | 栄養データ出典 | **日本食品標準成分表（八訂）** を seed。マッチ失敗食材は AI 補助推定 |
| Q-05 | 体組成計連携 | **手入力**（MVP〜Phase 3）。将来 P-15 として拡張候補 |
| Q-06 | Apple Health／Google Fit 連携 | **手入力**。テンプレを充実させ入力負担を軽減。将来 P-15 で連携検討 |
| Q-07 | 通知 | **実装しない**（MVP〜Phase 3） |
| Q-08 | 公開範囲 | **作成者（admin、非利用者）＋ 初期ユーザー 1 名**。数名規模までの拡張性を確保、一般公開はしない |
| Q-09 | AI コスト上限 | **月 ¥1,000**（環境変数 `MONTHLY_AI_BUDGET_JPY` で可変） |
| Q-10 | ドメイン | **Vercel デフォルト**（`okazu-link.vercel.app` 等） |
| Q-11 | 生理周期トラッカー | **実装しない**（将来拡張候補 P-07 として保留） |
| Q-12 | CSV エクスポート | **MVP から実装**。各 Phase で対象データを順次追加 |

---

## 13. 次のアクション（Phase 0 〜 Phase 1 着手）

1. **本設計書 v0.2 の最終確認**（レビュー OK で着手）
2. Supabase プロジェクト作成、Google OAuth クライアント作成
3. Next.js スケルトン生成、ホワイトリスト認証まで実装（Phase 0）
4. 日本食品標準成分表 CSV を入手し、`foods` マスタ用マイグレーション作成
5. 参考画像フォルダ `/pic` とは別に、**実レシート写真をテスト用に数枚用意**（`extract-receipt` の精度検証用）
6. Phase 1 実装スタート

---

## 付録 A. 参考画像について

- プロジェクト初期段階でユーザーより提供された `/pic/*.jpg` は**手書きの買物メモ（見開き2ページ）**。これはアプリのメイン OCR 対象ではなく、「1 ヶ月分の購入内容がこのくらいの情報量／粒度である」という**参考用のサンプル**として提供されたもの。
- 本アプリの OCR 対象は **レジで発行される紙レシート** であり、手書きメモ対応は非スコープ。
- ただし手書きメモに含まれる情報（日付／店舗／品目／単価／合計／クーポン値引き／月次内訳）は、**アプリが最終的に管理・可視化すべき情報のリファレンスとして有用**。Phase 1〜2 の画面設計・月次集計仕様に反映済み。

---

（以上）
