// AI 呼出のコスト計算と月次予算チェック
//
// 設計書 §9.5: 月間上限 ¥1,000（環境変数 MONTHLY_AI_BUDGET_JPY）
// soft: 警告のみで継続 / hard: 超過時は AI 呼出を一時停止
//
// このモジュールは純粋関数のみを公開する（fetch も Supabase SDK も使わない）ため
// vitest で完全にテスト可能。
//
// 丸めポリシー:
// - calculateCostUsd: 小数 6 桁丸め（ai_advice_logs.cost_usd の numeric(10,6) と整合）
// - usdToJpy: 小数 2 桁丸め（円表示の慣習）
// - evaluateBudget.monthly_total_jpy: 小数 2 桁丸め（同上）
//
// 月の境界は UTC で扱う（getMonthlyCostUsd in ai-log.ts）。JST 月末との時差で
// 月初 9 時間が前月扱いになる。MVP では実用上問題ないと判断。
// 完全な JST 月次集計が必要になったら DB 側で `at time zone 'Asia/Tokyo'` で集約する。

import type { BudgetMode, GeminiModel } from "./types";

// =====================================================================
// モデル別の単価表（USD per 1M tokens, 2026-04 時点の参考値）
// 実コストはモデル変更時にここを更新する。Gemini 3 系の正式価格が変わった場合は要調整。
// =====================================================================

interface ModelPricing {
  input_per_1m: number; // USD per 1M input tokens
  output_per_1m: number; // USD per 1M output tokens
}

const PRICING: Record<string, ModelPricing> = {
  // Gemini 3 系（仮の推定値、リリース時に要更新）
  "gemini-3-flash": { input_per_1m: 0.5, output_per_1m: 3.0 },
  "gemini-3-pro": { input_per_1m: 5.0, output_per_1m: 15.0 },
  "gemini-3.1-flash-lite": { input_per_1m: 0.1, output_per_1m: 0.4 },
  // Gemini 2.5 系（フォールバック用に既知の値を保持）
  "gemini-2.5-flash": { input_per_1m: 0.3, output_per_1m: 2.5 },
  "gemini-2.5-pro": { input_per_1m: 1.25, output_per_1m: 10.0 },
};

const FALLBACK_PRICING: ModelPricing = { input_per_1m: 1.0, output_per_1m: 5.0 };

/** モデルと token 数からドルコストを計算する */
export function calculateCostUsd(
  model: GeminiModel,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = PRICING[model] ?? FALLBACK_PRICING;
  const cost =
    (tokensIn / 1_000_000) * p.input_per_1m +
    (tokensOut / 1_000_000) * p.output_per_1m;
  return Math.round(cost * 1_000_000) / 1_000_000; // 小数 6 桁丸め
}

/** 円換算 (USD/JPY レート は環境変数か外部設定で渡す。デフォルト 150) */
export function usdToJpy(usd: number, rate = 150): number {
  return Math.round(usd * rate * 100) / 100;
}

// =====================================================================
// 予算チェック
// =====================================================================

export interface BudgetStatus {
  /** 当月の累計コスト (JPY) */
  monthly_total_jpy: number;
  /** 上限 (JPY) */
  budget_jpy: number;
  /** 上限を超過しているか */
  exceeded: boolean;
  /** モード（soft/hard） */
  mode: BudgetMode;
  /** 呼び出しを許可するか（hard かつ exceeded なら false） */
  allow: boolean;
}

/** 累計コストと予算から状態を判定する */
export function evaluateBudget(
  monthlyTotalJpy: number,
  budgetJpy: number,
  mode: BudgetMode,
): BudgetStatus {
  const exceeded = monthlyTotalJpy >= budgetJpy;
  const allow = !(mode === "hard" && exceeded);
  return {
    monthly_total_jpy: Math.round(monthlyTotalJpy * 100) / 100,
    budget_jpy: budgetJpy,
    exceeded,
    mode,
    allow,
  };
}
