"use client";

// /nutrition/advice ページ内のステートマシン:
// - mount 時に Edge Function を invoke（cache hit ならコスト 0）
// - 成功なら AdviceDisplay、失敗ならエラーメッセージ + 再試行ボタン

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdviceDisplay } from "./advice-display";
import type { AdviceResponse } from "@/lib/nutrition/advice-types";

interface Props {
  monthStart: string;
}

type Status = "idle" | "loading" | "success" | "error";

export function AdviceClientWrapper({ monthStart }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<AdviceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdvice();
    // monthStart が変わるたびに再取得
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart]);

  async function fetchAdvice(force = false) {
    setStatus("loading");
    setError(null);
    if (!force) setData(null);

    const supabase = createClient();
    const { data: result, error: fnErr } = await supabase.functions.invoke<AdviceResponse>(
      "advise-nutrition",
      { body: { monthStart } },
    );
    if (fnErr || !result) {
      setError(toErrorMessage(fnErr));
      setStatus("error");
      return;
    }
    setData(result);
    setStatus("success");
  }

  if (status === "loading" && !data) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white p-8 text-sm text-[var(--color-muted-foreground)]">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        AI がアドバイスを準備中...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-3">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[color-mix(in_oklch,var(--color-destructive)_10%,white)] p-3 text-sm text-[var(--color-destructive)]"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error ?? "アドバイス取得に失敗しました"}</span>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => fetchAdvice(true)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
          >
            <RefreshCw size={14} aria-hidden /> 再試行
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {data.cached ? "キャッシュから表示" : "新規生成"}（{data.monthLabel} ・ {data.ageGroup}・{data.monthDays} 日）
        </span>
        <button
          type="button"
          onClick={() => fetchAdvice(true)}
          disabled={status === "loading"}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs hover:bg-[var(--color-muted)] disabled:opacity-50"
        >
          {status === "loading" ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw size={12} aria-hidden />
          )}
          再生成
        </button>
      </div>
      <AdviceDisplay advice={data.advice} />
    </div>
  );
}

function toErrorMessage(err: unknown): string {
  if (!err) return "アドバイス取得に失敗しました（不明なエラー）";
  const e = err as { message?: string; context?: { code?: string; error?: string; detail?: string } };
  switch (e.context?.code) {
    case "AUTH_NOT_ALLOWED":
      return "このアカウントは利用許可されていません。";
    case "BAD_REQUEST":
      return e.context?.error?.includes("栄養サマリー")
        ? "先に栄養レポート画面で月次集計を実行してください。"
        : (e.context?.error ?? "リクエストエラーが発生しました");
    case "BUDGET_EXCEEDED":
      return "今月の AI 利用上限に達しました。管理者に連絡してください。";
    case "AI_TIMEOUT":
      return "AI の応答がタイムアウトしました。少し時間をおいて再度お試しください。";
    case "AI_BLOCKED":
      return "条件が AI 安全フィルタに引っかかりました。";
    case "AI_INVALID_RESPONSE":
      return "AI の応答形式が想定外でした。再生成をお試しください。";
    default:
      return e.message ?? "アドバイス取得に失敗しました";
  }
}
