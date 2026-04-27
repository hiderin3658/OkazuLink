import { describe, expect, it } from "vitest";
import {
  calculateCostUsd,
  evaluateBudget,
  usdToJpy,
} from "./budget";

describe("calculateCostUsd", () => {
  it("既知モデル: gemini-3-flash で正しく算出", () => {
    // input 1M = 0.5 USD, output 1M = 3.0 USD
    expect(calculateCostUsd("gemini-3-flash", 1_000_000, 0)).toBeCloseTo(0.5, 6);
    expect(calculateCostUsd("gemini-3-flash", 0, 1_000_000)).toBeCloseTo(3.0, 6);
    expect(calculateCostUsd("gemini-3-flash", 500_000, 100_000)).toBeCloseTo(
      0.25 + 0.3,
      6,
    );
  });

  it("既知モデル: gemini-3-pro は単価が高い", () => {
    expect(calculateCostUsd("gemini-3-pro", 1_000_000, 0)).toBeCloseTo(5.0, 6);
    expect(calculateCostUsd("gemini-3-pro", 0, 1_000_000)).toBeCloseTo(15.0, 6);
  });

  it("未知モデルはフォールバック単価", () => {
    // FALLBACK_PRICING = 1.0 / 5.0
    expect(calculateCostUsd("unknown-model", 1_000_000, 0)).toBeCloseTo(1.0, 6);
    expect(calculateCostUsd("unknown-model", 0, 1_000_000)).toBeCloseTo(5.0, 6);
  });

  it("0 トークンなら 0 USD", () => {
    expect(calculateCostUsd("gemini-3-flash", 0, 0)).toBe(0);
  });

  it("小数 6 桁丸め", () => {
    const v = calculateCostUsd("gemini-3-flash", 7, 11);
    // とても小さい値だが、6 桁までで揃うことを確認
    expect(Number.isFinite(v)).toBe(true);
    expect(String(v).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });
});

describe("usdToJpy", () => {
  it("既定レート 150", () => {
    expect(usdToJpy(1)).toBe(150);
    expect(usdToJpy(0.01)).toBe(1.5);
  });

  it("レート指定", () => {
    expect(usdToJpy(1, 160)).toBe(160);
    expect(usdToJpy(0.5, 200)).toBe(100);
  });

  it("小数 2 桁丸め", () => {
    const v = usdToJpy(0.001234, 150);
    // 0.1851 -> 0.19 (Math.round * 100 / 100)
    expect(v).toBeCloseTo(0.19, 2);
  });
});

describe("evaluateBudget", () => {
  it("超過していない場合は exceeded=false, allow=true", () => {
    const s = evaluateBudget(500, 1000, "soft");
    expect(s.exceeded).toBe(false);
    expect(s.allow).toBe(true);
  });

  it("soft モード: 超過しても allow=true（警告のみ）", () => {
    const s = evaluateBudget(1500, 1000, "soft");
    expect(s.exceeded).toBe(true);
    expect(s.allow).toBe(true);
  });

  it("hard モード: 超過時は allow=false（呼出停止）", () => {
    const s = evaluateBudget(1500, 1000, "hard");
    expect(s.exceeded).toBe(true);
    expect(s.allow).toBe(false);
  });

  it("hard モードでも超過していなければ allow=true", () => {
    const s = evaluateBudget(500, 1000, "hard");
    expect(s.exceeded).toBe(false);
    expect(s.allow).toBe(true);
  });

  it("ちょうど境界では exceeded=true（>= 判定）", () => {
    expect(evaluateBudget(1000, 1000, "soft").exceeded).toBe(true);
    expect(evaluateBudget(999, 1000, "soft").exceeded).toBe(false);
  });

  it("monthly_total_jpy は小数 2 桁丸め", () => {
    const s = evaluateBudget(123.4567, 1000, "soft");
    expect(s.monthly_total_jpy).toBe(123.46);
  });
});
