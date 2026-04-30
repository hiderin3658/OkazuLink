// 月次栄養サマリーの CSV ビルダー
//
// Phase 1 の shopping/csv.ts と同じく、純粋関数で UTF-8 CSV を生成する。
// 呼び出し側で BOM を付与して text/csv で返す前提。

import {
  NUTRIENT_KEYS,
  NUTRIENT_LABEL,
  NUTRIENT_UNIT,
  type NutrientKey,
  type NutritionSummary,
} from "./types";
import {
  AGE_GROUPS,
  calcAchievement,
  daysInMonth,
  getMonthlyRecommended,
  pickAgeGroup,
  type AgeGroup,
} from "./recommended";

/** CSV のヘッダー（日本語） */
export const NUTRITION_CSV_HEADERS = [
  "対象月",
  "栄養素",
  "単位",
  "月間摂取量",
  "推奨摂取量（月）",
  "達成率(%)",
  "判定",
  "計算前提",
] as const;

/** Phase 1 の shopping/csv と同じ formula injection 対策つきエスケープ */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (s === "") return "";
  if (typeof value === "string" && FORMULA_PREFIX_RE.test(s)) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const UPPER_BOUND_KEYS: ReadonlySet<NutrientKey> = new Set(["salt_g"]);

interface BuildOptions {
  monthStart: string; // "YYYY-MM-01"
  /** 推奨摂取量計算用。無指定なら 30-49 に fallback */
  birthYear: number | null;
  summary: NutritionSummary;
}

function judgement(achievement: number | null, isUpper: boolean): string {
  if (achievement === null) return "推奨量データなし";
  if (isUpper) {
    if (achievement <= 0.8) return "適正";
    if (achievement <= 1.0) return "上限近い";
    return "過剰";
  }
  if (achievement < 0.7) return "不足";
  if (achievement < 1.0) return "やや不足";
  if (achievement <= 1.5) return "適正";
  return "過剰";
}

function formatPercent(achievement: number | null): string {
  if (achievement === null) return "";
  return `${Math.round(achievement * 100)}`;
}

function formatValue(v: number): string {
  // 整数桁が大きい栄養素（kcal, mg）は丸めて表示。小さい値は小数 2 桁
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function monthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  return `${y}年${m}月`;
}

/** NutritionSummary を CSV 文字列に整形する。先頭 \r\n は付かないため、
 *  呼び出し側で複数月を結合する場合は明示的に区切る。 */
export function buildNutritionCsv(opts: BuildOptions): string {
  const { monthStart, birthYear, summary } = opts;
  const ageGroup: AgeGroup = pickAgeGroup(birthYear);
  const days = daysInMonth(monthStart);
  const recommended = getMonthlyRecommended(ageGroup, days);
  const monthLab = monthLabel(monthStart);

  const lines: string[] = [];
  lines.push(NUTRITION_CSV_HEADERS.join(","));

  for (const key of NUTRIENT_KEYS) {
    const total = summary.totals[key] ?? 0;
    const rec = recommended[key];
    const ach = calcAchievement(total, rec);
    const isUpper = UPPER_BOUND_KEYS.has(key);

    lines.push(
      [
        escapeCsvCell(monthLab),
        escapeCsvCell(NUTRIENT_LABEL[key]),
        escapeCsvCell(NUTRIENT_UNIT[key]),
        escapeCsvCell(formatValue(total)),
        escapeCsvCell(rec === null ? "" : formatValue(rec)),
        escapeCsvCell(formatPercent(ach)),
        escapeCsvCell(judgement(ach, isUpper)),
        // 計算前提を最初の行（エネルギー）にだけ入れる
        escapeCsvCell(
          key === "energy_kcal" ? `年齢区分: ${ageGroup} 女性 / 月日数: ${days}` : "",
        ),
      ].join(","),
    );
  }

  // notes（概算前提）も末尾の行として記録
  if (summary.notes.length > 0) {
    lines.push(
      [
        escapeCsvCell(monthLab),
        escapeCsvCell("計算前提"),
        "",
        "",
        "",
        "",
        "",
        escapeCsvCell(summary.notes.join(" / ")),
      ].join(","),
    );
  }

  return lines.join("\r\n");
}

/** ダウンロード用ファイル名: okazu-link-nutrition-YYYYMM.csv */
export function buildNutritionCsvFileName(monthStart: string): string {
  const [y, m] = monthStart.split("-");
  return `okazu-link-nutrition-${y}${m}.csv`;
}

/** AGE_GROUPS export は外部からも使うため再 export しておく */
export { AGE_GROUPS };
