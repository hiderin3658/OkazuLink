// rakuten-flow の単体テスト
//
// Supabase クライアントは vi.fn() でビルダーチェーンをモックする。
// 以下の呼び出しパターンに対応:
//   - supabase.from("rakuten_recipe_cache").select().eq().maybeSingle()
//   - supabase.from("recipes").select().in().eq().eq()
//   - serviceClient.from("recipes").upsert(payload, opts).select(cols)
//   - serviceClient.from("rakuten_recipe_cache").upsert(payload, opts)
//   - serviceClient.from("ai_advice_logs").insert(payload)
//
// 各テストは「テーブルごとに振る舞いを定義」する `makeSupabase` ヘルパで
// クライアントを組み立て、必要なら vi.fn().mockResolvedValueOnce() で結果を制御する。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mapRakutenErrorToHttp,
  orderByRecipeIdSequence,
  parseRakutenIndication,
  runRakutenMode,
  type RunRakutenDeps,
} from "./rakuten-flow";
import type { RakutenCleanInput } from "./validate";

// =====================================================================
// fixtures
// =====================================================================

const FIXED_NOW_ISO = "2026-05-03T12:00:00.000Z";
const FIXED_NOW = new Date(FIXED_NOW_ISO);

function fixedNow(): Date {
  return new Date(FIXED_NOW);
}

function rakutenInput(over: Partial<RakutenCleanInput> = {}): RakutenCleanInput {
  return {
    source: "rakuten",
    cuisine: "japanese",
    candidateCount: 4,
    ...over,
  } as RakutenCleanInput;
}

function makeRawRecipe(rank: string, recipeId: number) {
  return {
    rank,
    recipeId,
    recipeTitle: `テストレシピ ${rank} 位`,
    recipeUrl: `https://recipe.rakuten.co.jp/recipe/${recipeId}/`,
    foodImageUrl: "https://image.example.com/food.jpg",
    mediumImageUrl: "https://image.example.com/medium.jpg",
    smallImageUrl: "https://image.example.com/small.jpg",
    recipeDescription: `説明文 ${rank}`,
    recipeMaterial: [`材料A-${rank}`, `材料B-${rank}`],
    recipeIndication: "約15分",
    recipeCost: "300円前後",
    recipePublishday: "2020/05/01",
    nickname: "テストユーザー",
    shop: 0,
    pickup: 0,
  };
}

