// ai_advice_logs テーブルへの記録ヘルパー
//
// Edge Function での AI 呼び出し履歴・コスト・エラーを集約記録する。
// service_role キーで RLS バイパス（呼出側が anon でも記録できる）。
//
// セキュリティ: request_payload と response は sanitizeForAiLog() を通して
// 画像 base64・API キー・トークン等を除去/マスクする。

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeForAiLog } from "./sanitize.ts";
import type { AiKind, GeminiCallMeta } from "./types.ts";

export interface AiLogParams {
  user_id: string | null;
  kind: AiKind;
  model: string;
  request_payload?: unknown;
  response?: unknown;
  meta?: GeminiCallMeta;
  error?: string;
}

/** ai_advice_logs に 1 行 INSERT する。失敗時は console.error のみで例外送出しない
 *  （ロギング失敗で本来の処理を止めたくないため） */
export async function logAiCall(
  supabase: SupabaseClient,
  params: AiLogParams,
): Promise<void> {
  try {
    const { error } = await supabase.from("ai_advice_logs").insert({
      user_id: params.user_id,
      kind: params.kind,
      model: params.model,
      request_payload: params.request_payload != null
        ? sanitizeForAiLog(params.request_payload)
        : null,
      response: params.response != null ? sanitizeForAiLog(params.response) : null,
      tokens_in: params.meta?.tokens_in ?? null,
      tokens_out: params.meta?.tokens_out ?? null,
      cost_usd: params.meta?.cost_usd ?? null,
      error: params.error ?? null,
    });
    if (error) {
      console.error("[ai-log] insert failed:", error);
    }
  } catch (err) {
    console.error("[ai-log] unexpected:", err);
  }
}

/** 当月（UTC）の累計 cost_usd を集計する。budget チェックの一次情報として使う。
 *
 *  注意: 日本円予算 (MONTHLY_AI_BUDGET_JPY) を運用するが、月の境界は UTC で
 *  扱う点に注意。JST との時差で月初の数時間は前月扱いになる。設計書 §9.5 と
 *  README で言及する。完全な JST 月次集計が必要になったら DB の tz convert を
 *  使う形に拡張する。 */
export async function getMonthlyCostUsd(
  supabase: SupabaseClient,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sinceIso = monthStart.toISOString();
  const { data, error } = await supabase
    .from("ai_advice_logs")
    .select("cost_usd")
    .gte("created_at", sinceIso);
  if (error) {
    console.error("[ai-log] monthly cost query failed:", error);
    return 0;
  }
  return (data ?? []).reduce(
    (sum, r) => sum + (typeof r.cost_usd === "number" ? r.cost_usd : 0),
    0,
  );
}
