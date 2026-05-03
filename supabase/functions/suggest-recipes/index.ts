// suggest-recipes: 食材リスト + ジャンルからレシピ候補を AI で生成する。
//
// フロー:
//   1. 認証 + ホワイトリスト確認
//   2. 入力（ingredients, cuisine, profile, candidateCount, servings）の検証
//   3. プロンプトキャッシュキーを生成し SHA-256 化
//   4. recipes テーブルから generated_prompt_hash でキャッシュを検索
//   5. ヒット → recipe_ingredients も結合して返却（cached=true）
//   6. ミス → 月次予算チェック → Gemini 呼出 → validate → recipes / recipe_ingredients
//      に INSERT（service_role）→ ai_advice_logs 記録 → 返却（cached=false）
//
// ローカル動作確認:
//   supabase functions serve suggest-recipes --env-file ./supabase/functions/.env

import { authenticate, createServiceClient } from "../_shared/auth.ts";
import { jsonResponse, preflightResponse } from "../_shared/cors.ts";
import { getEnv, mustEnv } from "../_shared/env.ts";
import {
  callGemini,
  GeminiError,
  parseJsonOutput,
} from "../_shared/gemini.ts";
import {
  buildRecipeCacheKey,
  buildRecipeSuggestPrompt,
} from "../_shared/prompts.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { logAiCall, getMonthlyCostUsd } from "../_shared/ai-log.ts";
import { evaluateBudget, usdToJpy } from "../_shared/budget.ts";
import type {
  BudgetMode,
  EdgeError,
  EdgeErrorCode,
  RecipeIngredientSuggestion,
} from "../_shared/types.ts";
import {
  RecipeValidationError,
  validateRecipeSuggestions,
  VALID_CUISINES,
} from "./validate.ts";

interface RequestBody {
  ingredients?: string[];
  cuisine?: string;
  servings?: number;
  candidateCount?: number;
  profile?: {
    allergies?: string[];
    disliked?: string[];
    goal_type?: string | null;
  };
}

interface RecipeOut {
  id: string;
  title: string;
  cuisine: string;
  description: string;
  servings: number;
  time_minutes: number;
  calories_kcal: number | null;
  ingredients: RecipeIngredientSuggestion[];
  steps: string[];
}

interface SuccessResponse {
  cached: boolean;
  results: RecipeOut[];
}

const VALID_CUISINE_SET: ReadonlySet<string> = new Set(VALID_CUISINES);

// =====================================================================
// helpers
// =====================================================================

function badRequest(message: string, detail?: string): Response {
  const err: EdgeError = { error: message, code: "BAD_REQUEST", detail };
  return jsonResponse(err, { status: 400 });
}

function aiFailureCode(err: unknown): EdgeErrorCode {
  if (err instanceof GeminiError) {
    if (err.reason === "timeout") return "AI_TIMEOUT";
    if (err.reason === "blocked") return "AI_BLOCKED";
    return "AI_INVALID_RESPONSE";
  }
  if (err instanceof RecipeValidationError) return "AI_INVALID_RESPONSE";
  return "INTERNAL_ERROR";
}

function validateInput(body: RequestBody): { ok: true; clean: Required<Omit<RequestBody, "profile">> & { profile: NonNullable<RequestBody["profile"]> } } | { ok: false; reason: string } {
  if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    return { ok: false, reason: "ingredients must be a non-empty array" };
  }
  if (body.ingredients.length > 50) {
    return { ok: false, reason: "ingredients exceeds 50 items" };
  }
  const cleaned = body.ingredients
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0 && s.length <= 100);
  if (cleaned.length === 0) {
    return { ok: false, reason: "ingredients are all empty after trim" };
  }

  const cuisine = typeof body.cuisine === "string" ? body.cuisine : "";
  if (!VALID_CUISINE_SET.has(cuisine)) {
    return {
      ok: false,
      reason: `cuisine must be one of ${VALID_CUISINES.join("/")}`,
    };
  }

  const servings = Math.min(
    Math.max(1, Math.round(Number(body.servings ?? 1) || 1)),
    20,
  );
  const candidateCount = Math.min(
    Math.max(1, Math.round(Number(body.candidateCount ?? 4) || 4)),
    8,
  );

  const profile = {
    allergies: Array.isArray(body.profile?.allergies)
      ? body.profile!.allergies.filter((s): s is string => typeof s === "string").slice(0, 30)
      : [],
    disliked: Array.isArray(body.profile?.disliked)
      ? body.profile!.disliked.filter((s): s is string => typeof s === "string").slice(0, 30)
      : [],
    goal_type:
      typeof body.profile?.goal_type === "string" ? body.profile.goal_type : null,
  };

  return {
    ok: true,
    clean: {
      ingredients: cleaned,
      cuisine,
      servings,
      candidateCount,
      profile,
    },
  };
}

