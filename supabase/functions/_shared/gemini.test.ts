import { describe, expect, it, vi } from "vitest";
import { callGemini, extractText, parseJsonOutput } from "./gemini";

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
      { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
    );

    expect(res.data).toBe("hello");
    expect(res.meta.model).toBe("gemini-3-flash");
    expect(res.meta.tokens_in).toBe(100);
    expect(res.meta.tokens_out).toBe(50);
    // 100*0.5/1M + 50*3/1M = 0.00005 + 0.00015 = 0.0002
    expect(res.meta.cost_usd).toBeCloseTo(0.0002, 6);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("gemini-3-flash:generateContent");
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

  it("HTTP エラーは throw", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("internal error", { status: 500 }),
    );
    await expect(
      callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/status=500/);
  });

  it("blockReason が返ったら throw", async () => {
    const fetchMock = vi.fn(async () =>
      buildResponse({ blockReason: "SAFETY" }),
    );
    await expect(
      callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/SAFETY/);
  });

  it("候補テキストが空なら throw", async () => {
    const fetchMock = vi.fn(async () => buildResponse({ text: "" }));
    await expect(
      callGemini(
        { user: "x" },
        { apiKey: "k", model: "gemini-3-flash", fetchImpl: fetchMock },
      ),
    ).rejects.toThrow(/no text/i);
  });
});
