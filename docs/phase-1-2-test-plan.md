# Phase 1 + 2 統合テスト計画書

> 対象: OkazuLink Web アプリ Phase 1（レシート→レシピ提案）+ Phase 2（栄養アドバイザー）
> 作成日: 2026-04-30
> ブランチ: `docs/phase-1-2-test-plan`
> テスト方法: Claude in Chrome MCP ツールによる半自動 E2E テスト

---

## 1. 目的

Phase 3（記録機能）に着手する前に、Phase 1〜2 で実装した全機能の統合動作を確認し、本番運用に耐える品質であることを実機検証する。

ユニットテスト（Vitest 322 ケース）と E2E スモーク（Playwright）はすでに緑だが、以下は CI で検証されていないため実機テストが必須:

- Google OAuth ログインフロー実機動作
- Gemini API による OCR・レシピ生成・栄養アドバイスの実コスト・実応答
- Supabase Storage への画像アップロード
- foods マッチング後の栄養集計の正確性
- CSV ダウンロード（ブラウザ挙動・Excel 互換）
- RLS による他ユーザー越境防止

---

## 2. テスト対象範囲

### 2.1 機能スコープ

| Phase | 画面 / API | テストする内容 |
|-------|-----------|---------------|
| 共通 | `/login` | Google OAuth、ホワイトリスト弾き |
| 共通 | 認証ガード | 未ログイン時の `/login` リダイレクト |
| 1 | `/shopping` | 履歴一覧、検索、フィルタ |
| 1 | `/shopping/new` | 手入力登録、OCR 登録、画像アップロード |
| 1 | `/shopping/[id]` | 詳細表示、編集、削除 |
| 1 | `/recipes` | レシピ提案（直近の食材から）、Pro 切替 |
| 1 | `/recipes/[id]` | レシピ詳細、お気に入り保存 |
| 1 | `/recipes/saved` | お気に入り一覧 |
| 1 | `/api/shopping/export` | 買物 CSV ダウンロード |
| 2 | `/settings` | プロフィール（生年・身長・目標体重）保存 |
| 2 | `/nutrition` | 栄養レポート S-07、再計算ボタン |
| 2 | `/nutrition/advice` | AI アドバイス S-08、キャッシュヒット |
| 2 | `/api/nutrition/export` | 栄養 CSV ダウンロード |
| 2 | `/admin` | 管理画面（AI ログ確認用） |

### 2.2 非機能スコープ

- **セキュリティ**: RLS（ユーザー A から B のデータが見えないこと）
- **コスト**: AI 1 セッションあたりの円換算実測（`ai_advice_logs` 集計）
- **パフォーマンス**: 各ページ 3 秒以内 First Paint、栄養計算 5 秒以内
- **互換性**: CSV を Excel / Numbers で開いて文字化けしないこと

### 2.3 対象外

- Phase 3 機能（体重ログ、リマインド）
- モバイル実機検証（PWA は別途）
- Edge Function 単体の負荷試験
- Supabase 障害時のフェイルオーバー

---

## 3. 前提条件・環境

### 3.1 デプロイ済みであること

| 項目 | 確認方法 |
|-----|---------|
| Supabase migrations 全 6 本適用 | `supabase migration list` |
| Edge Function 4 本 deploy 済み | Supabase Dashboard > Edge Functions |
| Storage bucket `receipts` 作成済み | Dashboard > Storage |
| `foods` テーブル 2,478 件 seed 済み | `select count(*) from foods` |
| `allowed_users` にテストユーザー追加済み | `select email from allowed_users` |
| Edge Function secrets 設定済み | `GEMINI_API_KEY`, `MODEL_OCR=gemini-3-flash` 等 |

### 3.2 ローカル環境

| 項目 | 値 |
|-----|----|
| Node | 20.x 以上 |
| pnpm | 9.x 以上 |
| `web/.env.local` | Supabase URL / anon key 設定済み |
| `web/scripts/.env` | service_role_key 設定済み（backfill 用） |
| dev サーバー | `cd web && pnpm dev` で `http://localhost:3000` |

### 3.3 テスト用ユーザー

| ユーザー | メール | 用途 |
|---------|--------|------|
| 主ユーザー | `h.hamada@i-seifu.jp` | 全シナリオ実施 |
| 副ユーザー | （別 Google アカウント） | RLS 越境テスト用 |
| 未許可ユーザー | （allowed_users 外） | ホワイトリスト弾き確認 |

### 3.4 テストデータ

- 手書きレシート画像 3 枚: `/Volumes/990PRO_SSD/personal/OkazuLink/pic/1776690404311.jpg` ほか
- 各画像に複数月の買物メモが含まれているため、OCR で日付ごとに分解できるか検証

