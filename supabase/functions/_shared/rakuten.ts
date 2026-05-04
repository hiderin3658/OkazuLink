// 楽天レシピ API クライアント
//
// 楽天レシピ API（CategoryRanking）を呼び出し、レスポンスを型安全に取り出す純粋関数群。
// Edge Function 本体（PR-C で suggest-recipes に組み込み）から再利用される想定。
//
// このモジュールは:
// - DB アクセスをしない（Supabase クライアント不要）
// - 環境変数を直接参照しない（apiKey は引数で受け取る）
// - fetch を差し替え可能（テスト時にモック注入可）
// - エラーは構造化された RakutenFetchError で返す
//
// 楽天 API 仕様:
// https://webservice.rakuten.co.jp/documentation/recipe-category-ranking
// - エンドポイント: GET https://app.rakuten.co.jp/services/api/Recipe/CategoryRanking/20170426
// - 必須パラメータ: applicationId, categoryId
// - レスポンス: result[] に最大 4 件
// - レート制限: 1 req/sec / 600,000 req/day（applicationId 単位）

import type { EdgeError, EdgeErrorCode } from "./types.ts";

const RAKUTEN_API_BASE =
  "https://app.rakuten.co.jp/services/api/Recipe/CategoryRanking/20170426";

/** 楽天 API レスポンスの 1 レシピ。
 *  仕様の全フィールドを保持しているわけではなく、後段で利用する分のみ型付けする。 */
export interface RakutenRecipeRaw {
  rank: string;
  recipeId: number;
  recipeTitle: string;
  recipeUrl: string;
  foodImageUrl: string;
  mediumImageUrl: string;
  smallImageUrl: string;
  recipeDescription: string;
  recipeMaterial: string[];
  recipeIndication: string;
  recipeCost: string;
  recipePublishday: string;
  nickname: string;
  shop: number;
  pickup: number;
}

/** 楽天 API レスポンス全体の最小スキーマ */
export interface RakutenRankingResponse {
  result: RakutenRecipeRaw[];
}

/** fetchRakutenRanking の入力 */
export interface FetchRakutenOptions {
  /** 楽天デベロッパーで発行する applicationId（secrets RAKUTEN_APP_ID） */
  apiKey: string;
  /** 楽天大カテゴリ ID（例: "27" = 和食） */
  categoryId: string;
  /** fetch 実装を差し替え可能（テスト用） */
  fetchImpl?: typeof fetch;
  /** タイムアウト ms（デフォルト 10000）*/
  timeoutMs?: number;
  /** 429 受領時のリトライ回数（デフォルト 1、計 2 回試行） */
  retries?: number;
  /** リトライ前の backoff ms（デフォルト 1000） */
  backoffMs?: number;
}

/** 結果型: 成功時はレシピ配列、失敗時は構造化エラー */
export type RakutenFetchResult =
  | { ok: true; data: RakutenRecipeRaw[] }
  | { ok: false; error: EdgeError };

/** 楽天 CategoryRanking API を呼び出す。
 *  - 200 OK + 妥当なスキーマなら data 配列を返す
 *  - 429 Too Many Requests は retries 回までリトライ（線形 backoff）
 *  - 4xx は RAKUTEN_API_FAILED、5xx も同上
 *  - JSON パース失敗 / 型不一致は RAKUTEN_INVALID_RESPONSE
 *  - timeout は RAKUTEN_TIMEOUT */
export async function fetchRakutenRanking(
  options: FetchRakutenOptions,
): Promise<RakutenFetchResult> {
  const {
    apiKey,
    categoryId,
    fetchImpl = fetch,
    timeoutMs = 10_000,
    retries = 1,
    backoffMs = 1_000,
  } = options;

  if (!apiKey) {
    return rakutenError("RAKUTEN_API_FAILED", "apiKey is empty");
  }
  if (!categoryId) {
    return rakutenError(
      "RAKUTEN_UNSUPPORTED_CUISINE",
      "categoryId is empty",
    );
  }

  const url = new URL(RAKUTEN_API_BASE);
  url.searchParams.set("applicationId", apiKey);
  url.searchParams.set("categoryId", categoryId);
  url.searchParams.set("format", "json");

  let attempt = 0;
  // attempt 0 は初回、 attempt 1 以降が retry。retries=1 なら計 2 回試行。
  while (attempt <= retries) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url.toString(), { signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 429) {
        if (attempt < retries) {
          attempt++;
          await sleep(backoffMs * attempt); // 線形 backoff（1s, 2s, ...）
          continue;
        }
        return rakutenError(
          "RAKUTEN_RATE_LIMIT",
          "Rate limit exceeded after retries",
          await safeReadText(res),
        );
      }

      if (!res.ok) {
        return rakutenError(
          "RAKUTEN_API_FAILED",
          `HTTP ${res.status}`,
          await safeReadText(res),
        );
      }

      const json = (await res.json().catch(() => null)) as unknown;
      if (!isRakutenResponse(json)) {
        return rakutenError(
          "RAKUTEN_INVALID_RESPONSE",
          "Schema mismatch in Rakuten Recipe API response",
        );
      }
      return { ok: true, data: json.result };
    } catch (err) {
      clearTimeout(timer);
      // AbortController.abort() は AbortError を投げる。
      // Deno / Node / Browser で実装クラスは異なるが name は共通のため name 判定が確実。
      if (err instanceof Error && err.name === "AbortError") {
        return rakutenError("RAKUTEN_TIMEOUT", `Timed out after ${timeoutMs}ms`);
      }
      // ネットワークエラー / 予期せぬ例外は単一エラーとして返す（retry しない）
      const detail = err instanceof Error ? err.message : String(err);
      return rakutenError("RAKUTEN_API_FAILED", "fetch failed", detail);
    }
  }
  // ここには到達しないが型のため
  return rakutenError("RAKUTEN_API_FAILED", "Unreachable retry loop end");
}

/** 楽天レスポンスの型ガード。
 *  仕様変更や fixture バグを早期検知するため、必須フィールドの型まで確認する。 */
export function isRakutenResponse(v: unknown): v is RakutenRankingResponse {
  if (!isObject(v)) return false;
  const result = (v as Record<string, unknown>).result;
  if (!Array.isArray(result)) return false;
  // 0 件レスポンスはあり得る（カテゴリにレシピがない場合）ので空配列は許容
  return result.every(isRakutenRecipe);
}

function isRakutenRecipe(v: unknown): v is RakutenRecipeRaw {
  if (!isObject(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.rank === "string" &&
    typeof o.recipeId === "number" &&
    typeof o.recipeTitle === "string" &&
    typeof o.recipeUrl === "string" &&
    typeof o.foodImageUrl === "string" &&
    typeof o.mediumImageUrl === "string" &&
    typeof o.smallImageUrl === "string" &&
    typeof o.recipeDescription === "string" &&
    Array.isArray(o.recipeMaterial) &&
    o.recipeMaterial.every((m) => typeof m === "string") &&
    typeof o.recipeIndication === "string" &&
    typeof o.recipeCost === "string" &&
    typeof o.recipePublishday === "string" &&
    typeof o.nickname === "string"
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function rakutenError(
  code: EdgeErrorCode,
  message: string,
  detail?: string,
): RakutenFetchResult {
  return {
    ok: false,
    error: {
      code,
      error: message,
      ...(detail ? { detail } : {}),
    },
  };
}

async function safeReadText(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    // 1KB を超える本文は detail として保持する意味が薄いので切る
    return text.length > 1024 ? text.slice(0, 1024) + "..." : text;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
