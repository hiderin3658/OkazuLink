// Gemini が返した JSON （RecipeSuggestion[] 想定）を検証・整形する。
//
// LLM の出力は JSON Schema で固定しても乱れることがあるため、必須項目の存在と
// 型を厳密にチェックして安全に整形する。純粋関数として実装し vitest で検証。

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
