// 楽天モードのレシピ取得フロー本体
//
// suggest-recipes Edge Function の楽天モード処理を `runRakutenMode()` にまとめ、
// 1) rakuten_recipe_cache を参照（fresh hit ならそのまま返す）
// 2) 楽天 CategoryRanking API を呼び出す
// 3) recipes に upsert（external_provider, external_id をキーに重複排除）
// 4) rakuten_recipe_cache を更新
// 5) ai_advice_logs に best-effort 記録
// という流れを純粋に表現する。
//
// 設計判断:
// - DI（fetchImpl / now / supabase / serviceClient）で外部依存をすべて注入可能にし、
//   vitest からビルダーチェーンをモックして検証できるようにする。
// - 結果は HTTP status と JSON body を持つオブジェクトで返す（Edge Function 本体側で
//   `jsonResponse(body, { status })` するだけで済む形）。
// - 楽天 API のエラーは構造化された EdgeError として保持されているので、
//   `mapRakutenErrorToHttp()` で HTTP status と対応付ける。

import type { SupabaseClient } from "@supabase/supabase-js";
import { logAiCall } from "../_shared/ai-log.ts";
import { rakutenCategoryFor } from "../_shared/cuisine-rakuten-map.ts";
import {
  fetchRakutenRanking,
  type RakutenRecipeRaw,
} from "../_shared/rakuten.ts";
import type { EdgeError } from "../_shared/types.ts";
import type { RakutenCleanInput } from "./validate.ts";

// =====================================================================
// 公開型
// =====================================================================

/** Edge Function が返すレシピ 1 件分の形（楽天 / AI 共通の出力 schema） */
export interface RecipeOut {
  id: string;
  title: string;
  cuisine: string;
  description: string;
  servings: number;
  time_minutes: number;
  calories_kcal: number | null;
  ingredients: { name: string; amount: string; optional: boolean }[];
  steps: string[];
  external?: {
    provider: "rakuten";
    url: string;
    image_url: string;
    meta: Record<string, unknown>;
  };
}

/** runRakutenMode の戻り値（HTTP status と body のペア） */
export interface RunRakutenResult {
  status: number;
  body:
    | { cached: boolean; source: "rakuten"; results: RecipeOut[] }
    | EdgeError;
}

/** runRakutenMode への注入物 */
export interface RunRakutenDeps {
  /** authenticated client（rakuten_recipe_cache, recipes の SELECT 用） */
  supabase: SupabaseClient;
  /** service_role client（recipes / rakuten_recipe_cache の upsert, ai_advice_logs INSERT） */
  serviceClient: SupabaseClient;
  userId: string;
  input: RakutenCleanInput; // { source: "rakuten", cuisine, candidateCount }
  /** 楽天 API キー（mustEnv("RAKUTEN_APP_ID") を呼び出し側で解決して渡す） */
  rakutenAppId: string;
  /** fetch 差し替え（テスト用） */
  fetchImpl?: typeof fetch;
  /** 現在時刻プロバイダ（テスト用に時刻固定可） */
  now?: () => Date;
}

// =====================================================================
// 定数
// =====================================================================

/** rakuten_recipe_cache の TTL: 6 時間 */
const TTL_MS = 6 * 60 * 60 * 1000;

// =====================================================================
// 補助型（DB 読み取り行）
// =====================================================================

/** rakuten_recipe_cache の行（必要列のみ） */
interface RakutenCacheRow {
  cuisine: string;
  rakuten_category_id: string;
  recipe_ids: string[];
  fetched_at: string;
}

/** recipes 行（フロー内で扱う列のみ） */
interface RecipeRow {
  id: string;
  title: string;
  cuisine: string;
  description: string | null;
  servings: number | null;
  time_minutes: number | null;
  calories_kcal: number | null;
  steps: unknown;
  external_provider?: string | null;
  /** PR-A スキーマでは bigint。楽天 recipeId は 7-10 桁なので JS number 安全範囲内。 */
  external_id?: number | null;
  external_url?: string | null;
  external_image_url?: string | null;
  external_meta?: Record<string, unknown> | null;
}