// =====================================================================
// main handler
// =====================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return jsonResponse<EdgeError>(
      { error: "Method not allowed", code: "BAD_REQUEST" },
      { status: 405 },
    );
  }

  // 1. 認証
  const auth = await authenticate(req);
  if (!auth.ok) return jsonResponse(auth.error, { status: auth.status });

  // 2. 入力 parse + validate
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  const v = validateInput(body);
  if (!v.ok) return badRequest(v.reason);
  const { ingredients, cuisine, servings, candidateCount, profile } = v.clean;

  // 3. キャッシュキー
  const cacheKey = buildRecipeCacheKey({
    ingredients,
    cuisine,
    servings,
    allergies: profile.allergies,
    dislikedFoods: profile.disliked,
    goalType: profile.goal_type,
    candidateCount,
  });
  const promptHash = await sha256Hex(cacheKey);

  // 4. キャッシュ検索（authenticated client で読む。RLS で誰でも recipes を read 可）
  const { data: cachedRecipes, error: cacheErr } = await auth.supabase
    .from("recipes")
    .select(
      "id, title, cuisine, description, servings, time_minutes, calories_kcal, steps, recipe_ingredients(name, amount, optional)",
    )
    .eq("generated_prompt_hash", promptHash)
    .order("created_at", { ascending: true });
  if (cacheErr) {
    console.error("[suggest-recipes] cache lookup failed:", cacheErr);
    // エラーでも続行（キャッシュはあくまで最適化）
  }

  if (!cacheErr && cachedRecipes && cachedRecipes.length > 0) {
    // 並行リクエストにより同じ promptHash で複数 batch が INSERT される
    // 可能性がある（design choice: 1 hash に複数 recipes を許容）。
    // 利用者には要求された候補数だけ返すため candidateCount で先頭を切る。
    const all = mapCachedToOutput(cachedRecipes);
    const results = all.slice(0, candidateCount);
    const response: SuccessResponse = { cached: true, results };
    return jsonResponse(response);
  }

  // 5. 月次予算チェック
  const serviceClient = createServiceClient();
  const monthlyUsd = await getMonthlyCostUsd(serviceClient);
  const usdJpyRate = Number(getEnv("USD_JPY_RATE") ?? "150");
  const monthlyJpy = usdToJpy(monthlyUsd, usdJpyRate);
  const budgetJpy = Number(getEnv("MONTHLY_AI_BUDGET_JPY") ?? "1000");
  const budgetMode = (getEnv("AI_BUDGET_MODE") ?? "soft") as BudgetMode;
  const budgetStatus = evaluateBudget(monthlyJpy, budgetJpy, budgetMode);
  if (!budgetStatus.allow) {
    const err: EdgeError = {
      error: "Monthly AI budget exceeded",
      code: "BUDGET_EXCEEDED",
      detail: `${budgetStatus.monthly_total_jpy} JPY / ${budgetStatus.budget_jpy} JPY (mode=hard)`,
    };
    return jsonResponse(err, { status: 429 });
  }
  if (budgetStatus.exceeded) {
    console.warn(
      `[suggest-recipes] budget exceeded but mode=soft, continuing. ${budgetStatus.monthly_total_jpy}/${budgetStatus.budget_jpy} JPY`,
    );
  }

  // 6. Gemini 呼出
  const apiKey = mustEnv("GEMINI_API_KEY");
  const model = getEnv("MODEL_RECIPE") ?? "gemini-2.5-flash";

  const prompt = buildRecipeSuggestPrompt({
    ingredients,
    cuisine,
    servings,
    allergies: profile.allergies,
    dislikedFoods: profile.disliked,
    goalType: profile.goal_type,
    candidateCount,
  });

  let suggestions;
  try {
    const response = await callGemini(
      {
        system: prompt.system,
        user: prompt.user,
        jsonOutput: true,
      },
      { apiKey, model },
    );
    const parsed = parseJsonOutput<unknown>(response.data);
    suggestions = validateRecipeSuggestions(parsed);

    // 7. recipes / recipe_ingredients に INSERT（service_role）
    const recipesPayload = suggestions.map((s) => ({
      title: s.title,
      cuisine: s.cuisine,
      description: s.description,
      servings: s.servings,
      time_minutes: s.time_minutes,
      calories_kcal: s.calories_kcal,
      steps: s.steps,
      source: "ai_generated" as const,
      generated_prompt_hash: promptHash,
    }));
    const { data: insertedRecipes, error: recInsErr } = await serviceClient
      .from("recipes")
      .insert(recipesPayload)
      .select("id, title, cuisine, description, servings, time_minutes, calories_kcal, steps");
    if (recInsErr || !insertedRecipes || insertedRecipes.length !== suggestions.length) {
      throw new Error(
        `Failed to insert recipes: ${recInsErr?.message ?? "row count mismatch"}`,
      );
    }

    const ingredientsPayload = insertedRecipes.flatMap((rec, i) =>
      suggestions[i]!.ingredients.map((ing) => ({
        recipe_id: rec.id,
        food_id: null,
        name: ing.name,
        amount: ing.amount,
        optional: ing.optional,
      })),
    );
    const { error: ingInsErr } = await serviceClient
      .from("recipe_ingredients")
      .insert(ingredientsPayload);
    if (ingInsErr) {
      // ベストエフォートのロールバック: recipes も削除する。
      // DELETE が失敗するとレシピだけが孤児として残るため、その場合は
      // console.error で運用者が気づけるようにする（DB 不整合の検知用）
      const ids = insertedRecipes.map((r) => r.id);
      const { error: delErr } = await serviceClient
        .from("recipes")
        .delete()
        .in("id", ids);
      if (delErr) {
        console.error(
          "[suggest-recipes] rollback DELETE failed, recipes left as orphans:",
          { recipeIds: ids, error: delErr },
        );
      }
      throw new Error(`Failed to insert recipe_ingredients: ${ingInsErr.message}`);
    }

    // 8. ログ
    // PII リスク低減のため profile は記録せず、件数や有無の summary だけ残す。
    // 詳細な allergies / disliked / goal_type は user_profiles に永続化されている。
    await logAiCall(serviceClient, {
      user_id: auth.userId,
      kind: "recipe",
      model,
      request_payload: {
        ingredients,
        cuisine,
        servings,
        candidateCount,
        profile_summary: {
          allergies_count: profile.allergies.length,
          disliked_count: profile.disliked.length,
          has_goal: profile.goal_type !== null,
        },
      },
      response: suggestions,
      meta: response.meta,
    });

    // 9. 出力
    const results: RecipeOut[] = insertedRecipes.map((rec, i) => ({
      id: rec.id as string,
      title: rec.title as string,
      cuisine: rec.cuisine as string,
      description: rec.description as string,
      servings: rec.servings as number,
      time_minutes: rec.time_minutes as number,
      calories_kcal: rec.calories_kcal as number | null,
      ingredients: suggestions[i]!.ingredients,
      steps: suggestions[i]!.steps,
    }));
    const success: SuccessResponse = { cached: false, results };
    return jsonResponse(success);
  } catch (err) {
    const code = aiFailureCode(err);
    const status = code === "AI_TIMEOUT" ? 504 : code === "AI_BLOCKED" ? 422 : 502;
    const detail =
      err instanceof Error ? err.message : "unknown error";

    await logAiCall(serviceClient, {
      user_id: auth.userId,
      kind: "recipe",
      model,
      request_payload: {
        ingredients,
        cuisine,
        servings,
        candidateCount,
        profile_summary: {
          allergies_count: profile.allergies.length,
          disliked_count: profile.disliked.length,
          has_goal: profile.goal_type !== null,
        },
      },
      error: detail,
    });

    return jsonResponse<EdgeError>(
      { error: "Recipe generation failed", code, detail },
      { status },
    );
  }
});

// =====================================================================
// cache → output 変換
// =====================================================================

interface CachedRow {
  id: string;
  title: string;
  cuisine: string;
  description: string | null;
  servings: number | null;
  time_minutes: number | null;
  calories_kcal: number | null;
  steps: unknown;
  recipe_ingredients: { name: string; amount: string | null; optional: boolean }[];
}

function mapCachedToOutput(rows: CachedRow[]): RecipeOut[] {
  return rows.map((r) => {
    const stepsArr = Array.isArray(r.steps)
      ? r.steps.filter((s): s is string => typeof s === "string")
      : [];
    const ingredients: RecipeIngredientSuggestion[] = (r.recipe_ingredients ?? []).map(
      (ri) => ({
        name: ri.name,
        amount: ri.amount ?? "適量",
        optional: ri.optional === true,
      }),
    );
    return {
      id: r.id,
      title: r.title,
      cuisine: r.cuisine,
      description: r.description ?? "",
      servings: r.servings ?? 1,
      time_minutes: r.time_minutes ?? 30,
      calories_kcal: r.calories_kcal,
      ingredients,
      steps: stepsArr,
    };
  });
}