---

## 4. Claude in Chrome ツール運用方針

### 4.1 利用するツール

| ツール | 主な用途 |
|-------|---------|
| `tabs_context_mcp` | セッション開始時にタブ情報取得（必須） |
| `tabs_create_mcp` | 新規タブ作成 |
| `navigate` | URL 遷移、戻る/進む |
| `read_page` | アクセシビリティツリー取得（要素 ref 取得） |
| `find` | 自然言語で要素検索 |
| `form_input` | テキスト入力、チェックボックス、セレクト |
| `file_upload` | レシート画像アップロード |
| `javascript_tool` | DOM 検証、URL 取得、CSV 内容確認 |
| `read_console_messages` | エラーログ確認（pattern 必須） |

### 4.2 自動化できない箇所（人手必要）

- **Google OAuth ログイン**: Claude Code は SSO/OAuth に対し明示的ユーザー許可が必要。テスター（ユーザー）がログインを完了させた後、Claude Code が以降を自動化する。
- **CSV のダウンロード結果検証**: ブラウザのダウンロードダイアログは MCP から直接読めない。代替として `javascript_tool` で `fetch(url)` を実行し、レスポンスヘッダーと本文を取得して検証する。
- **AI アドバイスの内容妥当性**: 自然文出力の品質判定はテスター目視。

### 4.3 セッション維持

- 各シナリオは同一タブで連続実行する（ログイン状態を再利用）
- セッション切れ検知は `read_page` で「ログイン」リンクが現れたかで判断

### 4.4 失敗時のフォールバック

- 同一操作 2 回失敗 → ユーザーに状況報告して指示を仰ぐ
- ダイアログ（confirm/alert）が出そうな操作前は警告
- 削除系は確認モーダルを必ず読み上げてからユーザー確認

---

## 5. テストシナリオ詳細

各シナリオは「目的」「手順」「期待結果」「使用ツール」「合否基準」を持つ。

### 5.0 事前データ作成（10 分）

**目的**: backfill により Phase 1 既存データに `food_id` を紐付ける

**手順**（CLI）:
1. `cd web && pnpm backfill:food-ids --dry-run` → 統計確認
2. 結果が想定通りなら `pnpm backfill:food-ids` で本実行

**期待結果**: matched 件数が item 総数の 80% 以上、unmatched は手書きの揺れによるもののみ

**合否**: dry-run で件数取得できれば PASS（Phase 1 既存データが少なければスキップ可）

---

### 5.1 認証・ガード（5 分）

| # | 目的 | 手順 | 期待結果 | 使用ツール |
|--:|-----|------|---------|----------|
| 1.1 | 未認証ガード | `navigate("/dashboard")` | URL が `/login` に変わる | navigate, javascript_tool |
| 1.2 | 未認証 API | `fetch("/api/nutrition/export?month=2026-04-01")` | status=401 | javascript_tool |
| 1.3 | 不正 month + 未認証 | `fetch("/api/nutrition/export?month=invalid")` | status=401（400 ではない）| javascript_tool |
| 1.4 | not_allowed エラー表示 | `navigate("/login?error=not_allowed")` | エラーメッセージが見える | read_page |
| 1.5 | Google ログインボタン | `/login` 表示確認 | ボタンが見える | find |

### 5.2 Google OAuth ログイン（5 分・手動）

**手順**:
1. テスターが手動で Google ログインボタンをクリックし `h.hamada@i-seifu.jp` でサインイン
2. 完了後 Claude Code が `read_page("/dashboard")` で URL とユーザー名表示を確認

**合否**: ダッシュボードに遷移し、エラーが console に出ていない

### 5.3 Phase 1: 買物登録（手入力）（10 分）

**手順**:
1. `/shopping/new` へ navigate
2. 手入力フォームに以下を form_input で投入:
   - 店舗: マルハチ
   - 購入日: 2026-04-15
   - 明細: 玉ねぎ 98円, ほうれん草 100円, 鶏もも 250円
3. 保存ボタンを find で取得して click

**期待結果**:
- `/shopping` 一覧に新レコードが現れる
- shopping_items に 3 行、food_id が紐付く
- 合計金額 448 円が表示される

**合否**: 一覧に表示 + 詳細画面で明細 3 件 + food_id 紐付け確認（javascript_tool で `document.querySelector` 検証）

### 5.4 Phase 1: 買物登録（OCR）（15 分）

