// Gemini が返した JSON （RecipeSuggestion[] 想定）を検証・整形する。
// 加えて、suggest-recipes Edge Function のリクエスト入力検証 (validateRequestInput)
// もここに集約する（AI / 楽天モードの分岐起点）。
//
// LLM の出力は JSON Schema で固定しても乱れることがあるため、必須項目の存在と
// 型を厳密にチェックして安全に整形する。純粋関数として実装し vitest で検証。

import { rakutenCategoryFor } from "../_shared/cuisine-rakuten-map.ts";
import type {
  RecipeIngredientSuggestion,
  RecipeSuggestion,
} from "../_shared/types.ts";

/** recipes.cuisine enum と一致 */
export const VALID_CUISINES = [
  "japanese",
  "chinese",
  "italian",
  "french",
  "ethnic",
  "korean",
  "sweets",
  "other",
] as const;
type ValidCuisine = (typeof VALID_CUISINES)[number];

const CUISINE_SET: ReadonlySet<string> = new Set(VALID_CUISINES);

export class RecipeValidationError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = "RecipeValidationError";
  }
}

/** number 化。NaN/非数値は null */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 正の整数化。フォールバック値が必要 */
function toPositiveInt(v: unknown, fallback: number): number {
  const n = toNum(v);
  if (n === null) return fallback;
  const i = Math.round(n);
  return i > 0 ? i : fallback;
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return fallback;
}

function safeCuisine(v: unknown, fallback: ValidCuisine = "other"): string {
  if (typeof v === "string" && CUISINE_SET.has(v)) return v;
  return fallback;
}

function validateIngredient(raw: unknown, idx: number): RecipeIngredientSuggestion {
  if (typeof raw !== "object" || raw === null) {
    throw new RecipeValidationError(
      `ingredients[${idx}] is not an object`,
      `ingredients[${idx}]`,
    );
  }
  const r = raw as Record<string, unknown>;
  const name = asString(r.name);
  if (!name) {
    throw new RecipeValidationError(
      `ingredients[${idx}].name is required`,
      `ingredients[${idx}].name`,
    );
  }
  return {
    name,
    amount: asString(r.amount, "適量"),
    optional: r.optional === true,
  };
}

function validateSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new RecipeValidationError("steps must be an array", "steps");
  }
  const cleaned = raw
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) {
    throw new RecipeValidationError("steps must be non-empty", "steps");
  }
  return cleaned;
}

/** 単一 RecipeSuggestion 検証 */
function validateOne(raw: unknown, idx: number): RecipeSuggestion {
  if (typeof raw !== "object" || raw === null) {
    throw new RecipeValidationError(
      `recipes[${idx}] is not an object`,
      `recipes[${idx}]`,
    );
  }
  const r = raw as Record<string, unknown>;

  const title = asString(r.title);
  if (!title) {
    throw new RecipeValidationError(
      `recipes[${idx}].title is required`,
      `recipes[${idx}].title`,
    );
  }

  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    throw new RecipeValidationError(
      `recipes[${idx}].ingredients must be a non-empty array`,
      `recipes[${idx}].ingredients`,
    );
  }
  const ingredients = r.ingredients.map((it, i) => validateIngredient(it, i));

  let steps: string[];
  try {
    steps = validateSteps(r.steps);
  } catch (err) {
    if (err instanceof RecipeValidationError) {
      throw new RecipeValidationError(
        `recipes[${idx}].${err.path ?? "steps"}: ${err.message}`,
        `recipes[${idx}].${err.path ?? "steps"}`,
      );
    }
    throw err;
  }

  return {
    title,
    cuisine: safeCuisine(r.cuisine),
    description: asString(r.description, ""),
    servings: toPositiveInt(r.servings, 1),
    time_minutes: toPositiveInt(r.time_minutes, 30),
    calories_kcal: toNum(r.calories_kcal) === null ? null : Math.round(toNum(r.calories_kcal) ?? 0),
    ingredients,
    steps,
  };
}

/** Gemini の JSON 出力を RecipeSuggestion[] に整形する。
 *  - 配列でない場合はエラー
 *  - 0 件の場合はエラー
 *  - 各要素は防御的に整形（不正値は fallback、必須欠落は throw） */
export function validateRecipeSuggestions(raw: unknown): RecipeSuggestion[] {
  if (!Array.isArray(raw)) {
    // Gemini が { recipes: [...] } のように包んで返すケースもあるので 1 段降りる
    if (
      typeof raw === "object" &&
      raw !== null &&
      Array.isArray((raw as Record<string, unknown>).recipes)
    ) {
      return validateRecipeSuggestions((raw as Record<string, unknown>).recipes);
    }
    throw new RecipeValidationError("Response is not an array");
  }
  if (raw.length === 0) {
    throw new RecipeValidationError("Response is empty");
  }
  return raw.map((r, i) => validateOne(r, i));
}

