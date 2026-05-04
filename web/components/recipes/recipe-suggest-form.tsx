"use client";

// レシピ提案画面 (S-05) のメイン状態機:
// - 提案ソース選択（AI / 楽天） ← P-14 で追加
// - 食材選択（IngredientChipPicker）※ AI モードのみ
// - ジャンル選択（CuisinePicker）
// - 「レシピを提案」ボタンで suggest-recipes Edge Function を invoke
// - 結果を RecipeCard で並べて表示

import { useState } from "react";
import { Loader2, Sparkles, AlertCircle, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Cuisine, RecipeSourcePreference } from "@/types/database";
import { IngredientChipPicker } from "./ingredient-chip-picker";
import { CuisinePicker } from "./cuisine-picker";
import { RecipeCard } from "./recipe-card";
import { SourcePicker } from "./source-picker";
import type {
  SuggestRecipesInput,
  SuggestRecipesProfile,
  SuggestRecipesResponse,
} from "@/lib/recipes/types";

interface Props {
  /** 過去の買物履歴から取り出した直近の食材名（チップ候補） */
  recentIngredients: string[];
  /** ユーザープロフィール由来の制約。設定済みなら Edge Function に送る */
  profile?: SuggestRecipesProfile;
  /** P-14: 設定画面で保存されたデフォルトソース。未指定なら "ai" */
  defaultSource?: RecipeSourcePreference;
}

export function RecipeSuggestForm({
  recentIngredients,
  profile,
  defaultSource = "ai",
}: Props) {
  const [source, setSource] = useState<RecipeSourcePreference>(defaultSource);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState<Cuisine>("japanese");
  const [candidateCount, setCandidateCount] = useState(4);
  const [results, setResults] = useState<SuggestRecipesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRakuten = source === "rakuten";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // 楽天モードでは食材指定なし。AI モードのみ ingredients チェック。
    if (!isRakuten && ingredients.length === 0) {
      setError("食材を 1 つ以上選んでください");
      return;
    }
    setLoading(true);
    setResults(null);

    const supabase = createClient();
    const input: SuggestRecipesInput = isRakuten
      ? {
          source: "rakuten",
          cuisine,
          // 楽天は常に 4 件返るが UI からは固定で 4。サーバーで clamp も入っている。
          candidateCount: 4,
        }
      : {
          source: "ai",
          ingredients,
          cuisine,
          candidateCount,
          servings: 1,
          ...(profile ? { profile } : {}),
        };
    const { data, error: fnErr } = await supabase.functions.invoke<SuggestRecipesResponse>(
      "suggest-recipes",
      { body: input },
    );
    setLoading(false);

    if (fnErr || !data) {
      setError(toErrorMessage(fnErr));
      return;
    }
    setResults(data);
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-[var(--color-border)] bg-white p-4"
      >
        <SourcePicker value={source} onChange={setSource} />

        {!isRakuten && profile && hasProfileConstraints(profile) && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            設定済みプロフィール（アレルギー
            {profile.allergies?.length ?? 0} 件・苦手{" "}
            {profile.disliked?.length ?? 0} 件
            {profile.goal_type ? `・目標 ${profile.goal_type}` : ""}）を
            提案条件に反映します。
          </p>
        )}

        {/* AI モードのみ: 食材選択 */}
        {!isRakuten && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">手持ちの食材</h2>
            <IngredientChipPicker
              options={recentIngredients}
              value={ingredients}
              onChange={setIngredients}
            />
          </section>
        )}

        {/* 楽天モード時の説明（食材指定不可の旨を明示） */}
        {isRakuten && (
          <section
            role="note"
            className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-3 text-xs text-[var(--color-muted-foreground)]"
          >
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              楽天モードは食材指定不可で、選んだジャンルの人気ランキング上位 4 件を表示します。
              所要時間や材料は楽天レシピの公開情報、手順は楽天サイトでご確認ください。
            </span>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">ジャンル</h2>
          <CuisinePicker value={cuisine} onChange={setCuisine} />
        </section>

        {/* 候補数: AI モードのみ。楽天は常に 4 件固定 */}
        {!isRakuten && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">候補数</h2>
            <div className="flex gap-1.5">
              {[3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCandidateCount(n)}
                  aria-pressed={candidateCount === n}
                  className={
                    candidateCount === n
                      ? "rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-[var(--color-primary-foreground)]"
                      : "rounded-md border border-[var(--color-border)] bg-white px-3 py-1 text-xs hover:bg-[var(--color-muted)]"
                  }
                >
                  {n} 件
                </button>
              ))}
            </div>
          </section>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[color-mix(in_oklch,var(--color-destructive)_10%,white)] p-3 text-sm text-[var(--color-destructive)]"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || (!isRakuten && ingredients.length === 0)}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={14} aria-hidden />
            )}
            {loading
              ? isRakuten
                ? "楽天から取得中..."
                : "AI が考え中..."
              : "レシピを提案"}
          </button>
        </div>
      </form>

      {results && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">提案結果（{results.results.length} 件）</h2>
            {results.cached && (
              <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
                キャッシュ
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {results.results.map((r) => (
              <li key={r.id}>
                <RecipeCard recipe={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function hasProfileConstraints(p: SuggestRecipesProfile): boolean {
  return (
    (p.allergies?.length ?? 0) > 0 ||
    (p.disliked?.length ?? 0) > 0 ||
    Boolean(p.goal_type)
  );
}

function toErrorMessage(err: unknown): string {
  if (!err) return "提案に失敗しました（不明なエラー）";
  const e = err as { message?: string; context?: { code?: string; error?: string } };
  switch (e.context?.code) {
    case "AUTH_NOT_ALLOWED":
      return "このアカウントは利用許可されていません。";
    case "BUDGET_EXCEEDED":
      return "今月の AI 利用上限に達しました。管理者に連絡してください。";
    case "AI_TIMEOUT":
      return "AI の応答がタイムアウトしました。少し時間をおいて再度お試しください。";
    case "AI_BLOCKED":
      return "条件が AI 安全フィルタに引っかかりました。条件を変えて再度お試しください。";
    case "AI_INVALID_RESPONSE":
      return "AI が想定外の形式で応答しました。条件を変えるか、しばらく経ってから再度お試しください。";
    // P-14: 楽天 API 由来のエラー
    case "RAKUTEN_RATE_LIMIT":
      return "楽天レシピ API が混雑しています。しばらく時間をおいて再度お試しください。";
    case "RAKUTEN_TIMEOUT":
      return "楽天レシピ API の応答がタイムアウトしました。再度お試しください。";
    case "RAKUTEN_API_FAILED":
    case "RAKUTEN_INVALID_RESPONSE":
      return "楽天レシピ API でエラーが発生しました。AI モードに切り替えるか、しばらく経ってから再度お試しください。";
    case "RAKUTEN_UNSUPPORTED_CUISINE":
      return "選択したジャンルは楽天モードでは対応していません。AI モードに切り替えてください。";
    case "BAD_REQUEST":
      return e.context?.error ?? "リクエストエラー";
    default:
      return e.message ?? "提案に失敗しました";
  }
}