// =====================================================================
// 純粋関数（export しテスト容易性を保つ）
// =====================================================================

/** 楽天 recipeIndication（"約15分" / "15分" / "半日" 等）から分数を抽出する。
 *  数値が拾えない場合は null。 */
export function parseRakutenIndication(s: string | null | undefined): number | null {
  if (typeof s !== "string" || s.length === 0) return null;
  const m = /(\d+)\s*分/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** IN クエリで取得した行を、cache に保存された ID 順序通りに並べ替える。
 *  存在しない ID は除外する（`recipes` から削除されたケースに備えるため）。 */
export function orderByRecipeIdSequence<T extends { id: string }>(
  rows: T[],
  idOrder: string[],
): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.id, r);
  const out: T[] = [];
  for (const id of idOrder) {
    const hit = map.get(id);
    if (hit) out.push(hit);
  }
  return out;
}

/** DB から取得した cache hit 用の recipes 行を RecipeOut に整形する。
 *  external_meta.recipeMaterial が string[] の場合は ingredients に展開する。 */
export function toRecipeOut(row: RecipeRow): RecipeOut {
  const meta = (row.external_meta ?? {}) as Record<string, unknown>;
  const rawMaterial = meta.recipeMaterial;
  const ingredients = Array.isArray(rawMaterial)
    ? rawMaterial
        .filter((m): m is string => typeof m === "string")
        .map((name) => ({ name, amount: "", optional: false }))
    : [];

  const stepsArr = Array.isArray(row.steps)
    ? row.steps.filter((s): s is string => typeof s === "string")
    : [];

  return {
    id: row.id,
    title: row.title,
    cuisine: row.cuisine,
    description: row.description ?? "",
    servings: row.servings ?? 1,
    time_minutes: row.time_minutes ?? 30,
    calories_kcal: row.calories_kcal,
    ingredients,
    steps: stepsArr,
    external: {
      provider: "rakuten",
      url: row.external_url ?? "",
      image_url: row.external_image_url ?? "",
      meta,
    },
  };
}

/** 楽天 API のエラーを HTTP status にマッピングする。 */
export function mapRakutenErrorToHttp(err: EdgeError): RunRakutenResult {
  switch (err.code) {
    case "RAKUTEN_RATE_LIMIT":
      return { status: 429, body: err };
    case "RAKUTEN_TIMEOUT":
      return { status: 504, body: err };
    case "RAKUTEN_UNSUPPORTED_CUISINE":
      return { status: 400, body: err };
    case "RAKUTEN_INVALID_RESPONSE":
    case "RAKUTEN_API_FAILED":
    default:
      return { status: 502, body: err };
  }
}

// =====================================================================
// 本体
// =====================================================================

/** 楽天モードの一連の処理を実行する。
 *  - キャッシュが TTL 内かつ recipes が揃っているなら API を叩かずに返す
 *  - そうでなければ楽天 API を呼び、recipes と rakuten_recipe_cache を upsert
 *  - ai_advice_logs への記録は best-effort（失敗しても本体には影響させない）
 */