**手順**:
1. `/shopping/new` で「画像アップロード」タブに切替
2. `file_upload(paths=[".../pic/1776690404311.jpg"])`
3. アップロード完了 → OCR 実行 → 抽出結果プレビュー表示を待つ
4. 必要なら明細を編集 → 保存

**期待結果**:
- Storage `receipts/{user_id}/...` に画像が保存される
- Edge Function `extract-receipt` が JSON で明細を返す
- foods マッチング率が 70% 以上
- ai_advice_logs に OCR 呼び出しログが残る

**合否**:
- 抽出明細が 5 件以上表示される
- 詳細保存後 `select * from shopping_items where image_url is not null` で取得できる
- console にエラーが出ない（read_console_messages で確認）

### 5.5 Phase 1: 買物詳細・編集・削除（5 分）

**手順**:
1. `/shopping/[id]` を表示
2. 1 明細の数量を変更 → 保存 → 反映確認
3. 1 明細を削除 → 反映確認
4. 買物自体の削除（確認モーダル）

**合否**: 編集と削除の楽観 UI が正しく動作、reload 後も状態が保持される

### 5.6 Phase 1: レシピ提案（10 分）

**手順**:
1. `/recipes` へ navigate
2. 提案ボタン押下 → Edge Function `suggest-recipes` 呼び出し
3. 直近 7 日の食材からレシピ 3 件が表示されるのを待つ
4. 1 件をクリック → `/recipes/[id]` で詳細表示
5. 「お気に入り」ボタン押下 → `/recipes/saved` で確認

**期待結果**:
- 3 件のレシピが日本語で生成される
- 材料が直近の買物食材を含む
- お気に入り保存が DB に永続化される

**合否**: レシピ JSON 構造が壊れていない、お気に入りトグルが想定通り

### 5.7 Phase 1: 買物 CSV エクスポート（5 分）

**手順**:
1. `/shopping` のヘッダ「CSV」リンクの URL を取得
2. `javascript_tool` で `fetch(csvUrl)` し、blob を取得
3. レスポンスヘッダ確認: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="..."`
4. 本文先頭バイトに UTF-8 BOM (0xEF 0xBB 0xBF) があることを確認
5. ヘッダ行が `購入日,店舗,商品名,数量,単価,金額` 形式であることを確認

**合否**: ヘッダ・行数・改行コード `\r\n` が正しい

### 5.8 Phase 2: プロフィール拡充（5 分）

**手順**:
1. `/settings` を表示
2. 生年（1990）、身長（160cm）、目標体重（55kg）を form_input
3. 保存
4. `/settings` をリロードして反映確認

**期待結果**:
- バリデーション（範囲外）でフィールドエラー出力
- 保存後 user_profiles に永続化

**合否**: 個別フィールドエラー表示と aria-invalid が正しく機能（PR #19 修正反映確認）

### 5.9 Phase 2: 栄養レポート S-07（10 分）

**手順**:
1. `/nutrition` を表示（month デフォルト = 当月）
2. キャッシュなし → 自動計算実行 → 表示
3. PFC バー、20 栄養素テーブル、達成率の表示確認
4. MonthSelector で前月に切替
5. 「再計算」ボタン押下

**期待結果**:
- nutrition_monthly_summaries にレコード作成
- ageGroup が 30-49（生年 1990 → 36 歳）
- 達成率の計算が `recommended.ts` と一致
- 上限栄養素（食塩）の判定が「適正/上限近い/過剰」

**合否**: 各セクション描画 + javascript_tool で `document.body.innerText` から数値が取れる

### 5.10 Phase 2: AI 栄養アドバイス S-08（10 分）

**手順**:
1. `/nutrition` から「✨ AI アドバイス」リンク click
2. `/nutrition/advice` で AI 応答待ち（10〜30 秒）
3. アドバイス文（コーチング調・親しみやすい）が表示される
4. 同月で再アクセス → キャッシュヒット（高速・コスト 0）
5. 別月（先月）に切替 → 新規 AI 呼び出し

**期待結果**:
- ai_advice_logs に input_hash 付きログが残る
- 2 回目アクセスは ai_advice_cache から取得（response_at が変わらない）
- input_hash partial index が効いて 100ms 以内応答

**合否**:
- console エラーなし
- SQL `select count(*) from ai_advice_logs where user_id=...` が 1 増、再アクセスでは増えない

### 5.11 Phase 2: 栄養 CSV エクスポート（5 分）

**手順**:
1. `/nutrition` のヘッダ「CSV」リンク URL を取得
2. `fetch(csvUrl)` で取得
3. ヘッダ 8 列確認（対象月,栄養素,単位,月間摂取量,推奨摂取量（月）,達成率(%),判定,計算前提）
4. 行数 = ヘッダ + 20 栄養素 + （notes 1 行）
5. 食塩行に「過剰」「適正」「上限近い」のいずれかが入っているか
6. 認証なし `fetch("/api/nutrition/export?month=invalid")` で 401 を返すこと（PR #20 修正確認）

**合否**: CSV 構造、ファイル名 `okazu-link-nutrition-YYYYMM.csv`、UTF-8 BOM、認証優先

### 5.12 RLS / クロスユーザー検証（10 分・手動 + 自動）

**手順**:
1. 副ユーザーで別タブにログイン
2. 副ユーザーのコンソールで `fetch("/api/nutrition/export?month=2026-04-01")` 実行 → 副ユーザーのデータが返る
3. 副ユーザーのコンソールで `fetch("/api/shopping/export")` → 副ユーザーの買物のみ
4. 主ユーザーの `shopping_items.id` を直接取得し、副ユーザーで `/shopping/{主ユーザーID}` に navigate → 404 または空表示

**合否**: クロスユーザー越境がない

### 5.13 ホワイトリスト弾き（5 分・手動）

**手順**: 別 Google アカウント（allowed_users 未登録）でログイン試行

**期待結果**: `/login?error=not_allowed` にリダイレクト + メッセージ表示

**合否**: not_allowed メッセージが表示

### 5.14 AI コスト実測（5 分）

**手順**:
```sql
select
  function_name,
  model,
  count(*) as calls,
  sum(input_tokens) as in_tok,
  sum(output_tokens) as out_tok,
  sum(cost_jpy) as total_jpy
