// 推奨摂取量（1 日あたり）と月次達成率の計算
//
// 出典: 日本人の食事摂取基準（2020 年版）厚生労働省
//   https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/kenkou/eiyou/syokuji_kijyun.html
// 対象: 女性、身体活動レベル II（ふつう）
//
// Phase 2 では性別を「女性」固定、年齢区分を 4 段階に分けて持つ。
// 詳細な PAL（活動係数）や妊婦・授乳期は将来拡張で対応。

import { NUTRIENT_KEYS, type NutrientKey } from "./types";

export const AGE_GROUPS = ["18-29", "30-49", "50-64", "65+"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

/** 1 日あたりの推奨／目安／目標量。null は基準なし */
type DailyIntake = Record<NutrientKey, number | null>;

const FEMALE_DAILY_INTAKE: Record<AgeGroup, DailyIntake> = {
  // 18-29 歳・身体活動レベル II
  "18-29": {
    energy_kcal: 2000,
    protein_g: 50, // 推奨量 50g（妊娠/授乳除く）
    fat_g: 60, // エネルギー比 27.5% ≈ 2000 × 0.275 / 9
    carb_g: 290, // エネルギー比 57.5% ≈ 2000 × 0.575 / 4
    fiber_g: 18,
    salt_g: 6.5, // 目標量（上限）
    calcium_mg: 650,
    iron_mg: 10.5, // 月経あり推奨量
    vitamin_a_ug: 650, // μgRAE
    vitamin_c_mg: 100,
    vitamin_d_ug: 8.5,
    vitamin_b1_mg: 1.1,
    vitamin_b2_mg: 1.2,
    vitamin_b6_mg: 1.1,
    vitamin_b12_ug: 2.4,
    folate_ug: 240,
    potassium_mg: 2000, // 目安量（成人女性）
    magnesium_mg: 270,
    phosphorus_mg: 800,
    zinc_mg: 8,
  },
  // 30-49 歳
  "30-49": {
    energy_kcal: 2050,
    protein_g: 50,
    fat_g: 63,
    carb_g: 295,
    fiber_g: 18,
    salt_g: 6.5,
    calcium_mg: 650,
    iron_mg: 10.5,
    vitamin_a_ug: 700,
    vitamin_c_mg: 100,
    vitamin_d_ug: 8.5,
    vitamin_b1_mg: 1.1,
    vitamin_b2_mg: 1.2,
    vitamin_b6_mg: 1.1,
    vitamin_b12_ug: 2.4,
    folate_ug: 240,
    potassium_mg: 2000,
    magnesium_mg: 290,
    phosphorus_mg: 800,
    zinc_mg: 8,
  },
  // 50-64 歳
  "50-64": {
    energy_kcal: 1950,
    protein_g: 50,
    fat_g: 60,
    carb_g: 280,
    fiber_g: 18,
    salt_g: 6.5,
    calcium_mg: 650,
    iron_mg: 6.5, // 閉経後は推奨量 6.5mg
    vitamin_a_ug: 700,
    vitamin_c_mg: 100,
    vitamin_d_ug: 8.5,
    vitamin_b1_mg: 1.1,
    vitamin_b2_mg: 1.2,
    vitamin_b6_mg: 1.1,
    vitamin_b12_ug: 2.4,
    folate_ug: 240,
    potassium_mg: 2000,
    magnesium_mg: 290,
    phosphorus_mg: 800,
    zinc_mg: 8,
  },
  // 65 歳以上
  "65+": {
    energy_kcal: 1750,
    protein_g: 50,
    fat_g: 53,
    carb_g: 250,
    fiber_g: 17,
    salt_g: 6.5,
    calcium_mg: 650,
    iron_mg: 6.0,
    vitamin_a_ug: 650,
    vitamin_c_mg: 100,
    vitamin_d_ug: 8.5,
    vitamin_b1_mg: 0.9,
    vitamin_b2_mg: 1.0,
    vitamin_b6_mg: 1.1,
    vitamin_b12_ug: 2.4,
    folate_ug: 240,
    potassium_mg: 2000,
    magnesium_mg: 260,
    phosphorus_mg: 800,
    zinc_mg: 8,
  },
};

/** birth_year から年齢区分を返す。null の場合は最も人口比の高い 30-49 を fallback */
export function pickAgeGroup(
  birthYear: number | null,
  now: Date = new Date(),
): AgeGroup {
  if (birthYear === null || !Number.isFinite(birthYear)) return "30-49";
  const age = now.getUTCFullYear() - birthYear;
  if (age < 30) return "18-29";
  if (age < 50) return "30-49";
  if (age < 65) return "50-64";
  return "65+";
}

/** 月次の推奨摂取量を返す（1 日量 × monthDays） */
export function getMonthlyRecommended(
  ageGroup: AgeGroup,
  monthDays = 30,
): Record<NutrientKey, number | null> {
  const daily = FEMALE_DAILY_INTAKE[ageGroup];
  const out = {} as Record<NutrientKey, number | null>;
  for (const k of NUTRIENT_KEYS) {
    const v = daily[k];
    out[k] = v == null ? null : Math.round(v * monthDays * 100) / 100;
  }
  return out;
}

/** 月の日数を返す（1〜31）。月初日 (YYYY-MM-DD) を前提に翌月初日との日差で算出 */
export function daysInMonth(monthStart: string): number {
  const [y, m] = monthStart.split("-").map(Number);
  if (!y || !m) return 30;
  // m は 1..12。次月初日 - 当月初日 (ms) / (24 * 3600 * 1000)
  const cur = Date.UTC(y, m - 1, 1);
  const next = m === 12 ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, m, 1);
  return Math.round((next - cur) / (24 * 3600 * 1000));
}

/** 達成率 (totals / recommended) を 0..2 にクランプして返す。
 *  推奨が null なら null（UI でグレー表示）。
 *  > 100% は緑バー、< 100% は赤系で表示する想定（UI 側で配色）。 */
export function calcAchievement(
  total: number,
  recommended: number | null,
): number | null {
  if (recommended === null || recommended <= 0) return null;
  return Math.max(0, Math.min(2, total / recommended));
}
