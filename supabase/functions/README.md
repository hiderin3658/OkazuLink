# Supabase Edge Functions

OkazuLink の AI 連携（OCR / レシピ生成 / 栄養アドバイス）はすべて Supabase Edge Functions
で実装する。クライアント (Next.js) は API キーを持たず、Edge Function を経由して
Gemini API を呼び出す。

設計書 §9 を参照。

---

## ディレクトリ構成

```
supabase/functions/
├─ _shared/                    共通ロジック（複数 Function から import）
│  ├─ auth.ts                  JWT 検証 + allowed_users 確認
│  ├─ ai-log.ts                ai_advice_logs への記録 + 月次コスト集計
│  ├─ budget.ts                コスト計算と予算判定（純粋関数 / vitest 対応）
│  ├─ cors.ts                  CORS ヘッダ
│  ├─ gemini.ts                Gemini API クライアント（fetch ベース）
│  ├─ prompts.ts               プロンプトテンプレート（純粋関数 / vitest 対応）
│  ├─ types.ts                 共通型
│  └─ *.test.ts                vitest からも実行される単体テスト
├─ hello/
│  └─ index.ts                 疎通確認用 Function（PR-B のスモークテスト）
├─ deno.json                   Deno 設定
├─ import_map.json             bare specifier (npm:...) のマッピング
├─ .env.sample                 ローカル開発用環境変数テンプレ
└─ README.md                   このファイル
```

`_shared/auth.ts` と `_shared/ai-log.ts` は Supabase JS SDK を使うため Deno 上でのみ
実行を想定（vitest 対象外）。それ以外の `_shared/*.ts` は純粋ロジックのため、
`web/` から `pnpm test` を実行すると一緒にテストされる。

---

## ローカル開発手順

### 1. 前提

- Supabase CLI (>= v1.180 推奨)
- Deno は Supabase CLI に同梱されるためグローバルインストール不要

### 2. 環境変数の準備

```bash
cp supabase/functions/.env.sample supabase/functions/.env
# .env を編集して GEMINI_API_KEY 等を設定
```

`.env` は Git ignore 済（root の `.gitignore` に `.env` パターン）。

### 3. ローカル Function サーバ起動

```bash
# 単一 Function を起動
supabase functions serve hello --env-file ./supabase/functions/.env

# すべての Function を起動
supabase functions serve --env-file ./supabase/functions/.env
```

デフォルトで `http://localhost:54321/functions/v1/<name>` で listen する。

### 4. 動作確認（hello Function）

ユーザー JWT を取得してから curl で叩く。JWT は Supabase Studio または
ブラウザで `/dashboard` を開いた後、開発者ツールの Cookie から取得する。

```bash
JWT=<your-user-jwt>

curl -X POST http://localhost:54321/functions/v1/hello \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"OkazuLink"}'

# 期待:
# {"message":"Hello, OkazuLink!","user":"<email>","timestamp":"..."}
```

未認証や allowed_users に無いアカウントの場合、それぞれ 401 / 403 が返る。

---

## 本番デプロイ

### 環境変数（secrets）の登録

```bash
# プロジェクトに紐付け済みの状態で
supabase secrets set GEMINI_API_KEY=AIzaSy...
supabase secrets set MODEL_OCR=gemini-3-flash
supabase secrets set MODEL_OCR_FALLBACK=gemini-3-pro
supabase secrets set MODEL_RECIPE=gemini-3-flash
supabase secrets set MODEL_ADVICE=gemini-3-pro
supabase secrets set MODEL_REPORT=gemini-3.1-flash-lite
supabase secrets set MONTHLY_AI_BUDGET_JPY=1000
supabase secrets set AI_BUDGET_MODE=soft
supabase secrets set USD_JPY_RATE=150
```

`SUPABASE_URL` と `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は
Supabase 側で自動付与される（明示設定不要）。

### Function のデプロイ

```bash
# 個別
supabase functions deploy hello

# 一括
supabase functions deploy
```

### デプロイ後の確認

```bash
PROJECT_URL=https://<project-ref>.supabase.co
JWT=<production-user-jwt>

curl -X POST $PROJECT_URL/functions/v1/hello \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"World"}'
```

---

## テスト戦略

### 単体テスト（vitest）

`_shared/*.test.ts` の純粋関数テストは web/ から実行される:

```bash
cd web
pnpm test
```

カバレッジ:
- `budget.ts`: コスト計算・予算判定（14 cases）
- `prompts.ts`: プロンプト生成・キャッシュキー（15 cases）
- `gemini.ts`: HTTP クライアント（13 cases、fetch を vi.fn でモック）

### 統合テスト（手動）

`auth.ts` `ai-log.ts` および各 Function 本体は Deno 専用のため vitest からは
直接テストしない。`supabase functions serve` でローカル起動して動作確認する。

PR-C 以降では実画像・実プロンプトでの E2E 確認を行う。

---

## 既知の注意点

- **CORS**: 現状は `*` を許す軽量設定。本番リリース前に `ALLOWED_ORIGIN`
  環境変数で Vercel ドメインのみに絞ること
- **エラーメッセージ**: ユーザー向けには汎用文言で、詳細は console.error / ai_advice_logs.error にのみ流す方針（情報漏洩防止）
- **コスト管理**: `evaluateBudget()` は呼び出し前にチェック必須。`hard` モードで超過時は呼出を拒否
- **モデル名の更新**: Gemini 3 系の正式リリース後、`budget.ts` の `PRICING` テーブルを実価格で更新する