from ai_advice_logs
where user_id = '...' and created_at::date = current_date
group by 1, 2;
```

**合否**: 1 セッション合計が 20 円以下（design.md の予算指針）

---

## 6. 想定リスクと対処

| リスク | 検知 | 対処 |
|-------|------|------|
| OAuth 自動化不可で停滞 | OAuth 画面検出 | テスターに手動ログインを依頼して継続 |
| OCR 失敗（Gemini 障害） | Edge Function 500 | フォールバックモデル切替を確認、ログ採取 |
| AI コスト爆増 | ai_advice_logs cost_jpy | `MONTHLY_AI_BUDGET_JPY` の hard モード切替検討 |
| ダイアログでセッション固まる | ツール無応答 | 手動でダイアログ閉じる、テスターに通知 |
| 同月キャッシュが効かない | 2 回目応答が遅い | input_hash 計算ロジック見直し |
| Storage アップロード失敗 | 500 / 403 | bucket 公開設定・RLS ポリシー確認 |

---

## 7. 完了基準（DoD）

以下を全て満たしたら Phase 3 着手可:

- [ ] シナリオ 5.1〜5.14 すべて PASS
- [ ] console エラー / 警告ゼロ（無視可能なものはホワイトリスト化）
- [ ] AI コスト 1 セッション 20 円以下
- [ ] CSV を Excel で開いて文字化けなし（手動確認）
- [ ] RLS 越境ゼロ
- [ ] OAuth ホワイトリスト弾き機能
- [ ] テスト結果サマリーを `docs/phase-1-2-test-result.md` に記録

---

## 8. 実行スケジュール

| ステップ | 所要 | 担当 |
|---------|------|------|
| 0. デプロイ確認 | 15 分 | テスター |
| 1. dev サーバー起動 + Chrome 接続確認 | 5 分 | Claude Code |
| 2. シナリオ 5.1〜5.14 実行 | 約 2 時間 | Claude Code（OAuth はテスター） |
| 3. 結果レポート作成 | 15 分 | Claude Code |
| 4. 結果レビュー & 残課題チケット化 | 30 分 | テスター |

合計約 3 時間。Phase 3 着手は問題なしの場合に翌日以降。

---

## 9. 補足: 計画書を計画書のまま終わらせない運用

- 各シナリオ完了時に **結果スクショ or DOM ダンプ** を取り、`docs/phase-1-2-test-result.md` に追記
- 重大な不具合は即 GitHub Issue 化
- 軽微な UI 違和感は別途 `docs/phase-1-2-ux-notes.md` にまとめて Phase 3 と並行修正

---

## 10. 参考リンク

- 設計書: `docs/design.md` v0.6
- Phase 1 計画書: `docs/phase1-implementation-plan.md`
- Phase 2 計画書: `docs/phase2-implementation-plan.md`
- スモークテスト: `web/e2e/smoke.spec.ts`
- 推奨摂取量定義: `web/lib/nutrition/recommended.ts`
- foods マッチング: `web/lib/foods/matcher.ts`
