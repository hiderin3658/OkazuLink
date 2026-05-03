import { describe, expect, it, vi } from "vitest";
import { callGemini, extractText, GeminiError, parseJsonOutput } from "./gemini";

// Gemini レスポンス形のサンプルを作るヘルパー
function buildResponse(opts: {
  text?: string;
  status?: number;
  blockReason?: string;
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}): Response {
  const status = opts.status ?? 200;
  const body: Record<string, unknown> = {
    candidates: opts.text
      ? [{ content: { parts: [{ text: opts.text }] } }]
      : undefined,
    usageMetadata: {
      promptTokenCount: opts.promptTokenCount ?? 0,
      candidatesTokenCount: opts.candidatesTokenCount ?? 0,
    },
    promptFeedback: opts.blockReason ? { blockReason: opts.blockReason } : undefined,
  };
  return new Response(JSON.stringify(body), { status });
}

describe("extractText", () => {
  it("候補のテキストを連結して返す", () => {
    const r = {
      candidates: [
        {
          content: {
            parts: [{ text: "hello" }, { text: " world" }],
          },
        },
      ],
    };
    expect(extractText(r)).toBe("hello world");
  });

  it("候補がなければ空文字", () => {
    expect(extractText({})).toBe("");
  });

  it("parts が undefined でも空文字", () => {
    expect(
      extractText({
        candidates: [{ content: { parts: undefined as unknown as never[] } }],
      }),
    ).toBe("");
  });
});

describe("parseJsonOutput", () => {
  it("そのままの JSON 文字列をパース", () => {
    expect(parseJsonOutput<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("コードブロックで囲まれていても剥がす", () => {
    expect(parseJsonOutput<{ a: number }>("```json\n{\"a\":2}\n```")).toEqual({ a: 2 });
    expect(parseJsonOutput<{ a: number }>("```\n{\"a\":3}\n```")).toEqual({ a: 3 });
  });

  it("不正な JSON は throw", () => {
    expect(() => parseJsonOutput("not json")).toThrow();
  });
});

describe("callGemini", () => {
  it("正常レスポンスから text と meta を返す", async () => {
    const fetchMock = vi.fn(async () =>
      buildResponse({
        text: "hello",
        promptTokenCount: 100,
        candidatesTokenCount: 50,
      }),
    );

    const res = await callGemini(
      { user: "Hi" },
      { apiKey: "k", model: "gemini-2.5-flash", fetchImpl: fetchMock },
    );

    expect(res.data).toBe("hello");
    expect(res.meta.model).toBe("gemini-2.5-flash");
    expect(res.meta.tokens_in).toBe(100);
    expect(res.meta.tokens_out).toBe(50);
    // 100*0.3/1M + 50*2.5/1M = 0.00003 + 0.000125 = 0.000155
    expect(res.meta.cost_usd).toBeCloseTo(0.000155, 6);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("gemini-2.5-flash:generateContent");
    expect(init.method).toBe("POST");
    expect(init.headers["x-goog-api-key"]).toBe("k");
  });

  it("system プロンプトは systemInstruction として送られる", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ text: "ok" }));
    await callGemini(
      { system: "You are a coach.", user: "Hi" },
      { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
    );
    const init = fetchMock.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "You are a coach." }],
    });
  });

  it("画像 input は inlineData で送られる", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ text: "ok" }));
    await callGemini(
      {
        user: "Describe",
        image: { mimeType: "image/jpeg", data: "AAAA" },
      },
      { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
    );
    const init = fetchMock.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body) as { contents: { parts: unknown[] }[] };
    const parts = body.contents[0]!.parts;
    expect(parts).toHaveLength(2);
    expect(parts).toContainEqual({
      inlineData: { mimeType: "image/jpeg", data: "AAAA" },
    });
  });

  it("jsonOutput=true で responseMimeType を指定する", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ text: "{}" }));
    await callGemini(
      { user: "x", jsonOutput: true },
      { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
    );
    const init = fetchMock.mock.calls[0]![1] as { body: string };
    const body = JSON.parse(init.body) as { generationConfig?: { responseMimeType?: string } };
    expect(body.generationConfig?.responseMimeType).toBe("application/json");
  });

  it("HTTP エラーは GeminiError(http_error, status) を throw", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("internal error", { status: 500 }),
    );
    let caught: unknown;
    try {
      await callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GeminiError);
    expect((caught as GeminiError).reason).toBe("http_error");
    expect((caught as GeminiError).status).toBe(500);
  });

  it("HTTP エラーボディに含まれる API key 風文字列はマスクされる", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        "Error: AIzaSyAbcdefghijklmnopqrstuvwxyz1234567890 invalid",
        { status: 400 },
      ),
    );
    let caught: GeminiError | undefined;
    try {
      await callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      );
    } catch (e) {
      caught = e as GeminiError;
    }
    expect(caught?.message).not.toContain("AIzaSy");
    expect(caught?.message).toContain("<GOOGLE_API_KEY>");
  });

  it("blockReason が返ったら GeminiError(blocked, blockReason) を throw", async () => {
    const fetchMock = vi.fn(async () =>
      buildResponse({ blockReason: "SAFETY" }),
    );
    let caught: GeminiError | undefined;
    try {
      await callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      );
    } catch (e) {
      caught = e as GeminiError;
    }
    expect(caught).toBeInstanceOf(GeminiError);
    expect(caught?.reason).toBe("blocked");
    expect(caught?.blockReason).toBe("SAFETY");
  });

  it("候補テキストが空なら GeminiError(no_text) を throw", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ text: "" }));
    let caught: GeminiError | undefined;
    try {
      await callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      );
    } catch (e) {
      caught = e as GeminiError;
    }
    expect(caught?.reason).toBe("no_text");
  });

  it("AbortError は GeminiError(timeout) に変換される", async () => {
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      // signal を観察し、即座に abort をシミュレート
      return await new Promise<Response>((_, reject) => {
        const ac = init?.signal as AbortSignal | undefined;
        if (ac) {
          if (ac.aborted) {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
            return;
          }
          ac.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });
    let caught: GeminiError | undefined;
    try {
      await callGemini(
        { user: "x" },
        {
          apiKey: "k",
          model: "gemini-3-flash",
          fetchImpl: fetchMock as unknown as typeof fetch,
          timeoutMs: 1, // 即タイムアウト
        },
      );
    } catch (e) {
      caught = e as GeminiError;
    }
    expect(caught).toBeInstanceOf(GeminiError);
    expect(caught?.reason).toBe("timeout");
  });

  it("不正なレスポンス shape は GeminiError(invalid_response)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("null", { status: 200 }),
    );
    let caught: GeminiError | undefined;
    try {
      await callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      );
    } catch (e) {
      caught = e as GeminiError;
    }
    expect(caught?.reason).toBe("invalid_response");
  });
});
