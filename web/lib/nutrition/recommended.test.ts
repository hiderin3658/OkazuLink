import { describe, expect, it } from "vitest";
import {
  AGE_GROUPS,
  calcAchievement,
  daysInMonth,
  getMonthlyRecommended,
  pickAgeGroup,
} from "./recommended";

describe("pickAgeGroup", () => {
  it("birth_year null は 30-49 にフォールバック", () => {
    expect(pickAgeGroup(null)).toBe("30-49");
  });

  it("年齢区分の境界を正しく分ける", () => {
    const now = new Date("2026-04-29T00:00:00Z");
    expect(pickAgeGroup(2008, now)).toBe("18-29"); // 18 歳
    expect(pickAgeGroup(1997, now)).toBe("18-29"); // 29 歳
    expect(pickAgeGroup(1996, now)).toBe("30-49"); // 30 歳
    expect(pickAgeGroup(1977, now)).toBe("30-49"); // 49 歳
    expect(pickAgeGroup(1976, now)).toBe("50-64"); // 50 歳
    expect(pickAgeGroup(1962, now)).toBe("50-64"); // 64 歳
    expect(pickAgeGroup(1961, now)).toBe("65+"); // 65 歳
  });

  it("不正値は 30-49 にフォールバック", () => {
    expect(pickAgeGroup(NaN)).toBe("30-49");
    expect(pickAgeGroup(Infinity)).toBe("30-49");
  });
});

describe("getMonthlyRecommended", () => {
  it("4 つの年齢区分すべて取得可能", () => {
    for (const g of AGE_GROUPS) {
      const rec = getMonthlyRecommended(g, 30);
      expect(typeof rec.energy_kcal).toBe("number");
      expect(typeof rec.protein_g).toBe("number");
    }
  });

  it("monthDays に応じて値が線形にスケール", () => {
    const r30 = getMonthlyRecommended("30-49", 30);
    const r31 = getMonthlyRecommended("30-49", 31);
    expect(r31.energy_kcal!).toBeCloseTo((r30.energy_kcal! / 30) * 31, 0);
  });

  it("30-49 女性のエネルギー = 2050 × 30 = 61500", () => {
    const r = getMonthlyRecommended("30-49", 30);
    expect(r.energy_kcal).toBe(61500);
  });

  it("65+ は鉄が低い（閉経後 6mg）", () => {
    const r = getMonthlyRecommended("65+", 30);
    // 6.0 × 30 = 180
    expect(r.iron_mg).toBe(180);
  });

  it("各栄養素キーが NUTRIENT_KEYS と網羅一致", () => {
    const r = getMonthlyRecommended("30-49", 30);
    expect(Object.keys(r)).toContain("energy_kcal");
    expect(Object.keys(r)).toContain("zinc_mg");
    expect(Object.keys(r)).toContain("folate_ug");
  });
});

describe("daysInMonth", () => {
  it("一般的な月の日数", () => {
    expect(daysInMonth("2026-01-01")).toBe(31);
    expect(daysInMonth("2026-04-01")).toBe(30);
    expect(daysInMonth("2026-12-01")).toBe(31);
  });

  it("閏年の 2 月", () => {
    expect(daysInMonth("2024-02-01")).toBe(29);
    expect(daysInMonth("2026-02-01")).toBe(28);
  });

  it("不正値は 30 を返す", () => {
    expect(daysInMonth("invalid")).toBe(30);
  });
});

describe("calcAchievement", () => {
  it("推奨 null なら null", () => {
    expect(calcAchievement(100, null)).toBeNull();
  });

  it("推奨 0 なら null（ゼロ除算回避）", () => {
    expect(calcAchievement(100, 0)).toBeNull();
  });

  it("達成率 = total / recommended", () => {
    expect(calcAchievement(50, 100)).toBe(0.5);
    expect(calcAchievement(100, 100)).toBe(1);
    expect(calcAchievement(150, 100)).toBe(1.5);
  });

  it("負の total は 0 にクランプ", () => {
    expect(calcAchievement(-50, 100)).toBe(0);
  });

  it("達成率 > 200% は 2 にクランプ", () => {
    expect(calcAchievement(500, 100)).toBe(2);
  });
});
