// ビタミン・ミネラルを月次合計と推奨摂取量との比で表示する。
//
// 達成率に応じてバーの色を変える:
//   < 70%  → red（不足）
//   70-100%  → yellow（やや不足）
//   100-150%  → green（達成）
//   > 150%  → red（過剰、特に salt / fat 系）
//
// 食塩は「目標量 = 上限」なので 100% 超は過剰扱い。

import {
  NUTRIENT_LABEL,
  NUTRIENT_UNIT,
  type NutrientKey,
  type NutritionSummary,
} from "@/lib/nutrition/types";
import { calcAchievement } from "@/lib/nutrition/recommended";

interface Props {
  totals: NutritionSummary["totals"];
  recommended: Record<NutrientKey, number | null>;
  /** 表示対象キー。未指定なら micro 分類デフォルト */
  keys?: NutrientKey[];
}

const DEFAULT_MICRO_KEYS: NutrientKey[] = [
  "fiber_g",
  "salt_g",
  "calcium_mg",
  "iron_mg",
  "vitamin_a_ug",
  "vitamin_c_mg",
  "vitamin_d_ug",
  "vitamin_b1_mg",
  "vitamin_b2_mg",
  "vitamin_b6_mg",
  "vitamin_b12_ug",
  "folate_ug",
  "potassium_mg",
  "magnesium_mg",
  "phosphorus_mg",
  "zinc_mg",
];

/** 上限超過扱いするキー（食塩、脂質） */
const UPPER_BOUND_KEYS: ReadonlySet<NutrientKey> = new Set(["salt_g"]);

export function NutritionTable({ totals, recommended, keys = DEFAULT_MICRO_KEYS }: Props) {
  return (
    <ul className="rounded-lg border border-[var(--color-border)] bg-white">
      {keys.map((k, idx) => {
        const total = totals[k] ?? 0;
        const rec = recommended[k];
        const ach = calcAchievement(total, rec);
        const isUpper = UPPER_BOUND_KEYS.has(k);
        return (
          <li
            key={k}
            className={
              "px-4 py-3 text-sm" +
              (idx > 0 ? " border-t border-[var(--color-border)]" : "")
            }
          >
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{NUTRIENT_LABEL[k]}</span>
              <span className="tabular-nums">
                <span className="font-semibold">
                  {formatValue(total)}
                </span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {" "}
                  {NUTRIENT_UNIT[k]}
                  {rec != null && (
                    <>
                      {" "}/ {formatValue(rec)} {NUTRIENT_UNIT[k]}
                    </>
                  )}
                </span>
              </span>
            </div>
            {ach != null && (
              <div className="mt-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, ach * 100)}%`,
                      backgroundColor: barColor(ach, isUpper),
                    }}
                    aria-label={`達成率 ${(ach * 100).toFixed(0)}%`}
                  />
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  達成率 {(ach * 100).toFixed(0)}% {captionFor(ach, isUpper)}
                </p>
              </div>
            )}
            {ach == null && (
              <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                推奨量データなし
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString();
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function barColor(ach: number, isUpperBound: boolean): string {
  if (isUpperBound) {
    // 食塩等は超過 = 赤、80% 以下 = 緑
    if (ach <= 0.8) return "#10B981"; // green
    if (ach <= 1.0) return "#F59E0B"; // amber（注意）
    return "#EF4444"; // red（超過）
  }
  if (ach < 0.7) return "#EF4444"; // red（不足）
  if (ach < 1.0) return "#F59E0B"; // amber
  if (ach <= 1.5) return "#10B981"; // green（達成）
  return "#F59E0B"; // 過剰（amber 警告）
}

function captionFor(ach: number, isUpperBound: boolean): string {
  if (isUpperBound) {
    if (ach <= 0.8) return "（適正）";
    if (ach <= 1.0) return "（上限近)";
    return "（過剰、控えめに）";
  }
  if (ach < 0.7) return "（不足）";
  if (ach < 1.0) return "（やや不足）";
  if (ach <= 1.5) return "（適正）";
  return "（過剰）";
}