export async function runRakutenMode(
  deps: RunRakutenDeps,
): Promise<RunRakutenResult> {
  const { supabase, serviceClient, userId, input, rakutenAppId, fetchImpl } = deps;
  const nowDate = (deps.now ?? (() => new Date()))();

  // cuisine → 楽天 categoryId
  const categoryId = rakutenCategoryFor(input.cuisine);
  if (!categoryId) {
    const err: EdgeError = {
      error: `cuisine "${input.cuisine}" is not mapped to Rakuten category`,
      code: "RAKUTEN_UNSUPPORTED_CUISINE",
    };
    return { status: 400, body: err };
  }

  // ai_advice_logs の共通 payload
  const requestPayload = {
    source: "rakuten" as const,
    cuisine: input.cuisine,
    candidateCount: input.candidateCount,
  };

  // 1. cache 行を読む（authenticated client。RLS で誰でも SELECT 可能）
  const { data: cacheData, error: cacheReadErr } = await supabase
    .from("rakuten_recipe_cache")
    .select("cuisine, rakuten_category_id, recipe_ids, fetched_at")
    .eq("cuisine", input.cuisine)
    .maybeSingle();
  if (cacheReadErr) {
    // キャッシュ参照エラーは致命的ではない。fresh fetch にフォールバック。
    console.error("[rakuten-flow] cache read failed:", cacheReadErr);
  }

  const cacheRow = (cacheData ?? null) as RakutenCacheRow | null;
  const isFresh =
    cacheRow !== null &&
    cacheRow.rakuten_category_id === categoryId &&
    Array.isArray(cacheRow.recipe_ids) &&
    cacheRow.recipe_ids.length > 0 &&
    nowDate.getTime() - new Date(cacheRow.fetched_at).getTime() < TTL_MS;

  if (isFresh && cacheRow) {
    // 2. recipes を IN クエリで取得
    const { data: cachedRows, error: cachedErr } = await supabase
      .from("recipes")
      .select(
        "id, title, cuisine, description, servings, time_minutes, calories_kcal, steps, external_provider, external_id, external_url, external_image_url, external_meta",
      )
      .in("id", cacheRow.recipe_ids)
      .eq("source", "external")
      .eq("external_provider", "rakuten");

    if (cachedErr) {
      console.error("[rakuten-flow] cached recipes read failed:", cachedErr);
      // 致命的でない: stale 扱いで再フェッチへ
    } else {
      const rows = (cachedRows ?? []) as RecipeRow[];
      const ordered = orderByRecipeIdSequence(rows, cacheRow.recipe_ids);
      // 件数が一致するときだけ fresh hit とみなす（途中で削除されたら再フェッチ）
      if (ordered.length === cacheRow.recipe_ids.length) {
        const results = ordered.slice(0, input.candidateCount).map(toRecipeOut);
        return {
          status: 200,
          body: { cached: true, source: "rakuten", results },
        };
      }
    }
  }

  // 3. 楽天 API 呼び出し
  const apiRes = await fetchRakutenRanking({
    apiKey: rakutenAppId,
    categoryId,
    fetchImpl,
  });

  if (!apiRes.ok) {
    // 失敗ログ（best-effort）
    await logAiCall(serviceClient, {
      user_id: userId,
      kind: "recipe",
      model: "rakuten",
      request_payload: requestPayload,
      meta: { model: "rakuten", tokens_in: 0, tokens_out: 0, cost_usd: 0 },
      error: apiRes.error.error,
    });
    return mapRakutenErrorToHttp(apiRes.error);
  }

  const rawRecipes: RakutenRecipeRaw[] = apiRes.data;

  // 4. 0 件はキャッシュ更新せず空配列で返す（次回試行余地を残す）
  if (rawRecipes.length === 0) {
    await logAiCall(serviceClient, {
      user_id: userId,
      kind: "recipe",
      model: "rakuten",
      request_payload: requestPayload,
      response: { count: 0, recipe_ids: [] },
      meta: { model: "rakuten", tokens_in: 0, tokens_out: 0, cost_usd: 0 },
    });
    return {
      status: 200,
      body: { cached: false, source: "rakuten", results: [] },
    };
  }

  // 5. recipes upsert（service_role）
  //    onConflict: "external_provider,external_id" は PR-A の partial unique index に対応
  const upsertPayload = rawRecipes.map((r) => ({
    title: r.recipeTitle,
    cuisine: input.cuisine,
    description: r.recipeDescription || "",
    servings: 1, // 楽天 API は人数情報を提供しないため 1 固定
    time_minutes: parseRakutenIndication(r.recipeIndication) ?? 30,
    calories_kcal: null, // 楽天 API は提供なし
    steps: [], // 楽天規約により手順は転載不可。空配列で保持。
    source: "external" as const,
    external_provider: "rakuten" as const,
    external_id: r.recipeId,
    external_url: r.recipeUrl,
    external_image_url: r.mediumImageUrl,
    external_meta: {
      rank: r.rank,
      nickname: r.nickname,
      recipePublishday: r.recipePublishday,
      recipeIndication: r.recipeIndication,
      recipeCost: r.recipeCost,
      recipeMaterial: r.recipeMaterial, // フロント表示用に材料配列を保持
      smallImageUrl: r.smallImageUrl,
      foodImageUrl: r.foodImageUrl,
    },
    generated_prompt_hash: null,
  }));

  const upserted = await serviceClient
    .from("recipes")
    .upsert(upsertPayload, { onConflict: "external_provider,external_id" })
    .select(
      "id, title, cuisine, description, servings, time_minutes, calories_kcal, steps, external_url, external_image_url, external_meta",
    );

  if (upserted.error || !upserted.data) {
    await logAiCall(serviceClient, {
      user_id: userId,
      kind: "recipe",
      model: "rakuten",
      request_payload: requestPayload,
      meta: { model: "rakuten", tokens_in: 0, tokens_out: 0, cost_usd: 0 },
      error: upserted.error?.message ?? "recipes upsert returned no data",
    });
    return {
      status: 500,
      body: {
        code: "INTERNAL_ERROR",
        error: "Failed to upsert recipes",
        detail: upserted.error?.message,
      },
    };
  }

  const upsertedRows = upserted.data as RecipeRow[];

  // 6. cache 更新（best-effort、失敗してもユーザー応答は返す）
  const recipeIds = upsertedRows.map((r) => r.id);
  const { error: cacheUpsertErr } = await serviceClient
    .from("rakuten_recipe_cache")
    .upsert(
      {
        cuisine: input.cuisine,
        rakuten_category_id: categoryId,
        recipe_ids: recipeIds,
        fetched_at: nowDate.toISOString(),
        api_response_meta: {
          fetched_at_iso: nowDate.toISOString(),
          item_count: rawRecipes.length,
        },
      },
      { onConflict: "cuisine" },
    );
  if (cacheUpsertErr) {
    console.error("[rakuten-flow] cache upsert failed:", cacheUpsertErr);
  }

  // 7. 成功ログ
  await logAiCall(serviceClient, {
    user_id: userId,
    kind: "recipe",
    model: "rakuten",
    request_payload: requestPayload,
    response: { count: rawRecipes.length, recipe_ids: recipeIds },
    meta: { model: "rakuten", tokens_in: 0, tokens_out: 0, cost_usd: 0 },
  });

  // 8. レスポンス整形
  //    upsert 結果は INSERT 順 = rawRecipes と同順序になる（PostgREST の挙動）。
  //    既存行が更新された場合も同様に payload 順で返るため i 番目で zip して問題ない。
  const results: RecipeOut[] = upsertedRows
    .map((row, i) => {
      const raw = rawRecipes[i]!;
      const meta = (row.external_meta ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        title: row.title,
        cuisine: row.cuisine,
        description: row.description ?? "",
        servings: row.servings ?? 1,
        time_minutes: row.time_minutes ?? 30,
        calories_kcal: null,
        ingredients: raw.recipeMaterial.map((m) => ({
          name: m,
          amount: "",
          optional: false,
        })),
        steps: [],
        external: {
          provider: "rakuten" as const,
          url: row.external_url ?? raw.recipeUrl,
          image_url: row.external_image_url ?? raw.mediumImageUrl,
          meta,
        },
      };
    })
    .slice(0, input.candidateCount);

  return {
    status: 200,
    body: { cached: false, source: "rakuten", results },
  };
}