// =====================================================================
// リクエスト入力 (POST body) の検証
// =====================================================================

/** リクエスト body の最小型（受信側で保持） */
export interface RequestBody {
  source?: string;
  ingredients?: unknown;
  cuisine?: unknown;
  servings?: unknown;
  candidateCount?: unknown;
  profile?: {
    allergies?: unknown;
    disliked?: unknown;
    goal_type?: unknown;
  } | null;
}

export interface AiCleanInput {
  source: "ai";
  ingredients: string[];
  cuisine: ValidCuisine;
  servings: number;
  candidateCount: number;
  profile: {
    allergies: string[];
    disliked: string[];
    goal_type: string | null;
  };
}

export interface RakutenCleanInput {
  source: "rakuten";
  cuisine: ValidCuisine;
  candidateCount: number;
}

/** 入力検証の結果（判別共用体）。`code` はクライアント側のエラーコードに直結。 */
export type ValidateInputResult =
  | { ok: true; clean: AiCleanInput | RakutenCleanInput }
  | {
      ok: false;
      reason: string;
      code: "BAD_REQUEST" | "RAKUTEN_UNSUPPORTED_CUISINE";
    };

/** source 文字列の正規化。未指定/空は "ai"、無効値はエラー扱いのため null。 */
function normalizeSource(raw: unknown): "ai" | "rakuten" | null {
  if (raw === undefined || raw === null || raw === "") return "ai";
  if (raw === "ai" || raw === "rakuten") return raw;
  return null;
}

function safeCuisineRequired(raw: unknown): ValidCuisine | null {
  if (typeof raw !== "string") return null;
  if (!CUISINE_SET.has(raw)) return null;
  return raw as ValidCuisine;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(min, n), max);
}

function toIntOr(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

/** suggest-recipes Edge Function の入力 body を検証して整形する。
 *  - source は "ai" / "rakuten" / 未指定（→"ai"）のみ許容
 *  - AI モードは ingredients 必須、profile を整形
 *  - 楽天モードは cuisine と candidateCount のみ使う（ingredients/profile/servings は無視）
 */
export function validateRequestInput(body: RequestBody): ValidateInputResult {
  const source = normalizeSource(body.source);
  if (source === null) {
    return {
      ok: false,
      reason: "source must be 'ai' or 'rakuten'",
      code: "BAD_REQUEST",
    };
  }

  const cuisine = safeCuisineRequired(body.cuisine);
  if (cuisine === null) {
    return {
      ok: false,
      reason: `cuisine must be one of ${VALID_CUISINES.join("/")}`,
      code: "BAD_REQUEST",
    };
  }

  if (source === "rakuten") {
    // 防御コード: 現在は VALID_CUISINES と CUISINE_TO_RAKUTEN_CATEGORY が
    // 同じ 8 種を網羅しているため到達しないが、片側だけ拡張された場合に備える。
    // 例えば new cuisine 追加時に楽天 categoryId 未マッピングなら早期エラー。
    if (rakutenCategoryFor(cuisine) === null) {
      return {
        ok: false,
        reason: `cuisine "${cuisine}" is not mapped to Rakuten category`,
        code: "RAKUTEN_UNSUPPORTED_CUISINE",
      };
    }
    const candidateCount = clamp(toIntOr(body.candidateCount, 4), 1, 4);
    return {
      ok: true,
      clean: { source: "rakuten", cuisine, candidateCount },
    };
  }

  // AI モード: 既存 validateInput と同等のルール
  if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    return {
      ok: false,
      reason: "ingredients must be a non-empty array",
      code: "BAD_REQUEST",
    };
  }
  if (body.ingredients.length > 50) {
    return { ok: false, reason: "ingredients exceeds 50 items", code: "BAD_REQUEST" };
  }
  const cleaned = body.ingredients
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0 && s.length <= 100);
  if (cleaned.length === 0) {
    return {
      ok: false,
      reason: "ingredients are all empty after trim",
      code: "BAD_REQUEST",
    };
  }

  const servings = clamp(toIntOr(body.servings, 1), 1, 20);
  const candidateCount = clamp(toIntOr(body.candidateCount, 4), 1, 8);

  const profile = {
    allergies: Array.isArray(body.profile?.allergies)
      ? (body.profile!.allergies as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 30)
      : [],
    disliked: Array.isArray(body.profile?.disliked)
      ? (body.profile!.disliked as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 30)
      : [],
    goal_type:
      typeof body.profile?.goal_type === "string"
        ? body.profile!.goal_type
        : null,
  };

  return {
    ok: true,
    clean: {
      source: "ai",
      ingredients: cleaned,
      cuisine,
      servings,
      candidateCount,
      profile,
    },
  };
}