function okFetchResponse(recipes: ReturnType<typeof makeRawRecipe>[]): Response {
  return new Response(JSON.stringify({ result: recipes }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function statusFetchResponse(status: number, body = ""): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

// =====================================================================
// Supabase ビルダーチェーンのモック
//
// 各 from(table) 呼び出しに対し、テーブルごとに用意した「ビルダーオブジェクト」を返す。
// ビルダーは select / eq / in / maybeSingle / upsert / insert / single 等を全て関数として
// 持ち、その時点で評価が必要なメソッド（maybeSingle / 終端 select 等）が
// Promise を返す形にする。
// =====================================================================

interface TableBehavior {
  /** SELECT 系: { data, error } を resolve する */
  selectResult?: { data: unknown; error: unknown } | (() => { data: unknown; error: unknown });
  /** maybeSingle 系（行 0/1 ): { data, error } を resolve する */
  maybeSingleResult?: { data: unknown; error: unknown };
  /** upsert(payload).select(...) の結果 */
  upsertSelectResult?: { data: unknown; error: unknown };
  /** upsert(payload) のみで終端する場合の結果 */
  upsertResult?: { data: unknown; error: unknown };
  /** insert(payload) の結果 */
  insertResult?: { data: unknown; error: unknown };
}

interface BuilderRecord {
  /** 呼ばれたメソッドの履歴（メソッド名と引数） */
  calls: { method: string; args: unknown[] }[];
}

function makeBuilder(behavior: TableBehavior, record: BuilderRecord) {
  const log = (method: string, args: unknown[]): void => {
    record.calls.push({ method, args });
  };

  // チェーン用 builder を再帰的に構築。
  // 終端メソッド: maybeSingle / upsert(...).select(...)（select の結果が Promise） / insert
  // それ以外（select, eq, in 等）は then で thenable にして直接 await したときも data/error を返す。
  const builder: Record<string, unknown> = {};

  const selectResolved = (): { data: unknown; error: unknown } => {
    if (typeof behavior.selectResult === "function") {
      return behavior.selectResult();
    }
    return behavior.selectResult ?? { data: null, error: null };
  };

  const thenable = {
    then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) {
      const v = selectResolved();
      return Promise.resolve(v).then(onFulfilled);
    },
    catch() {
      return Promise.resolve(selectResolved());
    },
  };

  builder.select = vi.fn((...args: unknown[]) => {
    log("select", args);
    // select 後にさらに eq / in / maybeSingle がチェーンされるか、または直接 await されるかの両対応
    return chainAfterSelect();
  });

  function chainAfterSelect() {
    const sub: Record<string, unknown> = {};
    sub.eq = vi.fn((...a: unknown[]) => {
      log("eq", a);
      return chainAfterSelect();
    });
    sub.in = vi.fn((...a: unknown[]) => {
      log("in", a);
      return chainAfterSelect();
    });
    sub.order = vi.fn((...a: unknown[]) => {
      log("order", a);
      return chainAfterSelect();
    });
    sub.maybeSingle = vi.fn(() => {
      log("maybeSingle", []);
      return Promise.resolve(behavior.maybeSingleResult ?? { data: null, error: null });
    });
    sub.single = vi.fn(() => {
      log("single", []);
      return Promise.resolve(behavior.maybeSingleResult ?? { data: null, error: null });
    });
    sub.then = thenable.then.bind(thenable);
    sub.catch = thenable.catch.bind(thenable);
    return sub;
  }

  builder.upsert = vi.fn((...args: unknown[]) => {
    log("upsert", args);
    const upsertChain: Record<string, unknown> = {
      select: vi.fn((...sa: unknown[]) => {
        log("upsert.select", sa);
        return Promise.resolve(
          behavior.upsertSelectResult ?? { data: null, error: null },
        );
      }),
      then(onFulfilled?: (v: { data: unknown; error: unknown }) => unknown) {
        const v = behavior.upsertResult ?? { data: null, error: null };
        return Promise.resolve(v).then(onFulfilled);
      },
      catch() {
        return Promise.resolve(behavior.upsertResult ?? { data: null, error: null });
      },
    };
    return upsertChain;
  });

  builder.insert = vi.fn((...args: unknown[]) => {
    log("insert", args);
    return Promise.resolve(behavior.insertResult ?? { data: null, error: null });
  });

  return builder;
}

interface FakeSupabase {
  from: ReturnType<typeof vi.fn>;
  /** テーブル別呼び出し履歴 */
  records: Map<string, BuilderRecord>;
}

function makeSupabase(tables: Record<string, TableBehavior>): FakeSupabase {
  const records = new Map<string, BuilderRecord>();
  const from = vi.fn((table: string) => {
    let rec = records.get(table);
    if (!rec) {
      rec = { calls: [] };
      records.set(table, rec);
    }
    const behavior = tables[table] ?? {};
    return makeBuilder(behavior, rec);
  });
  return {
    from: from as unknown as ReturnType<typeof vi.fn>,
    records,
  };
}

// helper: 履歴から特定 method 呼び出しを取り出す
function callsOf(rec: FakeSupabase, table: string, method: string): unknown[][] {
  const r = rec.records.get(table);
  if (!r) return [];
  return r.calls.filter((c) => c.method === method).map((c) => c.args);
}

// =====================================================================
// 共通: Deps を組み立てる
// =====================================================================

function buildDeps(args: {
  authTables: Record<string, TableBehavior>;
  serviceTables: Record<string, TableBehavior>;
  fetchImpl: typeof fetch;
  input?: RakutenCleanInput;
  rakutenAppId?: string;
  now?: () => Date;
}): { deps: RunRakutenDeps; auth: FakeSupabase; service: FakeSupabase } {
  const auth = makeSupabase(args.authTables);
  const service = makeSupabase(args.serviceTables);
  const deps: RunRakutenDeps = {
    supabase: auth as unknown as RunRakutenDeps["supabase"],
    serviceClient: service as unknown as RunRakutenDeps["serviceClient"],
    userId: "user-1",
    input: args.input ?? rakutenInput(),
    rakutenAppId: args.rakutenAppId ?? "test-app-id",
    fetchImpl: args.fetchImpl,
    now: args.now ?? fixedNow,
  };
  return { deps, auth, service };
}

// =====================================================================
// 純粋関数のテスト
// =====================================================================

describe("parseRakutenIndication", () => {
  it("'約15分' → 15", () => {
    expect(parseRakutenIndication("約15分")).toBe(15);
  });
  it("'15分' → 15", () => {
    expect(parseRakutenIndication("15分")).toBe(15);
  });
  it("'半日' → null", () => {
    expect(parseRakutenIndication("半日")).toBeNull();
  });
  it("空文字 → null", () => {
    expect(parseRakutenIndication("")).toBeNull();
  });
  it("null → null", () => {
    expect(parseRakutenIndication(null)).toBeNull();
  });
  it("'10〜15分' は『分』直前の数字 15 を返す（範囲表記の上限を採用）", () => {
    expect(parseRakutenIndication("10〜15分")).toBe(15);
  });
});

describe("orderByRecipeIdSequence", () => {
  it("idOrder 通りに並べ替える", () => {
    const rows = [
      { id: "c", v: 3 },
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ];
    const out = orderByRecipeIdSequence(rows, ["a", "b", "c"]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(out.map((r) => r.v)).toEqual([1, 2, 3]);
  });

  it("rows に存在しない id は無視される", () => {
    const rows = [
      { id: "a", v: 1 },
      { id: "c", v: 3 },
    ];
    const out = orderByRecipeIdSequence(rows, ["a", "b", "c"]);
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("idOrder が空でも壊れない", () => {
    expect(orderByRecipeIdSequence([{ id: "a" }], [])).toEqual([]);
  });
});

describe("mapRakutenErrorToHttp", () => {
  it("RATE_LIMIT → 429", () => {
    const r = mapRakutenErrorToHttp({ code: "RAKUTEN_RATE_LIMIT", error: "x" });
    expect(r.status).toBe(429);
  });
  it("TIMEOUT → 504", () => {
    const r = mapRakutenErrorToHttp({ code: "RAKUTEN_TIMEOUT", error: "x" });
    expect(r.status).toBe(504);
  });
  it("UNSUPPORTED_CUISINE → 400", () => {
    const r = mapRakutenErrorToHttp({
      code: "RAKUTEN_UNSUPPORTED_CUISINE",
      error: "x",
    });
    expect(r.status).toBe(400);
  });
  it("API_FAILED / INVALID_RESPONSE → 502", () => {
    expect(
      mapRakutenErrorToHttp({ code: "RAKUTEN_API_FAILED", error: "x" }).status,
    ).toBe(502);
    expect(
      mapRakutenErrorToHttp({ code: "RAKUTEN_INVALID_RESPONSE", error: "x" })
        .status,
    ).toBe(502);
  });
});

// =====================================================================
// runRakutenMode のテスト本体
// =====================================================================

describe("runRakutenMode", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------
  // Case 1: fresh hit
  // -----------------------------------------------------------------
  it("fresh hit: cache 内 + recipes 全件取れたら API を呼ばずに cached:true を返す", async () => {
    const ids = ["r1", "r2", "r3", "r4"];
    const cachedAtRecent = new Date(FIXED_NOW.getTime() - 1000 * 60 * 30); // 30分前
    const cacheRow = {
      cuisine: "japanese",
      rakuten_category_id: "27",
      recipe_ids: ids,
      fetched_at: cachedAtRecent.toISOString(),
    };
    const recipeRows = ids.map((id, i) => ({
      id,
      title: `t${i}`,
      cuisine: "japanese",
      description: `d${i}`,
      servings: 1,
      time_minutes: 15,
      calories_kcal: null,
      steps: [],
      external_provider: "rakuten",
      external_id: String(100 + i),
      external_url: `https://r.example.com/${id}`,
      external_image_url: `https://img.example.com/${id}`,
      external_meta: { recipeMaterial: [`m1-${i}`, `m2-${i}`] },
    }));

    const fetchMock = vi.fn();

    const { deps, auth, service } = buildDeps({
      authTables: {
        rakuten_recipe_cache: {
          maybeSingleResult: { data: cacheRow, error: null },
        },
        recipes: {
          selectResult: { data: recipeRows, error: null },
        },
      },
      serviceTables: {},
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const out = await runRakutenMode(deps);

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ cached: true, source: "rakuten" });
    if ("results" in out.body) {
      expect(out.body.results).toHaveLength(4);
      expect(out.body.results.map((r) => r.id)).toEqual(ids);
      expect(out.body.results[0]?.ingredients).toEqual([
        { name: "m1-0", amount: "", optional: false },
        { name: "m2-0", amount: "", optional: false },
      ]);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    // service client は何も呼ばれない（ログも upsert もなし）
    expect(service.from).not.toHaveBeenCalled();
    // auth side: rakuten_recipe_cache と recipes は 1 回ずつ from される
    expect(auth.from).toHaveBeenCalledWith("rakuten_recipe_cache");
    expect(auth.from).toHaveBeenCalledWith("recipes");
  });

  // -----------------------------------------------------------------
  // Case 2: stale (TTL 超)
  // -----------------------------------------------------------------
  it("stale (TTL 超): fetched_at が 7 時間前なら API を呼んで upsert", async () => {
    const stale = new Date(FIXED_NOW.getTime() - 7 * 60 * 60 * 1000);
    const cacheRow = {
      cuisine: "japanese",
      rakuten_category_id: "27",
      recipe_ids: ["old1"],
      fetched_at: stale.toISOString(),
    };

    const raw = [makeRawRecipe("1", 100), makeRawRecipe("2", 101)];
    const upsertedRows = raw.map((r, i) => ({
      id: `id-${i}`,
      title: r.recipeTitle,
      cuisine: "japanese",
      description: r.recipeDescription,
      servings: 1,
      time_minutes: 15,
      calories_kcal: null,
      steps: [],
      external_provider: "rakuten",
      external_id: String(r.recipeId),
      external_url: r.recipeUrl,
      external_image_url: r.mediumImageUrl,
      external_meta: { recipeMaterial: r.recipeMaterial },
    }));

    const fetchMock = vi.fn(async () => okFetchResponse(raw));

    const { deps, service } = buildDeps({
      authTables: {
        rakuten_recipe_cache: {
          maybeSingleResult: { data: cacheRow, error: null },
        },
      },
      serviceTables: {
        recipes: {
          upsertSelectResult: { data: upsertedRows, error: null },
        },
        rakuten_recipe_cache: {
          upsertResult: { data: null, error: null },
        },
        ai_advice_logs: {
          insertResult: { data: null, error: null },
        },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const out = await runRakutenMode(deps);

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ cached: false, source: "rakuten" });
    if ("results" in out.body) {
      expect(out.body.results).toHaveLength(2);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // service client では recipes upsert / cache upsert / ai_advice_logs insert
    expect(service.from).toHaveBeenCalledWith("recipes");
    expect(service.from).toHaveBeenCalledWith("rakuten_recipe_cache");
    expect(service.from).toHaveBeenCalledWith("ai_advice_logs");
  });

  // -----------------------------------------------------------------
  // Case 3: 未キャッシュ
  // -----------------------------------------------------------------
  it("未キャッシュ: cache 行 null なら API を呼んで upsert", async () => {
    const raw = [makeRawRecipe("1", 100)];
    const upsertedRows = [
      {
        id: "id-0",
        title: raw[0]!.recipeTitle,
        cuisine: "japanese",
        description: raw[0]!.recipeDescription,
        servings: 1,
        time_minutes: 15,
        calories_kcal: null,
        steps: [],
        external_provider: "rakuten",
        external_id: String(raw[0]!.recipeId),
        external_url: raw[0]!.recipeUrl,
        external_image_url: raw[0]!.mediumImageUrl,
        external_meta: { recipeMaterial: raw[0]!.recipeMaterial },
      },
    ];
    const fetchMock = vi.fn(async () => okFetchResponse(raw));

    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        recipes: { upsertSelectResult: { data: upsertedRows, error: null } },
        rakuten_recipe_cache: { upsertResult: { data: null, error: null } },
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const out = await runRakutenMode(deps);
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if ("results" in out.body) {
      expect(out.body.results).toHaveLength(1);
    }
  });

  // -----------------------------------------------------------------
  // Case 4: categoryId 不整合
  // -----------------------------------------------------------------
  it("categoryId 不整合: cache 行の rakuten_category_id が違うなら強制再フェッチ", async () => {
    const cacheRow = {
      cuisine: "japanese",
      rakuten_category_id: "999", // マッピングは "27"
      recipe_ids: ["x"],
      fetched_at: FIXED_NOW.toISOString(),
    };
    const raw = [makeRawRecipe("1", 100)];
    const upserted = [
      {
        id: "id-x",
        title: raw[0]!.recipeTitle,
        cuisine: "japanese",
        description: "",
        servings: 1,
        time_minutes: 15,
        calories_kcal: null,
        steps: [],
        external_provider: "rakuten",
        external_id: String(raw[0]!.recipeId),
        external_url: raw[0]!.recipeUrl,
        external_image_url: raw[0]!.mediumImageUrl,
        external_meta: { recipeMaterial: raw[0]!.recipeMaterial },
      },
    ];
    const fetchMock = vi.fn(async () => okFetchResponse(raw));

    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: cacheRow, error: null } },
      },
      serviceTables: {
        recipes: { upsertSelectResult: { data: upserted, error: null } },
        rakuten_recipe_cache: { upsertResult: { data: null, error: null } },
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if ("results" in out.body) {
      expect(out.body.cached).toBe(false);
    }
  });

  // -----------------------------------------------------------------
  // Case 5: fresh hit だが recipes が消えていた
  // -----------------------------------------------------------------
  it("fresh hit でも recipes が件数不一致なら stale 扱いで再フェッチ", async () => {
    const ids = ["r1", "r2"];
    const recent = new Date(FIXED_NOW.getTime() - 1000 * 60 * 10);
    const cacheRow = {
      cuisine: "japanese",
      rakuten_category_id: "27",
      recipe_ids: ids,
      fetched_at: recent.toISOString(),
    };
    // 1 件しか返らない → 件数不一致 → 再フェッチ
    const recipeRows = [
      {
        id: "r1",
        title: "t",
        cuisine: "japanese",
        description: "",
        servings: 1,
        time_minutes: 10,
        calories_kcal: null,
        steps: [],
        external_provider: "rakuten",
        external_id: "100",
        external_url: "u",
        external_image_url: "i",
        external_meta: {},
      },
    ];
    const raw = [makeRawRecipe("1", 100)];
    const upserted = [
      {
        id: "new-id",
        title: raw[0]!.recipeTitle,
        cuisine: "japanese",
        description: "",
        servings: 1,
        time_minutes: 15,
        calories_kcal: null,
        steps: [],
        external_provider: "rakuten",
        external_id: String(raw[0]!.recipeId),
        external_url: raw[0]!.recipeUrl,
        external_image_url: raw[0]!.mediumImageUrl,
        external_meta: { recipeMaterial: raw[0]!.recipeMaterial },
      },
    ];

    const fetchMock = vi.fn(async () => okFetchResponse(raw));
    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: cacheRow, error: null } },
        recipes: { selectResult: { data: recipeRows, error: null } },
      },
      serviceTables: {
        recipes: { upsertSelectResult: { data: upserted, error: null } },
        rakuten_recipe_cache: { upsertResult: { data: null, error: null } },
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const out = await runRakutenMode(deps);
    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if ("results" in out.body) {
      expect(out.body.cached).toBe(false);
    }
  });

  // -----------------------------------------------------------------
  // Case 6: candidateCount=2 で 4 件中 2 件のみ返却
  // -----------------------------------------------------------------
  it("candidateCount=2: 4 件中 2 件のみ返却、upsert は 4 件全件", async () => {
    const raw = [
      makeRawRecipe("1", 101),
      makeRawRecipe("2", 102),
      makeRawRecipe("3", 103),
      makeRawRecipe("4", 104),
    ];
    const upserted = raw.map((r, i) => ({
      id: `id-${i}`,
      title: r.recipeTitle,
      cuisine: "japanese",
      description: r.recipeDescription,
      servings: 1,
      time_minutes: 15,
      calories_kcal: null,
      steps: [],
      external_provider: "rakuten",
      external_id: String(r.recipeId),
      external_url: r.recipeUrl,
      external_image_url: r.mediumImageUrl,
      external_meta: { recipeMaterial: r.recipeMaterial },
    }));

    const fetchMock = vi.fn(async () => okFetchResponse(raw));
    const { deps, service } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        recipes: { upsertSelectResult: { data: upserted, error: null } },
        rakuten_recipe_cache: { upsertResult: { data: null, error: null } },
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
      input: rakutenInput({ candidateCount: 2 }),
    });

    const out = await runRakutenMode(deps);
    expect(out.status).toBe(200);
    if ("results" in out.body) {
      expect(out.body.results).toHaveLength(2);
    }
    // upsert ペイロードは 4 件
    const upsertCalls = callsOf(service, "recipes", "upsert");
    expect(upsertCalls).toHaveLength(1);
    const payload = upsertCalls[0]![0] as unknown[];
    expect(payload).toHaveLength(4);
  });

  // -----------------------------------------------------------------
  // Case 7: API RATE_LIMIT エラー
  // -----------------------------------------------------------------
  it("API RATE_LIMIT → 429 を返し upsert は呼ばれない", async () => {
    // fetchRakutenRanking 内のリトライを最小化するため 429 を必要回数返す
    const fetchMock = vi.fn(async () => statusFetchResponse(429, "rate"));
    const { deps, service } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(429);
    if ("code" in out.body) {
      expect(out.body.code).toBe("RAKUTEN_RATE_LIMIT");
    }
    // recipes は from されない（upsert 呼ばれない）
    expect(callsOf(service, "recipes", "upsert")).toHaveLength(0);
  });

  // -----------------------------------------------------------------
  // Case 8: API TIMEOUT
  // -----------------------------------------------------------------
  it("API TIMEOUT → 504", async () => {
    const fetchMock = vi.fn(async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    });
    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(504);
    if ("code" in out.body) {
      expect(out.body.code).toBe("RAKUTEN_TIMEOUT");
    }
  });

  // -----------------------------------------------------------------
  // Case 9: API 4xx エラー
  // -----------------------------------------------------------------
  it("API 4xx → 502 / RAKUTEN_API_FAILED", async () => {
    const fetchMock = vi.fn(async () => statusFetchResponse(400, "Bad Request"));
    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(502);
    if ("code" in out.body) {
      expect(out.body.code).toBe("RAKUTEN_API_FAILED");
    }
  });

  // -----------------------------------------------------------------
  // Case 10: API INVALID_RESPONSE
  // -----------------------------------------------------------------
  it("API INVALID_RESPONSE → 502", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(502);
    if ("code" in out.body) {
      expect(out.body.code).toBe("RAKUTEN_INVALID_RESPONSE");
    }
  });

  // -----------------------------------------------------------------
  // Case 11: API 0 件
  // -----------------------------------------------------------------
  it("API 0 件 → 200 / results: [] / cache 更新スキップ", async () => {
    const fetchMock = vi.fn(async () => okFetchResponse([]));
    const { deps, service } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(200);
    if ("results" in out.body) {
      expect(out.body.results).toEqual([]);
      expect(out.body.cached).toBe(false);
    }
    // recipes/rakuten_recipe_cache の upsert は呼ばれない
    expect(callsOf(service, "recipes", "upsert")).toHaveLength(0);
    expect(callsOf(service, "rakuten_recipe_cache", "upsert")).toHaveLength(0);
  });

  // -----------------------------------------------------------------
  // Case 12: recipes upsert DB エラー
  // -----------------------------------------------------------------
  it("recipes upsert DB エラー → 500 INTERNAL_ERROR", async () => {
    const raw = [makeRawRecipe("1", 100)];
    const fetchMock = vi.fn(async () => okFetchResponse(raw));
    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        recipes: {
          upsertSelectResult: {
            data: null,
            error: { message: "duplicate key" },
          },
        },
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(500);
    if ("code" in out.body) {
      expect(out.body.code).toBe("INTERNAL_ERROR");
      expect(out.body.error).toContain("upsert");
    }
  });

  // -----------------------------------------------------------------
  // Case 13: cache upsert 失敗は致命的でない
  // -----------------------------------------------------------------
  it("cache upsert 失敗でも 200 を返し console.error を出す", async () => {
    const raw = [makeRawRecipe("1", 100)];
    const upserted = [
      {
        id: "id-0",
        title: raw[0]!.recipeTitle,
        cuisine: "japanese",
        description: "",
        servings: 1,
        time_minutes: 15,
        calories_kcal: null,
        steps: [],
        external_provider: "rakuten",
        external_id: String(raw[0]!.recipeId),
        external_url: raw[0]!.recipeUrl,
        external_image_url: raw[0]!.mediumImageUrl,
        external_meta: { recipeMaterial: raw[0]!.recipeMaterial },
      },
    ];
    const fetchMock = vi.fn(async () => okFetchResponse(raw));

    const { deps } = buildDeps({
      authTables: {
        rakuten_recipe_cache: { maybeSingleResult: { data: null, error: null } },
      },
      serviceTables: {
        recipes: { upsertSelectResult: { data: upserted, error: null } },
        rakuten_recipe_cache: {
          upsertResult: { data: null, error: { message: "fail" } },
        },
        ai_advice_logs: { insertResult: { data: null, error: null } },
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(200);
    if ("results" in out.body) {
      expect(out.body.results).toHaveLength(1);
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("cache upsert failed"),
      expect.objectContaining({ message: "fail" }),
    );
  });

  // -----------------------------------------------------------------
  // Case: 未対応 cuisine
  // -----------------------------------------------------------------
  it("未対応 cuisine → 400 RAKUTEN_UNSUPPORTED_CUISINE / fetch 呼ばない", async () => {
    const fetchMock = vi.fn();
    const { deps } = buildDeps({
      authTables: {},
      serviceTables: {},
      fetchImpl: fetchMock as unknown as typeof fetch,
      input: rakutenInput({ cuisine: "unknown" as unknown as RakutenCleanInput["cuisine"] }),
    });
    const out = await runRakutenMode(deps);
    expect(out.status).toBe(400);
    if ("code" in out.body) {
      expect(out.body.code).toBe("RAKUTEN_UNSUPPORTED_CUISINE");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
