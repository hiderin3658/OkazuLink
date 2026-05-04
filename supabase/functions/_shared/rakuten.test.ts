import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRakutenRanking,
  isRakutenResponse,
  type RakutenRecipeRaw,
} from "./rakuten";

// =====================================================================
// テスト fixtures
// =====================================================================

function makeRecipe(rank: string, override: Partial<RakutenRecipeRaw> = {}): RakutenRecipeRaw {
  return {
    rank,
    recipeId: 1234567 + Number(rank),
    recipeTitle: `テストレシピ ${rank} 位`,
    recipeUrl: `https://recipe.rakuten.co.jp/recipe/${1234567 + Number(rank)}/`,
    foodImageUrl: "https://image.example.com/food.jpg",
    mediumImageUrl: "https://image.example.com/medium.jpg",
    smallImageUrl: "https://image.example.com/small.jpg",
    recipeDescription: "テスト用の説明文",
    recipeMaterial: ["材料 A", "材料 B"],
    recipeIndication: "約15分",
    recipeCost: "300円前後",
    recipePublishday: "2020/05/01",
    nickname: "テストユーザー",
    shop: 0,
    pickup: 0,
    ...override,
  };
}

function makeOkResponse(recipes: RakutenRecipeRaw[]): Response {
  return new Response(JSON.stringify({ result: recipes }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeStatusResponse(status: number, body = ""): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

// =====================================================================
// happy path
// =====================================================================

describe("fetchRakutenRanking - happy path", () => {
  it("200 + 妥当なスキーマで data 配列を返す", async () => {
    const fetchMock = vi.fn(async () =>
      makeOkResponse([makeRecipe("1"), makeRecipe("2"), makeRecipe("3"), makeRecipe("4")]),
    );

    const result = await fetchRakutenRanking({
      apiKey: "dummy-app-id",
      categoryId: "27",
      fetchImpl: fetchMock,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(4);
      expect(result.data[0]?.rank).toBe("1");
      expect(result.data[0]?.recipeId).toBe(1234568);
    }
    // URL に必須クエリが付いているか
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain("applicationId=dummy-app-id");
    expect(calledUrl).toContain("categoryId=27");
    expect(calledUrl).toContain("format=json");
  });

  it("0 件レスポンス（result: []）も成功扱い", async () => {
    const fetchMock = vi.fn(async () => makeOkResponse([]));
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });
});

// =====================================================================
// 入力バリデーション
// =====================================================================

describe("fetchRakutenRanking - input validation", () => {
  it("apiKey が空なら RAKUTEN_API_FAILED を返し fetch 呼ばない", async () => {
    const fetchMock = vi.fn();
    const result = await fetchRakutenRanking({
      apiKey: "",
      categoryId: "27",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RAKUTEN_API_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("categoryId が空なら RAKUTEN_UNSUPPORTED_CUISINE を返す", async () => {
    const fetchMock = vi.fn();
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RAKUTEN_UNSUPPORTED_CUISINE");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// =====================================================================
// レート制限とリトライ
// =====================================================================

describe("fetchRakutenRanking - rate limit / retry", () => {
  it("429 → 200 で 1 回リトライして成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeStatusResponse(429))
      .mockResolvedValueOnce(makeOkResponse([makeRecipe("1")]));

    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
      retries: 1,
      backoffMs: 1, // テスト高速化のため backoff を 1ms に
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("429 が retries 回数を超えたら RAKUTEN_RATE_LIMIT", async () => {
    const fetchMock = vi.fn(async () => makeStatusResponse(429, "rate limit body"));
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
      retries: 2,
      backoffMs: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RAKUTEN_RATE_LIMIT");
      expect(result.error.detail).toContain("rate limit");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3); // 初回 + retry 2 = 3
  });
});

// =====================================================================
// エラーレスポンス
// =====================================================================

describe("fetchRakutenRanking - error responses", () => {
  it("400 等の 4xx は RAKUTEN_API_FAILED", async () => {
    const fetchMock = vi.fn(async () =>
      makeStatusResponse(400, "Bad Request: invalid categoryId"),
    );
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "999999",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RAKUTEN_API_FAILED");
      expect(result.error.error).toBe("HTTP 400");
      expect(result.error.detail).toContain("Bad Request");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1); // リトライしない
  });

  it("5xx は RAKUTEN_API_FAILED", async () => {
    const fetchMock = vi.fn(async () => makeStatusResponse(503, "Service Unavailable"));
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RAKUTEN_API_FAILED");
  });

  it("JSON パース失敗は RAKUTEN_INVALID_RESPONSE", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("not a json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RAKUTEN_INVALID_RESPONSE");
  });

  it("スキーマ不一致は RAKUTEN_INVALID_RESPONSE", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ result: [{ recipeId: "not-a-number" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RAKUTEN_INVALID_RESPONSE");
  });

  it("AbortError は RAKUTEN_TIMEOUT", async () => {
    const fetchMock = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
      timeoutMs: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RAKUTEN_TIMEOUT");
  });

  it("予期せぬ例外（ネットワーク断等）は RAKUTEN_API_FAILED", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await fetchRakutenRanking({
      apiKey: "k",
      categoryId: "27",
      fetchImpl: fetchMock,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RAKUTEN_API_FAILED");
      expect(result.error.detail).toBe("ECONNREFUSED");
    }
  });
});

// =====================================================================
// isRakutenResponse 単体
// =====================================================================

describe("isRakutenResponse", () => {
  it("正規のレスポンスは true", () => {
    const ok = { result: [makeRecipe("1")] };
    expect(isRakutenResponse(ok)).toBe(true);
  });

  it("result が配列でない場合は false", () => {
    expect(isRakutenResponse({ result: "x" })).toBe(false);
    expect(isRakutenResponse({ result: null })).toBe(false);
    expect(isRakutenResponse({})).toBe(false);
  });

  it("レシピの recipeId が number でなければ false", () => {
    expect(
      isRakutenResponse({
        result: [{ ...makeRecipe("1"), recipeId: "1234" as unknown as number }],
      }),
    ).toBe(false);
  });

  it("recipeMaterial に非文字列が混在すれば false", () => {
    expect(
      isRakutenResponse({
        result: [{ ...makeRecipe("1"), recipeMaterial: ["A", 123 as unknown as string] }],
      }),
    ).toBe(false);
  });

  it("空配列の result は true（カテゴリ内にレシピが無いケース）", () => {
    expect(isRakutenResponse({ result: [] })).toBe(true);
  });

  it("null / undefined / プリミティブは false", () => {
    expect(isRakutenResponse(null)).toBe(false);
    expect(isRakutenResponse(undefined)).toBe(false);
    expect(isRakutenResponse("string")).toBe(false);
    expect(isRakutenResponse(42)).toBe(false);
  });
});
