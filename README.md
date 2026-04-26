# OkazuLink

一人暮らし女性向けのパーソナル食生活コーチ Web アプリ。
レシート写真から食材を抽出し、ジャンル別レシピ提案・月次栄養アドバイス・体重/運動/食事記録までを一気通貫でサポートします。

- 設計書: [docs/design.md](docs/design.md)

## 技術スタック

- **フロント**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **バックエンド**: Supabase (PostgreSQL + RLS + Storage + Edge Functions + Auth)
- **認証**: Google OAuth + ホワイトリスト（`allowed_users` テーブル）
- **AI**: Gemini 3 系（OCR / レシピ / 栄養アドバイス）※ Edge Function 経由
- **ホスティング**: Vercel（デフォルトドメイン `*.vercel.app`）

## ディレクトリ構成

```
OkazuLink/
├─ docs/                 # 設計書
├─ web/                  # Next.js アプリ
├─ supabase/             # マイグレーション・seed・Edge Functions
├─ pic/                  # 参考画像（開発用、リポ公開時は除外推奨）
└─ .github/workflows/    # CI/CD
```

## Phase 0 セットアップ手順

### 1. 必要アカウント

- Google Cloud（OAuth 2.0 クライアント取得用）
- Supabase（プロジェクト作成用、無料枠で OK）
- Vercel（デプロイ用）
- GitHub（リポジトリ）

### 2. Supabase プロジェクト作成

1. https://supabase.com/dashboard にアクセスしプロジェクト作成
2. リージョン: **Tokyo (Northeast Asia)** 推奨
3. 作成後、`Settings → API` から以下を控える:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`（Edge Function 用、機密）

### 3. Google OAuth クライアント作成

1. https://console.cloud.google.com/ で新規プロジェクト作成
2. `API とサービス → OAuth 同意画面` を設定（外部、testing モード可）
3. `認証情報 → 認証情報を作成 → OAuth クライアント ID`
   - 種類: Web アプリケーション
   - 承認済みリダイレクト URI:
     - `http://localhost:54321/auth/v1/callback`（ローカル開発）
     - `https://<your-project>.supabase.co/auth/v1/callback`（本番 Supabase 側）
4. Client ID / Client Secret を控える
5. Supabase ダッシュボード `Authentication → Providers → Google` に登録

### 4. Supabase マイグレーション適用

Supabase CLI をインストール:

```bash
brew install supabase/tap/supabase
```

プロジェクトに接続してマイグレーション適用:

```bash
cd /Volumes/990PRO_SSD/personal/OkazuLink
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### 5. 初期ユーザー登録（seed 投入）

`supabase db push` は migrations のみでリモートには seed を適用しない。
以下のいずれかの方法で seed SQL をリモートに投入する:

**方法A（推奨）: Supabase Studio の SQL Editor**
1. Supabase ダッシュボード → `SQL Editor` → `New query`
2. `supabase/seed.sql` の内容を貼り付け
3. 利用者 email 行のコメントを外して記入:
   ```sql
   insert into public.allowed_users (email, role, note)
   values ('<利用者の Google アカウント email>', 'user', 'Primary user')
   on conflict (email) do nothing;
   ```
4. `Run` で実行

**方法B: psql 直接**
```bash
psql "$SUPABASE_DB_URL" < supabase/seed.sql
```

（`SUPABASE_DB_URL` は Supabase ダッシュボードの `Settings → Database → Connection string`）

### 6. foods マスタ投入（日本食品標準成分表2020年版（八訂））

手順は [`supabase/scripts/README.md`](supabase/scripts/README.md) 参照。

簡易には:

```bash
cd web
# scripts/.env を作成し SUPABASE_SERVICE_ROLE_KEY を設定後
pnpm seed:foods   # 約 2,478 件投入
```

データ出典: katoharu432/standards-tables-of-food-composition-in-japan（CC BY 4.0）  
原典: 文部科学省 日本食品標準成分表2020年版（八訂）

### 7. Next.js アプリのローカル起動

```bash
cd web
cp .env.example .env.local
# .env.local に Supabase の URL / anon key を記載

pnpm install  # または npm install / bun install
pnpm dev
```

ブラウザで http://localhost:3000 を開き、`/login` から Google ログイン可能。

### 8. Vercel デプロイ

1. Vercel ダッシュボードで GitHub リポジトリをインポート
2. Root Directory を `web` に設定
3. Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (例: `https://okazu-link.vercel.app`)
4. デプロイ実行
5. Google OAuth クライアントの承認済みリダイレクト URI に本番 URL を追加

## 開発ロードマップ

設計書 §11 参照。

- **Phase 0**: 基盤整備（本 README の手順）← ✅ 構築完了
- **Phase 1**: レシート → 食材抽出 → レシピ提案
- **Phase 2**: 栄養アドバイザー
- **Phase 3**: 体重 / 運動 / 食事ログ
- 将来拡張: 月次レポート、食材在庫、楽天レシピ API 併用 等

## ライセンス

Private (not for public distribution)

食品成分データの出典: **文部科学省 日本食品標準成分表（八訂）増補2023年**
（政府標準利用規約 2.0 / CC BY 4.0 相当、商用利用・再配布可）
